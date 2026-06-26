import express from 'express';
import fs from 'fs';
import path from 'path';
import { dbGet, dbRun, dbAll, hashPassword, verifyPassword, logSystemEvent, withTransaction, UPLOADS_DIR } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '../middleware.js';
import * as OTPAuth from 'otpauth';
import { createAuthToken } from '../utils/authToken.js';
import { toPublicRegistryRow } from '../utils/registry.js';
import { normalizeWebSlashes, sanitizeDirName } from '../utils/paths.js';
import {
    DEFAULT_GOOGLE_LITE_TEXT_MODEL,
    DEFAULT_GOOGLE_TEXT_MODEL,
    normalizeGoogleModelIds
} from '../utils/googleModelIds.js';
import { syncGoogleRegistryModels } from '../services/googleRegistrySync.js';
import { getRuntimePollinationsApiKey } from '../utils/runtimeEnv.js';

const router = express.Router();

const APP_CONFIG_KEY = 'app_config';
const APP_UPDATE_STATE_KEY = 'app_update_state';
const USER_DASHBOARD_PREFERENCES_KEY_PREFIX = 'user_dashboard_preferences:';
const DELETE_VERIFY_TTL_SECONDS = 60 * 5;
const DEFAULT_MANUAL_POLLEN_HOURLY_RATE = 0.15;
const PROMPT_MANAGER_UPLOAD_ROOT = 'Prompt_Manager';

const parseBase64DataUri = (dataUri = '') => {
    const matches = String(dataUri).match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
    if (!matches) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (!buffer.length) return null;
    return { mimeType, buffer };
};

const extensionFromMimeType = (mimeType = '') => {
    const normalized = String(mimeType || '').trim().toLowerCase();
    if (normalized === 'image/png') return '.png';
    if (normalized === 'image/jpeg') return '.jpg';
    if (normalized === 'image/webp') return '.webp';
    if (normalized === 'image/gif') return '.gif';
    if (normalized === 'image/svg+xml') return '.svg';
    if (normalized === 'video/mp4') return '.mp4';
    if (normalized === 'video/webm') return '.webm';
    if (normalized === 'video/quicktime') return '.mov';
    return '.bin';
};

const savePromptManagerDraftAsset = ({ userId, draftId, dataUrl, mimeType }) => {
    const parsed = parseBase64DataUri(dataUrl);
    if (!parsed) {
        throw new Error('Prompt Manager image must be a valid base64 data URL.');
    }

    const resolvedMimeType = String(mimeType || parsed.mimeType || '').trim() || parsed.mimeType;
    const ext = extensionFromMimeType(resolvedMimeType);
    const safeDraftId = sanitizeDirName(draftId || uuidv4());
    const relativeParts = [PROMPT_MANAGER_UPLOAD_ROOT, 'Staging'];
    const physicalDir = path.join(UPLOADS_DIR, ...relativeParts);
    fs.mkdirSync(physicalDir, { recursive: true });
    const fileName = `${safeDraftId}${ext}`;
    const physicalPath = path.join(physicalDir, fileName);
    fs.writeFileSync(physicalPath, parsed.buffer);

    return {
        fileUrl: normalizeWebSlashes(`/storage/uploads/${relativeParts.join('/')}/${fileName}`),
        mimeType: resolvedMimeType,
        size: parsed.buffer.length
    };
};

const normalizeManualPollenHourlyRate = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MANUAL_POLLEN_HOURLY_RATE;
    return Number(parsed);
};

const DEFAULT_DASHBOARD_RESULT_LIMIT = 24;

const normalizeDashboardResultLimit = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DASHBOARD_RESULT_LIMIT;
    return Math.max(1, Math.min(200, Math.round(parsed)));
};

const normalizeAssetIngestionEngines = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
        .map((entry) => String(entry || '').trim())
        .filter((entry) => {
            if (!entry) return false;
            const key = entry.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

const defaultAppConfig = () => ({
    isTwoFactorRequiredForDelete: true,
    maxUsers: 5,
    inactivityTimeout: 0,
    aiEngines: [DEFAULT_GOOGLE_TEXT_MODEL, DEFAULT_GOOGLE_LITE_TEXT_MODEL],
    assetIngestionEngines: [],
    isPinProtectionEnabled: false,
    isItemProtectionEnabled: false,
    bulkLimit: 8,
    manualPollenHourlyRate: DEFAULT_MANUAL_POLLEN_HOURLY_RATE,
    dashboardResultLimit: DEFAULT_DASHBOARD_RESULT_LIMIT,
    defaultReadAloudVoiceURI: '',
    defaultReadAloudVoiceName: ''
});

const defaultAppUpdateState = () => ({
    currentVersion: 'unknown',
    latestVersion: 'unknown',
    checkedAt: null,
    updateAvailable: false,
    updatedAt: 0
});

const readJsonSetting = async (key, fallback) => {
    const row = await dbGet("SELECT value FROM settings WHERE key = ?", [key]);
    if (!row?.value) return fallback();
    try {
        const parsed = JSON.parse(row.value);
        if (!parsed || typeof parsed !== 'object') return fallback();
        return {
            ...fallback(),
            ...parsed
        };
    } catch {
        return fallback();
    }
};

const writeJsonSetting = async (key, value) => {
    const timestamp = Date.now();
    const normalizedValue = {
        ...(value && typeof value === 'object' ? value : {}),
        updatedAt: timestamp
    };
    await dbRun(
        `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`,
        [key, JSON.stringify(normalizedValue), timestamp]
    );
    return normalizedValue;
};

const readAppConfig = async () => {
    try {
        const parsed = await readJsonSetting(APP_CONFIG_KEY, defaultAppConfig);
        return {
            ...defaultAppConfig(),
            ...parsed,
            manualPollenHourlyRate: normalizeManualPollenHourlyRate(parsed.manualPollenHourlyRate),
            dashboardResultLimit: normalizeDashboardResultLimit(parsed.dashboardResultLimit),
            aiEngines: normalizeGoogleModelIds(Array.isArray(parsed.aiEngines) ? parsed.aiEngines : defaultAppConfig().aiEngines),
            assetIngestionEngines: normalizeAssetIngestionEngines(parsed.assetIngestionEngines)
        };
    } catch (err) {
        console.warn('[SETTINGS] Failed to parse app_config JSON. Reverting to defaults.', err);
        return defaultAppConfig();
    }
};

const writeAppConfig = async (config) => {
    const normalizedConfig = {
        ...config,
        manualPollenHourlyRate: normalizeManualPollenHourlyRate(config?.manualPollenHourlyRate),
        dashboardResultLimit: normalizeDashboardResultLimit(config?.dashboardResultLimit),
        aiEngines: normalizeGoogleModelIds(Array.isArray(config?.aiEngines) ? config.aiEngines : defaultAppConfig().aiEngines),
        assetIngestionEngines: normalizeAssetIngestionEngines(config?.assetIngestionEngines)
    };
    await writeJsonSetting(APP_CONFIG_KEY, normalizedConfig);
};

const readUserDashboardPreferences = async (userId) => {
    const key = `${USER_DASHBOARD_PREFERENCES_KEY_PREFIX}${userId}`;
    const parsed = await readJsonSetting(key, () => ({}));
    return {
        dashboardResultLimit: Object.prototype.hasOwnProperty.call(parsed, 'dashboardResultLimit')
            ? normalizeDashboardResultLimit(parsed.dashboardResultLimit)
            : null
    };
};

const writeUserDashboardPreferences = async (userId, preferences) => {
    const key = `${USER_DASHBOARD_PREFERENCES_KEY_PREFIX}${userId}`;
    const current = await readUserDashboardPreferences(userId);
    return writeJsonSetting(key, {
        ...current,
        ...(preferences || {}),
        dashboardResultLimit: normalizeDashboardResultLimit(preferences?.dashboardResultLimit)
    });
};

const readAppUpdateState = async () => readJsonSetting(APP_UPDATE_STATE_KEY, defaultAppUpdateState);

const writeAppUpdateState = async (state) => {
    const current = await readAppUpdateState();
    return writeJsonSetting(APP_UPDATE_STATE_KEY, {
        ...current,
        ...(state || {}),
        currentVersion: String(state?.currentVersion || current.currentVersion || 'unknown').trim() || 'unknown',
        latestVersion: String(state?.latestVersion || current.latestVersion || 'unknown').trim() || 'unknown',
        checkedAt: Number.isFinite(Number(state?.checkedAt)) ? Number(state.checkedAt) : current.checkedAt,
        updateAvailable: typeof state?.updateAvailable === 'boolean' ? state.updateAvailable : current.updateAvailable
    });
};

const issueDeleteVerificationToken = (userId) =>
    createAuthToken({ sub: userId, dv: 1 }, DELETE_VERIFY_TTL_SECONDS);

const migrateLegacySecurityToUser = async (userId, config) => {
    if (!config) return config;
    const hasLegacyPin = !!config.pinHash;
    const hasLegacyTotp = !!config.twoFactorSecret;
    if (!hasLegacyPin && !hasLegacyTotp) return config;

    const user = await dbGet("SELECT pinHash, twoFactorSecret FROM users WHERE id = ?", [userId]);
    if (!user) return config;

    if (hasLegacyPin && !user.pinHash) {
        await dbRun("UPDATE users SET pinHash = ? WHERE id = ?", [config.pinHash, userId]);
    }
    if (hasLegacyTotp && !user.twoFactorSecret) {
        await dbRun("UPDATE users SET twoFactorSecret = ? WHERE id = ?", [config.twoFactorSecret, userId]);
    }

    const cleaned = { ...config };
    delete cleaned.pinHash;
    delete cleaned.twoFactorSecret;
    delete cleaned.isTwoFactorEnabled;
    await writeAppConfig(cleaned);
    return cleaned;
};

router.get('/', async (req, res) => {
    const settings = await migrateLegacySecurityToUser(req.user.id, await readAppConfig());
    const dashboardPreferences = await readUserDashboardPreferences(req.user.id);
    const user = await dbGet("SELECT twoFactorSecret, pinHash, isTwoFactorLoginEnabled FROM users WHERE id = ?", [req.user.id]);
    const safeSettings = {
        ...settings,
        dashboardResultLimit: dashboardPreferences.dashboardResultLimit ?? settings.dashboardResultLimit,
        isTwoFactorEnabled: !!user?.twoFactorSecret,
        isTwoFactorLoginEnabled: !!user?.isTwoFactorLoginEnabled,
        hasPinConfigured: !!user?.pinHash
    };
    res.json(safeSettings);
});

router.put('/', async (req, res) => {
    const userId = req.user.id;
    const isAdmin = req.user?.role === 'admin' || req.user?.id === 'admin-root';
    const body = req.body || {};

    // Persist per-user security factors for all authenticated users
    if (typeof body.newRawPin === 'string' && body.newRawPin.length > 0) {
        await dbRun("UPDATE users SET pinHash = ? WHERE id = ?", [hashPassword(body.newRawPin), userId]);
    } else if (Object.prototype.hasOwnProperty.call(body, 'pinHash') && body.pinHash === null) {
        await dbRun("UPDATE users SET pinHash = NULL WHERE id = ?", [userId]);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'twoFactorSecret')) {
        const nextSecret = body.twoFactorSecret || null;
        await dbRun("UPDATE users SET twoFactorSecret = ? WHERE id = ?", [nextSecret, userId]);
        // If account TOTP secret is removed, login challenge cannot remain enabled.
        if (!nextSecret) {
            await dbRun("UPDATE users SET isTwoFactorLoginEnabled = 0 WHERE id = ?", [userId]);
        }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'isTwoFactorLoginEnabled')) {
        const nextLoginProtection = !!body.isTwoFactorLoginEnabled;
        if (nextLoginProtection) {
            const factorState = await dbGet("SELECT twoFactorSecret FROM users WHERE id = ?", [userId]);
            if (!factorState?.twoFactorSecret) {
                return res.status(400).json({ error: 'Enable Authenticator Account first before requiring 2FA on login.' });
            }
        }
        await dbRun("UPDATE users SET isTwoFactorLoginEnabled = ? WHERE id = ?", [nextLoginProtection ? 1 : 0, userId]);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'dashboardResultLimit')) {
        await writeUserDashboardPreferences(userId, {
            dashboardResultLimit: body.dashboardResultLimit
        });
    }

    // Admin-only global policy controls
    if (isAdmin) {
        const current = await readAppConfig();
        const next = { ...current };
        const globalFields = [
            'isTwoFactorRequiredForDelete',
            'maxUsers',
            'inactivityTimeout',
            'aiEngines',
            'assetIngestionEngines',
            'isPinProtectionEnabled',
            'isItemProtectionEnabled',
            'bulkLimit',
            'manualPollenHourlyRate',
            'defaultReadAloudVoiceURI',
            'defaultReadAloudVoiceName'
        ];

        for (const field of globalFields) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                next[field] = body[field];
            }
        }
        await writeAppConfig(next);
    }

    await logSystemEvent('INFO', 'SETTINGS', 'Application settings updated', userId);
    res.json({ success: true });
});

router.get('/app-update-state', async (_req, res) => {
    try {
        res.json(await readAppUpdateState());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/app-update-state', async (req, res) => {
    try {
        const body = req.body || {};
        const state = await writeAppUpdateState({
            currentVersion: body.currentVersion,
            latestVersion: body.latestVersion,
            checkedAt: body.checkedAt,
            updateAvailable: body.updateAvailable
        });
        res.json(state);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/verify-pin', async (req, res) => {
    const { pin } = req.body;
    const user = await dbGet("SELECT pinHash FROM users WHERE id = ?", [req.user.id]);
    if (!user?.pinHash) return res.status(400).json({ error: "PIN not set for current user" });
    if (verifyPassword(pin, user.pinHash)) {
        res.json({ success: true, deleteVerificationToken: issueDeleteVerificationToken(req.user.id) });
    } else {
        res.status(401).json({ error: "Invalid PIN" });
    }
});

router.post('/verify-totp', async (req, res) => {
    const { code } = req.body || {};
    if (!code || String(code).length !== 6) {
        return res.status(400).json({ error: "6-digit code required" });
    }

    const user = await dbGet("SELECT twoFactorSecret FROM users WHERE id = ?", [req.user.id]);
    if (!user?.twoFactorSecret) {
        return res.status(400).json({ error: "Authenticator is not configured for current user" });
    }

    const totp = new OTPAuth.TOTP({
        issuer: 'AIMANA',
        label: req.user.email || 'AIMANA',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: user.twoFactorSecret
    });
    const delta = totp.validate({ token: String(code), window: 1 });
    if (delta === null) return res.status(401).json({ error: "Invalid code" });

    res.json({ success: true, deleteVerificationToken: issueDeleteVerificationToken(req.user.id) });
});

// --- Custom Project Types (Intents) ---

router.get('/project-types', async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM custom_project_types ORDER BY createdAt ASC");
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/project-types', requireAdmin, async (req, res) => {
    try {
        const userId = req.user.id;
        const { label, description, iconName, color } = req.body;
        const id = label.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        await dbRun(`INSERT INTO custom_project_types (id, label, description, iconName, color, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, label, description, iconName || 'LayoutGrid', color || '#6366f1', Date.now()]);
        
        await logSystemEvent('INFO', 'SETTINGS', `Forged new Neural Intent: ${label}`, userId);
        res.status(201).json({ id, label, description, iconName, color });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/project-types/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.user.id;
        const { label, description, iconName, color } = req.body;
        await dbRun(`UPDATE custom_project_types SET label=?, description=?, iconName=?, color=? WHERE id=?`,
            [label, description, iconName, color, req.params.id]);
        
        await logSystemEvent('INFO', 'SETTINGS', `Updated Neural Intent: ${label}`, userId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/project-types/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.user.id;
        await dbRun("DELETE FROM custom_project_types WHERE id = ?", [req.params.id]);
        await logSystemEvent('WARN', 'SETTINGS', `Decommissioned Neural Intent: ${req.params.id}`, userId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Bulk Presets Logic ---

router.get('/bulk-presets', async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await dbAll("SELECT * FROM bulk_presets WHERE userId = ? ORDER BY createdAt DESC", [userId]);
        res.json(rows.map(r => ({ 
            ...r, 
            variables: JSON.parse(r.variablesJson) 
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bulk-presets', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, variables, manifest, inputMode } = req.body;
        const id = uuidv4();
        await dbRun(`INSERT INTO bulk_presets (id, name, variablesJson, manifest, inputMode, createdAt, userId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, JSON.stringify(variables), manifest || '', inputMode || 'text', Date.now(), userId]);
        await logSystemEvent('INFO', 'BULK', `Created synthesis engine preset: ${name}`, userId);
        res.status(201).json({ id, name, variables, manifest, inputMode });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/bulk-presets/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, variables, manifest, inputMode } = req.body;
        await dbRun(`UPDATE bulk_presets SET name=?, variablesJson=?, manifest=?, inputMode=? WHERE id=? AND userId=?`,
            [name, JSON.stringify(variables), manifest, inputMode, req.params.id, userId]);
        await logSystemEvent('INFO', 'BULK', `Updated synthesis engine preset: ${name}`, userId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bulk-presets/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        await dbRun("DELETE FROM bulk_presets WHERE id = ? AND userId = ?", [req.params.id, userId]);
        await logSystemEvent('WARN', 'BULK', `Deleted variable preset ID: ${req.params.id}`, userId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Neural Variable Registry Lists ---

router.get('/variable-registry-lists', async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await dbAll(
            `SELECT * FROM neural_variable_registry_lists WHERE userId = ? ORDER BY updatedAt DESC, createdAt DESC`,
            [userId]
        );
        res.json(rows.map((row) => ({
            ...row,
            variables: JSON.parse(row.variablesJson)
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/variable-registry-lists', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, variables } = req.body || {};
        const trimmedName = String(name || '').trim();
        if (!trimmedName) {
            return res.status(400).json({ error: 'List name is required.' });
        }

        const timestamp = Date.now();
        const id = uuidv4();
        await dbRun(
            `INSERT INTO neural_variable_registry_lists (id, name, variablesJson, createdAt, updatedAt, userId)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, trimmedName, JSON.stringify(Array.isArray(variables) ? variables : []), timestamp, timestamp, userId]
        );
        await logSystemEvent('INFO', 'PROMPT', `Created neural variable registry list: ${trimmedName}`, userId);
        res.status(201).json({ id, name: trimmedName, variables: Array.isArray(variables) ? variables : [], createdAt: timestamp, updatedAt: timestamp });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/variable-registry-lists/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, variables } = req.body || {};
        const trimmedName = String(name || '').trim();
        if (!trimmedName) {
            return res.status(400).json({ error: 'List name is required.' });
        }

        const timestamp = Date.now();
        await dbRun(
            `UPDATE neural_variable_registry_lists
             SET name = ?, variablesJson = ?, updatedAt = ?
             WHERE id = ? AND userId = ?`,
            [trimmedName, JSON.stringify(Array.isArray(variables) ? variables : []), timestamp, req.params.id, userId]
        );
        await logSystemEvent('INFO', 'PROMPT', `Updated neural variable registry list: ${trimmedName}`, userId);
        res.json({ success: true, updatedAt: timestamp });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/variable-registry-lists/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        await dbRun("DELETE FROM neural_variable_registry_lists WHERE id = ? AND userId = ?", [req.params.id, userId]);
        await logSystemEvent('WARN', 'PROMPT', `Deleted neural variable registry list ID: ${req.params.id}`, userId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Prompt Manager Drafts ---

const parsePromptManagerDraftRevisionHistory = (raw) => {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const mapPromptManagerDraftRow = (row) => {
    const { revisionHistoryJson, ...draft } = row;
    return {
        ...draft,
        thumbnailBlur: Boolean(row.thumbnailBlur),
        revisionHistory: parsePromptManagerDraftRevisionHistory(revisionHistoryJson)
    };
};

router.get('/prompt-manager-drafts', async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await dbAll(
            `SELECT * FROM prompt_manager_drafts WHERE userId = ? ORDER BY updatedAt DESC, createdAt DESC`,
            [userId]
        );
        res.json(rows.map(mapPromptManagerDraftRow));
    } catch (e) {
        await logSystemEvent('ERROR', 'PROMPT_MANAGER', `Failed to load prompt drafts: ${e.message}`, req.user.id);
        res.status(500).json({ error: e.message });
    }
});

router.put('/prompt-manager-drafts', async (req, res) => {
    try {
        const userId = req.user.id;
        const drafts = Array.isArray(req.body?.drafts) ? req.body.drafts : [];
        await withTransaction(async () => {
            for (const draft of drafts) {
                if (!draft?.id) continue;
                await dbRun(
                    `INSERT INTO prompt_manager_drafts (
                        id, userId, title, prompt, raw, label, tags, note, source, status,
                        ingestionState, queueLetter, queueNumber, previewImageUrl, previewMimeType, thumbnailBlur,
                        previewError, previewErrorDetails, revisionHistoryJson, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        userId = excluded.userId,
                        title = excluded.title,
                        prompt = excluded.prompt,
                        raw = excluded.raw,
                        label = excluded.label,
                        tags = excluded.tags,
                        note = excluded.note,
                        source = excluded.source,
                        status = excluded.status,
                        ingestionState = excluded.ingestionState,
                        queueLetter = excluded.queueLetter,
                        queueNumber = excluded.queueNumber,
                        previewImageUrl = excluded.previewImageUrl,
                        previewMimeType = excluded.previewMimeType,
                        thumbnailBlur = excluded.thumbnailBlur,
                        previewError = excluded.previewError,
                        previewErrorDetails = excluded.previewErrorDetails,
                        revisionHistoryJson = excluded.revisionHistoryJson,
                        createdAt = excluded.createdAt,
                        updatedAt = excluded.updatedAt
                    WHERE excluded.userId = prompt_manager_drafts.userId
                      AND excluded.updatedAt >= prompt_manager_drafts.updatedAt`,
                    [
                        String(draft.id),
                        userId,
                        String(draft.title || ''),
                        String(draft.prompt || ''),
                        draft.raw == null ? null : String(draft.raw),
                        draft.label == null ? null : String(draft.label),
                        draft.tags == null ? null : String(draft.tags),
                        draft.note == null ? null : String(draft.note),
                        draft.source == null ? null : String(draft.source),
                        String(draft.status || 'staging'),
                        draft.ingestionState == null ? null : String(draft.ingestionState),
                        draft.queueLetter == null ? null : String(draft.queueLetter),
                        draft.queueNumber == null ? null : String(draft.queueNumber),
                        draft.previewImageUrl == null ? null : String(draft.previewImageUrl),
                        draft.previewMimeType == null ? null : String(draft.previewMimeType),
                        draft.thumbnailBlur ? 1 : 0,
                        draft.previewError == null ? null : String(draft.previewError),
                        draft.previewErrorDetails == null ? null : String(draft.previewErrorDetails),
                        JSON.stringify(Array.isArray(draft.revisionHistory) ? draft.revisionHistory : []),
                        Number(draft.createdAt || Date.now()),
                        Number(draft.updatedAt || Date.now())
                    ]
                );
            }
        });
        await logSystemEvent('INFO', 'PROMPT_MANAGER', `Upserted ${drafts.length} prompt draft(s) via legacy save endpoint`, userId);
        res.json({ success: true, count: drafts.length });
    } catch (e) {
        await logSystemEvent('ERROR', 'PROMPT_MANAGER', `Failed to save prompt drafts: ${e.message}`, req.user.id);
        res.status(500).json({ error: e.message });
    }
});

router.post('/prompt-manager-drafts/append', async (req, res) => {
    try {
        const userId = req.user.id;
        const drafts = Array.isArray(req.body?.drafts) ? req.body.drafts : [];
        for (const draft of drafts) {
            if (!draft?.id) continue;
            await dbRun(
                `INSERT INTO prompt_manager_drafts (
                    id, userId, title, prompt, raw, label, tags, note, source, status,
                        ingestionState, queueLetter, queueNumber, previewImageUrl, previewMimeType, thumbnailBlur,
                        previewError, previewErrorDetails, revisionHistoryJson, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    userId = excluded.userId,
                    title = excluded.title,
                    prompt = excluded.prompt,
                    raw = excluded.raw,
                    label = excluded.label,
                    tags = excluded.tags,
                    note = excluded.note,
                    source = excluded.source,
                    status = excluded.status,
                    ingestionState = excluded.ingestionState,
                    queueLetter = excluded.queueLetter,
                    queueNumber = excluded.queueNumber,
                    previewImageUrl = excluded.previewImageUrl,
                    previewMimeType = excluded.previewMimeType,
                    thumbnailBlur = excluded.thumbnailBlur,
                    previewError = excluded.previewError,
                    previewErrorDetails = excluded.previewErrorDetails,
                    revisionHistoryJson = excluded.revisionHistoryJson,
                    createdAt = excluded.createdAt,
                    updatedAt = excluded.updatedAt
                WHERE excluded.userId = prompt_manager_drafts.userId
                  AND excluded.updatedAt >= prompt_manager_drafts.updatedAt`,
                [
                    String(draft.id),
                    userId,
                    String(draft.title || ''),
                    String(draft.prompt || ''),
                    draft.raw == null ? null : String(draft.raw),
                    draft.label == null ? null : String(draft.label),
                    draft.tags == null ? null : String(draft.tags),
                    draft.note == null ? null : String(draft.note),
                    draft.source == null ? null : String(draft.source),
                    String(draft.status || 'staging'),
                    draft.ingestionState == null ? null : String(draft.ingestionState),
                    draft.queueLetter == null ? null : String(draft.queueLetter),
                    draft.queueNumber == null ? null : String(draft.queueNumber),
                    draft.previewImageUrl == null ? null : String(draft.previewImageUrl),
                    draft.previewMimeType == null ? null : String(draft.previewMimeType),
                    draft.thumbnailBlur ? 1 : 0,
                    draft.previewError == null ? null : String(draft.previewError),
                    draft.previewErrorDetails == null ? null : String(draft.previewErrorDetails),
                    JSON.stringify(Array.isArray(draft.revisionHistory) ? draft.revisionHistory : []),
                    Number(draft.createdAt || Date.now()),
                    Number(draft.updatedAt || Date.now())
                ]
            );
        }
        await logSystemEvent('INFO', 'PROMPT_MANAGER', `Appended ${drafts.length} prompt draft(s)`, userId);
        res.status(201).json({ success: true, count: drafts.length });
    } catch (e) {
        await logSystemEvent('ERROR', 'PROMPT_MANAGER', `Failed to append prompt drafts: ${e.message}`, req.user.id);
        res.status(500).json({ error: e.message });
    }
});

router.post('/prompt-manager-drafts/delete', async (req, res) => {
    try {
        const userId = req.user.id;
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
        const uniqueIds = Array.from(new Set(ids));
        for (const id of uniqueIds) {
            await dbRun(`DELETE FROM prompt_manager_drafts WHERE userId = ? AND id = ?`, [userId, id]);
        }
        await logSystemEvent('INFO', 'PROMPT_MANAGER', `Deleted ${uniqueIds.length} prompt draft row(s)`, userId);
        res.json({ success: true, count: uniqueIds.length });
    } catch (e) {
        await logSystemEvent('ERROR', 'PROMPT_MANAGER', `Failed to delete prompt drafts: ${e.message}`, req.user.id);
        res.status(500).json({ error: e.message });
    }
});

router.post('/prompt-manager-drafts/upload-image', async (req, res) => {
    try {
        const userId = req.user.id;
        const draftId = String(req.body?.draftId || '').trim();
        const dataUrl = String(req.body?.dataUrl || '').trim();
        const mimeType = String(req.body?.mimeType || '').trim();

        if (!draftId) {
            return res.status(400).json({ error: 'draftId is required' });
        }
        if (!dataUrl) {
            return res.status(400).json({ error: 'dataUrl is required' });
        }

        const saved = savePromptManagerDraftAsset({ userId, draftId, dataUrl, mimeType });
        await logSystemEvent('INFO', 'PROMPT_MANAGER', `Saved local draft image for ${draftId}`, userId);
        res.status(201).json(saved);
    } catch (e) {
        await logSystemEvent('ERROR', 'PROMPT_MANAGER', `Failed to save local draft image: ${e.message}`, req.user.id);
        res.status(500).json({ error: e.message });
    }
});

// --- Active / Archived Variable Registry ---

router.get('/active-variable-registry', async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await dbAll(
            `SELECT * FROM active_variable_registry_entries WHERE userId = ? ORDER BY position ASC, updatedAt DESC`,
            [userId]
        );
        res.json(rows.map((row) => ({
            id: row.id,
            key: row.variableKey,
            value: row.variableValue
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/active-variable-registry', async (req, res) => {
    try {
        const userId = req.user.id;
        const variables = Array.isArray(req.body?.variables) ? req.body.variables : [];
        const timestamp = Date.now();
        await withTransaction(async () => {
            await dbRun(`DELETE FROM active_variable_registry_entries WHERE userId = ?`, [userId]);
            for (let index = 0; index < variables.length; index += 1) {
                const variable = variables[index];
                if (!variable?.id) continue;
                await dbRun(
                    `INSERT INTO active_variable_registry_entries (
                        id, userId, variableKey, variableValue, position, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        String(variable.id),
                        userId,
                        String(variable.key || ''),
                        String(variable.value || ''),
                        index,
                        timestamp,
                        timestamp
                    ]
                );
            }
        });
        res.json({ success: true, count: variables.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/archived-variable-registry', async (req, res) => {
    try {
        const userId = req.user.id;
        const rows = await dbAll(
            `SELECT * FROM archived_variable_registry_entries WHERE userId = ? ORDER BY deletedAt DESC, position ASC`,
            [userId]
        );
        res.json(rows.map((row) => ({
            id: row.id,
            variable: {
                id: row.variableId,
                key: row.variableKey,
                value: row.variableValue
            },
            deletedAt: row.deletedAt,
            source: row.source,
            collectionId: row.collectionId || undefined,
            collectionName: row.collectionName || undefined
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/archived-variable-registry', async (req, res) => {
    try {
        const userId = req.user.id;
        const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
        await withTransaction(async () => {
            await dbRun(`DELETE FROM archived_variable_registry_entries WHERE userId = ?`, [userId]);
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index];
                if (!entry?.id || !entry?.variable?.id) continue;
                await dbRun(
                    `INSERT INTO archived_variable_registry_entries (
                        id, userId, variableId, variableKey, variableValue,
                        deletedAt, source, collectionId, collectionName, position
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        String(entry.id),
                        userId,
                        String(entry.variable.id),
                        String(entry.variable.key || ''),
                        String(entry.variable.value || ''),
                        Number(entry.deletedAt || Date.now()),
                        String(entry.source || 'active'),
                        entry.collectionId == null ? null : String(entry.collectionId),
                        entry.collectionName == null ? null : String(entry.collectionName),
                        index
                    ]
                );
            }
        });
        res.json({ success: true, count: entries.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Bulk Studio State ---

router.get('/bulk-studio-state', async (req, res) => {
    try {
        const userId = req.user.id;
        const row = await dbGet(`SELECT * FROM bulk_studio_state WHERE userId = ?`, [userId]);
        if (!row) {
            return res.json({
                variables: [],
                tasks: [],
                failedTasks: [],
                archivedTasks: [],
                isActive: false,
                batchModelId: null,
                updatedAt: 0
            });
        }
        res.json({
            variables: JSON.parse(row.variablesJson || '[]'),
            tasks: JSON.parse(row.tasksJson || '[]'),
            failedTasks: JSON.parse(row.failedTasksJson || '[]'),
            archivedTasks: JSON.parse(row.archivedTasksJson || '[]'),
            isActive: !!row.isActive,
            batchModelId: row.batchModelId || null,
            updatedAt: row.updatedAt || 0
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/bulk-studio-state', async (req, res) => {
    try {
        const userId = req.user.id;
        const body = req.body || {};
        const timestamp = Date.now();
        await dbRun(
            `INSERT INTO bulk_studio_state (
                userId, variablesJson, tasksJson, failedTasksJson, archivedTasksJson, isActive, batchModelId, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId) DO UPDATE SET
                variablesJson=excluded.variablesJson,
                tasksJson=excluded.tasksJson,
                failedTasksJson=excluded.failedTasksJson,
                archivedTasksJson=excluded.archivedTasksJson,
                isActive=excluded.isActive,
                batchModelId=excluded.batchModelId,
                updatedAt=excluded.updatedAt`,
            [
                userId,
                JSON.stringify(Array.isArray(body.variables) ? body.variables : []),
                JSON.stringify(Array.isArray(body.tasks) ? body.tasks : []),
                JSON.stringify(Array.isArray(body.failedTasks) ? body.failedTasks : []),
                JSON.stringify(Array.isArray(body.archivedTasks) ? body.archivedTasks : []),
                body.isActive ? 1 : 0,
                body.batchModelId == null ? null : String(body.batchModelId),
                timestamp
            ]
        );
        res.json({ success: true, updatedAt: timestamp });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bulk-studio-state/append-tasks', async (req, res) => {
    try {
        const userId = req.user.id;
        const tasksToAppend = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
        const row = await dbGet(`SELECT tasksJson FROM bulk_studio_state WHERE userId = ?`, [userId]);
        const existingTasks = row?.tasksJson ? JSON.parse(row.tasksJson) : [];
        const mergedTasks = [...existingTasks, ...tasksToAppend];
        const current = await dbGet(`SELECT * FROM bulk_studio_state WHERE userId = ?`, [userId]);
        const timestamp = Date.now();
        await dbRun(
            `INSERT INTO bulk_studio_state (
                userId, variablesJson, tasksJson, failedTasksJson, archivedTasksJson, isActive, batchModelId, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId) DO UPDATE SET
                tasksJson=excluded.tasksJson,
                updatedAt=excluded.updatedAt`,
            [
                userId,
                current?.variablesJson || '[]',
                JSON.stringify(mergedTasks),
                current?.failedTasksJson || '[]',
                current?.archivedTasksJson || '[]',
                current?.isActive ? 1 : 0,
                current?.batchModelId || null,
                timestamp
            ]
        );
        res.status(201).json({ success: true, count: tasksToAppend.length, updatedAt: timestamp });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- AI Lab Workspace State ---

router.get('/lab-workspace-state', async (req, res) => {
    try {
        const userId = req.user.id;
        const row = await dbGet(`SELECT * FROM lab_workspace_state WHERE userId = ?`, [userId]);
        if (!row) {
            return res.json({ state: null, updatedAt: 0 });
        }
        let state = null;
        try {
            state = row.stateJson ? JSON.parse(row.stateJson) : null;
        } catch {
            state = null;
        }
        return res.json({
            state,
            updatedAt: Number.isFinite(row.updatedAt) ? Number(row.updatedAt) : 0
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/lab-workspace-state', async (req, res) => {
    try {
        const userId = req.user.id;
        const state = req.body?.state && typeof req.body.state === 'object' ? req.body.state : {};
        const updatedAt = Date.now();
        await dbRun(
            `INSERT INTO lab_workspace_state (userId, stateJson, updatedAt)
             VALUES (?, ?, ?)
             ON CONFLICT(userId) DO UPDATE SET
                stateJson = excluded.stateJson,
                updatedAt = excluded.updatedAt`,
            [userId, JSON.stringify(state), updatedAt]
        );
        return res.json({ success: true, updatedAt });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Dynamic Registry API ---

const POLLINATIONS_TEXT_MODELS_URL = 'https://gen.pollinations.ai/text/models';
const POLLINATIONS_V1_MODELS_URL = 'https://gen.pollinations.ai/v1/models';
const POLLINATIONS_AUDIO_MODELS_URL = 'https://gen.pollinations.ai/audio/models';
const POLLINATIONS_MEDIA_MODELS_URL = 'https://gen.pollinations.ai/image/models';
const POLLINATIONS_CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const POLLINATIONS_CHAT_HEADERS = '{"Accept":"application/json","Content-Type":"application/json"}';
const POLLINATIONS_CHAT_BODY_TEMPLATE = '{"model":"{{upstreamId}}","messages":[{"role":"system","content":{{system_json}}},{"role":"user","content":{{prompt_json}}}],"temperature":{{temperature}},"max_tokens":{{max_tokens}},"stream":false}';
const LANGUAGE_FEATURES_JSON = JSON.stringify({
    showDimensions: false,
    showSeed: false,
    showNegativePrompt: false,
    showEnhancements: false,
    showNologo: false,
    showImageInput: false,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: false
});
const AUDIO_FEATURES_JSON = JSON.stringify({
    showDimensions: false,
    showSeed: false,
    showNegativePrompt: false,
    showEnhancements: false,
    showNologo: false,
    showImageInput: false,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: false
});
const VIDEO_RATIO_OPTIONS = [
    { label: 'Widescreen (16:9)', value: '16:9' },
    { label: 'Portrait (9:16)', value: '9:16' }
];
const POLLINATIONS_VIDEO_MODEL_OVERRIDES = {
    veo: {
        iconName: 'Video',
        audioMode: 'toggle',
        supportsImageInput: true,
        durationControl: {
            type: 'select',
            default: 4,
            options: [
                { label: '4 Seconds', value: 4 },
                { label: '6 Seconds', value: 6 },
                { label: '8 Seconds', value: 8 }
            ],
            description: 'Veo supports 4, 6, or 8 second presets.'
        }
    },
    seedance: {
        iconName: 'Activity',
        audioMode: 'toggle',
        supportsImageInput: true,
        durationControl: {
            type: 'slider',
            min: 2,
            max: 10,
            step: 1,
            default: 4,
            description: 'Seedance supports 2-10 second clips.'
        }
    },
    'seedance-pro': {
        iconName: 'Video',
        audioMode: 'toggle',
        supportsImageInput: true,
        durationControl: {
            type: 'slider',
            min: 2,
            max: 10,
            step: 1,
            default: 4,
            description: 'Seedance Pro supports 2-10 second clips.'
        }
    },
    wan: {
        iconName: 'Video',
        audioMode: 'none',
        supportsImageInput: true,
        durationControl: {
            type: 'select',
            default: 6,
            options: [
                { label: '2 Seconds', value: 2 },
                { label: '4 Seconds', value: 4 },
                { label: '6 Seconds', value: 6 },
                { label: '8 Seconds', value: 8 },
                { label: '10 Seconds', value: 10 },
                { label: '12 Seconds', value: 12 },
                { label: '15 Seconds', value: 15 }
            ],
            description: 'Wan supports approximately 2-15 second clips.'
        }
    },
    'grok-video': {
        iconName: 'Video',
        audioMode: 'toggle',
        supportsImageInput: true,
        durationControl: {
            type: 'select',
            default: 4,
            options: [
                { label: '1 Second', value: 1 },
                { label: '2 Seconds', value: 2 },
                { label: '4 Seconds', value: 4 },
                { label: '6 Seconds', value: 6 },
                { label: '8 Seconds', value: 8 },
                { label: '10 Seconds', value: 10 }
            ],
            description: 'Duration control for Grok Video via Pollinations.'
        }
    },
    'ltx-2': {
        iconName: 'Video',
        audioMode: 'fixed-true',
        supportsImageInput: true,
        durationControl: {
            type: 'slider',
            min: 1,
            max: 10,
            step: 1,
            default: 4,
            description: 'LTX-2 supports up to about 10 seconds.'
        }
    }
};
const IMAGE_RATIO_OPTIONS = ['3:4', '4:3', '1:1', '9:16', '16:9'];
const POLLINATIONS_IMAGE_MODEL_OVERRIDES = {
    flux: {
        id: 'pollinations-flux',
        label: 'Flux',
        iconName: 'FlaskConical',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportNologo: true,
        supportPrivateFlags: true,
        supportImageInput: false
    },
    'flux-2-dev': {
        id: 'pollinations-flux-2-dev',
        label: 'FLUX.2 Dev',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportNologo: true,
        supportPrivateFlags: false,
        supportImageInput: false,
        defaultNegativePrompt: 'blur, low quality, distorted, extra limbs, watermark, text, signature'
    },
    kontext: {
        id: 'pollinations-kontext',
        label: 'FLUX.1 Kontext',
        iconName: 'BrainCircuit',
        efficiencyTier: 'Tier-Advanced',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    nanobanana: {
        id: 'pollinations-nanobanana',
        label: 'NanoBanana',
        iconName: 'Zap',
        efficiencyTier: 'Tier-Express',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    'nanobanana-2': {
        id: 'pollinations-nanobanana-2',
        label: 'NanoBanana 2',
        iconName: 'Zap',
        efficiencyTier: 'Tier-Advanced',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    'nanobanana-pro': {
        id: 'pollinations-nanobanana-pro',
        label: 'NanoBanana Pro',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    seedream5: {
        id: 'pollinations-seedream5',
        label: 'Seedream 5',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    gptimage: {
        id: 'pollinations-gpt-image',
        label: 'GPT Image',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Stable',
        supportGuidance: true,
        supportQuality: true,
        supportTransparent: true,
        supportImageInput: true
    },
    'gptimage-large': {
        id: 'pollinations-gpt-image-large',
        label: 'GPT Image Large',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportQuality: true,
        supportTransparent: true,
        supportImageInput: true,
        isPaid: true
    },
    'p-image': {
        id: 'pollinations-p-image',
        label: 'P-Image',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        isPaid: true
    },
    'p-image-edit': {
        id: 'pollinations-p-image-edit',
        label: 'P-Image Edit',
        iconName: 'Wand2',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    seedream: {
        id: 'pollinations-seedream',
        label: 'Seedream',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Stable',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    zimage: {
        id: 'pollinations-z-image',
        label: 'ZImage',
        iconName: 'Layers',
        efficiencyTier: 'Tier-Express',
        supportGuidance: true,
        supportImageInput: false
    },
    'qwen-image': {
        id: 'pollinations-qwen-image',
        label: 'Qwen Image',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Advanced',
        supportImageInput: true
    },
    klein: {
        id: 'pollinations-klein',
        label: 'Klein',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportImageInput: true
    },
    'klein-large': {
        id: 'pollinations-klein-large',
        label: 'Klein Large',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportImageInput: true
    },
    'imagen-4': {
        id: 'pollinations-imagen-4',
        label: 'Imagen 4',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportNologo: true,
        defaultNegativePrompt: 'blur, low quality, distorted, extra limbs, watermark, text, signature'
    },
    'grok-imagine': {
        id: 'pollinations-grok-imagine',
        label: 'Grok Imagine',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Experimental'
    },
    'grok-imagine-pro': {
        id: 'pollinations-grok-imagine-pro',
        label: 'Grok Imagine Pro',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        isPaid: true
    },
    'seedream-pro': {
        id: 'pollinations-seedream-4-5-pro',
        label: 'Seedream 4.5 Pro',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        supportGuidance: true,
        supportImageInput: true,
        isPaid: true
    },
    dirtberry: {
        id: 'pollinations-dirtberry',
        label: 'Dirtberry',
        iconName: 'Wand2',
        efficiencyTier: 'Tier-Experimental',
        supportImageInput: true
    },
    'dirtberry-pro': {
        id: 'pollinations-dirtberry-pro',
        label: 'Dirtberry Pro',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        supportImageInput: true,
        isPaid: true
    },
    'nova-canvas': {
        id: 'pollinations-nova-canvas',
        label: 'Nova Canvas',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        supportImageInput: true,
        isPaid: true
    }
};
const POLLINATIONS_PAID_IMAGE_FALLBACKS = [
    {
        name: 'p-image',
        description: 'P-Image - Premium paid image generation model',
        input_modalities: ['text'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'p-image-edit',
        description: 'P-Image Edit - Premium paid image editing model',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'seedream',
        description: 'Seedream - Paid Seedream image generation model',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'seedream-pro',
        description: 'Seedream 4.5 Pro - Paid Seedream pro image generation model',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'nanobanana-2',
        description: 'NanoBanana 2 - Paid second-generation NanoBanana image model',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'gptimage-large',
        description: 'GPT Image Large - Paid large GPT image model',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'grok-imagine-pro',
        description: 'Grok Imagine Pro - Paid Aurora image model',
        input_modalities: ['text'],
        output_modalities: ['image'],
        paid_only: true
    },
    {
        name: 'nova-canvas',
        description: 'Nova Canvas - Paid Bedrock image generation and editing model',
        input_modalities: ['text', 'image'],
        output_modalities: ['image'],
        paid_only: true
    }
];
const LANGUAGE_UI_SCHEMA_JSON = JSON.stringify([
    {
        key: 'temperature',
        label: 'Temperature',
        type: 'slider',
        min: 0,
        max: 2,
        step: 0.1,
        default: 0.7,
        description: 'Controls creativity and variability of responses.'
    },
    {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'slider',
        min: 64,
        max: 8192,
        step: 64,
        default: 1024,
        description: 'Upper bound for completion length.'
    }
]);
const POLLINATIONS_PAID_TEXT_FALLBACKS = [
    {
        name: 'openai-large',
        description: 'OpenAI GPT-5.2 - Most Powerful & Intelligent',
        tools: true,
        reasoning: true,
        context_length: 400000,
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'gemini',
        description: 'Google Gemini 3 Flash - Pro-Grade Reasoning at Flash Speed',
        tools: true,
        context_length: 1048576,
        input_modalities: ['text', 'image', 'audio', 'video'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'grok',
        description: 'xAI Grok 4.1 Fast - High Speed & Real-Time',
        tools: true,
        context_length: 2000000,
        input_modalities: ['text'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'grok-reasoning',
        description: 'xAI Grok 4.1 Fast Reasoning - Chain-of-Thought Reasoning',
        tools: true,
        reasoning: true,
        context_length: 2000000,
        input_modalities: ['text'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'claude',
        description: 'Anthropic Claude Sonnet 4.6 - Most Capable & Balanced',
        tools: true,
        context_length: 200000,
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'claude-large',
        description: 'Anthropic Claude Opus 4.6 - Most Intelligent Model',
        tools: true,
        context_length: 200000,
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'gemini-large',
        description: 'Google Gemini 3.1 Pro - Most Intelligent Model with 1M Context (Preview)',
        tools: true,
        reasoning: true,
        context_length: 1048576,
        input_modalities: ['text', 'image', 'audio', 'video'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'midijourney-large',
        description: 'MIDIjourney Large - Premium AI Music Composition',
        tools: true,
        input_modalities: ['text'],
        output_modalities: ['text'],
        is_specialized: true,
        paid_only: true
    },
    {
        name: 'nova',
        description: 'Amazon Nova 2 Lite - 1M Context with Reasoning',
        tools: true,
        reasoning: true,
        context_length: 1048576,
        input_modalities: ['text'],
        output_modalities: ['text'],
        paid_only: true
    },
    {
        name: 'qwen-coder-large',
        description: 'Qwen3 Coder Next - Advanced Code Generation via DashScope',
        tools: true,
        context_length: 262144,
        input_modalities: ['text'],
        output_modalities: ['text'],
        paid_only: true
    }
];

const toStringArray = (value) => (
    Array.isArray(value)
        ? value.map((v) => String(v || '').trim()).filter(Boolean)
        : []
);

const toPricingRecordOrNull = (value) => (
    value && typeof value === 'object' ? value : null
);

const mergeCatalogModelsByName = (...sources) => {
    const modelMap = new Map();

    for (const source of sources) {
        if (!Array.isArray(source)) continue;
        for (const model of source) {
            const name = String(model?.name || '').trim();
            if (!name) continue;

            const existing = modelMap.get(name);
            if (!existing) {
                modelMap.set(name, model);
                continue;
            }

            const mergedAliases = Array.from(new Set([
                ...toStringArray(existing?.aliases),
                ...toStringArray(model?.aliases)
            ]));
            const mergedInputModalities = Array.from(new Set([
                ...toStringArray(existing?.input_modalities),
                ...toStringArray(model?.input_modalities)
            ]));
            const mergedOutputModalities = Array.from(new Set([
                ...toStringArray(existing?.output_modalities),
                ...toStringArray(model?.output_modalities)
            ]));
            const mergedVoices = Array.from(new Set([
                ...toStringArray(existing?.voices),
                ...toStringArray(model?.voices)
            ]));
            const incomingPricing = toPricingRecordOrNull(model?.pricing);
            const existingPricing = toPricingRecordOrNull(existing?.pricing);

            modelMap.set(name, {
                ...existing,
                ...model,
                aliases: mergedAliases,
                input_modalities: mergedInputModalities,
                output_modalities: mergedOutputModalities,
                voices: mergedVoices,
                pricing: incomingPricing || existingPricing
            });
        }
    }

    return Array.from(modelMap.values());
};

const parseCatalogResponse = async (result) => {
    if (!result || result.__fetchError || !result.ok) return [];
    const payload = await result.json().catch(() => null);
    return Array.isArray(payload) ? payload : [];
};

const POLLINATIONS_PRICING_CACHE_TTL_MS = 5 * 60 * 1000;
let pollinationsPricingCache = {
    expiresAt: 0,
    text: new Map(),
    audio: new Map(),
    media: new Map()
};
const POLLINATIONS_MEDIA_PRICING_FALLBACKS = {
    'qwen-image': { currency: 'pollen', completionImageTokens: 0.03 },
    'qwen-image-plus': { currency: 'pollen', completionImageTokens: 0.03 }
};
const POLLINATIONS_AUDIO_PRICING_FALLBACKS = {
    whisper: { currency: 'pollen', promptAudioSeconds: 0.0000445 },
    'whisper-large-v3': { currency: 'pollen', promptAudioSeconds: 0.0000445 },
    'whisper-1': { currency: 'pollen', promptAudioSeconds: 0.0000445 },
    scribe: { currency: 'pollen', promptAudioSeconds: 0.0001111 },
    elevenlabs: { currency: 'pollen', completionAudioTokens: 0.00018 },
    elevenmusic: { currency: 'pollen', completionAudioSeconds: 0.005 }
};
const POLLINATIONS_AUDIO_PAID_FALLBACKS = new Set(['elevenmusic']);

const getPollinationsMediaPricingFallback = (upstreamId) => {
    const key = String(upstreamId || '').trim().toLowerCase();
    if (!key) return null;
    const fallback = POLLINATIONS_MEDIA_PRICING_FALLBACKS[key];
    return fallback && typeof fallback === 'object' ? fallback : null;
};

const normalizePollinationsAudioPricing = (upstreamId, pricing) => {
    const key = String(upstreamId || '').trim().toLowerCase();
    if (!key) return null;
    const fallback = POLLINATIONS_AUDIO_PRICING_FALLBACKS[key];
    if (fallback && typeof fallback === 'object') return fallback;

    const candidate = pricing && typeof pricing === 'object' ? pricing : null;
    if (!candidate) return null;
    return {
        ...candidate,
        currency: typeof candidate.currency === 'string' && candidate.currency.trim() ? candidate.currency : 'pollen'
    };
};

const isPollinationsAudioPaidModel = (upstreamId, remotePaidOnly = false) => {
    const key = String(upstreamId || '').trim().toLowerCase();
    if (key && POLLINATIONS_AUDIO_PAID_FALLBACKS.has(key)) return true;
    return !!remotePaidOnly;
};

const toPricingMap = (models = []) => {
    const pricingMap = new Map();
    for (const model of models) {
        const name = String(model?.name || '').trim();
        const pricing = toPricingRecordOrNull(model?.pricing);
        if (!name || !pricing) continue;
        pricingMap.set(name, pricing);
    }
    return pricingMap;
};

const getPollinationsPricingCache = async () => {
    const now = Date.now();
    if (
        now < pollinationsPricingCache.expiresAt
        && pollinationsPricingCache.text.size > 0
        && pollinationsPricingCache.media.size > 0
    ) {
        return pollinationsPricingCache;
    }

    const [textRes, audioRes, mediaRes] = await Promise.all([
        fetch(POLLINATIONS_TEXT_MODELS_URL, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(12000)
        }).catch((err) => ({ __fetchError: err })),
        fetch(POLLINATIONS_AUDIO_MODELS_URL, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(12000)
        }).catch((err) => ({ __fetchError: err })),
        fetch(POLLINATIONS_MEDIA_MODELS_URL, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(12000)
        }).catch((err) => ({ __fetchError: err }))
    ]);

    const [textModels, audioModels, mediaModels] = await Promise.all([
        parseCatalogResponse(textRes),
        parseCatalogResponse(audioRes),
        parseCatalogResponse(mediaRes)
    ]);

    const next = {
        expiresAt: now + POLLINATIONS_PRICING_CACHE_TTL_MS,
        text: toPricingMap(textModels),
        audio: toPricingMap(audioModels),
        media: toPricingMap(mediaModels)
    };

    if (next.text.size > 0 || next.audio.size > 0 || next.media.size > 0) {
        pollinationsPricingCache = next;
    } else {
        pollinationsPricingCache = {
            ...pollinationsPricingCache,
            expiresAt: now + 30 * 1000
        };
    }

    return pollinationsPricingCache;
};

const withLivePollinationsPricing = (row, pricingCache) => {
    if (!row || String(row.provider || '').toLowerCase() !== 'pollinations') return row;
    const upstreamId = String(row.upstreamId || '').trim();
    if (!upstreamId) return row;

    let parsedConfig = {};
    try {
        parsedConfig = row.configJson ? JSON.parse(row.configJson) : {};
    } catch {
        parsedConfig = {};
    }

    let nextIsPaid = row.isPaid;
    let changed = false;
    if (row.category === 'Language') {
        const live = pricingCache?.text?.get(upstreamId) || null;
        if (live) {
            parsedConfig.textPricing = live;
            changed = true;
        }
    } else if (row.category === 'Audio') {
        const live = normalizePollinationsAudioPricing(upstreamId, pricingCache?.audio?.get(upstreamId) || null);
        if (live) {
            parsedConfig.textPricing = live;
            changed = true;
        }
        const paid = isPollinationsAudioPaidModel(upstreamId, !!row.isPaid);
        if (paid !== !!row.isPaid) {
            nextIsPaid = paid ? 1 : 0;
            changed = true;
        }
    } else if (row.category === 'Visual') {
        const live = pricingCache?.media?.get(upstreamId) || getPollinationsMediaPricingFallback(upstreamId) || null;
        if (live) {
            parsedConfig.imagePricing = live;
            changed = true;
        }
    } else if (row.category === 'Motion') {
        const live = pricingCache?.media?.get(upstreamId) || null;
        if (live) {
            parsedConfig.videoPricing = live;
            changed = true;
        }
    }

    if (!changed) return row;
    return {
        ...row,
        configJson: JSON.stringify(parsedConfig),
        isPaid: nextIsPaid
    };
};

const toSlug = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toTitle = (value) => String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

const normalizeTextUpstreamId = (modelName, aliases = []) => {
    const name = String(modelName || '').trim();
    if (!name) return name;
    const normalized = name.replace(/\./g, '-');
    if (aliases.includes(normalized)) return normalized;
    return name;
};

const normalizeTextInputModalities = (modelName, inputModalities) => {
    const name = String(modelName || '').trim();
    const normalized = Array.from(new Set((inputModalities || []).map((m) => String(m || '').toLowerCase()).filter(Boolean)));
    if (name === 'openai-audio') {
        // Live endpoint behavior rejects image_url for this model despite catalog metadata.
        return normalized.filter((m) => m !== 'image');
    }
    return normalized;
};

const isV1TextChatModel = (model = {}) => {
    const id = String(model?.id || '').trim();
    if (!id) return false;
    const endpoints = toStringArray(model?.supported_endpoints);
    return endpoints.includes('/v1/chat/completions');
};

const toV1TextModelShape = (model = {}) => {
    const name = String(model?.id || '').trim();
    if (!name) return null;
    return {
        name,
        aliases: [],
        input_modalities: toStringArray(model?.input_modalities).map((m) => String(m || '').toLowerCase()),
        output_modalities: toStringArray(model?.output_modalities).map((m) => String(m || '').toLowerCase()),
        tools: model?.tools === true,
        reasoning: model?.reasoning === true,
        context_length: Number.isFinite(Number(model?.context_length)) ? Number(model.context_length) : undefined,
        is_specialized: false
    };
};

const formatContextLength = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1)}K`;
    return `${num}`;
};

const POLLINATIONS_SEARCH_MODEL_OVERRIDES = new Set([
    'gemini-search',
    'perplexity-fast',
    'perplexity-reasoning',
    'nomnom',
    'polly'
]);

const SEARCH_KEYWORD = /\bsearch\b/i;
const REASONING_KEYWORD = /\breasoning\b/i;

const modelSupportsTools = (model = {}) => model?.tools === true;

const modelSupportsSearch = (model = {}) => {
    const name = String(model?.name || '').trim().toLowerCase();
    const description = String(model?.description || '').trim().toLowerCase();
    if (SEARCH_KEYWORD.test(name) || SEARCH_KEYWORD.test(description)) return true;
    return POLLINATIONS_SEARCH_MODEL_OVERRIDES.has(name);
};

const modelSupportsReasoning = (model = {}) => {
    if (model?.reasoning) return true;
    const name = String(model?.name || '').trim().toLowerCase();
    const description = String(model?.description || '').trim().toLowerCase();
    return REASONING_KEYWORD.test(name) || REASONING_KEYWORD.test(description);
};

const deriveCapabilities = (model) => {
    const caps = new Set(['text']);
    const name = String(model?.name || '').toLowerCase();
    const description = String(model?.description || '').toLowerCase();
    const inputModalities = normalizeTextInputModalities(
        model?.name,
        toStringArray(model?.input_modalities)
    );
    const outputModalities = toStringArray(model?.output_modalities).map((m) => m.toLowerCase());

    if (modelSupportsReasoning(model)) caps.add('logic');
    if (modelSupportsSearch(model)) caps.add('search');
    if (name.includes('coder') || description.includes('code')) caps.add('code');
    if (inputModalities.includes('image')) caps.add('image');
    if (inputModalities.includes('audio') || outputModalities.includes('audio')) caps.add('audio');
    if (inputModalities.includes('video') || outputModalities.includes('video')) caps.add('video');

    return Array.from(caps);
};

const deriveIconName = (model, capabilities) => {
    if (capabilities.includes('code')) return 'Code2';
    if (modelSupportsReasoning(model)) return 'BrainCircuit';
    if (modelSupportsSearch(model)) return 'Search';
    return 'Type';
};

const deriveEfficiencyTier = (model) => {
    const completionCost = Number(model?.pricing?.completionTextTokens);
    if (!Number.isFinite(completionCost) || completionCost <= 0) return 'Tier-Stable';
    if (completionCost <= 0.0000005) return 'Tier-Express';
    if (completionCost <= 0.000003) return 'Tier-Stable';
    return 'Tier-Elite';
};

const deriveLimits = (model) => {
    const parts = [];
    const context = formatContextLength(model?.context_length);
    if (context) parts.push(`Ctx ${context}`);
    if (modelSupportsTools(model)) parts.push('Tools');
    if (modelSupportsReasoning(model)) parts.push('Reasoning');
    if (model?.paid_only) parts.push('Paid');
    if (model?.is_specialized) parts.push('Specialized');
    return parts.join(' | ') || 'Dynamic';
};

const deriveAudioCapabilities = (model = {}) => {
    const caps = new Set();
    const inputModalities = toStringArray(model?.input_modalities).map((m) => String(m || '').toLowerCase());
    const outputModalities = toStringArray(model?.output_modalities).map((m) => String(m || '').toLowerCase());
    if (inputModalities.includes('text') || outputModalities.includes('text')) caps.add('text');
    if (inputModalities.includes('audio') || outputModalities.includes('audio')) caps.add('audio');
    return Array.from(caps);
};

const deriveAudioLimits = (model = {}, override = {}) => {
    const parts = [];
    const pricing = model?.pricing || {};
    if (pricing?.completionAudioTokens) parts.push('Audio Tokens');
    if (pricing?.completionAudioSeconds) parts.push('Audio Seconds');
    if (pricing?.promptAudioSeconds) parts.push('Audio Input');
    if (model?.paid_only || override.isPaid) parts.push('Paid');
    return parts.join(' | ') || 'Dynamic';
};

const isMusicAudioModel = (model = {}) => {
    const name = String(model?.name || '').toLowerCase();
    const description = String(model?.description || '').toLowerCase();
    return (
        name.includes('music') ||
        name.includes('suno') ||
        name.includes('acestep') ||
        name.includes('ace-step') ||
        name.includes('ace_step') ||
        name.includes('ace step') ||
        description.includes('music') ||
        description.includes('acestep') ||
        description.includes('ace-step') ||
        description.includes('ace_step') ||
        description.includes('ace step')
    );
};

const AUDIO_OUTPUT_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'];
const TRANSCRIPTION_OUTPUT_FORMATS = ['json', 'text', 'srt', 'verbose_json', 'vtt'];
const TRANSCRIPTION_MODEL_OPTIONS = [
    { label: 'Whisper Large V3', value: 'whisper-large-v3' },
    { label: 'Whisper 1', value: 'whisper-1' },
    { label: 'Scribe', value: 'scribe' }
];

const buildTranscriptionAudioUiSchema = (modelId = '') => {
    const normalizedModelId = String(modelId || '').trim().toLowerCase();
    const isScribeModel = normalizedModelId === 'scribe' || normalizedModelId === 'scribe_v2';
    const schema = [
        {
            key: 'response_format',
            label: 'Transcript Format',
            type: 'select',
            default: 'json',
            options: TRANSCRIPTION_OUTPUT_FORMATS.map((fmt) => ({ label: fmt.toUpperCase(), value: fmt })),
            description: isScribeModel
                ? 'Use JSON or VERBOSE JSON to preserve speaker labels and timing metadata.'
                : 'Format for transcription output.'
        },
        {
            key: 'language',
            label: 'Language (ISO-639-1)',
            type: 'text',
            default: '',
            description: 'Optional language hint (e.g., en, fr).'
        },
        {
            key: 'temperature',
            label: 'Temperature',
            type: 'slider',
            min: 0,
            max: 1,
            step: 0.1,
            default: 0,
            description: 'Sampling temperature for transcription.'
        }
    ];

    if (isScribeModel) {
        schema.push(
            {
                key: 'diarize',
                label: 'Speaker Diarization',
                type: 'toggle',
                default: false,
                description: 'Detect and label who is speaking. Structured formats work best for preserving speaker metadata.'
            },
            {
                key: 'num_speakers',
                label: 'Max Speakers',
                type: 'text',
                default: '',
                description: 'Optional maximum speaker count between 1 and 32. Leave empty for automatic detection.'
            },
            {
                key: 'diarization_threshold',
                label: 'Diarization Threshold',
                type: 'text',
                default: '',
                description: 'Optional 0.10 to 0.40 tuning value. Leave empty for the model default. Only used when Max Speakers is empty.'
            }
        );
    }

    return schema;
};

const buildPollinationsAudioSyncEntries = (remote = {}) => {
    const remoteName = String(remote?.name || '').trim();
    if (!remoteName) return [];

    const aliases = toStringArray(remote?.aliases);
    const inputModalities = toStringArray(remote?.input_modalities).map((m) => String(m || '').toLowerCase());
    const outputModalities = toStringArray(remote?.output_modalities).map((m) => String(m || '').toLowerCase());
    const voices = toStringArray(remote?.voices);
    const capabilities = deriveAudioCapabilities(remote);
    const label = String(remote?.description || '').split(' - ')[0]?.trim() || toTitle(remoteName);
    const description = String(remote?.description || '').trim() || `${toTitle(remoteName)} via Pollinations audio gateway.`;
    const isTranscription = inputModalities.includes('audio') && outputModalities.includes('text');
    const isMusic = isMusicAudioModel(remote);
    const baseUpstreamId = remoteName === 'whisper' && aliases.includes('whisper-large-v3')
        ? 'whisper-large-v3'
        : remoteName;
    const remoteIsPaid = isPollinationsAudioPaidModel(baseUpstreamId, !!remote?.paid_only);

    const createConfigJson = (resolvedUpstreamId, isPaid) => JSON.stringify({
        supportedRatios: [],
        dashboardUrl: 'https://enter.pollinations.ai/',
        ratioNotes: '',
        textPaidOnly: !!isPaid,
        textInputModalities: inputModalities,
        textOutputModalities: outputModalities,
        textAliases: Array.from(new Set([resolvedUpstreamId, remoteName, ...aliases])),
        textPricing: normalizePollinationsAudioPricing(resolvedUpstreamId, remote?.pricing),
        textVoices: voices,
        audioSource: 'pollinations/audio/models',
        audioSyncedAt: Date.now()
    });

    const buildVoiceOptions = (items = []) =>
        items.map((voice) => ({ label: toTitle(voice), value: voice }));

    const buildAudioUiSchema = () => {
        if (isTranscription) {
            return buildTranscriptionAudioUiSchema(baseUpstreamId);
        }

        const schema = [];
        if (voices.length > 0) {
            schema.push({
                key: 'voiceName',
                label: 'Voice',
                type: 'select',
                default: voices[0] || 'alloy',
                options: buildVoiceOptions(voices),
                description: 'Voice profile for speech generation.'
            });
        }
        schema.push({
            key: 'response_format',
            label: 'Audio Format',
            type: 'select',
            default: 'mp3',
            options: AUDIO_OUTPUT_FORMATS.map((fmt) => ({ label: fmt.toUpperCase(), value: fmt })),
            description: 'Output audio format.'
        });
        if (isMusic) {
            schema.push({
                key: 'duration',
                label: 'Duration (seconds)',
                type: 'slider',
                min: 3,
                max: 300,
                step: 1,
                default: 30,
                description: 'Music duration in seconds, 3-300 (ElevenMusic only).'
            });
            schema.push({
                key: 'style',
                label: 'Style',
                type: 'text',
                default: '',
                description: 'Optional style guidance for music generation.'
            });
            schema.push({
                key: 'instrumental',
                label: 'Instrumental Only',
                type: 'toggle',
                default: false,
                description: 'Instrumental output only (ElevenMusic only).'
            });
        }
        return schema;
    };

    const requestMethod = isTranscription ? 'POST' : 'GET';
    const baseTtsUrl = 'https://gen.pollinations.ai/audio/{{prompt}}?model={{upstreamId}}';
    const voiceParam = voices.length > 0 ? '&voice={{voiceName}}' : '';
    const formatParam = '&response_format={{response_format}}';
    const musicParams = '&duration={{duration}}&style={{style}}&instrumental={{instrumental}}';
    const requestUrl = isTranscription
        ? 'https://gen.pollinations.ai/v1/audio/transcriptions'
        : `${baseTtsUrl}${voiceParam}${formatParam}${isMusic ? musicParams : ''}`;
    const requestHeaders = isTranscription ? '{}' : '{"Accept":"audio/*"}';
    const requestBodyTemplate = isTranscription ? '' : '';
    const responsePath = isTranscription ? 'text' : '';

    if (!isTranscription) {
        return [{
            id: `pollinations-${toSlug(remoteName)}`,
            label,
            description,
            upstreamId: baseUpstreamId,
            configJson: createConfigJson(baseUpstreamId, remoteIsPaid),
            uiConfigJson: JSON.stringify(buildAudioUiSchema()),
            capabilities: capabilities.join(','),
            requestMethod,
            requestUrl,
            requestHeaders,
            requestBodyTemplate,
            responsePath,
            limits: deriveAudioLimits(remote, { isPaid: remoteIsPaid }),
            isPaid: remoteIsPaid
        }];
    }

    const transcriptionTargets = (() => {
        if (remoteName === 'whisper') {
            return TRANSCRIPTION_MODEL_OPTIONS.filter((option) =>
                option.value === 'whisper-large-v3' || option.value === 'whisper-1'
            );
        }
        if (remoteName === 'scribe') {
            return TRANSCRIPTION_MODEL_OPTIONS.filter((option) => option.value === 'scribe');
        }
        return [{ label, value: baseUpstreamId }];
    })();

    return transcriptionTargets.map((option) => {
        const isWhisperLarge = option.value === 'whisper-large-v3';
        const entryId = isWhisperLarge && remoteName === 'whisper'
            ? 'pollinations-whisper'
            : `pollinations-${toSlug(option.value)}`;
        const entryLabel = option.value === 'scribe' ? label : option.label;
        const entryDescription = option.value === 'whisper-1'
            ? 'Whisper 1 - Alias of Whisper Large V3 speech-to-text transcription (OVHcloud).'
            : description;
        const entryIsPaid = isPollinationsAudioPaidModel(option.value, remoteIsPaid);

        return {
            id: entryId,
            label: entryLabel,
            description: entryDescription,
            upstreamId: option.value,
            configJson: createConfigJson(option.value, entryIsPaid),
            uiConfigJson: JSON.stringify(buildTranscriptionAudioUiSchema(option.value)),
            capabilities: capabilities.join(','),
            requestMethod,
            requestUrl,
            requestHeaders,
            requestBodyTemplate,
            responsePath,
            limits: deriveAudioLimits(remote, { isPaid: entryIsPaid }),
            isPaid: entryIsPaid
        };
    });
};
const isVideoCatalogModel = (model = {}) => {
    const outputModalities = toStringArray(model?.output_modalities).map((m) => String(m || '').toLowerCase());
    return outputModalities.includes('video');
};
const isImageCatalogModel = (model = {}) => {
    const outputModalities = toStringArray(model?.output_modalities).map((m) => String(m || '').toLowerCase());
    return outputModalities.includes('image');
};

const buildImageFeaturesJson = (override = {}) => JSON.stringify({
    showDimensions: true,
    showSeed: true,
    showNegativePrompt: true,
    showEnhancements: true,
    showNologo: !!override.supportNologo,
    showImageInput: !!override.supportImageInput,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: !!override.supportGuidance
});

const buildImageCapabilities = (model = {}, override = {}) => {
    const caps = new Set(['image']);
    const name = String(model?.name || '').trim().toLowerCase();
    const description = String(model?.description || '').trim().toLowerCase();

    if (override.supportTransparent) caps.add('transparent');
    if (override.supportQuality) caps.add('quality');
    if (override.supportImageInput) caps.add('image-edit');
    if (override.supportGuidance) caps.add('guided');
    if (
        name.includes('flux')
        || name.includes('imagen')
        || name.includes('klein')
        || name.includes('seedream')
        || description.includes('high-fidelity')
        || description.includes('photoreal')
    ) {
        caps.add('detailed');
        caps.add('high-fidelity');
    }
    if (name.includes('nanobanana') || name.includes('zimage')) caps.add('fast');
    if (name.includes('grok') || name.includes('dirtberry')) caps.add('creative');
    if (name.includes('kontext')) caps.add('contextual');

    return Array.from(caps);
};

const buildImageRequestUrl = (upstreamId, override = {}) => {
    let url = `https://gen.pollinations.ai/image/{{prompt}}?model=${encodeURIComponent(upstreamId)}&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}`;
    if (override.supportNologo) url += '&nologo={{nologo}}';
    if (override.supportPrivateFlags) url += '&private={{private}}&nofeed={{nofeed}}';
    if (override.supportQuality) url += '&quality={{quality}}';
    if (override.supportTransparent) url += '&transparent={{transparent}}';
    if (override.supportGuidance) url += '&guidance={{guidance_scale}}';
    if (override.supportImageInput) url += '&image={{image}}';
    return url;
};

const buildImageUiSchema = (override = {}) => {
    const schema = [];
    if (override.supportGuidance) {
        schema.push({
            key: 'guidance_scale',
            label: 'Prompt Guidance (CFG)',
            type: 'slider',
            min: 1,
            max: 30,
            step: 0.5,
            default: 7.5,
            description: 'Strength of prompt adherence.'
        });
    }
    if (override.supportQuality) {
        schema.push({
            key: 'quality',
            label: 'Output Quality',
            type: 'select',
            default: 'medium',
            options: [
                { label: 'Low', value: 'low' },
                { label: 'Medium', value: 'medium' },
                { label: 'High', value: 'high' },
                { label: 'HD', value: 'hd' }
            ],
            description: 'Quality tier for GPT Image variants.'
        });
    }
    if (override.supportTransparent) {
        schema.push({
            key: 'transparent',
            label: 'Transparent Background',
            type: 'toggle',
            default: false,
            description: 'Generate with alpha transparency when supported.'
        });
    }
    return schema;
};

const buildImageLimits = (model = {}, override = {}) => {
    const parts = [];
    if (override.supportQuality) parts.push('Quality');
    if (override.supportTransparent) parts.push('Alpha');
    if (override.supportImageInput) parts.push('Image Input');
    if (model?.paid_only || override.isPaid) parts.push('Paid');
    return parts.join(' | ') || 'Dynamic';
};

const buildVideoFeaturesJson = (supportsImageInput) => JSON.stringify({
    showDimensions: false,
    showSeed: true,
    showNegativePrompt: false,
    showEnhancements: false,
    showNologo: false,
    showImageInput: !!supportsImageInput,
    showVideoRatio: true,
    showSampling: false,
    showGuidance: false
});

const buildVideoCapabilities = (model = {}, override = {}) => {
    const caps = new Set(['video', 'motion']);
    const name = String(model?.name || '').trim().toLowerCase();
    const description = String(model?.description || '').trim().toLowerCase();
    const inputModalities = toStringArray(model?.input_modalities).map((m) => String(m || '').toLowerCase());
    const pricing = model?.pricing || {};

    if (inputModalities.includes('image')) caps.add('image');
    if (
        override.audioMode === 'toggle' ||
        override.audioMode === 'fixed-true' ||
        pricing?.completionAudioSeconds ||
        description.includes('audio')
    ) {
        caps.add('audio');
    }
    if (name.includes('veo')) caps.add('cinematic');
    if (name.includes('seedance')) caps.add(name);
    if (name.includes('wan')) caps.add('wan');
    if (name.includes('grok')) caps.add('grok');
    if (name.includes('ltx')) caps.add('ltx');

    return Array.from(caps);
};

const buildVideoLimits = (model = {}) => {
    const parts = [];
    const pricing = model?.pricing || {};
    if (pricing?.completionVideoSeconds) parts.push('Video Seconds');
    if (pricing?.completionVideoTokens) parts.push('Video Tokens');
    if (pricing?.completionAudioSeconds) parts.push('Audio');
    if (model?.paid_only) parts.push('Paid');
    return parts.join(' | ') || 'Tier-Video';
};

const buildVideoRequestUrl = (audioMode, supportsImageInput) => {
    let url = 'https://gen.pollinations.ai/video/{{prompt}}?model={{upstreamId}}&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}';
    if (audioMode === 'toggle') {
        url += '&audio={{audio}}';
    } else if (audioMode === 'fixed-true') {
        url += '&audio=true';
    }
    if (supportsImageInput) {
        url += '&image={{image}}';
    }
    return url;
};

const buildVideoUiSchema = (override = {}) => {
    const durationControl = override.durationControl || {
        type: 'slider',
        min: 1,
        max: 10,
        step: 1,
        default: 4,
        description: 'Video duration in seconds.'
    };

    const schema = [
        {
            key: 'duration',
            label: durationControl.type === 'select' ? 'Clip Duration' : 'Duration (s)',
            type: durationControl.type,
            default: durationControl.default ?? 4,
            description: durationControl.description
        },
        {
            key: 'aspectRatio',
            label: 'Video Aspect Ratio',
            type: 'select',
            default: '16:9',
            options: VIDEO_RATIO_OPTIONS,
            description: 'Pollinations video controls currently use 16:9 and 9:16.'
        }
    ];

    if (durationControl.type === 'select') {
        schema[0].options = durationControl.options || [];
    } else {
        schema[0].min = durationControl.min ?? 1;
        schema[0].max = durationControl.max ?? 10;
        schema[0].step = durationControl.step ?? 1;
    }

    if (override.audioMode === 'toggle') {
        schema.push({
            key: 'audio',
            label: 'Generate Audio',
            type: 'toggle',
            default: false,
            description: 'Enable soundtrack when supported upstream.'
        });
    }

    if (override.supportsImageInput) {
        schema.push({
            key: 'image',
            label: 'Reference Image URL(s)',
            type: 'text',
            default: '',
            description: 'Single URL or multiple URLs separated by | or ,.'
        });
    }

    return schema;
};

router.post('/registry/sync/pollinations-text', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'system';
    try {
        const publicHeaders = { Accept: 'application/json' };
        const headers = { ...publicHeaders };
        const pollinationsApiKey = getRuntimePollinationsApiKey();
        if (pollinationsApiKey) {
            headers.Authorization = `Bearer ${pollinationsApiKey}`;
        }

        const [upstreamRes, publicRes, v1ResResult] = await Promise.all([
            fetch(POLLINATIONS_TEXT_MODELS_URL, {
                headers,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err })),
            fetch(POLLINATIONS_TEXT_MODELS_URL, {
                headers: publicHeaders,
                signal: AbortSignal.timeout(20000)
            }),
            fetch(POLLINATIONS_V1_MODELS_URL, {
                headers,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err }))
        ]);

        const [upstreamModels, publicModels] = await Promise.all([
            parseCatalogResponse(upstreamRes),
            parseCatalogResponse(publicRes)
        ]);
        const mergedTextModels = mergeCatalogModelsByName(upstreamModels, publicModels);
        if (mergedTextModels.length === 0) {
            const upstreamStatus = upstreamRes?.status || 0;
            const publicStatus = publicRes?.status || 0;
            throw new Error(`Pollinations /text/models sync failed (${upstreamStatus || publicStatus || 'request error'})`);
        }

        let v1TextModels = [];
        if (v1ResResult && !v1ResResult.__fetchError) {
            if (v1ResResult.ok) {
                const v1Payload = await v1ResResult.json();
                const v1Models = Array.isArray(v1Payload?.data) ? v1Payload.data : [];
                v1TextModels = v1Models
                    .filter(isV1TextChatModel)
                    .map(toV1TextModelShape)
                    .filter(Boolean);
            } else {
                console.warn(`[SETTINGS] Pollinations /v1/models sync fallback unavailable (${v1ResResult.status}). Continuing with /text/models only.`);
            }
        } else if (v1ResResult?.__fetchError) {
            console.warn(`[SETTINGS] Pollinations /v1/models sync fallback failed: ${v1ResResult.__fetchError?.message || 'unknown error'}`);
        }

        const modelMap = new Map();
        for (const model of mergedTextModels) {
            const key = String(model?.name || '').trim();
            if (!key) continue;
            modelMap.set(key, model);
        }

        for (const v1Model of v1TextModels) {
            const key = String(v1Model?.name || '').trim();
            if (!key || modelMap.has(key)) continue;
            modelMap.set(key, v1Model);
        }

        // Some paid-only models may be omitted for restricted keys.
        // Ensure core paid language models are still represented in the registry.
        for (const fallback of POLLINATIONS_PAID_TEXT_FALLBACKS) {
            const existing = modelMap.get(fallback.name);
            if (existing) {
                const inputModalities = toStringArray(existing?.input_modalities);
                const outputModalities = toStringArray(existing?.output_modalities);
                modelMap.set(fallback.name, {
                    ...fallback,
                    ...existing,
                    aliases: toStringArray(existing?.aliases),
                    input_modalities: inputModalities.length > 0 ? inputModalities : (fallback.input_modalities || ['text']),
                    output_modalities: outputModalities.length > 0 ? outputModalities : (fallback.output_modalities || ['text']),
                    pricing: existing?.pricing && typeof existing.pricing === 'object' ? existing.pricing : { currency: 'pollen' },
                    is_specialized: typeof existing?.is_specialized === 'boolean'
                        ? existing.is_specialized
                        : !!fallback.is_specialized,
                    paid_only: typeof existing?.paid_only === 'boolean'
                        ? existing.paid_only
                        : !!fallback.paid_only
                });
                continue;
            }
            modelMap.set(fallback.name, {
                ...fallback,
                aliases: [],
                input_modalities: Array.isArray(fallback.input_modalities) ? fallback.input_modalities : ['text'],
                output_modalities: Array.isArray(fallback.output_modalities) ? fallback.output_modalities : ['text'],
                pricing: { currency: 'pollen' },
                is_specialized: typeof fallback.is_specialized === 'boolean' ? fallback.is_specialized : false
            });
        }
        const syncModels = Array.from(modelMap.values());

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const skippedIds = [];

        for (const remote of syncModels) {
            const remoteName = String(remote?.name || '').trim();
            if (!remoteName) continue;

            const id = `pollinations-${toSlug(remoteName)}`;
            const aliases = toStringArray(remote?.aliases);
            const upstreamId = normalizeTextUpstreamId(remoteName, aliases);
            const inputModalities = normalizeTextInputModalities(remoteName, toStringArray(remote?.input_modalities));
            const outputModalities = toStringArray(remote?.output_modalities);
            const voices = toStringArray(remote?.voices);
            const capabilities = deriveCapabilities(remote);
            const iconName = deriveIconName(remote, capabilities);
            const label = String(remote?.description || '').split(' - ')[0]?.trim() || toTitle(remoteName);
            const description = String(remote?.description || '').trim() || `${toTitle(remoteName)} via Pollinations text gateway.`;
            const configJson = JSON.stringify({
                supportedRatios: [],
                dashboardUrl: 'https://enter.pollinations.ai/',
                ratioNotes: '',
                textContextLength: Number.isFinite(Number(remote?.context_length)) ? Number(remote.context_length) : null,
                textTools: modelSupportsTools(remote),
                textReasoning: modelSupportsReasoning(remote),
                textPaidOnly: !!remote?.paid_only,
                textSpecialized: !!remote?.is_specialized,
                textInputModalities: inputModalities,
                textOutputModalities: outputModalities,
                textAliases: aliases,
                textPricing: remote?.pricing && typeof remote.pricing === 'object' ? remote.pricing : null,
                textVoices: voices,
                textSource: 'pollinations/text/models',
                textSyncedAt: Date.now()
            });

            const existing = await dbGet(
                `SELECT id, isSystem FROM custom_engines WHERE id = ?`,
                [id]
            );

            if (existing && !existing.isSystem) {
                skipped += 1;
                skippedIds.push(id);
                continue;
            }

            if (existing) {
                await dbRun(
                    `UPDATE custom_engines SET
                        label=?,
                        description=?,
                        provider='pollinations',
                        category='Language',
                        upstreamId=?,
                        systemInstruction='',
                        iconName=?,
                        efficiencyTier=?,
                        configJson=?,
                        uiConfigJson=?,
                        featuresJson=?,
                        isProgrammable=1,
                        requestMethod='POST',
                        requestUrl=?,
                        requestHeaders=?,
                        requestBodyTemplate=?,
                        responsePath='choices.0.message.content',
                        capabilities=?,
                        isSystem=1,
                        apiKey=NULL,
                        limits=?,
                        isPaid=?
                      WHERE id=?`,
                    [
                        label,
                        description,
                        upstreamId,
                        iconName,
                        deriveEfficiencyTier(remote),
                        configJson,
                        LANGUAGE_UI_SCHEMA_JSON,
                        LANGUAGE_FEATURES_JSON,
                        POLLINATIONS_CHAT_URL,
                        POLLINATIONS_CHAT_HEADERS,
                        POLLINATIONS_CHAT_BODY_TEMPLATE,
                        capabilities.join(','),
                        deriveLimits(remote),
                        remote?.paid_only ? 1 : 0,
                        id
                    ]
                );
                updated += 1;
            } else {
                await dbRun(
                    `INSERT INTO custom_engines (
                        id, label, description, provider, category, upstreamId, systemInstruction,
                        iconName, efficiencyTier, configJson, uiConfigJson, featuresJson,
                        isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
                        capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt, isPaid
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [
                        id,
                        label,
                        description,
                        'pollinations',
                        'Language',
                        upstreamId,
                        '',
                        iconName,
                        deriveEfficiencyTier(remote),
                        configJson,
                        LANGUAGE_UI_SCHEMA_JSON,
                        LANGUAGE_FEATURES_JSON,
                        1,
                        'POST',
                        POLLINATIONS_CHAT_URL,
                        POLLINATIONS_CHAT_HEADERS,
                        POLLINATIONS_CHAT_BODY_TEMPLATE,
                        'choices.0.message.content',
                        capabilities.join(','),
                        1,
                        null,
                        deriveLimits(remote),
                        0,
                        null,
                        remote?.paid_only ? 1 : 0
                    ]
                );
                inserted += 1;
            }
        }

        await dbRun(`DELETE FROM custom_engines WHERE id = 'pollinations-p1' AND provider = 'pollinations' AND category = 'Language'`);

        await logSystemEvent(
            'INFO',
            'REGISTRY',
            `Pollinations text model sync completed. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}.`,
            userId
        );

        res.json({
            success: true,
            source: POLLINATIONS_TEXT_MODELS_URL,
            sourceV1Fallback: POLLINATIONS_V1_MODELS_URL,
            totalRemote: mergedTextModels.length,
            totalSynced: syncModels.length,
            inserted,
            updated,
            skipped,
            skippedIds
        });
    } catch (e) {
        await logSystemEvent(
            'ERROR',
            'REGISTRY',
            `Pollinations text model sync failed: ${e.message}`,
            userId
        );
        res.status(502).json({ error: e.message || 'Failed to sync Pollinations text models' });
    }
});

router.post('/registry/sync/pollinations-image', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'system';
    try {
        const publicHeaders = { Accept: 'application/json' };
        const headers = { ...publicHeaders };
        const pollinationsApiKey = getRuntimePollinationsApiKey();
        if (pollinationsApiKey) {
            headers.Authorization = `Bearer ${pollinationsApiKey}`;
        }

        const [upstreamRes, publicRes] = await Promise.all([
            fetch(POLLINATIONS_MEDIA_MODELS_URL, {
                headers,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err })),
            fetch(POLLINATIONS_MEDIA_MODELS_URL, {
                headers: publicHeaders,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err }))
        ]);

        const [upstreamModels, publicModels] = await Promise.all([
            parseCatalogResponse(upstreamRes),
            parseCatalogResponse(publicRes)
        ]);
        const mergedMediaModels = mergeCatalogModelsByName(upstreamModels, publicModels);
        if (mergedMediaModels.length === 0) {
            const upstreamStatus = upstreamRes?.status || 0;
            const publicStatus = publicRes?.status || 0;
            throw new Error(`Pollinations image catalog sync failed (${upstreamStatus || publicStatus || 'request error'})`);
        }

        const baseVisualModels = mergedMediaModels.filter(isImageCatalogModel);
        const visualModels = [
            ...baseVisualModels,
            ...POLLINATIONS_PAID_IMAGE_FALLBACKS.filter((fallback) => (
                !baseVisualModels.some((model) => String(model?.name || '').trim().toLowerCase() === fallback.name)
            ))
        ];
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const skippedIds = [];
        const syncedIds = [];
        const syncTimestamp = Date.now();

        for (const remote of visualModels) {
            const remoteName = String(remote?.name || '').trim();
            if (!remoteName) continue;

            const override = POLLINATIONS_IMAGE_MODEL_OVERRIDES[remoteName] || {};
            const id = override.id || `pollinations-${toSlug(remoteName)}`;
            const aliases = toStringArray(remote?.aliases);
            const inputModalities = toStringArray(remote?.input_modalities).map((m) => String(m || '').toLowerCase());
            const outputModalities = toStringArray(remote?.output_modalities).map((m) => String(m || '').toLowerCase());
            const label = override.label || String(remote?.description || '').split(' - ')[0]?.trim() || toTitle(remoteName);
            const description = String(remote?.description || '').trim() || `${toTitle(remoteName)} via Pollinations image gateway.`;
            const requestUrl = buildImageRequestUrl(remoteName, {
                ...override,
                supportImageInput: typeof override.supportImageInput === 'boolean'
                    ? override.supportImageInput
                    : inputModalities.includes('image')
            });
            const uiConfigJson = JSON.stringify(buildImageUiSchema(override));
            const featuresJson = buildImageFeaturesJson({
                ...override,
                supportImageInput: typeof override.supportImageInput === 'boolean'
                    ? override.supportImageInput
                    : inputModalities.includes('image')
            });
            const configJson = JSON.stringify({
                supportedRatios: IMAGE_RATIO_OPTIONS,
                dashboardUrl: 'https://enter.pollinations.ai/',
                ratioNotes: 'Pollinations image controls surfaced in AIMANA: 3:4, 4:3, 1:1, 9:16, 16:9, plus custom dimensions.',
                imageAliases: aliases,
                imagePricing: toPricingRecordOrNull(remote?.pricing) || getPollinationsMediaPricingFallback(remoteName),
                imageInputModalities: inputModalities,
                imageOutputModalities: outputModalities,
                imageSource: 'pollinations/image/models',
                imageSyncedAt: syncTimestamp
            });
            const capabilities = buildImageCapabilities(remote, {
                ...override,
                supportImageInput: typeof override.supportImageInput === 'boolean'
                    ? override.supportImageInput
                    : inputModalities.includes('image')
            });

            const existing = await dbGet(
                `SELECT id, isSystem FROM custom_engines WHERE id = ?`,
                [id]
            );

            if (existing && !existing.isSystem) {
                skipped += 1;
                skippedIds.push(id);
                continue;
            }

            syncedIds.push(id);

            if (existing) {
                await dbRun(
                    `UPDATE custom_engines SET
                        label=?,
                        description=?,
                        provider='pollinations',
                        category='Visual',
                        upstreamId=?,
                        systemInstruction='',
                        iconName=?,
                        efficiencyTier=?,
                        configJson=?,
                        uiConfigJson=?,
                        featuresJson=?,
                        isProgrammable=1,
                        requestMethod='GET',
                        requestUrl=?,
                        requestHeaders='{"Accept":"image/*"}',
                        requestBodyTemplate='',
                        responsePath='',
                        capabilities=?,
                        isSystem=1,
                        apiKey=NULL,
                        limits=?,
                        defaultNegativePrompt=?,
                        isPaid=?
                      WHERE id=?`,
                    [
                        label,
                        description,
                        remoteName,
                        override.iconName || 'Image',
                        override.efficiencyTier || 'Tier-Stable',
                        configJson,
                        uiConfigJson,
                        featuresJson,
                        requestUrl,
                        capabilities.join(','),
                        buildImageLimits(remote, override),
                        override.defaultNegativePrompt || null,
                        (remote?.paid_only || override.isPaid) ? 1 : 0,
                        id
                    ]
                );
                updated += 1;
            } else {
                await dbRun(
                    `INSERT INTO custom_engines (
                        id, label, description, provider, category, upstreamId, systemInstruction,
                        iconName, efficiencyTier, configJson, uiConfigJson, featuresJson,
                        isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
                        capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt, isPaid
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [
                        id,
                        label,
                        description,
                        'pollinations',
                        'Visual',
                        remoteName,
                        '',
                        override.iconName || 'Image',
                        override.efficiencyTier || 'Tier-Stable',
                        configJson,
                        uiConfigJson,
                        featuresJson,
                        1,
                        'GET',
                        requestUrl,
                        '{"Accept":"image/*"}',
                        '',
                        '',
                        capabilities.join(','),
                        1,
                        null,
                        buildImageLimits(remote, override),
                        0,
                        override.defaultNegativePrompt || null,
                        (remote?.paid_only || override.isPaid) ? 1 : 0
                    ]
                );
                inserted += 1;
            }
        }

        if (syncedIds.length > 0) {
            const placeholders = syncedIds.map(() => '?').join(',');
            await dbRun(
                `DELETE FROM custom_engines
                 WHERE provider = 'pollinations'
                   AND category = 'Visual'
                   AND isSystem = 1
                   AND id NOT IN (${placeholders})`,
                syncedIds
            );
        }

        await logSystemEvent(
            'INFO',
            'REGISTRY',
            `Pollinations image model sync completed. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}.`,
            userId
        );

        res.json({
            success: true,
            source: POLLINATIONS_MEDIA_MODELS_URL,
            totalRemote: mergedMediaModels.length,
            totalSynced: visualModels.length,
            inserted,
            updated,
            skipped,
            skippedIds,
            syncedIds
        });
    } catch (e) {
        await logSystemEvent(
            'ERROR',
            'REGISTRY',
            `Pollinations image model sync failed: ${e.message}`,
            userId
        );
        res.status(502).json({ error: e.message || 'Failed to sync Pollinations image models' });
    }
});

router.post('/registry/sync/pollinations-video', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'system';
    try {
        const publicHeaders = { Accept: 'application/json' };
        const headers = { ...publicHeaders };
        const pollinationsApiKey = getRuntimePollinationsApiKey();
        if (pollinationsApiKey) {
            headers.Authorization = `Bearer ${pollinationsApiKey}`;
        }

        const [upstreamRes, publicRes] = await Promise.all([
            fetch(POLLINATIONS_MEDIA_MODELS_URL, {
                headers,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err })),
            fetch(POLLINATIONS_MEDIA_MODELS_URL, {
                headers: publicHeaders,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err }))
        ]);

        const [upstreamModels, publicModels] = await Promise.all([
            parseCatalogResponse(upstreamRes),
            parseCatalogResponse(publicRes)
        ]);
        const mergedMediaModels = mergeCatalogModelsByName(upstreamModels, publicModels);
        if (mergedMediaModels.length === 0) {
            const upstreamStatus = upstreamRes?.status || 0;
            const publicStatus = publicRes?.status || 0;
            throw new Error(`Pollinations video catalog sync failed (${upstreamStatus || publicStatus || 'request error'})`);
        }

        const motionModels = mergedMediaModels.filter(isVideoCatalogModel);
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const skippedIds = [];
        const syncedIds = [];
        const syncTimestamp = Date.now();

        for (const remote of motionModels) {
            const remoteName = String(remote?.name || '').trim();
            if (!remoteName) continue;

            const override = POLLINATIONS_VIDEO_MODEL_OVERRIDES[remoteName] || {};
            const id = `pollinations-${toSlug(remoteName)}`;
            const aliases = toStringArray(remote?.aliases);
            const inputModalities = toStringArray(remote?.input_modalities).map((m) => String(m || '').toLowerCase());
            const outputModalities = toStringArray(remote?.output_modalities).map((m) => String(m || '').toLowerCase());
            const label = String(remote?.description || '').split(' - ')[0]?.trim() || toTitle(remoteName);
            const description = String(remote?.description || '').trim() || `${toTitle(remoteName)} via Pollinations video gateway.`;
            const supportsImageInput = typeof override.supportsImageInput === 'boolean'
                ? override.supportsImageInput
                : inputModalities.includes('image');
            const audioMode = override.audioMode || 'none';
            const capabilities = buildVideoCapabilities(remote, override);
            const configJson = JSON.stringify({
                supportedRatios: VIDEO_RATIO_OPTIONS.map((ratio) => ratio.value),
                dashboardUrl: 'https://enter.pollinations.ai/',
                ratioNotes: 'Pollinations video controls currently surfaced in AIMANA: 16:9 and 9:16.',
                videoAliases: aliases,
                videoPricing: remote?.pricing && typeof remote.pricing === 'object' ? remote.pricing : null,
                videoInputModalities: inputModalities,
                videoOutputModalities: outputModalities,
                videoSource: 'pollinations/image/models',
                videoSyncedAt: syncTimestamp
            });
            const requestUrl = buildVideoRequestUrl(audioMode, supportsImageInput);
            const uiConfigJson = JSON.stringify(buildVideoUiSchema(override));
            const featuresJson = buildVideoFeaturesJson(supportsImageInput);

            const existing = await dbGet(
                `SELECT id, isSystem FROM custom_engines WHERE id = ?`,
                [id]
            );

            if (existing && !existing.isSystem) {
                skipped += 1;
                skippedIds.push(id);
                continue;
            }

            syncedIds.push(id);

            if (existing) {
                await dbRun(
                    `UPDATE custom_engines SET
                        label=?,
                        description=?,
                        provider='pollinations',
                        category='Motion',
                        upstreamId=?,
                        systemInstruction='',
                        iconName=?,
                        efficiencyTier='Tier-Video',
                        configJson=?,
                        uiConfigJson=?,
                        featuresJson=?,
                        isProgrammable=1,
                        requestMethod='GET',
                        requestUrl=?,
                        requestHeaders='{"Accept":"video/*"}',
                        requestBodyTemplate='',
                        responsePath='',
                        capabilities=?,
                        isSystem=1,
                        apiKey=NULL,
                        limits=?,
                        isPaid=?
                      WHERE id=?`,
                    [
                        label,
                        description,
                        remoteName,
                        override.iconName || 'Video',
                        configJson,
                        uiConfigJson,
                        featuresJson,
                        requestUrl,
                        capabilities.join(','),
                        buildVideoLimits(remote),
                        remote?.paid_only ? 1 : 0,
                        id
                    ]
                );
                updated += 1;
            } else {
                await dbRun(
                    `INSERT INTO custom_engines (
                        id, label, description, provider, category, upstreamId, systemInstruction,
                        iconName, efficiencyTier, configJson, uiConfigJson, featuresJson,
                        isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
                        capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt, isPaid
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [
                        id,
                        label,
                        description,
                        'pollinations',
                        'Motion',
                        remoteName,
                        '',
                        override.iconName || 'Video',
                        'Tier-Video',
                        configJson,
                        uiConfigJson,
                        featuresJson,
                        1,
                        'GET',
                        requestUrl,
                        '{"Accept":"video/*"}',
                        '',
                        '',
                        capabilities.join(','),
                        1,
                        null,
                        buildVideoLimits(remote),
                        0,
                        null,
                        remote?.paid_only ? 1 : 0
                    ]
                );
                inserted += 1;
            }
        }

        if (syncedIds.length > 0) {
            const placeholders = syncedIds.map(() => '?').join(',');
            await dbRun(
                `DELETE FROM custom_engines
                 WHERE provider = 'pollinations'
                   AND category = 'Motion'
                   AND isSystem = 1
                   AND id NOT IN (${placeholders})`,
                syncedIds
            );
        }

        await logSystemEvent(
            'INFO',
            'REGISTRY',
            `Pollinations video model sync completed. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}.`,
            userId
        );

        res.json({
            success: true,
            source: POLLINATIONS_MEDIA_MODELS_URL,
            totalRemote: mergedMediaModels.length,
            totalSynced: motionModels.length,
            inserted,
            updated,
            skipped,
            skippedIds,
            syncedIds
        });
    } catch (e) {
        await logSystemEvent(
            'ERROR',
            'REGISTRY',
            `Pollinations video model sync failed: ${e.message}`,
            userId
        );
        res.status(502).json({ error: e.message || 'Failed to sync Pollinations video models' });
    }
});

router.post('/registry/sync/pollinations-audio', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'system';
    try {
        const publicHeaders = { Accept: 'application/json' };
        const headers = { ...publicHeaders };
        const pollinationsApiKey = getRuntimePollinationsApiKey();
        if (pollinationsApiKey) {
            headers.Authorization = `Bearer ${pollinationsApiKey}`;
        }

        const [upstreamRes, publicRes] = await Promise.all([
            fetch(POLLINATIONS_AUDIO_MODELS_URL, {
                headers,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err })),
            fetch(POLLINATIONS_AUDIO_MODELS_URL, {
                headers: publicHeaders,
                signal: AbortSignal.timeout(20000)
            }).catch((err) => ({ __fetchError: err }))
        ]);

        const [upstreamModels, publicModels] = await Promise.all([
            parseCatalogResponse(upstreamRes),
            parseCatalogResponse(publicRes)
        ]);
        const mergedAudioModels = mergeCatalogModelsByName(upstreamModels, publicModels);
        if (mergedAudioModels.length === 0) {
            const upstreamStatus = upstreamRes?.status || 0;
            const publicStatus = publicRes?.status || 0;
            throw new Error(`Pollinations /audio/models sync failed (${upstreamStatus || publicStatus || 'request error'})`);
        }

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const skippedIds = [];

        const syncEntries = mergedAudioModels.flatMap((remote) => buildPollinationsAudioSyncEntries(remote));

        for (const entry of syncEntries) {
            const existing = await dbGet(
                `SELECT id, isSystem FROM custom_engines WHERE id = ?`,
                [entry.id]
            );

            if (existing && !existing.isSystem) {
                skipped += 1;
                skippedIds.push(entry.id);
                continue;
            }

            if (existing) {
                await dbRun(
                    `UPDATE custom_engines SET
                        label=?,
                        description=?,
                        provider='pollinations',
                        category='Audio',
                        upstreamId=?,
                        systemInstruction='',
                        iconName='Volume2',
                        efficiencyTier='Tier-Stable',
                        configJson=?,
                        uiConfigJson=?,
                        featuresJson=?,
                        isProgrammable=1,
                        requestMethod=?,
                        requestUrl=?,
                        requestHeaders=?,
                        requestBodyTemplate=?,
                        responsePath=?,
                        capabilities=?,
                        isSystem=1,
                        apiKey=NULL,
                        limits=?,
                        isPaid=?
                      WHERE id=?`,
                    [
                        entry.label,
                        entry.description,
                        entry.upstreamId,
                        entry.configJson,
                        entry.uiConfigJson,
                        AUDIO_FEATURES_JSON,
                        entry.requestMethod,
                        entry.requestUrl,
                        entry.requestHeaders,
                        entry.requestBodyTemplate,
                        entry.responsePath,
                        entry.capabilities,
                        entry.limits,
                        entry.isPaid ? 1 : 0,
                        entry.id
                    ]
                );
                updated += 1;
            } else {
                await dbRun(
                    `INSERT INTO custom_engines (
                        id, label, description, provider, category, upstreamId, systemInstruction,
                        iconName, efficiencyTier, configJson, uiConfigJson, featuresJson,
                        isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
                        capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt, isPaid
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [
                        entry.id,
                        entry.label,
                        entry.description,
                        'pollinations',
                        'Audio',
                        entry.upstreamId,
                        '',
                        'Volume2',
                        'Tier-Stable',
                        entry.configJson,
                        entry.uiConfigJson,
                        AUDIO_FEATURES_JSON,
                        1,
                        entry.requestMethod,
                        entry.requestUrl,
                        entry.requestHeaders,
                        entry.requestBodyTemplate,
                        entry.responsePath,
                        entry.capabilities,
                        1,
                        null,
                        entry.limits,
                        0,
                        null,
                        entry.isPaid ? 1 : 0
                    ]
                );
                inserted += 1;
            }
        }

        if (syncEntries.length > 0) {
            const placeholders = syncEntries.map(() => '?').join(',');
            await dbRun(
                `DELETE FROM custom_engines
                 WHERE provider = 'pollinations'
                   AND category = 'Audio'
                   AND isSystem = 1
                   AND json_extract(configJson, '$.audioSource') = 'pollinations/audio/models'
                   AND id NOT IN (${placeholders})`,
                syncEntries.map((entry) => entry.id)
            );
        }

        await logSystemEvent(
            'INFO',
            'REGISTRY',
            `Pollinations audio model sync completed. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}.`,
            userId
        );

        res.json({
            success: true,
            source: POLLINATIONS_AUDIO_MODELS_URL,
            totalRemote: mergedAudioModels.length,
            totalSynced: syncEntries.length,
            inserted,
            updated,
            skipped,
            skippedIds
        });
    } catch (e) {
        await logSystemEvent(
            'ERROR',
            'REGISTRY',
            `Pollinations audio model sync failed: ${e.message}`,
            userId
        );
        res.status(502).json({ error: e.message || 'Failed to sync Pollinations audio models' });
    }
});

router.post('/registry/sync/google-models', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'system';
    try {
        const result = await syncGoogleRegistryModels({
            dbGet,
            dbRun,
            apiKey: process.env.API_KEY
        });

        await logSystemEvent(
            'INFO',
            'REGISTRY',
            `Google model sync completed. Inserted: ${result.inserted}, Updated: ${result.updated}, Synced: ${result.totalSynced}.`,
            userId
        );

        res.json({
            success: true,
            ...result
        });
    } catch (e) {
        await logSystemEvent(
            'ERROR',
            'REGISTRY',
            `Google model sync failed: ${e.message}`,
            userId
        );
        res.status(502).json({ error: e.message || 'Failed to sync Google models' });
    }
});

router.get('/registry', async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM custom_engines");
        const pricingMode = String(req.query?.pricing || '').toLowerCase();
        const shouldLoadLivePricing = pricingMode !== 'static' && pricingMode !== 'none' && pricingMode !== 'cached';
        const pricingCache = shouldLoadLivePricing
            ? await getPollinationsPricingCache().catch(() => null)
            : null;
        const pricedRows = pricingCache
            ? rows.map((row) => withLivePollinationsPricing(row, pricingCache))
            : rows;
        res.json(pricedRows.map(toPublicRegistryRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/registry/admin', requireAdmin, async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM custom_engines");
        const pricingCache = await getPollinationsPricingCache().catch(() => null);
        const pricedRows = pricingCache
            ? rows.map((row) => withLivePollinationsPricing(row, pricingCache))
            : rows;
        res.json(pricedRows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.patch('/registry/:id/status', requireAdmin, async (req, res) => {
    const userId = req.user.id || 'system';
    const { isTested, errorMessage, defaultNegativePrompt } = req.body;
    
    try {
        if (defaultNegativePrompt !== undefined) {
            await dbRun("UPDATE custom_engines SET defaultNegativePrompt = ? WHERE id = ?", [defaultNegativePrompt, req.params.id]);
        }

        if (isTested !== undefined) {
            const statusVal = isTested ? 1 : 0;
            await dbRun("UPDATE custom_engines SET isTested = ? WHERE id = ?", [statusVal, req.params.id]);
            
            if (!isTested) {
                const detail = errorMessage ? ` Error details: ${errorMessage}` : '';
                await logSystemEvent('ERROR', 'REGISTRY', `Neural Health Alert: Engine [${req.params.id}] failed production inference. Status set to UNTESTED.${detail}`, userId);
            }
        }

        res.json({ success: true, id: req.params.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/registry', requireAdmin, async (req, res) => {
    const userId = req.user.id;
    const { 
        id, label, description, provider, category, upstreamId, 
        systemInstruction, iconName, efficiencyTier,
        isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
        configJson, uiConfigJson, featuresJson, capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt,
        verifiedPrompt, verificationNotes, verifiedResult, verifiedMimeType, verifiedParams, isPaid
    } = req.body;

    try {
        const existing = await dbGet("SELECT id FROM custom_engines WHERE id = ?", [id]);
        if (existing) {
            return res.status(409).json({ error: `Slug ID "${id}" is already registered in the Hub. Please choose a unique identifier.` });
        }

        await dbRun(`INSERT INTO custom_engines (
            id, label, description, provider, category, upstreamId, systemInstruction, iconName, efficiencyTier,
            isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
            configJson, uiConfigJson, featuresJson, capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt,
            verifiedPrompt, verificationNotes, verifiedResult, verifiedMimeType, verifiedParams, isPaid
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
        [
            id, label, description, provider, category, upstreamId, systemInstruction, iconName, efficiencyTier,
            isProgrammable ? 1 : 0, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
            configJson || null, uiConfigJson, featuresJson, capabilities, isSystem ? 1 : 0, apiKey || null, limits || null, isTested ? 1 : 0, defaultNegativePrompt || null,
            verifiedPrompt || null, verificationNotes || null, verifiedResult || null, verifiedMimeType || null, verifiedParams || null,
            isPaid ? 1 : 0
        ]);
        await logSystemEvent('INFO', 'REGISTRY', `Forged new programmable engine: ${label}`, userId);
        res.status(201).json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/registry/:id', requireAdmin, async (req, res) => {
    const userId = req.user.id;
    const { 
        label, description, provider, category, upstreamId, systemInstruction, efficiencyTier, iconName,
        isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
        configJson, uiConfigJson, featuresJson, capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt,
        verifiedPrompt, verificationNotes, verifiedResult, verifiedMimeType, verifiedParams, isPaid
    } = req.body;
    try {
        await dbRun(`UPDATE custom_engines SET 
            label=?, description=?, provider=?, category=?, upstreamId=?, systemInstruction=?, efficiencyTier=?, iconName=?,
            isProgrammable=?, requestMethod=?, requestUrl=?, requestHeaders=?, requestBodyTemplate=?, responsePath=?,
            configJson=?, uiConfigJson=?, featuresJson=?, capabilities=?, isSystem=?, apiKey=?, limits=?, isTested=?, defaultNegativePrompt=?,
            verifiedPrompt=?, verificationNotes=?, verifiedResult=?, verifiedMimeType=?, verifiedParams=?, isPaid=?
            WHERE id=?`, 
            [
                label, description, provider, category, upstreamId, systemInstruction, efficiencyTier, iconName,
                isProgrammable ? 1 : 0, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
                configJson || null, uiConfigJson, featuresJson, capabilities, isSystem ? 1 : 0, apiKey || null, limits || null, isTested ? 1 : 0, defaultNegativePrompt || null,
                verifiedPrompt || null, verificationNotes || null, verifiedResult || null, verifiedMimeType || null, verifiedParams || null,
                isPaid ? 1 : 0,
                req.params.id
            ]);
        await logSystemEvent('INFO', 'REGISTRY', `Configured programmable logic for: ${label}`, userId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/registry/:id', requireAdmin, async (req, res) => {
    const userId = req.user.id;
    try {
        await dbRun("DELETE FROM custom_engines WHERE id = ?", [req.params.id]);
        await logSystemEvent('WARN', 'REGISTRY', `Engine decommissioned: ${req.params.id}`, userId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
