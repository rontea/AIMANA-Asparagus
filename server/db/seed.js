import { dbRun, dbGet, dbAll } from './connection.js';
import { hashPassword } from './crypto.js';
import { googleBlueprints } from './seed/google.js';
import { pollinationsBlueprints } from './seed/pollinations.js';
import { airforceBlueprints } from './seed/airforce.js';
import { nvidiaBlueprints } from './seed/nvidia.js';
import { LEGACY_GOOGLE_MODEL_ID_MAP, normalizeGoogleModelIds } from '../utils/googleModelIds.js';

const isDevBootstrapEnabled = () => {
    const env = String(process.env.NODE_ENV || '').toLowerCase();
    if (env === 'development' || env === 'test') return true;
    return String(process.env.ALLOW_DEMO_ADMIN_BOOTSTRAP || '').trim().toLowerCase() === 'true';
};

export const seedInitialUser = async () => {
    try {
        const admin = await dbGet("SELECT id FROM users WHERE id = 'admin-root'");
        if (!admin) {
            if (!isDevBootstrapEnabled()) {
                console.log("[DB_INIT] Root Administrator bootstrap skipped. Initial admin setup is required.");
                return;
            }
            console.log("[DB_INIT] Provisioning Root Administrator...");
            const hashed = hashPassword('newpassword123');
            await dbRun(
                `INSERT INTO users (id, email, password, name, role, provider, createdAt) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['admin-root', 'admin@aimana.local', hashed, 'Root Admin', 'admin', 'email', Date.now()]
            );
            console.log("[DB_INIT] Root Administrator ready: admin@aimana.local");
        }
    } catch (e) {
        console.error("[DB_SEED] Failed to provision admin user:", e.message);
    }
};

export const seedDefaultIntents = async () => {
    try {
        const existing = await dbAll("SELECT id FROM custom_project_types");
        if (existing.length === 0) {
            console.log("[DB_INIT] Forging default Neural Intents...");
            const defaults = [
                { id: 'creative-portfolio', label: 'Creative Portfolio', desc: 'Optimized for high-fidelity visual assets and design iterations.', icon: 'Palette', color: '#f472b6' },
                { id: 'technical-research', label: 'Technical Research', desc: 'Focus on documentation, logic logs, and structured linguistic artifacts.', icon: 'Book', color: '#60a5fa' },
                { id: 'asset-vault', label: 'Asset Vault', desc: 'Long-term secure archival of production-ready binary artifacts.', icon: 'Archive', color: '#fbbf24' }
            ];

            for (const d of defaults) {
                await dbRun(
                    `INSERT INTO custom_project_types (id, label, description, iconName, color, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
                    [d.id, d.label, d.desc, d.icon, d.color, Date.now()]
                );
            }
            console.log("[DB_INIT] Default intents staged.");
        }
    } catch (e) {
        console.error("[DB_SEED] Failed to seed default intents:", e.message);
    }
};

export const seedCustomEngines = async () => {
    console.log("[DB_INIT] Synchronizing Master Neural Registry...");
    
    const blueprints = [
        ...googleBlueprints,
        ...pollinationsBlueprints,
        ...airforceBlueprints,
        ...nvidiaBlueprints
    ];

    const pollinationsVisualSystemIds = pollinationsBlueprints
        .filter((b) => b.provider === 'pollinations' && b.category === 'Visual' && b.isSystem)
        .map((b) => b.id);
    const pollinationsMotionSystemIds = pollinationsBlueprints
        .filter((b) => b.provider === 'pollinations' && b.category === 'Motion' && b.isSystem)
        .map((b) => b.id);
    const googleSystemIds = googleBlueprints
        .filter((b) => b.provider === 'google' && b.isSystem)
        .map((b) => b.id);

    if (pollinationsVisualSystemIds.length > 0) {
        const placeholders = pollinationsVisualSystemIds.map(() => '?').join(',');
        try {
            await dbRun(
                `DELETE FROM custom_engines
                 WHERE provider = 'pollinations'
                   AND category = 'Visual'
                   AND isSystem = 1
                   AND id NOT IN (${placeholders})`,
                pollinationsVisualSystemIds
            );
        } catch (e) {
            console.error("[DB_SEED] Failed to prune stale Pollinations visual engines:", e.message);
        }
    }

    if (pollinationsMotionSystemIds.length > 0) {
        const placeholders = pollinationsMotionSystemIds.map(() => '?').join(',');
        try {
            await dbRun(
                `DELETE FROM custom_engines
                 WHERE provider = 'pollinations'
                   AND category = 'Motion'
                   AND isSystem = 1
                   AND id NOT IN (${placeholders})`,
                pollinationsMotionSystemIds
            );
        } catch (e) {
            console.error("[DB_SEED] Failed to prune stale Pollinations motion engines:", e.message);
        }
    }

    if (googleSystemIds.length > 0) {
        const placeholders = googleSystemIds.map(() => '?').join(',');
        try {
            await dbRun(
                `DELETE FROM custom_engines
                 WHERE provider = 'google'
                   AND isSystem = 1
                   AND id NOT IN (${placeholders})`,
                googleSystemIds
            );
        } catch (e) {
            console.error("[DB_SEED] Failed to prune stale Google engines:", e.message);
        }
    }

    for (const b of blueprints) {
        try {
            await dbRun(`INSERT INTO custom_engines (id, label, description, provider, category, upstreamId, systemInstruction, iconName, efficiencyTier, configJson, isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath, uiConfigJson, featuresJson, capabilities, isSystem, defaultNegativePrompt, isPaid) 
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET 
                    label=excluded.label,
                    description=excluded.description,
                    provider=excluded.provider,
                    category=excluded.category,
                    upstreamId=COALESCE(excluded.upstreamId, custom_engines.upstreamId),
                    systemInstruction=COALESCE(excluded.systemInstruction, custom_engines.systemInstruction),
                    iconName=excluded.iconName,
                    efficiencyTier=excluded.efficiencyTier,
                    configJson=COALESCE(excluded.configJson, custom_engines.configJson),
                    capabilities=excluded.capabilities,
                    isProgrammable=excluded.isProgrammable,
                    requestUrl=excluded.requestUrl,
                    requestMethod=excluded.requestMethod,
                    requestHeaders=excluded.requestHeaders,
                    requestBodyTemplate=COALESCE(excluded.requestBodyTemplate, custom_engines.requestBodyTemplate),
                    responsePath=COALESCE(excluded.responsePath, custom_engines.responsePath),
                    uiConfigJson=excluded.uiConfigJson,
                    featuresJson=excluded.featuresJson,
                    defaultNegativePrompt=excluded.defaultNegativePrompt,
                    isPaid=excluded.isPaid,
                    isSystem=excluded.isSystem`, 
                [b.id, b.label, b.description, b.provider, b.category, b.upstreamId || null, b.systemInstruction ?? null, b.iconName, b.efficiencyTier, b.configJson || null, b.isProgrammable, b.requestMethod || null, b.requestUrl || null, b.requestHeaders || null, b.requestBodyTemplate || null, b.responsePath || null, b.uiConfigJson || null, b.featuresJson || null, b.capabilities || '', b.isSystem || 0, b.defaultNegativePrompt || null, b.isPaid || 0]);
        } catch (e) {
            console.error(`[DB_SEED] Failed to sync model: ${b.id}`, e.message);
        }
    }

    for (const [legacyId, currentId] of Object.entries(LEGACY_GOOGLE_MODEL_ID_MAP)) {
        try {
            await dbRun("UPDATE projects SET defaultEngine = ? WHERE defaultEngine = ?", [currentId, legacyId]);
            await dbRun("UPDATE revisions SET engine = ? WHERE engine = ?", [currentId, legacyId]);
        } catch (e) {
            console.error(`[DB_SEED] Failed to migrate Google model ID ${legacyId}:`, e.message);
        }
    }

    try {
        const appConfigRow = await dbGet("SELECT value FROM settings WHERE key = 'app_config'");
        if (appConfigRow?.value) {
            const parsed = JSON.parse(appConfigRow.value);
            const normalizedAiEngines = normalizeGoogleModelIds(Array.isArray(parsed?.aiEngines) ? parsed.aiEngines : []);
            if (Array.isArray(parsed?.aiEngines) && JSON.stringify(parsed.aiEngines) !== JSON.stringify(normalizedAiEngines)) {
                await dbRun(
                    `UPDATE settings SET value = ?, updatedAt = ? WHERE key = 'app_config'`,
                    [JSON.stringify({ ...parsed, aiEngines: normalizedAiEngines }), Date.now()]
                );
            }
        }
    } catch (e) {
        console.error("[DB_SEED] Failed to normalize app_config Google models:", e.message);
    }
};
