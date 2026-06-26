
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import JSZip from 'jszip';
import sqlite3 from 'sqlite3';
import { ZipArchive } from 'archiver';
import { dbAll, dbRun, dbGet, hashPassword, logSystemEvent, DB_FILE, UPLOADS_DIR } from '../db.js';
import { superAdminOnly } from '../middleware.js';
import { getPhysicalPathFromUrl } from '../utils/paths.js';
import { loadExtensionServerServices } from '../extensions/api.js';

const router = express.Router();
const PACKAGE_JSON_PATH = path.resolve(process.cwd(), 'package.json');
const BACKUP_STATE_KEY = 'backup_state';
const RESTORE_UPLOAD_LIMIT_BYTES = 1024 * 1024 * 1024; // 1GB per bundle
const RESTORE_UPLOAD_MAX_FILES = 12;
const DB_SNAPSHOT_DIR = path.join(path.dirname(DB_FILE), 'snapshots');
const restoreUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: RESTORE_UPLOAD_LIMIT_BYTES,
        files: RESTORE_UPLOAD_MAX_FILES
    }
});

const getAppVersion = () => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
        return typeof packageJson.version === 'string' ? packageJson.version : '0.15.0-dev';
    } catch {
        return '0.15.0-dev';
    }
};

const APP_VERSION = getAppVersion();

export const CORE_BACKUP_TABLES = [
    'users',
    'auth_sessions',
    'projects',
    'custom_project_types',
    'project_members',
    'project_collections',
    'items',
    'revisions',
    'item_references',
    'reference_assets',
    'chat_memory',
    'chat_sessions',
    'chat_session_attachments',
    'chat_items',
    'chat_item_attachments',
    'rag_chunks',
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

const FULL_INCREMENTAL_TABLES = new Set([
    // These tables are mutable but do not all carry a reliable updatedAt column.
    'users',
    'project_members',
    'custom_project_types',
    'custom_engines',
    'bulk_presets'
]);

const defaultBackupState = () => ({
    lastSuccessfulBackupAt: null,
    lastBackupType: null,
    lastBackupId: null,
    lastBackupStatus: null,
    lastBackupWarningCount: 0,
    updatedAt: 0
});

export const normalizeBackupState = (current, next, updatedAt = Date.now()) => ({
    ...defaultBackupState(),
    ...(current || {}),
    ...(next || {}),
    updatedAt
});

const readBackupState = async () => {
    const row = await dbGet("SELECT value FROM settings WHERE key = ?", [BACKUP_STATE_KEY]);
    if (!row?.value) return defaultBackupState();
    try {
        const parsed = JSON.parse(row.value);
        if (!parsed || typeof parsed !== 'object') return defaultBackupState();
        return {
            ...defaultBackupState(),
            ...parsed
        };
    } catch {
        return defaultBackupState();
    }
};

const writeBackupState = async (next, updatedAt = Date.now()) => {
    const merged = normalizeBackupState(await readBackupState(), next, updatedAt);
    await dbRun(
        `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`,
        [BACKUP_STATE_KEY, JSON.stringify(merged), merged.updatedAt]
    );
    return merged;
};

export const upsertDumpSetting = (dump, key, value, updatedAt) => {
    const settings = Array.isArray(dump?.data?.settings) ? [...dump.data.settings] : [];
    const row = {
        key,
        value: JSON.stringify(value),
        updatedAt
    };
    const existingIndex = settings.findIndex((entry) => entry?.key === key);
    if (existingIndex >= 0) {
        settings[existingIndex] = row;
    } else {
        settings.push(row);
    }

    return {
        ...dump,
        data: {
            ...(dump?.data || {}),
            settings
        }
    };
};

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const parseBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const createDatabaseSnapshotFile = async (label = 'snapshot') => {
    fs.mkdirSync(DB_SNAPSHOT_DIR, { recursive: true });
    cleanupStaleDatabaseSnapshots();
    const safeLabel = String(label || 'snapshot').replace(/[^a-z0-9_-]/gi, '_').slice(0, 48);
    const snapshotPath = path.join(DB_SNAPSHOT_DIR, `${safeLabel}_${Date.now()}_${uuidv4()}.db`);
    const snapshotDb = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY);
    try {
        await new Promise((resolve, reject) => {
            snapshotDb.run('VACUUM INTO ?', [snapshotPath], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return snapshotPath;
    } catch (error) {
        cleanupDatabaseSnapshotFile(snapshotPath);
        throw error;
    } finally {
        await new Promise((resolve) => {
            snapshotDb.close(() => resolve());
        });
    }
};

const cleanupDatabaseSnapshotFile = (snapshotPath) => {
    if (!snapshotPath) return;
    try {
        const root = path.resolve(DB_SNAPSHOT_DIR);
        const target = path.resolve(snapshotPath);
        if (target === root || !target.startsWith(`${root}${path.sep}`)) return;
        fs.rmSync(target, { force: true });
    } catch {
        // Best-effort cleanup only; failed cleanup should not break a completed download.
    }
};

const cleanupStaleDatabaseSnapshots = (maxAgeMs = 24 * 60 * 60 * 1000) => {
    try {
        if (!fs.existsSync(DB_SNAPSHOT_DIR)) return;
        const cutoff = Date.now() - maxAgeMs;
        for (const entry of fs.readdirSync(DB_SNAPSHOT_DIR, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
            const fullPath = path.join(DB_SNAPSHOT_DIR, entry.name);
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs < cutoff) {
                cleanupDatabaseSnapshotFile(fullPath);
            }
        }
    } catch {
        // Best-effort cleanup only.
    }
};

const toMsNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const rowChangeMarker = (row) => Math.max(
    toMsNumber(row?.createdAt),
    toMsNumber(row?.updatedAt),
    toMsNumber(row?.timestamp),
    toMsNumber(row?.deletedAt),
    toMsNumber(row?.appliedAt),
    toMsNumber(row?.failedAt),
    toMsNumber(row?.revokedAt),
    toMsNumber(row?.expiresAt)
);

const isAfterCursor = (row, since) => {
    if (!since) return true;
    return rowChangeMarker(row) > since;
};

const isWithinBackupWindow = (row, since, until) => {
    const marker = rowChangeMarker(row);
    if (since && marker <= since) return false;
    if (until && marker > until) return false;
    return true;
};

const isInlineDataUrl = (value) => typeof value === 'string' && /^data:/i.test(value.trim());

const normalizeUploadsRelativePath = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    if (isInlineDataUrl(rawUrl)) return null;

    let pathname = rawUrl;
    try {
        const parsed = new URL(rawUrl, 'http://localhost');
        pathname = parsed.pathname;
    } catch {
        pathname = rawUrl.split('?')[0];
    }

    const normalized = pathname.replace(/\\/g, '/').replace(/^\/+/, '');
    const withoutPrefix = normalized
        .replace(/^storage\/uploads\//, '')
        .replace(/^uploads\//, '');

    if (!withoutPrefix) return null;

    const safeSegments = withoutPrefix
        .split('/')
        .filter(Boolean)
        .map((segment) => {
            try {
                return decodeURIComponent(segment);
            } catch {
                return segment;
            }
        })
        .filter((segment) => segment !== '.' && segment !== '..');

    if (safeSegments.length === 0) return null;
    return safeSegments.join('/');
};

const collectChangedItemIds = (dump, since, until = null) => {
    const changed = new Set();
    const items = Array.isArray(dump?.data?.items) ? dump.data.items : [];
    for (const item of items) {
        if (!item?.id) continue;
        if (isWithinBackupWindow(item, since, until)) {
            changed.add(String(item.id));
        }
    }
    return changed;
};

export const buildDeltaManifest = (dump, since, until) => {
    const data = dump?.data || {};
    const deltaData = {};
    const changedItemIds = collectChangedItemIds(dump, since, until);

    for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value)) continue;
        if (FULL_INCREMENTAL_TABLES.has(key)) {
            deltaData[key] = value;
            continue;
        }
        if (key === 'revisions') {
            deltaData[key] = value.filter((row) => {
                if (isWithinBackupWindow(row, since, until)) return true;
                const itemId = row?.itemId ? String(row.itemId) : '';
                return itemId ? changedItemIds.has(itemId) : false;
            });
            continue;
        }
        deltaData[key] = value.filter((row) => isWithinBackupWindow(row, since, until));
    }

    return {
        mode: 'incremental',
        fromTimestamp: since,
        toTimestamp: until,
        generatedAt: new Date(until).toISOString(),
        version: dump?.version || null,
        data: deltaData
    };
};

const collectAssetsFromDump = (dump, since, until = null) => {
    const assetsToPack = new Map();
    const ignoredInlineAssets = [];
    let manifestLinksCount = 0;
    const changedItemIds = collectChangedItemIds(dump, since, until);

    const localRevisions = Array.isArray(dump?.data?.revisions)
        ? dump.data.revisions.filter((row) => {
            if (!(row.storage === 'local' && row.fileUrl)) return false;
            if (isWithinBackupWindow(row, since, until)) return true;
            const itemId = row?.itemId ? String(row.itemId) : '';
            return itemId ? changedItemIds.has(itemId) : false;
        })
        : [];

    for (const rev of localRevisions) {
        if (isInlineDataUrl(rev.fileUrl)) {
            ignoredInlineAssets.push({
                source: 'main',
                recordId: rev.id,
                reason: 'inline-data-url'
            });
        }
        const mainPath = normalizeUploadsRelativePath(rev.fileUrl);
        if (mainPath && !assetsToPack.has(mainPath)) {
            assetsToPack.set(mainPath, {
                source: 'main',
                recordId: rev.id,
                zipPath: mainPath
            });
        }

        if (!rev.secondaryFilesJson) continue;
        try {
            const links = JSON.parse(rev.secondaryFilesJson);
            if (!Array.isArray(links) || links.length === 0) continue;
            manifestLinksCount++;

            for (const link of links) {
                if (isInlineDataUrl(link?.url)) {
                    ignoredInlineAssets.push({
                        source: 'secondary',
                        recordId: rev.id,
                        reason: 'inline-data-url'
                    });
                    continue;
                }
                const secondaryPath = normalizeUploadsRelativePath(link?.url);
                if (!secondaryPath || assetsToPack.has(secondaryPath)) continue;
                assetsToPack.set(secondaryPath, {
                    source: 'secondary',
                    recordId: rev.id,
                    zipPath: secondaryPath
                });
            }
        } catch {
            // Preserve current behavior by skipping malformed manifests.
        }
    }

    const referenceAssets = Array.isArray(dump?.data?.reference_assets)
        ? dump.data.reference_assets.filter((row) => isWithinBackupWindow(row, since, until))
        : [];
    for (const ref of referenceAssets) {
        if (isInlineDataUrl(ref?.fileUrl)) {
            ignoredInlineAssets.push({
                source: 'reference-asset',
                recordId: ref?.itemId || ref?.hash || 'unknown-reference-asset',
                reason: 'inline-data-url'
            });
            continue;
        }
        const refPath = normalizeUploadsRelativePath(ref?.fileUrl);
        if (!refPath || assetsToPack.has(refPath)) continue;
        assetsToPack.set(refPath, {
            source: 'reference-asset',
            recordId: ref?.itemId || ref?.hash || 'unknown-reference-asset',
            zipPath: refPath
        });
    }

    const chatItemAttachments = Array.isArray(dump?.data?.chat_item_attachments)
        ? dump.data.chat_item_attachments.filter((row) => isWithinBackupWindow(row, since, until))
        : [];
    for (const attachment of chatItemAttachments) {
        if (isInlineDataUrl(attachment?.fileUrl)) {
            ignoredInlineAssets.push({
                source: 'chat-attachment',
                recordId: attachment?.id || attachment?.chatItemId || 'unknown-chat-attachment',
                reason: 'inline-data-url'
            });
            continue;
        }
        const attachmentPath = normalizeUploadsRelativePath(attachment?.fileUrl);
        if (!attachmentPath || assetsToPack.has(attachmentPath)) continue;
        assetsToPack.set(attachmentPath, {
            source: 'chat-attachment',
            recordId: attachment?.id || attachment?.chatItemId || 'unknown-chat-attachment',
            zipPath: attachmentPath
        });
    }

    const chatSessionAttachments = Array.isArray(dump?.data?.chat_session_attachments)
        ? dump.data.chat_session_attachments.filter((row) => isWithinBackupWindow(row, since, until))
        : [];
    for (const attachment of chatSessionAttachments) {
        if (isInlineDataUrl(attachment?.fileUrl)) {
            ignoredInlineAssets.push({
                source: 'chat-session-attachment',
                recordId: attachment?.id || 'unknown-chat-session-attachment',
                reason: 'inline-data-url'
            });
            continue;
        }
        const attachmentPath = normalizeUploadsRelativePath(attachment?.fileUrl);
        if (!attachmentPath || assetsToPack.has(attachmentPath)) continue;
        assetsToPack.set(attachmentPath, {
            source: 'chat-session-attachment',
            recordId: attachment?.id || 'unknown-chat-session-attachment',
            zipPath: attachmentPath
        });
    }

    const promptDrafts = Array.isArray(dump?.data?.prompt_manager_drafts)
        ? dump.data.prompt_manager_drafts.filter((row) => isWithinBackupWindow(row, since, until))
        : [];
    for (const draft of promptDrafts) {
        if (isInlineDataUrl(draft?.previewImageUrl)) {
            ignoredInlineAssets.push({
                source: 'prompt-manager-preview',
                recordId: draft?.id || 'unknown-prompt-manager-draft',
                reason: 'inline-data-url'
            });
            continue;
        }
        const previewPath = normalizeUploadsRelativePath(draft?.previewImageUrl);
        if (!previewPath || assetsToPack.has(previewPath)) continue;
        assetsToPack.set(previewPath, {
            source: 'prompt-manager-preview',
            recordId: draft?.id || 'unknown-prompt-manager-draft',
            zipPath: previewPath
        });
    }

    return {
        assets: Array.from(assetsToPack.values()),
        ignoredInlineAssets,
        localRevisionCount: localRevisions.length,
        manifestLinksCount
    };
};

const buildSystemDumpPayload = async () => {
    const extensionOwnedTableNames = await getExtensionOwnedTableNames();
    const tableNames = [...CORE_BACKUP_TABLES, ...extensionOwnedTableNames];
    const tableData = Object.fromEntries(
        await Promise.all(
            tableNames.map(async (tableName) => [tableName, await dbAll(`SELECT * FROM ${quoteIdentifier(tableName)}`)])
        )
    );

    return {
        timestamp: Date.now(),
        version: APP_VERSION,
        data: tableData
    };
};

const asTableMap = (manifest, modeLabel) => {
    if (!manifest || typeof manifest !== 'object') {
        throw new Error(`Invalid ${modeLabel} manifest payload`);
    }
    const data = manifest.data;
    if (!data || typeof data !== 'object') {
        throw new Error(`Invalid ${modeLabel} manifest: missing "data" object`);
    }
    return data;
};

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

const orderTableNames = (tables) => {
    const indexByName = new Map(tablePriorityOrder.map((name, idx) => [name, idx]));
    return [...tables].sort((a, b) => {
        const ai = indexByName.has(a) ? indexByName.get(a) : Number.MAX_SAFE_INTEGER;
        const bi = indexByName.has(b) ? indexByName.get(b) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return String(a).localeCompare(String(b));
    });
};

const getTableColumns = async (tableName) => {
    const sql = `PRAGMA table_info(${quoteIdentifier(tableName)})`;
    const columns = await dbAll(sql);
    return Array.isArray(columns) ? columns : [];
};

const getExtensionOwnedTableNames = async () => {
    const rows = await dbAll(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name LIKE 'ext_%'
         ORDER BY name ASC`
    );
    return rows.map((row) => row.name);
};

const resolveSafeUploadTarget = (relativePath) => {
    const normalized = String(relativePath || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .filter((segment) => segment !== '.' && segment !== '..')
        .join('/');
    if (!normalized) return null;
    const root = path.resolve(UPLOADS_DIR);
    const target = path.resolve(root, normalized);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
    return { normalized, target };
};

const parseBackupBundle = async (uploadedFile) => {
    const zip = await JSZip.loadAsync(uploadedFile.buffer);
    const systemManifestEntry = zip.file('SYSTEM_MANIFEST.json');
    const deltaManifestEntry = zip.file('DELTA_MANIFEST.json');

    if (systemManifestEntry) {
        const raw = await systemManifestEntry.async('string');
        const manifest = JSON.parse(raw);
        return {
            fileName: uploadedFile.originalname,
            type: 'full',
            manifest,
            zip
        };
    }
    if (deltaManifestEntry) {
        const raw = await deltaManifestEntry.async('string');
        const manifest = JSON.parse(raw);
        const infoEntry = zip.file('DELTA_INFO.json');
        let deltaInfo = null;
        if (infoEntry) {
            try {
                deltaInfo = JSON.parse(await infoEntry.async('string'));
            } catch {
                deltaInfo = null;
            }
        }
        return {
            fileName: uploadedFile.originalname,
            type: 'incremental',
            manifest,
            deltaInfo,
            zip
        };
    }

    throw new Error(`Unsupported backup bundle (${uploadedFile.originalname}). Missing SYSTEM_MANIFEST.json or DELTA_MANIFEST.json.`);
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
        const values = available.map((name) => row[name]);
        await dbRun(sql, values);
        touched++;
    }
    return touched;
};

const upsertRows = async ({ tableName, rows, columns, primaryKeyColumns }) => {
    let touched = 0;
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const available = columns.filter((col) => Object.prototype.hasOwnProperty.call(row, col));
        if (available.length === 0) continue;

        const placeholders = available.map(() => '?').join(', ');
        const values = available.map((name) => row[name]);
        if (!primaryKeyColumns.length) {
            const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (${available.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`;
            await dbRun(insertSql, values);
            touched++;
            continue;
        }

        const nonPkUpdates = available.filter((name) => !primaryKeyColumns.includes(name));
        const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (${available.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`;
        const conflictTarget = primaryKeyColumns.map(quoteIdentifier).join(', ');
        const conflictAction = nonPkUpdates.length
            ? `DO UPDATE SET ${nonPkUpdates.map((name) => `${quoteIdentifier(name)}=excluded.${quoteIdentifier(name)}`).join(', ')}`
            : 'DO NOTHING';
        await dbRun(`${insertSql} ON CONFLICT(${conflictTarget}) ${conflictAction}`, values);
        touched++;
    }
    return touched;
};

const applyManifestFull = async (manifest, warnings) => {
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
            const rows = data[tableName];
            if (!Array.isArray(rows)) continue;
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
            const columns = tableColumnsMeta.map((col) => col.name);
            const touched = await insertRows({ tableName, rows, columns });
            summary.tables[tableName] = touched;
            summary.totalRowsTouched += touched;
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

const applyManifestIncremental = async (manifest, warnings) => {
    const data = asTableMap(manifest, 'incremental');
    const tableNames = orderTableNames(Object.keys(data));
    const summary = {
        mode: 'incremental',
        tables: {},
        totalRowsTouched: 0,
        movement: {
            itemProjectMoves: 0,
            revisionPathMoves: 0
        }
    };

    await dbRun('PRAGMA foreign_keys = OFF');
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    try {
        for (const tableName of tableNames) {
            const rows = data[tableName];
            if (!Array.isArray(rows) || rows.length === 0) continue;
            const tableColumnsMeta = await getTableColumns(tableName);
            if (!tableColumnsMeta.length) {
                warnings.push(`Skipping unknown table in incremental manifest: ${tableName}`);
                continue;
            }
            const columns = tableColumnsMeta.map((col) => col.name);
            const primaryKeyColumns = tableColumnsMeta
                .filter((col) => Number(col.pk) > 0)
                .sort((a, b) => Number(a.pk) - Number(b.pk))
                .map((col) => col.name);

            if (tableName === 'items') {
                for (const row of rows) {
                    if (!row?.id || !Object.prototype.hasOwnProperty.call(row, 'projectId')) continue;
                    const existing = await dbGet('SELECT projectId FROM items WHERE id = ?', [row.id]);
                    if (existing?.projectId && existing.projectId !== row.projectId) {
                        summary.movement.itemProjectMoves += 1;
                    }
                }
            } else if (tableName === 'revisions') {
                for (const row of rows) {
                    if (!row?.id || !Object.prototype.hasOwnProperty.call(row, 'fileUrl')) continue;
                    const existing = await dbGet('SELECT fileUrl FROM revisions WHERE id = ?', [row.id]);
                    if (existing?.fileUrl && row.fileUrl && existing.fileUrl !== row.fileUrl) {
                        summary.movement.revisionPathMoves += 1;
                    }
                }
            }

            const touched = await upsertRows({ tableName, rows, columns, primaryKeyColumns });
            summary.tables[tableName] = touched;
            summary.totalRowsTouched += touched;
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

const restoreUploadsFromZip = async (zip, { clearExisting = false, warnings = [] } = {}) => {
    const uploadEntries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith('uploads/'));

    if (clearExisting) {
        fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    let restored = 0;
    for (const entry of uploadEntries) {
        const relative = entry.name.replace(/^uploads\//, '');
        const target = resolveSafeUploadTarget(relative);
        if (!target) {
            warnings.push(`Skipped unsafe upload path: ${entry.name}`);
            continue;
        }
        fs.mkdirSync(path.dirname(target.target), { recursive: true });
        const content = await entry.async('nodebuffer');
        fs.writeFileSync(target.target, content);
        restored++;
    }

    return restored;
};

const validateRestoreChain = ({ selectedFull, selectedIncrementals, warnings, errors }) => {
    if (!selectedFull && selectedIncrementals.length > 0) {
        warnings.push('Incremental-only restore selected. Existing database must already match the baseline full backup.');
    }

    const fullTimestamp = Number(selectedFull?.manifest?.timestamp || 0);
    const fullBundleId = selectedFull?.fileName || null;
    let previousTo = fullTimestamp > 0 ? fullTimestamp : null;

    for (const inc of selectedIncrementals) {
        const fromTs = Number(inc?.manifest?.fromTimestamp ?? inc?.deltaInfo?.fromTimestamp ?? 0);
        const toTs = Number(inc?.manifest?.toTimestamp ?? inc?.deltaInfo?.toTimestamp ?? 0);
        const baseBackupId = inc?.deltaInfo?.baseBackupId ? String(inc.deltaInfo.baseBackupId) : '';

        if (!fromTs || !toTs) {
            errors.push(`Incremental bundle has missing from/to timestamps: ${inc.fileName}`);
            continue;
        }
        if (toTs < fromTs) {
            errors.push(`Incremental bundle has invalid timestamp range: ${inc.fileName}`);
        }
        if (previousTo && fromTs > previousTo) {
            errors.push(`Gap detected before incremental bundle ${inc.fileName} (fromTimestamp is after previous toTimestamp). Upload every incremental backup in the chain.`);
        }
        if (previousTo && fromTs < previousTo) {
            errors.push(`Overlap detected for incremental bundle ${inc.fileName} (fromTimestamp is before previous toTimestamp). Remove duplicate or out-of-order incrementals.`);
        }
        if (fullBundleId && baseBackupId && baseBackupId !== fullBundleId) {
            errors.push(`Baseline mismatch: ${inc.fileName} references ${baseBackupId}, but selected full backup is ${fullBundleId}.`);
        }
        previousTo = toTs;
    }
};

router.use(superAdminOnly);

router.get('/backup/state', async (req, res) => {
    try {
        const state = await readBackupState();
        res.json(state);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/backup/state', async (req, res) => {
    try {
        const body = req.body || {};
        const next = {};

        if (Object.prototype.hasOwnProperty.call(body, 'lastSuccessfulBackupAt')) {
            const val = body.lastSuccessfulBackupAt;
            if (val === null || val === undefined || val === '') {
                next.lastSuccessfulBackupAt = null;
            } else {
                const parsed = Number(val);
                next.lastSuccessfulBackupAt = Number.isFinite(parsed) ? parsed : null;
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'lastBackupType')) {
            const type = String(body.lastBackupType || '').trim().toLowerCase();
            next.lastBackupType = type === 'full' || type === 'incremental' ? type : null;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'lastBackupId')) {
            const id = String(body.lastBackupId || '').trim();
            next.lastBackupId = id || null;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'lastBackupStatus')) {
            const status = String(body.lastBackupStatus || '').trim().toLowerCase();
            next.lastBackupStatus = status === 'complete' || status === 'partial' ? status : null;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'lastBackupWarningCount')) {
            const parsed = Number(body.lastBackupWarningCount);
            next.lastBackupWarningCount = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
        }

        const saved = await writeBackupState(next);
        await logSystemEvent('INFO', 'ADMIN', `Backup state updated (${saved.lastBackupType || 'unknown'})`, req.user.id);
        res.json(saved);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/backup/restore', restoreUpload.array('backups', RESTORE_UPLOAD_MAX_FILES), async (req, res) => {
    const userId = req.user?.id || 'system';
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (uploadedFiles.length === 0) {
        return res.status(400).json({ error: 'Attach at least one backup bundle (.zip).' });
    }

    const warnings = [];
    const chainErrors = [];
    const parsedBundles = [];
    try {
        for (const file of uploadedFiles) {
            parsedBundles.push(await parseBackupBundle(file));
        }
    } catch (e) {
        return res.status(400).json({ error: e.message || 'Invalid backup bundle.' });
    }

    const fullBundles = parsedBundles.filter((bundle) => bundle.type === 'full');
    const incrementalBundles = parsedBundles.filter((bundle) => bundle.type === 'incremental');
    if (fullBundles.length > 1) {
        return res.status(400).json({ error: 'Only one full backup bundle can be restored per run.' });
    }

    const selectedFull = fullBundles[0] || null;
    const selectedIncrementals = [...incrementalBundles].sort((a, b) => {
        const aFrom = Number(a?.manifest?.fromTimestamp ?? a?.deltaInfo?.fromTimestamp ?? 0);
        const bFrom = Number(b?.manifest?.fromTimestamp ?? b?.deltaInfo?.fromTimestamp ?? 0);
        if (aFrom !== bFrom) return aFrom - bFrom;
        const aTo = Number(a?.manifest?.toTimestamp ?? a?.deltaInfo?.toTimestamp ?? 0);
        const bTo = Number(b?.manifest?.toTimestamp ?? b?.deltaInfo?.toTimestamp ?? 0);
        if (aTo !== bTo) return aTo - bTo;
        return String(a.fileName).localeCompare(String(b.fileName));
    });

    if (!selectedFull && selectedIncrementals.length === 0) {
        return res.status(400).json({ error: 'No restorable backup manifests found.' });
    }

    const clearUploadsOnFull = parseBoolean(req.body?.clearUploadsOnFull, true);
    const responseSummary = {
        full: null,
        incrementals: [],
        uploadsRestored: 0,
        warnings
    };

    for (let i = 1; i < selectedIncrementals.length; i++) {
        const prevTo = Number(selectedIncrementals[i - 1]?.manifest?.toTimestamp ?? selectedIncrementals[i - 1]?.deltaInfo?.toTimestamp ?? 0);
        const currFrom = Number(selectedIncrementals[i]?.manifest?.fromTimestamp ?? selectedIncrementals[i]?.deltaInfo?.fromTimestamp ?? 0);
        if (prevTo > 0 && currFrom > 0 && currFrom < prevTo) {
            chainErrors.push(`Incremental order overlap detected: ${selectedIncrementals[i].fileName} starts before previous bundle end.`);
        }
    }
    validateRestoreChain({ selectedFull, selectedIncrementals, warnings, errors: chainErrors });

    if (chainErrors.length > 0) {
        return res.status(409).json({
            error: `Restore chain validation failed. ${chainErrors[0]}`,
            details: chainErrors,
            warnings
        });
    }

    try {
        await logSystemEvent('WARN', 'ADMIN', `Automated restore initiated (${uploadedFiles.length} bundles)`, userId);

        if (selectedFull) {
            const fullSummary = await applyManifestFull(selectedFull.manifest, warnings);
            const restoredUploads = await restoreUploadsFromZip(selectedFull.zip, {
                clearExisting: clearUploadsOnFull,
                warnings
            });
            responseSummary.uploadsRestored += restoredUploads;
            responseSummary.full = {
                fileName: selectedFull.fileName,
                tables: fullSummary.tables,
                totalRowsTouched: fullSummary.totalRowsTouched,
                uploadsRestored: restoredUploads
            };
        }

        for (const incremental of selectedIncrementals) {
            const incrementalSummary = await applyManifestIncremental(incremental.manifest, warnings);
            const restoredUploads = await restoreUploadsFromZip(incremental.zip, {
                clearExisting: false,
                warnings
            });
            responseSummary.uploadsRestored += restoredUploads;
            responseSummary.incrementals.push({
                fileName: incremental.fileName,
                fromTimestamp: Number(incremental?.manifest?.fromTimestamp ?? incremental?.deltaInfo?.fromTimestamp ?? 0),
                toTimestamp: Number(incremental?.manifest?.toTimestamp ?? incremental?.deltaInfo?.toTimestamp ?? 0),
                tables: incrementalSummary.tables,
                totalRowsTouched: incrementalSummary.totalRowsTouched,
                uploadsRestored: restoredUploads,
                movement: incrementalSummary.movement
            });
        }

        const finalBundle = responseSummary.incrementals.length > 0
            ? responseSummary.incrementals[responseSummary.incrementals.length - 1]
            : responseSummary.full;

        const finalType = responseSummary.incrementals.length > 0 ? 'incremental' : 'full';
        const finalTimestamp = responseSummary.incrementals.length > 0
            ? Number(finalBundle?.toTimestamp || Date.now())
            : Number(selectedFull?.manifest?.timestamp || Date.now());
        const finalId = finalBundle?.fileName || null;
        const cursorState = await writeBackupState({
            lastSuccessfulBackupAt: Number.isFinite(finalTimestamp) ? finalTimestamp : Date.now(),
            lastBackupType: finalType,
            lastBackupId: finalId
        });

        await logSystemEvent(
            warnings.length > 0 ? 'WARN' : 'INFO',
            'ADMIN',
            `Automated restore completed (${finalType}, uploads restored: ${responseSummary.uploadsRestored}, warnings: ${warnings.length})`,
            userId
        );

        res.json({
            success: true,
            applied: responseSummary,
            backupState: cursorState
        });
    } catch (e) {
        await logSystemEvent('ERROR', 'ADMIN', `Automated restore failed: ${e.message}`, userId);
        res.status(500).json({ error: e.message || 'Automated restore failed.' });
    }
});

router.get('/users', async (req, res) => {
    res.json(await dbAll("SELECT id, email, name, role, provider, isBlocked, avatar, lastLogin, createdAt FROM users"));
});

router.post('/users', async (req, res) => {
    const { id = uuidv4(), email, password, name, role, provider } = req.body;
    const userId = req.user.id;
    const hashed = password ? hashPassword(password) : null;
    await dbRun(`INSERT INTO users (id, email, password, name, role, provider, createdAt) VALUES (?,?,?,?,?,?,?)`, [id, email, hashed, name, role, provider, Date.now()]);
    await logSystemEvent('INFO', 'ADMIN', `Created new user: ${email}`, userId);
    res.status(201).json({ id, email, name, role });
});

router.put('/users/:id', async (req, res) => {
    const { name, role, isBlocked } = req.body;
    const userId = req.user.id;
    await dbRun(`UPDATE users SET name=?, role=?, isBlocked=? WHERE id=?`, [name, role, isBlocked ? 1 : 0, req.params.id]);
    await logSystemEvent('INFO', 'ADMIN', `Updated user ID: ${req.params.id}`, userId);
    res.json({ success: true });
});

router.delete('/users/:id', async (req, res) => {
    const userId = req.user.id;
    if (req.params.id === 'admin-root') return res.status(403).json({ error: "Root cannot be deleted" });
    await dbRun("DELETE FROM users WHERE id = ?", [req.params.id]);
    await logSystemEvent('WARN', 'ADMIN', `Deleted user ID: ${req.params.id}`, userId);
    res.json({ success: true });
});

router.get('/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;
        const countRow = await dbAll("SELECT COUNT(*) as count FROM system_logs");
        const total = countRow[0].count;
        const rows = await dbAll("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?", [limit, offset]);
        res.json({ logs: rows, total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/extensions/migrations', async (req, res) => {
    try {
        const applied = await dbAll(
            `SELECT extensionId, extensionVersion, schemaVersion, migrationName, checksum, appliedAt
             FROM extension_migrations
             ORDER BY extensionId ASC, schemaVersion ASC`
        );
        const failures = await dbAll(
            `SELECT id, extensionId, extensionVersion, schemaVersion, migrationName, checksum, errorMessage, failedStatementIndex, failedSql, failedAt
             FROM extension_migration_failures
             ORDER BY failedAt DESC`
        );

        res.json({ applied, failures });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/extensions/services', async (_req, res) => {
    try {
        const { apiRoutes, backgroundJobs } = loadExtensionServerServices();
        res.json({ apiRoutes, backgroundJobs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/logs', async (req, res) => {
    try {
        const userId = req.user.id;
        await dbRun("DELETE FROM system_logs");
        // Log the purge event as the first entry in the new trail
        await logSystemEvent('WARN', 'ADMIN', 'Audit Trail manually purged by Super Admin', userId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Report neural event from client (Frontend Errors)
 */
router.post('/logs/report', async (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const { level, module, message } = req.body;
    await logSystemEvent(level || 'ERROR', module || 'FRONTEND', message, userId);
    res.json({ success: true });
});

/**
 * System Diagnostic Integrity Scan
 * Checks for database vs filesystem inconsistencies.
 */
router.post('/diagnostics/scan', async (req, res) => {
    const userId = req.user.id;
    await logSystemEvent('INFO', 'DIAGNOSTICS', 'Initializing Neural System Integrity Scan...', userId);
    
    const results = {
        orphans: 0,
        missing: 0,
        corruptRevisions: 0
    };

    try {
        const referencedFiles = new Set();
        const revisions = await dbAll(
            "SELECT id, itemId, fileUrl, title, secondaryFilesJson FROM revisions WHERE storage = 'local'"
        );

        // 1. Check for missing files referenced by local revisions.
        for (const rev of revisions) {
            const physicalPath = getPhysicalPathFromUrl(rev.fileUrl);
            if (physicalPath) {
                const normalizedPhysical = path.normalize(physicalPath);
                referencedFiles.add(normalizedPhysical);
                if (!fs.existsSync(normalizedPhysical)) {
                    results.missing++;
                    await logSystemEvent(
                        'ERROR',
                        'DIAGNOSTICS',
                        `Broken Neural Link: Physical file missing for revision ${rev.id} (${rev.title})`,
                        userId
                    );
                }
            }

            if (rev.secondaryFilesJson) {
                try {
                    const secondaryFiles = JSON.parse(rev.secondaryFilesJson);
                    for (const child of secondaryFiles) {
                        const childPath = getPhysicalPathFromUrl(child?.url);
                        if (!childPath) continue;
                        const normalizedChildPath = path.normalize(childPath);
                        referencedFiles.add(normalizedChildPath);
                        if (!fs.existsSync(normalizedChildPath)) {
                            results.missing++;
                            await logSystemEvent(
                                'ERROR',
                                'DIAGNOSTICS',
                                `Broken Secondary Link: Physical file missing for revision ${rev.id} (${rev.title})`,
                                userId
                            );
                        }
                    }
                } catch (parseErr) {
                    results.corruptRevisions++;
                    await logSystemEvent(
                        'ERROR',
                        'DIAGNOSTICS',
                        `Corrupt revision payload: secondaryFilesJson parse failed for revision ${rev.id} (${rev.title})`,
                        userId
                    );
                }
            }
        }

        // 2. Check orphaned revision rows not attached to any item.
        const orphanRevisionRows = await dbAll(
            "SELECT r.id FROM revisions r LEFT JOIN items i ON i.id = r.itemId WHERE i.id IS NULL"
        );
        if (orphanRevisionRows.length > 0) {
            results.corruptRevisions += orphanRevisionRows.length;
            await logSystemEvent(
                'ERROR',
                'DIAGNOSTICS',
                `Corrupt revision links detected: ${orphanRevisionRows.length} revision rows reference missing items.`,
                userId
            );
        }

        // 3. Detect orphan binaries on disk that are not referenced by revisions.
        const walk = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            let files = [];
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files = files.concat(walk(fullPath));
                } else if (entry.isFile()) {
                    files.push(path.normalize(fullPath));
                }
            }
            return files;
        };

        if (fs.existsSync(UPLOADS_DIR)) {
            const diskFiles = walk(UPLOADS_DIR);
            for (const diskFile of diskFiles) {
                if (!referencedFiles.has(diskFile)) {
                    results.orphans++;
                }
            }
            if (results.orphans > 0) {
                await logSystemEvent(
                    'WARN',
                    'DIAGNOSTICS',
                    `Orphan binaries detected: ${results.orphans} files under uploads are not referenced by any local revision.`,
                    userId
                );
            }
        }

        // 4. Identify database workspace inconsistencies.
        const projects = await dbAll("SELECT id, name FROM projects");
        for (const p of projects) {
            const itemCount = (await dbGet("SELECT COUNT(*) as count FROM items WHERE projectId = ?", [p.id])).count;
            if (itemCount === 0) {
                await logSystemEvent('INFO', 'DIAGNOSTICS', `Workspace [${p.name}] is currently an empty cluster.`, userId);
            }
        }

        await logSystemEvent(
            'INFO',
            'DIAGNOSTICS',
            `Scan Complete. Findings - Missing: ${results.missing}, Orphans: ${results.orphans}, Corrupt: ${results.corruptRevisions}`,
            userId
        );
        res.json({ success: true, results });
    } catch (e) {
        await logSystemEvent('ERROR', 'DIAGNOSTICS', `Diagnostic pipeline crashed: ${e.message}`, userId);
        res.status(500).json({ error: e.message });
    }
});

router.get('/system-dump', async (req, res) => {
    try {
        res.json(await buildSystemDumpPayload());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/backup/download', async (req, res) => {
    const userId = req.user?.id || 'system';
    const mode = String(req.query.mode || 'full').trim().toLowerCase() === 'incremental' ? 'incremental' : 'full';
    let dbSnapshotPath = null;

    try {
        const nowTs = Date.now();
        const timestamp = new Date(nowTs).toISOString().replace(/[:.]/g, '-');
        const backupLabel = mode === 'full'
            ? `AIMANA_FULL_BACKUP_${timestamp}.zip`
            : `AIMANA_INCREMENTAL_BACKUP_${timestamp}.zip`;
        const snapshotStartTs = Date.now();

        let sinceCursor = null;
        let priorBackupId = null;
        if (mode === 'incremental') {
            const state = await readBackupState();
            sinceCursor = state?.lastSuccessfulBackupAt || null;
            priorBackupId = state?.lastBackupId || null;
            if (!sinceCursor) {
                return res.status(409).json({ error: 'Incremental backup requires a completed baseline backup first. Run Full Backup once.' });
            }
        }

        await logSystemEvent('INFO', 'ADMIN', `${mode === 'full' ? 'Full' : 'Incremental'} backup download initiated`, userId);

        let dump = await buildSystemDumpPayload();
        let dbBinaryCaptured = mode !== 'full' || fs.existsSync(DB_FILE);

        const backupWindowEnd = mode === 'incremental' ? snapshotStartTs : null;
        const { assets, ignoredInlineAssets, localRevisionCount, manifestLinksCount } = collectAssetsFromDump(dump, sinceCursor, backupWindowEnd);
        const failures = [];
        const skipped = [];

        for (const asset of assets) {
            const target = resolveSafeUploadTarget(asset.zipPath);
            if (!target) {
                skipped.push({
                    zipPath: asset.zipPath,
                    reason: 'unsafe-path',
                    recordId: asset.recordId,
                    source: asset.source
                });
                continue;
            }
            if (!fs.existsSync(target.target)) {
                failures.push({
                    zipPath: asset.zipPath,
                    reason: 'missing-on-disk',
                    recordId: asset.recordId,
                    source: asset.source
                });
                continue;
            }
        }

        const missingReferenceAssets = failures.filter((entry) => entry.source === 'reference-asset');
        const warningDetails = [];
        if (ignoredInlineAssets.length > 0) {
            warningDetails.push(`Ignored ${ignoredInlineAssets.length} inline data URL asset reference(s); those are embedded in metadata and are not disk-backed upload files.`);
        }
        if (missingReferenceAssets.length > 0) {
            warningDetails.push(`Missing ${missingReferenceAssets.length} reference asset file(s) on disk under the expected uploads tree.`);
        }

        const backupReport = {
            mode,
            generatedAt: new Date(nowTs).toISOString(),
            fromTimestamp: sinceCursor,
            toTimestamp: mode === 'incremental' ? snapshotStartTs : nowTs,
            summary: {
                revisionCount: localRevisionCount,
                manifestCount: manifestLinksCount,
                requestedAssets: assets.length,
                packedAssets: assets.length - failures.length - skipped.length,
                failedAssets: failures.length,
                skippedAssets: skipped.length,
                ignoredInlineAssets: ignoredInlineAssets.length,
                status: failures.length > 0 || skipped.length > 0 || !dbBinaryCaptured ? 'partial' : 'complete'
            },
            warningDetails,
            ignoredInlineAssets,
            missingReferenceAssets,
            failures,
            skipped
        };

        const hasWarnings = failures.length > 0 || skipped.length > 0 || !dbBinaryCaptured;
        const backupCursor = mode === 'incremental' ? snapshotStartTs : nowTs;
        const completedBackupState = normalizeBackupState(await readBackupState(), {
            lastSuccessfulBackupAt: backupCursor,
            lastBackupType: mode,
            lastBackupId: backupLabel,
            lastBackupStatus: hasWarnings ? 'partial' : 'complete',
            lastBackupWarningCount: failures.length + skipped.length + (dbBinaryCaptured ? 0 : 1)
        }, backupCursor);
        dump = upsertDumpSetting(dump, BACKUP_STATE_KEY, completedBackupState, backupCursor);

        if (mode === 'full') {
            if (fs.existsSync(DB_FILE)) {
                dbSnapshotPath = await createDatabaseSnapshotFile('full_backup');
                dbBinaryCaptured = true;
            }
            backupReport.summary.status = failures.length > 0 || skipped.length > 0 || !dbBinaryCaptured ? 'partial' : 'complete';
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${backupLabel}"`);
        res.setHeader('X-Aimana-Backup-Status', hasWarnings ? 'partial' : 'complete');
        res.setHeader('X-Aimana-Backup-Id', backupLabel);

        const archive = new ZipArchive({
            forceZip64: true,
            zlib: { level: 0 },
            store: true
        });

        let didCleanupSnapshot = false;
        const cleanupBackupSnapshot = () => {
            if (didCleanupSnapshot) return;
            didCleanupSnapshot = true;
            cleanupDatabaseSnapshotFile(dbSnapshotPath);
        };

        archive.on('error', async (error) => {
            await logSystemEvent('ERROR', 'ADMIN', `Backup stream failure: ${error.message}`, userId);
            cleanupBackupSnapshot();
            if (!res.headersSent) {
                res.status(500).json({ error: error.message || 'Failed to stream backup bundle.' });
            } else {
                res.destroy(error);
            }
        });

        archive.on('warning', async (warning) => {
            await logSystemEvent('WARN', 'ADMIN', `Backup stream warning: ${warning.message}`, userId);
        });

        res.on('finish', async () => {
            cleanupBackupSnapshot();
            await writeBackupState(completedBackupState, backupCursor);
            await logSystemEvent(
                hasWarnings ? 'WARN' : 'INFO',
                'ADMIN',
                `${mode === 'full' ? 'Full' : 'Incremental'} backup download completed (${hasWarnings ? `warnings: ${failures.length + skipped.length + (dbBinaryCaptured ? 0 : 1)}` : 'clean'})`,
                userId
            );
        });
        res.on('close', cleanupBackupSnapshot);

        archive.pipe(res);
        if (mode === 'full') {
            archive.file(dbSnapshotPath, { name: 'aimana_production_snapshot.db', store: true });
            archive.append(JSON.stringify(dump, null, 2), { name: 'SYSTEM_MANIFEST.json' });
        } else {
            const deltaManifest = buildDeltaManifest(dump, sinceCursor, snapshotStartTs);
            archive.append(JSON.stringify(deltaManifest, null, 2), { name: 'DELTA_MANIFEST.json' });
            archive.append(JSON.stringify({
                mode: 'incremental',
                generatedAt: new Date(nowTs).toISOString(),
                fromTimestamp: sinceCursor,
                toTimestamp: snapshotStartTs,
                baseBackupId: priorBackupId
            }, null, 2), { name: 'DELTA_INFO.json' });
        }
        archive.append(JSON.stringify(backupReport, null, 2), { name: 'BACKUP_REPORT.json' });

        for (const asset of assets) {
            const target = resolveSafeUploadTarget(asset.zipPath);
            if (!target || !fs.existsSync(target.target)) continue;
            archive.file(target.target, { name: `uploads/${asset.zipPath}`, store: true });
        }

        await archive.finalize();
    } catch (e) {
        cleanupDatabaseSnapshotFile(dbSnapshotPath);
        await logSystemEvent('ERROR', 'ADMIN', `Backup download failed: ${e.message}`, userId);
        res.status(500).json({ error: e.message || 'Backup download failed.' });
    }
});

router.get('/database/download', async (req, res) => {
    const userId = req.user.id;
    let dbSnapshotPath = null;
    await logSystemEvent('WARN', 'ADMIN', 'Direct raw database (.db) download initiated', userId);
    try {
        dbSnapshotPath = await createDatabaseSnapshotFile('raw_download');
    } catch (err) {
        await logSystemEvent('ERROR', 'ADMIN', `Direct raw database (.db) snapshot failed: ${err.message}`, userId);
        return res.status(500).json({ error: "Failed to create database snapshot" });
    }
    let didCleanupSnapshot = false;
    const cleanupRawSnapshot = () => {
        if (didCleanupSnapshot) return;
        didCleanupSnapshot = true;
        cleanupDatabaseSnapshotFile(dbSnapshotPath);
    };
    res.on('close', cleanupRawSnapshot);
    res.download(dbSnapshotPath, 'aimana_raw.db', (err) => {
        cleanupRawSnapshot();
        if (err) {
            console.error("Database download failed", err);
            if (!res.headersSent) res.status(500).json({ error: "Failed to stream database file" });
        }
    });
});

export default router;
