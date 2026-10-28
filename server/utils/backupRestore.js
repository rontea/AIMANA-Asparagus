import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import { dbAll, dbRun, STORAGE_DIR, UPLOADS_DIR } from '../db.js';

const tablePriorityOrder = [
    'users',
    'auth_sessions',
    'projects',
    'custom_project_types',
    'project_collections',
    'items',
    'revisions',
    'project_members',
    'chat_memory',
    'chat_sessions',
    'chat_session_attachments',
    'chat_items',
    'chat_item_attachments',
    'rag_chunks',
    'item_references',
    'reference_assets',
    'lab_workspace_state',
    'custom_engines',
    'bulk_presets',
    'neural_variable_registry_lists',
    'prompt_manager_drafts',
    'active_variable_registry_entries',
    'archived_variable_registry_entries',
    'bulk_studio_state',
    'extension_migrations',
    'extension_migration_failures',
    'system_logs',
    'error_reports',
    'settings'
];

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

export const orderTableNames = (tables) => {
    const indexByName = new Map(tablePriorityOrder.map((name, idx) => [name, idx]));
    return [...tables].sort((a, b) => {
        const ai = indexByName.has(a) ? indexByName.get(a) : Number.MAX_SAFE_INTEGER;
        const bi = indexByName.has(b) ? indexByName.get(b) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return String(a).localeCompare(String(b));
    });
};

const getTableColumns = async (tableName) => {
    const columns = await dbAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
    return Array.isArray(columns) ? columns : [];
};

export const asTableMap = (manifest, modeLabel = 'full') => {
    if (!manifest || typeof manifest !== 'object') {
        throw new Error(`Invalid ${modeLabel} manifest payload`);
    }
    const data = manifest.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`Invalid ${modeLabel} manifest: missing "data" object`);
    }
    return data;
};

export const parseBackupBundle = async (uploadedFile) => {
    return parseInstallBackupBundle(uploadedFile.path, uploadedFile.originalname);
};

const readZipEntryBuffer = async (zipFile, entry) => {
    const readStream = await zipFile.openReadStreamPromise(entry);
    const chunks = [];
    for await (const chunk of readStream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

export const parseInstallBackupBundle = async (archivePath, fileName, warnings = []) => {
    const zipFile = await yauzl.openPromise(archivePath, {
        autoClose: false,
        validateEntrySizes: true
    });
    let fullManifestBuffer = null;
    let incrementalManifestBuffer = null;
    let deltaInfoBuffer = null;
    let reportBuffer = null;

    try {
        for await (const entry of zipFile.eachEntry()) {
            if (entry.fileName === 'SYSTEM_MANIFEST.json') {
                fullManifestBuffer = await readZipEntryBuffer(zipFile, entry);
            } else if (entry.fileName === 'DELTA_MANIFEST.json') {
                incrementalManifestBuffer = await readZipEntryBuffer(zipFile, entry);
            } else if (entry.fileName === 'DELTA_INFO.json') {
                deltaInfoBuffer = await readZipEntryBuffer(zipFile, entry);
            } else if (entry.fileName === 'BACKUP_REPORT.json') {
                reportBuffer = await readZipEntryBuffer(zipFile, entry);
            }
        }
    } finally {
        zipFile.close();
    }

    if (fullManifestBuffer) {
        const manifest = JSON.parse(fullManifestBuffer.toString('utf8'));
        asTableMap(manifest, 'full');
        let backupReport = null;
        if (reportBuffer) {
            try {
                backupReport = JSON.parse(reportBuffer.toString('utf8'));
                if (backupReport?.summary?.status === 'partial') {
                    warnings.push('The uploaded full backup was marked partial. Check BACKUP_REPORT.json for missing files or other capture warnings.');
                }
            } catch {
                warnings.push('BACKUP_REPORT.json could not be read.');
            }
        }
        return {
            fileName,
            archivePath,
            type: 'full',
            manifest,
            backupReport
        };
    }
    if (incrementalManifestBuffer) {
        const manifest = JSON.parse(incrementalManifestBuffer.toString('utf8'));
        asTableMap(manifest, 'incremental');
        let deltaInfo = null;
        if (deltaInfoBuffer) {
            try {
                deltaInfo = JSON.parse(deltaInfoBuffer.toString('utf8'));
            } catch {
                deltaInfo = null;
            }
        }
        return { fileName, archivePath, type: 'incremental', manifest, deltaInfo };
    }

    throw new Error(`Unsupported backup bundle (${fileName}). Missing SYSTEM_MANIFEST.json or DELTA_MANIFEST.json.`);
};

const insertRows = async ({ tableName, rows, columns }) => {
    let touched = 0;
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const available = columns.filter((col) => Object.prototype.hasOwnProperty.call(row, col));
        if (available.length === 0) {
            await dbRun(`INSERT INTO ${quoteIdentifier(tableName)} DEFAULT VALUES`);
            touched++;
            continue;
        }
        const placeholders = available.map(() => '?').join(', ');
        const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${available.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`;
        await dbRun(sql, available.map((name) => row[name]));
        touched++;
    }
    return touched;
};

export const applyManifestFull = async (manifest, warnings = [], { clearAuthSessions = false } = {}) => {
    const data = asTableMap(manifest, 'full');
    const tableNames = orderTableNames(Object.keys(data));
    const summary = {
        mode: 'full',
        tables: {},
        totalRowsTouched: 0
    };

    await dbRun('PRAGMA foreign_keys = OFF');
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    try {
        for (const tableName of tableNames) {
            if (!Array.isArray(data[tableName])) continue;
            const tableColumnsMeta = await getTableColumns(tableName);
            if (!tableColumnsMeta.length) {
                warnings.push(`Skipping unknown table in full manifest: ${tableName}`);
                continue;
            }
            await dbRun(`DELETE FROM ${quoteIdentifier(tableName)}`);
        }

        for (const tableName of tableNames) {
            const rows = data[tableName];
            if (!Array.isArray(rows)) continue;
            const tableColumnsMeta = await getTableColumns(tableName);
            if (!tableColumnsMeta.length) continue;
            if (clearAuthSessions && tableName === 'auth_sessions') {
                summary.tables[tableName] = 0;
                continue;
            }
            const touched = await insertRows({
                tableName,
                rows,
                columns: tableColumnsMeta.map((col) => col.name)
            });
            summary.tables[tableName] = touched;
            summary.totalRowsTouched += touched;
        }
        if (clearAuthSessions && (await getTableColumns('auth_sessions')).length > 0) {
            await dbRun('DELETE FROM auth_sessions');
        }
        await dbRun('COMMIT');
    } catch (error) {
        await dbRun('ROLLBACK');
        throw error;
    } finally {
        await dbRun('PRAGMA foreign_keys = ON');
    }

    return summary;
};

const writeUploadEntriesFromArchive = async (archivePath, targetRoot, warnings = []) => {
    const zipFile = await yauzl.openPromise(archivePath, {
        autoClose: false,
        validateEntrySizes: true
    });
    let restored = 0;

    try {
        for await (const entry of zipFile.eachEntry()) {
            if (entry.fileName.endsWith('/') || !entry.fileName.startsWith('uploads/')) continue;
            const relative = entry.fileName.replace(/^uploads\//, '');
            const normalized = relative
                .replace(/\\/g, '/')
                .split('/')
                .filter(Boolean)
                .filter((segment) => segment !== '.' && segment !== '..')
                .join('/');
            if (!normalized) {
                warnings.push(`Skipped unsafe upload path: ${entry.fileName}`);
                continue;
            }
            const root = path.resolve(targetRoot);
            const target = path.resolve(root, normalized);
            if (target === root || !target.startsWith(`${root}${path.sep}`)) {
                warnings.push(`Skipped unsafe upload path: ${entry.fileName}`);
                continue;
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const readStream = await zipFile.openReadStreamPromise(entry);
            await pipeline(readStream, createWriteStream(target));
            restored++;
        }
    } finally {
        zipFile.close();
    }

    return restored;
};

export const restoreUploadsFromZip = async (archivePath, { clearExisting = false, warnings = [] } = {}) => {
    if (clearExisting) {
        fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    return writeUploadEntriesFromArchive(archivePath, UPLOADS_DIR, warnings);
};

export const restoreFullBackupForInstall = async (bundle, warnings = []) => {
    const stagingRoot = fs.mkdtempSync(path.join(STORAGE_DIR, '.install-migration-'));
    const stagedUploads = path.join(stagingRoot, 'uploads');
    const previousUploads = path.join(STORAGE_DIR, `.uploads-before-migration-${randomUUID()}`);
    let previousUploadsMoved = false;
    let stagedUploadsActivated = false;

    try {
        fs.mkdirSync(stagedUploads, { recursive: true });
        const uploadsRestored = await writeUploadEntriesFromArchive(bundle.archivePath, stagedUploads, warnings);

        fs.renameSync(UPLOADS_DIR, previousUploads);
        previousUploadsMoved = true;
        fs.renameSync(stagedUploads, UPLOADS_DIR);
        stagedUploadsActivated = true;

        let fullSummary;
        try {
            fullSummary = await applyManifestFull(bundle.manifest, warnings, { clearAuthSessions: true });
        } catch (error) {
            if (stagedUploadsActivated) fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
            if (previousUploadsMoved && fs.existsSync(previousUploads)) fs.renameSync(previousUploads, UPLOADS_DIR);
            throw error;
        }

        try {
            fs.rmSync(previousUploads, { recursive: true, force: true });
        } catch {
            warnings.push('The pre-migration uploads directory could not be removed after the restore completed.');
        }

        return { fullSummary, uploadsRestored };
    } catch (error) {
        if (previousUploadsMoved && !fs.existsSync(UPLOADS_DIR) && fs.existsSync(previousUploads)) {
            try {
                fs.renameSync(previousUploads, UPLOADS_DIR);
            } catch {
                warnings.push('The original uploads directory could not be restored automatically after the migration failed.');
            }
        }
        throw error;
    } finally {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
};

