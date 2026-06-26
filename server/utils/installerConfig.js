import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { isUnsafeAuthSecret } from './authToken.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

const SECRET_KEYS = new Set([
    'AUTH_SECRET',
    'API_KEY',
    'POLLINATIONS_API_KEY',
    'AIRFORCE_API_KEY',
    'TAVILY_API_KEY'
]);

const CONFIG_FIELDS = [
    {
        key: 'AUTH_SECRET',
        label: 'Auth Secret',
        category: 'core',
        kind: 'secret',
        required: true,
        description: 'Used to sign AIMANA session and verification tokens.',
        impact: 'Required for safe authentication in release environments.'
    },
    {
        key: 'API_KEY',
        label: 'Google AI Key',
        category: 'ai',
        kind: 'secret',
        required: false,
        description: 'Primary Google provider key used for Gemini-backed AI features.',
        impact: 'Without this, Google-backed AI generation and chat routes stay unavailable.'
    },
    {
        key: 'POLLINATIONS_APP_KEY',
        label: 'Pollinations App Key',
        category: 'ai',
        kind: 'text',
        required: false,
        description: 'Publishable Pollinations BYOP app key (`pk_...`) used to identify the app in user authorization flows.',
        impact: 'This does not replace `POLLINATIONS_API_KEY` for backend generation; users must authorize BYOP before their own credits can be spent.'
    },
    {
        key: 'POLLINATIONS_API_KEY',
        label: 'Pollinations Key',
        category: 'ai',
        kind: 'secret',
        required: false,
        description: 'Used for Pollinations-backed generation and registry sync.',
        impact: 'Without this, Pollinations-based generation and sync paths may be unavailable.'
    },
    {
        key: 'AIRFORCE_API_KEY',
        label: 'AirForce Key',
        category: 'ai',
        kind: 'secret',
        required: false,
        description: 'Optional AirForce provider key for supported proxy routes.',
        impact: 'Without this, AirForce-backed models remain unavailable.'
    },
    {
        key: 'GOOGLE_CLIENT_ID',
        label: 'Google Client ID',
        category: 'identity',
        kind: 'text',
        required: false,
        description: 'OAuth client ID for Google sign-in in the browser.',
        impact: 'Without this, Google login stays disabled.'
    },
    {
        key: 'GOOGLE_API_KEY',
        label: 'Google Browser API Key',
        category: 'identity',
        kind: 'secret',
        required: false,
        description: 'Browser-facing Google API key used for Drive integration.',
        impact: 'Without this, Google Drive project flows stay unavailable.'
    },
    {
        key: 'CHAT_WEB_SEARCH_PROVIDER',
        label: 'Fallback Search Provider',
        category: 'search',
        kind: 'select',
        required: false,
        description: 'Server-side fallback web search provider.',
        impact: 'Choose `none` to disable fallback search; select a provider only when you intend to configure it.',
        options: [
            { label: 'None', value: 'none' },
            { label: 'Tavily', value: 'tavily' },
            { label: 'SearXNG', value: 'searxng' }
        ]
    },
    {
        key: 'TAVILY_API_KEY',
        label: 'Tavily API Key',
        category: 'search',
        kind: 'secret',
        required: false,
        description: 'Key for Tavily fallback web search.',
        impact: 'Required only when `CHAT_WEB_SEARCH_PROVIDER=tavily`.'
    },
    {
        key: 'CHAT_WEB_SEARCH_SEARXNG_URL',
        label: 'SearXNG URL',
        category: 'search',
        kind: 'url',
        required: false,
        description: 'Base URL for a SearXNG instance used for fallback web search.',
        impact: 'Required only when `CHAT_WEB_SEARCH_PROVIDER=searxng`.'
    }
];

const CATEGORY_META = {
    core: {
        label: 'Core Security',
        description: 'Required to boot safely and authenticate users.'
    },
    ai: {
        label: 'AI Providers',
        description: 'Optional keys that unlock generation and model-backed workflows.'
    },
    identity: {
        label: 'Identity & Drive',
        description: 'Optional Google browser credentials for sign-in and Drive integration.'
    },
    search: {
        label: 'Fallback Search',
        description: 'Optional provider config for server-side web search fallback.'
    }
};

const readEnvFile = () => {
    try {
        const raw = fs.readFileSync(ENV_PATH, 'utf8');
        return {
            exists: true,
            raw,
            parsed: dotenv.parse(raw)
        };
    } catch {
        return {
            exists: false,
            raw: '',
            parsed: {}
        };
    }
};

const normalizeValue = (value) => {
    if (value == null) return '';
    return String(value).trim();
};

const maskValue = (key, value) => {
    const normalized = normalizeValue(value);
    if (!normalized) return '';
    if (!SECRET_KEYS.has(key)) return normalized;
    if (normalized.length <= 8) return '********';
    return `${normalized.slice(0, 3)}${'*'.repeat(Math.max(4, normalized.length - 6))}${normalized.slice(-3)}`;
};

const setProcessEnvValue = (key, value) => {
    if (!value) {
        delete process.env[key];
        return;
    }
    process.env[key] = value;
};

const upsertEnvValues = (updates) => {
    const envState = readEnvFile();
    const lines = envState.raw ? envState.raw.split(/\r?\n/) : [];
    const keys = Object.keys(updates);
    const seen = new Set();

    const nextLines = lines.map((line) => {
        const match = line.match(/^([A-Z0-9_]+)\s*=/);
        if (!match) return line;
        const key = match[1];
        if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
        seen.add(key);
        return `${key}=${updates[key]}`;
    });

    for (const key of keys) {
        if (seen.has(key)) continue;
        nextLines.push(`${key}=${updates[key]}`);
    }

    const nextRaw = nextLines.filter((line, index, arr) => !(index === arr.length - 1 && line === '')).join('\n').trimEnd() + '\n';
    fs.writeFileSync(ENV_PATH, nextRaw, 'utf8');

    for (const [key, value] of Object.entries(updates)) {
        setProcessEnvValue(key, normalizeValue(value));
    }
};

export const generateAuthSecret = () => crypto.randomBytes(32).toString('base64url');

export const getInstallerRuntimeConfig = () => {
    const envState = readEnvFile();
    const parsed = envState.parsed || {};
    const provider = normalizeValue(parsed.CHAT_WEB_SEARCH_PROVIDER || process.env.CHAT_WEB_SEARCH_PROVIDER || 'none').toLowerCase() || 'none';

    const categories = Object.entries(CATEGORY_META).map(([category, meta]) => {
        const fields = CONFIG_FIELDS
            .filter((field) => field.category === category)
            .map((field) => {
                const rawValue = normalizeValue(parsed[field.key] ?? process.env[field.key] ?? (field.key === 'CHAT_WEB_SEARCH_PROVIDER' ? 'none' : ''));
                const isSecret = SECRET_KEYS.has(field.key);
                const configured = !!rawValue && !(field.key === 'CHAT_WEB_SEARCH_PROVIDER' && rawValue === 'none');
                return {
                    key: field.key,
                    label: field.label,
                    category: field.category,
                    kind: field.kind,
                    required: field.required,
                    description: field.description,
                    impact: field.impact,
                    configured,
                    currentValue: isSecret ? '' : rawValue,
                    maskedValue: maskValue(field.key, rawValue),
                    options: field.options || null
                };
            });

        return {
            id: category,
            label: meta.label,
            description: meta.description,
            fields
        };
    });

    const impacts = [
        {
            key: 'core-auth',
            status: normalizeValue(parsed.AUTH_SECRET ?? process.env.AUTH_SECRET ?? '') ? 'configured' : 'missing',
            message: normalizeValue(parsed.AUTH_SECRET ?? process.env.AUTH_SECRET ?? '')
                ? 'Core session signing is configured.'
                : 'Authentication remains unsafe until AUTH_SECRET is set.'
        },
        {
            key: 'google-ai',
            status: normalizeValue(parsed.API_KEY ?? process.env.API_KEY ?? '') ? 'configured' : 'optional',
            message: normalizeValue(parsed.API_KEY ?? process.env.API_KEY ?? '')
                ? 'Google-backed AI routes are available.'
                : 'Google-backed AI features will remain unavailable until a Google API key is added.'
        },
        {
            key: 'pollinations-ai',
            status: normalizeValue(parsed.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_API_KEY ?? '') ? 'configured' : 'optional',
            message: normalizeValue(parsed.POLLINATIONS_API_KEY ?? process.env.POLLINATIONS_API_KEY ?? '')
                ? 'Pollinations-backed routes are available.'
                : 'Pollinations-backed features will remain unavailable until a Pollinations key is added.'
        },
        {
            key: 'google-login',
            status: normalizeValue(parsed.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '') ? 'configured' : 'optional',
            message: normalizeValue(parsed.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '')
                ? 'Google login can be enabled in the browser.'
                : 'Email/password will remain the only sign-in option until Google Client ID is configured.'
        },
        {
            key: 'search-fallback',
            status: provider === 'none' ? 'optional' : 'configured',
            message:
                provider === 'tavily'
                    ? 'Fallback search is set to Tavily and requires a Tavily API key.'
                    : provider === 'searxng'
                        ? 'Fallback search is set to SearXNG and requires a SearXNG URL.'
                        : 'Fallback search is disabled unless you explicitly configure a provider.'
        }
    ];

    return {
        envFile: {
            exists: envState.exists,
            path: ENV_PATH
        },
        categories,
        impacts
    };
};

export const getRequiredRuntimeConfigIssues = () => {
    const envState = readEnvFile();
    const parsed = envState.parsed || {};
    const getValue = (key) => normalizeValue(parsed[key] ?? process.env[key] ?? '');
    const issues = [];

    for (const field of CONFIG_FIELDS) {
        if (!field.required) continue;
        if (!getValue(field.key)) {
            issues.push({
                key: field.key,
                label: field.label,
                message: `${field.label} is required.`
            });
        }
    }

    if (isUnsafeAuthSecret()) {
        issues.push({
            key: 'AUTH_SECRET',
            label: 'Auth Secret',
            message: 'Auth Secret must be changed from the default placeholder before finalizing.'
        });
    }

    const provider = getValue('CHAT_WEB_SEARCH_PROVIDER').toLowerCase();
    if (provider === 'tavily' && !getValue('TAVILY_API_KEY')) {
        issues.push({
            key: 'TAVILY_API_KEY',
            label: 'Tavily API Key',
            message: 'Tavily API Key is required when fallback search provider is Tavily.'
        });
    }
    if (provider === 'searxng' && !getValue('CHAT_WEB_SEARCH_SEARXNG_URL')) {
        issues.push({
            key: 'CHAT_WEB_SEARCH_SEARXNG_URL',
            label: 'SearXNG URL',
            message: 'SearXNG URL is required when fallback search provider is SearXNG.'
        });
    }

    return issues;
};

export const saveInstallerRuntimeConfig = (input) => {
    const updates = {};

    for (const field of CONFIG_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(input, field.key)) continue;
        const raw = normalizeValue(input[field.key]);
        if (!raw) continue;
        updates[field.key] = raw;
    }

    if (input.generateAuthSecret === true) {
        updates.AUTH_SECRET = generateAuthSecret();
    }

    if (Object.keys(updates).length > 0) {
        upsertEnvValues(updates);
    }

    return getInstallerRuntimeConfig();
};
