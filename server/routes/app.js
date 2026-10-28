import express from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { logSystemEvent, STORAGE_DIR } from '../db.js';
import { getInstallStatusSnapshot, writeInstallStateRecord } from '../utils/installStatus.js';
import { getInstallerRuntimeConfig, saveInstallerRuntimeConfig } from '../utils/installerConfig.js';
import { bootstrapInitialAdmin, finalizeInstaller, saveInstallerProfile } from '../utils/installBootstrap.js';
import { buildInstallSummary } from '../utils/installSummary.js';
import { parseInstallBackupBundle, restoreFullBackupForInstall } from '../utils/backupRestore.js';
import { requireAdmin, requireAuth } from '../middleware.js';

const router = express.Router();
const PACKAGE_JSON_PATH = path.resolve(process.cwd(), 'package.json');
const MIGRATION_UPLOAD_LIMIT_BYTES = 1024 * 1024 * 1024;
const migrationUpload = multer({
    storage: multer.diskStorage({
        destination: (req, _file, callback) => {
            try {
                const tempDir = fs.mkdtempSync(path.join(STORAGE_DIR, '.install-upload-'));
                req.installMigrationUploadDir = tempDir;
                callback(null, tempDir);
            } catch (error) {
                callback(error);
            }
        },
        filename: (_req, _file, callback) => callback(null, `${randomUUID()}.zip`)
    }),
    limits: { fileSize: MIGRATION_UPLOAD_LIMIT_BYTES, files: 1 }
});
const cleanupMigrationUpload = (req) => {
    if (!req.installMigrationUploadDir) return;
    try {
        fs.rmSync(req.installMigrationUploadDir, { recursive: true, force: true });
    } catch {
        // Temporary uploads are best-effort cleanup; they are not part of the live installation.
    }
};
const handleMigrationUpload = (req, res, next) => {
    migrationUpload.single('backup')(req, res, (error) => {
        if (!error) return next();
        cleanupMigrationUpload(req);
        releaseMigrationLock(req);
        if (error instanceof multer.MulterError) {
            const tooLarge = error.code === 'LIMIT_FILE_SIZE';
            return res.status(tooLarge ? 413 : 400).json({
                error: tooLarge
                    ? 'The Full Baseline ZIP exceeds the 1 GB installer upload limit.'
                    : error.message
            });
        }
        return res.status(500).json({
            error: 'The uploaded Full Baseline ZIP could not be read.',
            message: error.message
        });
    });
};
let installBackupMigrationInProgress = false;
const releaseMigrationLock = (req) => {
    if (!req.installMigrationReserved) return;
    req.installMigrationReserved = false;
    installBackupMigrationInProgress = false;
};

const ensureInstallerEditable = async (req, res, next) => {
    try {
        const snapshot = await getInstallStatusSnapshot();
        const setupStates = new Set(['uninitialized', 'needs-config', 'needs-admin-setup', 'needs-finalize']);
        if (setupStates.has(snapshot.state) || snapshot.installer.runtimeConfigSetupPending) return next();
        return requireAuth(req, res, () => requireAdmin(req, res, next));
    } catch (error) {
        return next(error);
    }
};

router.use((req, res, next) => {
    if (installBackupMigrationInProgress && req.method !== 'GET') {
        return res.status(409).json({ error: 'Installer changes are temporarily locked while the backup migration runs.' });
    }
    next();
});

const reserveBackupMigration = async (req, res, next) => {
    if (installBackupMigrationInProgress) {
        return res.status(409).json({ error: 'A backup migration is already running.' });
    }

    installBackupMigrationInProgress = true;
    req.installMigrationReserved = true;
    req.once('aborted', () => {
        cleanupMigrationUpload(req);
        releaseMigrationLock(req);
    });

    try {
        const installStatus = await getInstallStatusSnapshot();
        if (!installStatus.capabilities.allowBackupMigration) {
            releaseMigrationLock(req);
            return res.status(409).json({ error: 'Backup migration is available only before an administrator or workspace data has been created.' });
        }
        next();
    } catch (error) {
        releaseMigrationLock(req);
        res.status(500).json({ error: error.message || 'Could not verify whether backup migration is available.' });
    }
};

const getAppVersion = () => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
        return typeof packageJson.version === 'string' ? packageJson.version : '0.15.0-dev';
    } catch {
        return '0.15.0-dev';
    }
};

router.get('/version', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
        name: 'AIMANA',
        version: getAppVersion(),
        checkedAt: Date.now()
    });
});

router.get('/install-status', async (_req, res) => {
    try {
        const snapshot = await getInstallStatusSnapshot();
        const checks = Object.fromEntries(Object.entries(snapshot.checks).map(([key, check]) => {
            const details = check?.details;
            if (!details) return [key, check];
            const { path: _path, ...safeDetails } = details;
            return [key, { ...check, details: safeDetails }];
        }));
        const { user: _adminUser, ...admin } = snapshot.admin;
        const { installedBy: _installedBy, runtimeConfigSetupPending: _runtimeConfigSetupPending, ...installer } = snapshot.installer;
        const publicSnapshot = {
            ...snapshot,
            issues: snapshot.issues.map(({ meta: _meta, ...issue }) => issue),
            checks,
            admin,
            runtime: {
                environment: snapshot.runtime.environment,
                production: snapshot.runtime.production
            },
            installer
        };
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({ ...publicSnapshot, version: getAppVersion() });
    } catch {
        res.status(500).json({ error: 'Could not read installation status.' });
    }
});

router.get('/bootstrap/runtime-config', ensureInstallerEditable, async (_req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        const config = getInstallerRuntimeConfig();
        res.json({ ...config, envFile: { exists: config.envFile.exists } });
    } catch {
        res.status(500).json({ error: 'Could not read runtime configuration.' });
    }
});

router.put('/bootstrap/runtime-config', ensureInstallerEditable, async (req, res) => {
    try {
        const config = saveInstallerRuntimeConfig(req.body || {});
        await writeInstallStateRecord({
            configCompletedAt: Date.now()
        });
        res.json({
            success: true,
            ...config,
            envFile: { exists: config.envFile.exists }
        });
    } catch {
        res.status(500).json({ error: 'Could not save runtime configuration.' });
    }
});

router.get('/install-summary', async (req, res) => {
    try {
        const origin = `${req.protocol}://${req.get('host') || `127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 3001}`}`;
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        const summary = await buildInstallSummary({ origin });
        const { backup: _backup, ...publicSummary } = summary;
        const recommendedHardeningSteps = summary.recommendedHardeningSteps.map((step) => (
            step.startsWith('Confirm ')
                ? 'Confirm the application and storage folders are on persistent storage before production use.'
                : step
        ));
        res.json({
            ...publicSummary,
            adminAccount: summary.adminAccount ? { configured: true } : null,
            storage: { configured: true },
            recommendedHardeningSteps
        });
    } catch {
        res.status(500).json({ error: 'Could not build the installation summary.' });
    }
});

router.post('/bootstrap/admin', async (req, res) => {
    try {
        const user = await bootstrapInitialAdmin(req.body || {});
        res.status(201).json({
            success: true,
            user
        });
    } catch (error) {
        if (String(error?.message || '').includes('Initial admin bootstrap') || String(error?.message || '').includes('Resolve blocking')) {
            return res.status(409).json({ error: error.message });
        }
        if (String(error?.message || '').includes('valid admin email') || String(error?.message || '').includes('at least 10 characters')) {
            return res.status(400).json({ error: error.message });
        }
        if (String(error?.message || '').toLowerCase().includes('unique')) {
            return res.status(409).json({ error: 'An admin account already exists for this instance.' });
        }
        res.status(500).json({ error: error.message });
    }
});

router.post('/bootstrap/migrate', reserveBackupMigration, handleMigrationUpload, async (req, res) => {
    if (!req.file) {
        cleanupMigrationUpload(req);
        releaseMigrationLock(req);
        return res.status(400).json({ error: 'Choose a full System Operations backup ZIP to migrate this installation.' });
    }
    res.once('finish', () => cleanupMigrationUpload(req));
    res.once('close', () => cleanupMigrationUpload(req));

    try {
        let bundle;
        const warnings = [];
        try {
            bundle = await parseInstallBackupBundle(req.file.path, req.file.originalname, warnings);
        } catch (error) {
            return res.status(400).json({ error: error.message || 'The selected file is not a valid backup ZIP.' });
        }
        if (bundle.type !== 'full') {
            return res.status(400).json({ error: 'Installer migration requires a Full Baseline backup. Incremental backups cannot be installed by themselves.' });
        }

        const users = bundle.manifest?.data?.users;
        if (!Array.isArray(users) || !users.some((user) => user && (user.role === 'admin' || user.id === 'admin-root'))) {
            return res.status(400).json({ error: 'The full backup does not contain an administrator account.' });
        }

        const restored = await restoreFullBackupForInstall(bundle, warnings);
        await writeInstallStateRecord({
            finalizedAt: null,
            installedAt: null,
            runtimeConfigSetupPending: true
        });
        await logSystemEvent('INFO', 'INSTALL', `Full baseline migration completed from ${req.file.originalname}.`, 'system');

        res.json({
            success: true,
            migration: {
                fileName: req.file.originalname,
                sourceVersion: bundle.manifest?.version || null,
                sourceTimestamp: Number(bundle.manifest?.timestamp) || null,
                totalRowsRestored: restored.fullSummary.totalRowsTouched,
                uploadsRestored: restored.uploadsRestored,
                backupStatus: bundle.backupReport?.summary?.status || null,
                warnings
            }
        });
    } catch (error) {
        const message = String(error?.message || 'Backup migration failed.');
        const statusCode = error instanceof SyntaxError || /Invalid .* manifest|Unsupported backup bundle/i.test(message) ? 400 : 500;
        res.status(statusCode).json({ error: message });
    } finally {
        releaseMigrationLock(req);
    }
});

router.post('/bootstrap/config', ensureInstallerEditable, async (req, res) => {
    try {
        const record = await saveInstallerProfile(req.body || {});

        res.json({
            success: true,
            installer: {
                instanceName: record.instanceName,
                mode: record.mode || 'local-first',
                notes: record.notes || '',
                configCompletedAt: record.configCompletedAt
            }
        });
    } catch (error) {
        if (String(error?.message || '').includes('Instance name is required')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

router.post('/bootstrap/finalize', ensureInstallerEditable, async (req, res) => {
    try {
        const record = await finalizeInstaller();
        res.json({
            success: true,
            installer: {
                instanceName: record.instanceName,
                finalizedAt: record.finalizedAt,
                installedAt: record.installedAt,
                installedBy: record.installedBy
            }
        });
    } catch (error) {
        if (
            String(error?.message || '').includes('Resolve blocking install configuration issues')
            || String(error?.message || '').includes('Create the initial admin')
            || String(error?.message || '').includes('Save installer settings')
            || String(error?.message || '').includes('Complete required runtime configuration')
        ) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

export default router;
