import express from 'express';
import fs from 'fs';
import path from 'path';
import { getInstallStatusSnapshot, writeInstallStateRecord } from '../utils/installStatus.js';
import { getInstallerRuntimeConfig, saveInstallerRuntimeConfig } from '../utils/installerConfig.js';
import { bootstrapInitialAdmin, finalizeInstaller, saveInstallerProfile } from '../utils/installBootstrap.js';
import { buildInstallSummary } from '../utils/installSummary.js';

const router = express.Router();
const PACKAGE_JSON_PATH = path.resolve(process.cwd(), 'package.json');

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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
        ...(await getInstallStatusSnapshot()),
        version: getAppVersion()
    });
});

router.get('/bootstrap/runtime-config', async (_req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json(getInstallerRuntimeConfig());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/bootstrap/runtime-config', async (req, res) => {
    try {
        const config = saveInstallerRuntimeConfig(req.body || {});
        await writeInstallStateRecord({
            configCompletedAt: Date.now()
        });
        res.json({
            success: true,
            ...config
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/install-summary', async (req, res) => {
    try {
        const origin = `${req.protocol}://${req.get('host') || `127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 3001}`}`;
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json(await buildInstallSummary({ origin }));
    } catch (error) {
        res.status(500).json({ error: error.message });
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

router.post('/bootstrap/config', async (req, res) => {
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

router.post('/bootstrap/finalize', async (req, res) => {
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
