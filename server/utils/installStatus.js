import fs from 'fs';
import path from 'path';

import { dbGet, dbRun } from '../db.js';
import { DB_FILE, ROOT_DIR, STORAGE_DIR, UPLOADS_DIR } from '../db/connection.js';
import { isUnsafeAuthSecret } from './authToken.js';

const ENV_PATH = path.join(ROOT_DIR, '.env');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_INDEX_PATH = path.join(DIST_DIR, 'index.html');
const INSTALL_STATE_KEY = 'install_state';
const DEFAULT_INSTANCE_NAME = 'AIMANA';

const CHECK_STATUS = {
    PASS: 'pass',
    WARN: 'warn',
    FAIL: 'fail'
};

const ISSUE_SEVERITY = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
};

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const toBooleanEnv = (key) => String(process.env[key] || '').trim().toLowerCase() === 'true';

const createIssue = (severity, code, message, meta = null) => ({
    severity,
    code,
    message,
    ...(meta ? { meta } : {})
});

const runPathCheck = (targetPath) => {
    const details = {
        path: targetPath,
        exists: false,
        readable: false,
        writable: false
    };

    try {
        details.exists = fs.existsSync(targetPath);
        if (!details.exists) return { status: CHECK_STATUS.FAIL, details };
        fs.accessSync(targetPath, fs.constants.R_OK);
        details.readable = true;
        fs.accessSync(targetPath, fs.constants.W_OK);
        details.writable = true;
        return { status: CHECK_STATUS.PASS, details };
    } catch {
        return {
            status: details.exists ? CHECK_STATUS.FAIL : CHECK_STATUS.FAIL,
            details
        };
    }
};

const runOptionalFileCheck = (targetPath) => {
    const details = {
        path: targetPath,
        exists: false,
        readable: false,
        writable: false
    };

    try {
        details.exists = fs.existsSync(targetPath);
        if (!details.exists) return { status: CHECK_STATUS.WARN, details };
        fs.accessSync(targetPath, fs.constants.R_OK);
        details.readable = true;
        fs.accessSync(targetPath, fs.constants.W_OK);
        details.writable = true;
        return { status: CHECK_STATUS.PASS, details };
    } catch {
        return { status: CHECK_STATUS.FAIL, details };
    }
};

export const deriveInstallState = ({ issues, hasAdmin, installRecord = null, hasExistingWorkspaceData = false }) => {
    const hasErrors = issues.some((issue) => issue.severity === ISSUE_SEVERITY.ERROR);
    const hasWarnings = issues.some((issue) => issue.severity === ISSUE_SEVERITY.WARN);
    const hasInstallerConfig = !!installRecord?.configCompletedAt;
    const hasFinalizedInstall = !!installRecord?.finalizedAt;
    const isExistingInstalledWorkspace = hasAdmin && (hasFinalizedInstall || hasExistingWorkspaceData);

    if (hasErrors) return 'needs-config';
    if (isExistingInstalledWorkspace) return hasWarnings ? 'degraded' : 'ready';
    if (!hasInstallerConfig) return 'needs-config';
    if (!hasAdmin) return 'needs-admin-setup';
    if (!hasFinalizedInstall) return 'needs-finalize';
    if (hasWarnings) return 'degraded';
    return 'ready';
};

const defaultInstallStateRecord = () => ({
    installState: 'uninitialized',
    instanceName: DEFAULT_INSTANCE_NAME,
    installStartedAt: null,
    bootstrapCompletedAt: null,
    configCompletedAt: null,
    finalizedAt: null,
    installedAt: null,
    installedBy: null,
    lastPreflightAt: null,
    lastPreflightIssues: [],
    updatedAt: 0
});

export const readInstallStateRecord = async () => {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', [INSTALL_STATE_KEY]);
    if (!row?.value) return defaultInstallStateRecord();
    try {
        const parsed = JSON.parse(row.value);
        if (!parsed || typeof parsed !== 'object') return defaultInstallStateRecord();
        return {
            ...defaultInstallStateRecord(),
            ...parsed
        };
    } catch {
        return defaultInstallStateRecord();
    }
};

export const writeInstallStateRecord = async (value) => {
    const timestamp = Date.now();
    const current = await readInstallStateRecord();
    const nextValue = {
        ...current,
        ...(value && typeof value === 'object' ? value : {}),
        updatedAt: timestamp
    };
    await dbRun(
        `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
        [INSTALL_STATE_KEY, JSON.stringify(nextValue), timestamp]
    );
    return nextValue;
};

const getExistingWorkspaceEvidence = async () => {
    const counts = {
        projects: 0,
        items: 0,
        chatItems: 0,
        chatSessions: 0
    };

    try {
        const projectCount = await dbGet('SELECT COUNT(*) as count FROM projects WHERE COALESCE(isSystem, 0) = 0');
        counts.projects = Number(projectCount?.count || 0);
    } catch {
        // Older or partially initialized databases may not have this table yet.
    }

    try {
        const itemCount = await dbGet('SELECT COUNT(*) as count FROM items');
        counts.items = Number(itemCount?.count || 0);
    } catch {
        // Older or partially initialized databases may not have this table yet.
    }

    try {
        const chatItemCount = await dbGet('SELECT COUNT(*) as count FROM chat_items');
        counts.chatItems = Number(chatItemCount?.count || 0);
    } catch {
        // Older or partially initialized databases may not have this table yet.
    }

    try {
        const chatSessionCount = await dbGet('SELECT COUNT(*) as count FROM chat_sessions');
        counts.chatSessions = Number(chatSessionCount?.count || 0);
    } catch {
        // Older or partially initialized databases may not have this table yet.
    }

    const total = counts.projects + counts.items + counts.chatItems + counts.chatSessions;
    return {
        counts,
        exists: total > 0
    };
};

export const getInstallStatusSnapshot = async () => {
    const production = isProduction();
    const issues = [];

    const envFile = runOptionalFileCheck(ENV_PATH);
    const storageDir = runPathCheck(STORAGE_DIR);
    const uploadsDir = runPathCheck(UPLOADS_DIR);
    const dbFile = runOptionalFileCheck(DB_FILE);
    const distIndex = runOptionalFileCheck(DIST_INDEX_PATH);

    if (envFile.status === CHECK_STATUS.WARN) {
        issues.push(
            createIssue(
                production ? ISSUE_SEVERITY.ERROR : ISSUE_SEVERITY.WARN,
                'env-file-missing',
                'Project .env file is missing.',
                { path: ENV_PATH }
            )
        );
    } else if (envFile.status === CHECK_STATUS.FAIL) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.ERROR,
                'env-file-unreadable',
                'Project .env file is not readable and writable.',
                { path: ENV_PATH }
            )
        );
    }

    if (storageDir.status === CHECK_STATUS.FAIL) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.ERROR,
                'storage-dir-unavailable',
                'Storage directory is missing or not writable.',
                { path: STORAGE_DIR }
            )
        );
    }

    if (uploadsDir.status === CHECK_STATUS.FAIL) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.ERROR,
                'uploads-dir-unavailable',
                'Uploads directory is missing or not writable.',
                { path: UPLOADS_DIR }
            )
        );
    }

    if (dbFile.status === CHECK_STATUS.WARN) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.INFO,
                'db-file-pending',
                'Database file does not exist yet and will be created during initialization.',
                { path: DB_FILE }
            )
        );
    } else if (dbFile.status === CHECK_STATUS.FAIL) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.ERROR,
                'db-file-unwritable',
                'Database file exists but is not readable and writable.',
                { path: DB_FILE }
            )
        );
    }

    if (production) {
        if (distIndex.status !== CHECK_STATUS.PASS) {
            issues.push(
                createIssue(
                    ISSUE_SEVERITY.ERROR,
                    'frontend-build-missing',
                    'Frontend build output is missing for production runtime.',
                    { path: DIST_INDEX_PATH }
                )
            );
        }
    } else if (distIndex.status !== CHECK_STATUS.PASS) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.INFO,
                'frontend-build-missing-dev',
                'Frontend build output is missing. This is expected in Vite development mode.',
                { path: DIST_INDEX_PATH }
            )
        );
    }

    if (isUnsafeAuthSecret()) {
        issues.push(
            createIssue(
                production ? ISSUE_SEVERITY.ERROR : ISSUE_SEVERITY.WARN,
                'auth-secret-unsafe',
                production
                    ? 'AUTH_SECRET must be set to a non-default value before the app can be used safely.'
                    : 'AUTH_SECRET is using a development-safe default and should be replaced before release.'
            )
        );
    }

    if (!String(process.env.API_KEY || '').trim()) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.WARN,
                'google-api-key-missing',
                'Google API key is not configured. Google-backed AI features will be unavailable.'
            )
        );
    }

    if (!String(process.env.POLLINATIONS_API_KEY || '').trim()) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.WARN,
                'pollinations-key-missing',
                'Pollinations API key is not configured. Pollinations-backed features may be unavailable.'
            )
        );
    }

    const chatSearchProvider = String(process.env.CHAT_WEB_SEARCH_PROVIDER || '').trim().toLowerCase();
    if (chatSearchProvider === 'tavily' && !String(process.env.TAVILY_API_KEY || '').trim()) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.WARN,
                'tavily-key-missing',
                'Tavily search provider is configured without a TAVILY_API_KEY.'
            )
        );
    }
    if (chatSearchProvider === 'searxng' && !String(process.env.CHAT_WEB_SEARCH_SEARXNG_URL || '').trim()) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.WARN,
                'searxng-url-missing',
                'SearXNG search provider is configured without a CHAT_WEB_SEARCH_SEARXNG_URL.'
            )
        );
    }

    let hasAdmin = false;
    let adminUser = null;
    try {
        adminUser = await dbGet(
            `SELECT id, email, name, role
             FROM users
             WHERE role = 'admin' OR id = 'admin-root'
             ORDER BY CASE WHEN id = 'admin-root' THEN 0 ELSE 1 END, createdAt ASC
             LIMIT 1`
        );
        hasAdmin = !!adminUser;
    } catch (error) {
        issues.push(
            createIssue(
                ISSUE_SEVERITY.ERROR,
                'admin-query-failed',
                'Failed to inspect admin bootstrap state.',
                { error: error?.message || 'Unknown error' }
            )
        );
    }

    const allowDemoAdminBootstrap = toBooleanEnv('ALLOW_DEMO_ADMIN_BOOTSTRAP');
    const allowDemoAdminLogin = toBooleanEnv('ALLOW_DEMO_ADMIN_LOGIN');
    const currentInstallRecord = await readInstallStateRecord();
    const existingWorkspaceEvidence = await getExistingWorkspaceEvidence();
    const derivedState = deriveInstallState({
        issues,
        hasAdmin,
        installRecord: currentInstallRecord,
        hasExistingWorkspaceData: existingWorkspaceEvidence.exists
    });
    const installRecord = await writeInstallStateRecord({
        installState: derivedState,
        installStartedAt: currentInstallRecord?.installStartedAt || Date.now(),
        lastPreflightAt: Date.now(),
        lastPreflightIssues: issues,
        installedAt: hasAdmin ? (currentInstallRecord?.installedAt || currentInstallRecord?.finalizedAt || null) : null
    });

    return {
        name: 'AIMANA',
        checkedAt: Date.now(),
        state: installRecord.installState,
        issues,
        checks: {
            envFile,
            storageDir,
            uploadsDir,
            dbFile,
            distIndex
        },
        admin: {
            exists: hasAdmin,
            user: adminUser
                ? {
                    id: adminUser.id,
                    email: adminUser.email,
                    name: adminUser.name,
                    role: adminUser.role
                }
                : null
        },
        runtime: {
            nodeVersion: process.version,
            environment: String(process.env.NODE_ENV || 'development'),
            production
        },
        capabilities: {
            allowDemoAdminBootstrap,
            allowDemoAdminLogin,
            allowAdminBootstrap: !hasAdmin
        },
        installer: {
            instanceName: installRecord.instanceName || DEFAULT_INSTANCE_NAME,
            installStartedAt: installRecord.installStartedAt,
            bootstrapCompletedAt: installRecord.bootstrapCompletedAt,
            configCompletedAt: installRecord.configCompletedAt,
            finalizedAt: installRecord.finalizedAt,
            installedAt: installRecord.installedAt,
            installedBy: installRecord.installedBy
        }
    };
};

export const logInstallStatusSummary = (snapshot) => {
    const blocking = snapshot.issues.filter((issue) => issue.severity === ISSUE_SEVERITY.ERROR);
    const warnings = snapshot.issues.filter((issue) => issue.severity === ISSUE_SEVERITY.WARN);

    console.log(`[INSTALL] State: ${snapshot.state}`);
    if (blocking.length === 0 && warnings.length === 0) {
        console.log('[INSTALL] No blocking installer issues detected.');
        return;
    }

    for (const issue of blocking) {
        console.error(`[INSTALL][BLOCKING] ${issue.code}: ${issue.message}`);
    }
    for (const issue of warnings) {
        console.warn(`[INSTALL][WARN] ${issue.code}: ${issue.message}`);
    }
};
