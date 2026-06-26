import path from 'path';
import fs from 'fs';

import { dbGet } from '../db.js';
import { DB_FILE, ROOT_DIR, STORAGE_DIR, UPLOADS_DIR } from '../db/connection.js';
import { getInstallerRuntimeConfig } from './installerConfig.js';
import { getInstallStatusSnapshot } from './installStatus.js';

const normalizeString = (value) => String(value || '').trim();
const BACKUP_STATE_KEY = 'backup_state';
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

const getAppVersion = () => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
        return typeof packageJson.version === 'string' ? packageJson.version : '0.15.0-dev';
    } catch {
        return '0.15.0-dev';
    }
};

const readBackupState = async () => {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', [BACKUP_STATE_KEY]);
    if (!row?.value) {
        return {
            lastSuccessfulBackupAt: null,
            lastBackupType: null,
            lastBackupId: null,
            updatedAt: 0
        };
    }

    try {
        const parsed = JSON.parse(row.value);
        if (!parsed || typeof parsed !== 'object') {
            return {
                lastSuccessfulBackupAt: null,
                lastBackupType: null,
                lastBackupId: null,
                updatedAt: 0
            };
        }
        return {
            lastSuccessfulBackupAt: parsed.lastSuccessfulBackupAt ?? null,
            lastBackupType: parsed.lastBackupType ?? null,
            lastBackupId: parsed.lastBackupId ?? null,
            updatedAt: Number(parsed.updatedAt || 0)
        };
    } catch {
        return {
            lastSuccessfulBackupAt: null,
            lastBackupType: null,
            lastBackupId: null,
            updatedAt: 0
        };
    }
};

const getBaseUrl = (origin) => {
    if (origin) return origin.replace(/\/+$/, '');
    const port = process.env.PORT || process.env.BACKEND_PORT || 3001;
    return `http://127.0.0.1:${port}`;
};

const getEnabledIntegrations = (runtimeConfig) => {
    const fieldMap = new Map();
    for (const category of runtimeConfig.categories) {
        for (const field of category.fields) {
            fieldMap.set(field.key, field);
        }
    }

    const searchProvider = normalizeString(fieldMap.get('CHAT_WEB_SEARCH_PROVIDER')?.currentValue || 'none').toLowerCase() || 'none';
    const hasGoogleAi = fieldMap.get('API_KEY')?.configured === true;
    const hasPollinations = fieldMap.get('POLLINATIONS_API_KEY')?.configured === true;
    const hasAirforce = fieldMap.get('AIRFORCE_API_KEY')?.configured === true;
    const hasGoogleClient = fieldMap.get('GOOGLE_CLIENT_ID')?.configured === true;
    const hasGoogleBrowserKey = fieldMap.get('GOOGLE_API_KEY')?.configured === true;
    const hasTavily = fieldMap.get('TAVILY_API_KEY')?.configured === true;
    const hasSearxng = fieldMap.get('CHAT_WEB_SEARCH_SEARXNG_URL')?.configured === true;

    return [
        {
            key: 'auth',
            label: 'Core Authentication',
            enabled: fieldMap.get('AUTH_SECRET')?.configured === true,
            detail: fieldMap.get('AUTH_SECRET')?.configured === true
                ? 'Custom AUTH_SECRET is configured.'
                : 'Auth signing is still using an unsafe default.'
        },
        {
            key: 'google-ai',
            label: 'Google AI',
            enabled: hasGoogleAi,
            detail: hasGoogleAi
                ? 'Google-backed AI routes are available.'
                : 'Google-backed AI routes remain disabled.'
        },
        {
            key: 'pollinations-ai',
            label: 'Pollinations',
            enabled: hasPollinations,
            detail: hasPollinations
                ? 'Pollinations generation and sync routes are available.'
                : 'Pollinations features remain disabled.'
        },
        {
            key: 'airforce-ai',
            label: 'AirForce',
            enabled: hasAirforce,
            detail: hasAirforce
                ? 'AirForce-backed models are available.'
                : 'AirForce-backed models remain disabled.'
        },
        {
            key: 'google-login',
            label: 'Google Login & Drive',
            enabled: hasGoogleClient || hasGoogleBrowserKey,
            detail: hasGoogleClient && hasGoogleBrowserKey
                ? 'Browser login and Drive integrations can be enabled.'
                : hasGoogleClient
                    ? 'Google login can be enabled once a browser API key is added.'
                    : 'Email/password remains the only sign-in path.'
        },
        {
            key: 'search-fallback',
            label: 'Web Search Fallback',
            enabled: (searchProvider === 'tavily' && hasTavily) || (searchProvider === 'searxng' && hasSearxng),
            detail: searchProvider === 'tavily'
                ? hasTavily
                    ? 'Fallback search is configured for Tavily.'
                    : 'Tavily is selected but the API key is missing.'
                : searchProvider === 'searxng'
                    ? hasSearxng
                        ? 'Fallback search is configured for SearXNG.'
                        : 'SearXNG is selected but the URL is missing.'
                    : 'Fallback search is disabled.'
        }
    ];
};

const buildHardeningSteps = ({ snapshot, runtimeConfig, backupState }) => {
    const steps = [];
    const fieldMap = new Map();
    for (const category of runtimeConfig.categories) {
        for (const field of category.fields) {
            fieldMap.set(field.key, field);
        }
    }

    if (fieldMap.get('AUTH_SECRET')?.configured !== true) {
        steps.push('Set or rotate AUTH_SECRET before exposing the instance outside a trusted local network.');
    }
    if (snapshot.capabilities.allowDemoAdminBootstrap || snapshot.capabilities.allowDemoAdminLogin) {
        steps.push('Keep ALLOW_DEMO_ADMIN_BOOTSTRAP and ALLOW_DEMO_ADMIN_LOGIN disabled for release environments.');
    }
    if (!backupState?.lastSuccessfulBackupAt) {
        steps.push('Run one full backup from Maintenance before your first upgrade or migration.');
    }
    const rootPath = path.resolve(ROOT_DIR);
    steps.push(`Confirm ${rootPath} and ${STORAGE_DIR} are both on persistent storage before production use.`);
    steps.push('Install AIMANA behind a Windows service wrapper or systemd unit if the instance should auto-start after reboot.');
    steps.push('Persist .env, storage/, and extension host config files before every upgrade.');
    return steps;
};

export const buildInstallSummary = async ({ origin } = {}) => {
    const snapshot = await getInstallStatusSnapshot();
    const runtimeConfig = getInstallerRuntimeConfig();
    const backupState = await readBackupState();
    const baseUrl = getBaseUrl(origin);

    return {
        name: snapshot.name,
        version: getAppVersion(),
        state: snapshot.state,
        instanceName: snapshot.installer.instanceName,
        appUrl: `${baseUrl}/#/`,
        loginUrl: `${baseUrl}/#/login`,
        adminAccount: snapshot.admin.user
            ? {
                id: snapshot.admin.user.id,
                email: snapshot.admin.user.email,
                name: snapshot.admin.user.name
            }
            : null,
        storage: {
            root: STORAGE_DIR,
            uploads: UPLOADS_DIR,
            database: DB_FILE,
            envFile: runtimeConfig.envFile.path
        },
        enabledIntegrations: getEnabledIntegrations(runtimeConfig),
        backup: backupState,
        recommendedHardeningSteps: buildHardeningSteps({ snapshot, runtimeConfig, backupState })
    };
};
