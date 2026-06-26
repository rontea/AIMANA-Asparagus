import express from 'express';
import { logSystemEvent, dbGet, dbRun, createErrorReport } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { ensureReferenceAsset } from '../logic/referenceAssets.js';
import { searchWeb, redactSearchSensitiveText } from '../services/webSearchService.js';
import { ingestUrls, extractUrlsFromText } from '../services/urlIngestService.js';
import fs from 'fs/promises';
import { getPhysicalPathFromUrl } from '../utils/paths.js';
import { getRuntimeAirforceApiKey, getRuntimeNvidiaApiKey, getRuntimePollinationsApiKey } from '../utils/runtimeEnv.js';

const router = express.Router();
const MAX_SAFE_WARNING_LENGTH = 240;
const MAX_PROXY_TEXT_BYTES = 512 * 1024;
const MAX_PROXY_JSON_BYTES = 1024 * 1024;
const MAX_PROXY_ERROR_BYTES = 64 * 1024;
const POLLINATIONS_ACCOUNT_BALANCE_URLS = [
    'https://enter.pollinations.ai/api/customer/balance',
    'https://gen.pollinations.ai/account/balance'
];
const POLLINATIONS_ACCOUNT_TIMEOUT_MS = 10000;
const POLLEN_CREDIT_STATE_KEY_PREFIX = 'pollen_credit_state_v1:';
const POLLEN_CREDIT_DEFAULT_ESTIMATE = 0.01;
const APP_CONFIG_KEY = 'app_config';
const DEFAULT_MANUAL_POLLEN_HOURLY_RATE = 0.15;

const resolveProxyErrorStatus = (message = '') => {
    const lower = String(message || '').toLowerCase();
    if (!lower) return 502;
    if (
        lower.includes('error code: 522')
        || lower.includes('cloudflare 522')
        || lower.includes('upstream provider timed out')
    ) {
        return 503;
    }
    if (lower.includes('resource not found')) {
        return 404;
    }
    if (lower.includes('billing cycle spend limit reached') || lower.includes('billing limit') || lower.includes('spend limit')) {
        return 402;
    }
    return 502;
};

const resolveProxyErrorCode = (message = '') => {
    const lower = String(message || '').toLowerCase();
    if (!lower) return 'UPSTREAM_ERROR';
    if (
        lower.includes('reference image')
        && (
            lower.includes('without a reference image')
            || lower.includes('switch models')
            || lower.includes('publicly accessible image')
        )
    ) {
        return 'REFERENCE_IMAGE_UPSTREAM_FAILURE';
    }
    if (lower.includes('[blocked]') || lower.includes('moderation')) {
        return 'MODERATION_BLOCKED';
    }
    if (
        lower.includes('billing cycle spend limit reached')
        || lower.includes('billing limit')
        || lower.includes('spend limit')
    ) {
        return 'BILLING_LIMIT';
    }
    if (
        lower.includes('error code: 522')
        || lower.includes('cloudflare 522')
        || lower.includes('upstream provider timed out')
    ) {
        return 'UPSTREAM_TIMEOUT';
    }
    if (lower.includes('resource not found')) {
        return 'RESOURCE_NOT_FOUND';
    }
    return 'UPSTREAM_ERROR';
};

const extractHtmlTitle = (html = '') => {
    const match = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? String(match[1] || '').trim() : '';
};

const normalizeKnownUpstreamHtmlError = ({
    rawMessage = '',
    rawBody = '',
    status = 0,
    engine = null
} = {}) => {
    const combined = `${String(rawMessage || '')}\n${String(rawBody || '')}`;
    const lower = combined.toLowerCase();
    const title = extractHtmlTitle(combined);
    const modelLabel = String(engine?.label || engine?.id || 'Selected model').trim();

    const isCloudflareTunnel =
        lower.includes('cloudflare tunnel error')
        || lower.includes('error 1033')
        || lower.includes('cloudflared is running')
        || title.toLowerCase().includes('cloudflare tunnel error');

    if (isCloudflareTunnel) {
        const hostMatch = combined.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
        const host = hostMatch ? String(hostMatch[1] || '').trim() : 'the upstream bridge';
        return `${modelLabel} is temporarily unavailable because its upstream bridge (${host}) is offline (Cloudflare Tunnel error 1033). Retry later or switch models.`;
    }

    const isHtmlDocument = lower.includes('<!doctype html') || lower.includes('<html');
    if (isHtmlDocument && Number(status) >= 500) {
        const fallbackTitle = title || 'upstream HTML error page';
        return `${modelLabel} failed because the upstream provider returned ${fallbackTitle} instead of media output. Retry later or switch models.`;
    }

    return '';
};

const normalizeKnownUpstreamJsonError = ({
    rawMessage = '',
    payload = null,
    status = 0,
    engine = null
} = {}) => {
    const modelLabel = String(engine?.label || engine?.id || 'Selected model').trim();
    const rawPayloadMessage = String(payload?.error?.message || payload?.message || '').trim();
    const rawPayloadCode = String(payload?.error?.code || payload?.code || '').trim().toUpperCase();
    const combined = `${String(rawMessage || '')}\n${rawPayloadMessage}`.toLowerCase();
    const effectiveStatus = Number(payload?.status || status || 0);
    const isGateway522 = effectiveStatus === 522 || combined.includes('error code: 522');
    const isUnknownProxyFailure = rawPayloadCode === 'UNKNOWN_ERROR' || combined.includes('unknown_error');

    if (isGateway522 && isUnknownProxyFailure) {
        return `${modelLabel} is temporarily unavailable because the upstream provider timed out (Cloudflare 522). Retry shortly or switch models.`;
    }

    return '';
};

const summarizeUpstreamErrorForLog = ({
    rawMessage = '',
    rawBody = '',
    status = 0,
    engine = null
} = {}) => {
    const normalizedHtmlError = normalizeKnownUpstreamHtmlError({
        rawMessage,
        rawBody,
        status,
        engine
    });
    if (normalizedHtmlError) return normalizedHtmlError;

    return redactSearchSensitiveText(rawMessage || rawBody || `Upstream Status ${status || 502}`);
};

const readTextWithLimit = async (response, maxBytes) => {
    if (!response?.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        if (text.length > maxBytes) {
            throw new Error('Upstream response exceeded size limit.');
        }
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let chunks = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
            try { await response.body.cancel(); } catch {}
            throw new Error('Upstream response exceeded size limit.');
        }
        chunks += decoder.decode(value, { stream: true });
    }

    chunks += decoder.decode();
    return chunks;
};

const readJsonWithLimit = async (response, maxBytes) => {
    const text = await readTextWithLimit(response, maxBytes);
    return JSON.parse(text);
};

const sanitizeWarningText = (value) => redactSearchSensitiveText(String(value || '')).slice(0, MAX_SAFE_WARNING_LENGTH);

const pushCapabilityWarning = (warnings = [], value = '') => {
    const sanitized = sanitizeWarningText(value);
    if (sanitized) warnings.push(sanitized);
};

const sanitizeSearchTelemetry = (searchTelemetry = {}) => ({
    ...searchTelemetry,
    searchWarning: sanitizeWarningText(searchTelemetry?.searchWarning || '')
});

const sanitizeWarningList = (warnings = []) => (
    (Array.isArray(warnings) ? warnings : [])
        .map((warning) => sanitizeWarningText(warning))
        .filter(Boolean)
);

const unwrapNestedErrorMessage = (rawMessage = '', onRequestId) => {
    let message = rawMessage;
    for (let depth = 0; depth < 3; depth += 1) {
        if (typeof message !== 'string') break;
        const trimmed = message.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) break;
        try {
            const parsed = JSON.parse(trimmed);
            const nestedRequestId = parsed?.requestId || parsed?.error?.requestId;
            if (nestedRequestId && typeof onRequestId === 'function') onRequestId(nestedRequestId);
            if (parsed?.error?.message) {
                message = parsed.error.message;
                continue;
            }
            if (parsed?.message) {
                message = parsed.message;
                continue;
            }
            break;
        } catch {
            break;
        }
    }
    return message;
};

const toCapabilitySet = (rawCapabilities = '') => (
    String(rawCapabilities || '')
        .split(',')
        .map((cap) => cap.trim().toLowerCase())
        .filter(Boolean)
);

const toFiniteNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
};

const resolvePollinationsKey = (engine = {}) => {
    const pollinationsKey = getRuntimePollinationsApiKey();
    if (pollinationsKey) return pollinationsKey;
    const airforceKey = getRuntimeAirforceApiKey();
    const marker = `${engine?.label || ''} ${engine?.description || ''} ${engine?.upstreamId || ''}`.toLowerCase();
    if (airforceKey && marker.includes('airforce')) return airforceKey;
    return '';
};

const resolveSystemProviderKey = (engine = {}) => {
    const provider = String(engine?.provider || '').trim().toLowerCase();
    if (provider === 'pollinations') return resolvePollinationsKey(engine);
    if (provider === 'airforce') return getRuntimeAirforceApiKey();
    if (provider === 'nvidia') return getRuntimeNvidiaApiKey();
    return process.env.API_KEY || '';
};

const getPollinationsBalanceFromPayload = (payload = {}) => {
    const direct = toFiniteNumber(payload?.balance);
    if (direct !== null) return Math.max(0, direct);

    const nested = toFiniteNumber(payload?.data?.balance);
    if (nested !== null) return Math.max(0, nested);

    const tierBalance = toFiniteNumber(payload?.tierBalance);
    const packBalance = toFiniteNumber(payload?.packBalance);
    const cryptoBalance = toFiniteNumber(payload?.cryptoBalance);
    if (tierBalance !== null || packBalance !== null || cryptoBalance !== null) {
        return Math.max(
            0,
            (tierBalance ?? 0)
            + (packBalance ?? 0)
            + (cryptoBalance ?? 0)
        );
    }

    return null;
};

const toUpstreamErrorMessage = (payload = {}, fallback = '') => {
    const value = payload?.error?.message || payload?.message || fallback || 'Pollinations balance request failed.';
    return redactSearchSensitiveText(String(value || 'Pollinations balance request failed.'));
};

const readManualPollenHourlyRate = async () => {
    try {
        const row = await dbGet("SELECT value FROM settings WHERE key = ?", [APP_CONFIG_KEY]);
        if (!row?.value) return DEFAULT_MANUAL_POLLEN_HOURLY_RATE;
        const parsed = JSON.parse(row.value);
        const amount = toFiniteNumber(parsed?.manualPollenHourlyRate);
        return amount !== null && amount > 0 ? amount : DEFAULT_MANUAL_POLLEN_HOURLY_RATE;
    } catch {
        return DEFAULT_MANUAL_POLLEN_HOURLY_RATE;
    }
};

const resolvePollenCreditStateKey = (userId = 'anonymous') => `${POLLEN_CREDIT_STATE_KEY_PREFIX}${String(userId || 'anonymous')}`;

const readPollenCreditState = async (userId = 'anonymous') => {
    try {
        const row = await dbGet("SELECT value FROM settings WHERE key = ?", [resolvePollenCreditStateKey(userId)]);
        if (!row?.value) return null;
        const parsed = JSON.parse(row.value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const writePollenCreditState = async (userId = 'anonymous', patch = {}) => {
    try {
        const now = Date.now();
        const key = resolvePollenCreditStateKey(userId);
        const existing = await readPollenCreditState(userId);
        const merged = {
            ...(existing && typeof existing === 'object' ? existing : {}),
            ...(patch && typeof patch === 'object' ? patch : {}),
            updatedAt: now
        };
        await dbRun(
            `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`,
            [key, JSON.stringify(merged), now]
        );
        return merged;
    } catch {
        return null;
    }
};

const recordPollenCreditUsageEstimate = async (userId = 'anonymous', pollenUsed = null) => {
    const amount = toFiniteNumber(pollenUsed);
    if (amount === null || amount <= 0) return null;

    const state = await readPollenCreditState(userId);
    const lastLiveBalance = toFiniteNumber(state?.lastLiveBalance);
    const previousUsageSinceLive = Math.max(0, toFiniteNumber(state?.usageSinceLive) ?? 0);
    const usageSinceLive = previousUsageSinceLive + amount;
    const defaultCap = lastLiveBalance ?? Math.max(0, toFiniteNumber(state?.cap) ?? POLLEN_CREDIT_DEFAULT_ESTIMATE);
    const previousEstimated = Math.max(0, toFiniteNumber(state?.estimatedBalance) ?? defaultCap);
    const estimatedBalance = lastLiveBalance !== null
        ? Math.max(0, lastLiveBalance - usageSinceLive)
        : Math.max(0, previousEstimated - amount);

    return writePollenCreditState(userId, {
        estimatedBalance,
        cap: Math.max(0, lastLiveBalance ?? defaultCap),
        usageSinceLive,
        lastUsageAmount: amount,
        lastUsageAt: Date.now(),
        source: 'local-estimate-db'
    });
};

const storePollinationsLiveBalance = async (userId = 'anonymous', balance = null, endpoint = '') => {
    const numericBalance = toFiniteNumber(balance);
    if (numericBalance === null) return null;
    return writePollenCreditState(userId, {
        estimatedBalance: Math.max(0, numericBalance),
        cap: Math.max(0, numericBalance),
        lastLiveBalance: Math.max(0, numericBalance),
        lastLiveBalanceAt: Date.now(),
        lastLiveEndpoint: String(endpoint || ''),
        lastLiveError: null,
        lastLiveStatus: 200,
        usageSinceLive: 0,
        source: 'pollinations-account'
    });
};

const storePollinationsBalanceFailure = async (userId = 'anonymous', status = 502, error = '') => (
    writePollenCreditState(userId, {
        lastLiveError: String(error || 'Pollinations account balance request failed.'),
        lastLiveStatus: Number.isFinite(status) ? status : 502,
        lastLiveAttemptAt: Date.now()
    })
);

const requiresPollinationsMusicKey = (engine = {}) => {
    const id = String(engine?.id || '').toLowerCase();
    const label = String(engine?.label || '').toLowerCase();
    return (
        id.includes('suno') ||
        id.includes('elevenmusic') ||
        id.includes('acestep') ||
        id.includes('ace-step') ||
        id.includes('ace_step') ||
        label.includes('suno') ||
        label.includes('music') ||
        label.includes('acestep') ||
        label.includes('ace-step') ||
        label.includes('ace_step')
    );
};

const supportsTextSearchTools = (engineConfig = {}) => {
    if (engineConfig?.textTools === true) return true;
    if (engineConfig?.textTools === false) return false;
    const caps = new Set(toCapabilitySet(engineConfig?.capabilities));
    return caps.has('search') || caps.has('tools');
};

const isPrivateHostname = (hostname) => {
    const h = String(hostname || '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
    if (h.endsWith('.local')) return true;

    if (/^127\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^169\.254\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;

    if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
    return false;
};

const assertSafeTargetUrl = (rawUrl) => {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('Invalid upstream URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Unsupported upstream protocol');
    }
    if (isPrivateHostname(parsed.hostname)) {
        throw new Error('Blocked upstream target');
    }
};

/**
 * Temporary Image Hosting Bridge
 * Converts Base64 Data URIs to public URLs for upstream AI consumption.
 */
async function uploadToTempHost(dataUri, apiKey = "") {
    try {
        if (!dataUri || !dataUri.startsWith('data:')) return dataUri;

        const matches = dataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) return dataUri;

        const type = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
        const formData = new FormData();
        const blob = new Blob([buffer], { type });
        const file = new File([blob], 'input.png', { type });
        formData.append('file', file);

        // Primary: Pollinations documented media storage endpoint.
        if (apiKey) {
            const mediaResponse = await fetch('https://media.pollinations.ai/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            if (mediaResponse.ok) {
                const mediaResult = await mediaResponse.json().catch(() => ({}));
                const mediaUrl = mediaResult?.url ||
                                 mediaResult?.data?.url ||
                                 (mediaResult?.id ? `https://media.pollinations.ai/${mediaResult.id}` : "") ||
                                 (mediaResult?.hash ? `https://media.pollinations.ai/${mediaResult.hash}` : "");
                if (typeof mediaUrl === 'string' && mediaUrl.startsWith('http')) {
                    if (await verifyPublicImageUrl(mediaUrl)) {
                        console.log(`[NEURAL_BRIDGE] Hosted reference via Pollinations media: ${mediaUrl}`);
                        return mediaUrl;
                    }
                    console.warn('[NEURAL_BRIDGE_WARN] Pollinations media upload returned a URL that did not serve image bytes.');
                }
            }
        }

        // Secondary: generation host compatibility fallback.
        if (apiKey) {
            const legacyMediaResponse = await fetch('https://gen.pollinations.ai/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            if (legacyMediaResponse.ok) {
                const legacyMediaResult = await legacyMediaResponse.json().catch(() => ({}));
                const legacyMediaUrl = legacyMediaResult?.url ||
                    legacyMediaResult?.data?.url ||
                    (legacyMediaResult?.id ? `https://gen.pollinations.ai/${legacyMediaResult.id}` : "") ||
                    (legacyMediaResult?.hash ? `https://gen.pollinations.ai/${legacyMediaResult.hash}` : "");
                if (typeof legacyMediaUrl === 'string' && legacyMediaUrl.startsWith('http')) {
                    if (await verifyPublicImageUrl(legacyMediaUrl)) {
                        console.log(`[NEURAL_BRIDGE] Hosted reference via Pollinations upload: ${legacyMediaUrl}`);
                        return legacyMediaUrl;
                    }
                    console.warn('[NEURAL_BRIDGE_WARN] Pollinations upload returned a URL that did not serve image bytes.');
                }
            }
        }

        // Fallback: tmp0 documented upload API.
        const tmp0Response = await fetch('https://tmp0.cc/api/v1/upload', {
            method: 'POST',
            body: (() => {
                const nextForm = new FormData();
                nextForm.append('file', file);
                nextForm.append('expires', '1d');
                return nextForm;
            })()
        });
        if (tmp0Response.ok) {
            const tmp0Result = await tmp0Response.json().catch(() => ({}));
            const tmp0Url = tmp0Result?.directDownloadUrl
                || tmp0Result?.url
                || tmp0Result?.fullUrl
                || '';
            if (typeof tmp0Url === 'string' && tmp0Url.startsWith('http')) {
                if (await verifyPublicImageUrl(tmp0Url)) {
                    console.log(`[NEURAL_BRIDGE] Hosted temporary manifest via tmp0: ${tmp0Url}`);
                    return tmp0Url;
                }
                console.warn('[NEURAL_BRIDGE_WARN] tmp0 upload returned a URL that did not serve image bytes.');
            }
        }

        // Legacy fallback: tmpfiles
        const tmpResponse = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!tmpResponse.ok) throw new Error(`Upstream hosting rejection: ${tmpResponse.status}`);

        const tmpResult = await tmpResponse.json();
        const publicUrl = tmpResult.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
        if (!await verifyPublicImageUrl(publicUrl)) {
            throw new Error('Temporary host returned a non-image download URL');
        }
        console.log(`[NEURAL_BRIDGE] Hosted temporary manifest: ${publicUrl}`);
        return publicUrl;
    } catch (e) {
        console.warn("[NEURAL_BRIDGE_WARN] Temporary hosting bypassed:", redactSearchSensitiveText(e.message));
        return "";
    }
}

const mimeFromPath = (filePath = "") => {
    const lower = String(filePath).toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'application/octet-stream';
};

const isLikelyImageBuffer = (buffer) => {
    if (!buffer || buffer.length < 4) return false;
    return (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    ) || (
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ) || (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer.length >= 12
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) || (
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
    );
};

async function verifyPublicImageUrl(url) {
    const raw = String(url || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return false;
    try {
        const response = await fetch(raw, {
            method: 'GET',
            headers: {
                Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (compatible; AimanaReferenceImageValidator/1.0)'
            }
        });
        if (!response.ok) return false;
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        const buffer = Buffer.from(await response.arrayBuffer());
        return contentType.startsWith('image/') || isLikelyImageBuffer(buffer);
    } catch {
        return false;
    }
}

const localStorageImageUrlToDataUri = async (imageUrl) => {
    const raw = String(imageUrl || '').trim();
    if (!raw || raw.startsWith('data:')) return '';

    if (raw.startsWith('/')) {
        const physicalPath = getPhysicalPathFromUrl(raw);
        if (!physicalPath) return '';
        const fileBuffer = await fs.readFile(physicalPath);
        const mimeType = mimeFromPath(physicalPath);
        return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }

    let parsed = null;
    try {
        parsed = new URL(raw);
    } catch {
        return '';
    }

    if (isPrivateHostname(parsed.hostname) && parsed.pathname.startsWith('/storage/')) {
        const physicalPath = getPhysicalPathFromUrl(parsed.pathname);
        if (!physicalPath) return '';
        const fileBuffer = await fs.readFile(physicalPath);
        const mimeType = mimeFromPath(physicalPath);
        return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }

    return '';
};

async function ensurePublicReferenceUrl(imageUrl, req, apiKey = "", options = {}) {
    const raw = String(imageUrl || '').trim();
    if (!raw || raw.startsWith('data:')) return raw;

    const localDataUri = await localStorageImageUrlToDataUri(raw);
    if (localDataUri) {
        const hostedUrl = await uploadToTempHost(localDataUri, apiKey);
        if (hostedUrl) return hostedUrl;
        return options?.fallbackToDataUri ? localDataUri : '';
    }

    return raw;
}

async function resolvePollinationsDirectImageInput(imageUrl, req) {
    const raw = normalizeImageInputValue(imageUrl);
    if (!raw) return '';
    if (raw.startsWith('data:')) return raw;

    if (raw.startsWith('/')) {
        const physicalPath = getPhysicalPathFromUrl(raw);
        if (!physicalPath) return raw;
        const fileBuffer = await fs.readFile(physicalPath);
        const mimeType = mimeFromPath(physicalPath);
        return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }

    let parsed = null;
    try {
        parsed = new URL(raw);
    } catch {
        return raw;
    }

    if (isPrivateHostname(parsed.hostname) && parsed.pathname.startsWith('/storage/')) {
        const physicalPath = getPhysicalPathFromUrl(parsed.pathname);
        if (!physicalPath) return raw;
        const fileBuffer = await fs.readFile(physicalPath);
        const mimeType = mimeFromPath(physicalPath);
        return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    }

    return raw;
}

function moveImageParamToEnd(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (!parsed.searchParams.has('image')) return rawUrl;
        const imageValue = parsed.searchParams.get('image');
        parsed.searchParams.delete('image');
        if (imageValue) parsed.searchParams.append('image', imageValue);
        return parsed.toString();
    } catch {
        return rawUrl;
    }
}

function normalizeVideoAspectRatio(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return '16:9';

    if (raw === '16:9' || raw.includes('16:9') || raw.includes('landscape') || raw.includes('cinematic')) {
        return '16:9';
    }
    if (raw === '9:16' || raw.includes('9:16') || raw.includes('portrait') || raw.includes('vertical')) {
        return '9:16';
    }

    // Pollinations video docs currently specify 16:9 / 9:16.
    return '16:9';
}

function getVideoDimensionsForAspect(aspectRatio) {
    const normalized = normalizeVideoAspectRatio(aspectRatio);
    if (normalized === '9:16') return { width: 720, height: 1280 };
    return { width: 1280, height: 720 };
}

function dimensionsConflictWithAspect(width, height, aspectRatio) {
    const normalized = normalizeVideoAspectRatio(aspectRatio);
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return true;
    if (normalized === '9:16') return !(h > w);
    return !(w > h);
}

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractTextFromContentParts = (content) => {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    return content
        .map((part) => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            if (typeof part?.content === 'string') return part.content;
            if (typeof part?.text?.value === 'string') return part.text.value;
            if (typeof part?.output_text === 'string') return part.output_text;
            return '';
        })
        .join('')
        .trim();
};

const resolveTextSandboxContent = (data, mapped) => {
    if (typeof mapped === 'string' && mapped.trim()) {
        return mapped;
    }

    const mappedPartsText = extractTextFromContentParts(mapped);
    if (mappedPartsText) return mappedPartsText;

    const firstChoice = data?.choices?.[0] || {};
    const message = firstChoice?.message || {};

    const messageText = extractTextFromContentParts(message?.content);
    if (messageText) return messageText;

    const choiceText = typeof firstChoice?.text === 'string' ? firstChoice.text.trim() : '';
    if (choiceText) return choiceText;

    const topLevelOutputText = typeof data?.output_text === 'string' ? data.output_text.trim() : '';
    if (topLevelOutputText) return topLevelOutputText;

    const refusal = typeof message?.refusal === 'string' ? message.refusal.trim() : '';
    if (refusal) return `[Refusal] ${refusal}`;

    if (String(firstChoice?.finish_reason || '').toLowerCase() === 'content_filter') {
        return '[No text response: filtered by provider moderation policy]';
    }

    if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
        return `[No direct text response: model emitted ${message.tool_calls.length} tool call(s)]`;
    }

    if (typeof mapped === 'string') return mapped;
    return JSON.stringify(mapped ?? data, null, 2);
};

const withPollinationsIdentityGuard = (engine, engineConfig = {}, messages = []) => {
    if (String(engine?.provider || '').toLowerCase() !== 'pollinations') return messages;
    if (String(engine?.category || '').toLowerCase() !== 'language') return messages;
    if (engineConfig && engineConfig.textSpecialized === true) return messages;

    const identity = String(engine?.upstreamId || engine?.id || 'unknown').trim();
    const guardInstruction = [
        'Identity policy:',
        `- You are the "${identity}" model routed through Pollinations.`,
        '- If asked about your model identity, use exactly that identity and do not claim a different model family.',
        '- If uncertain, say your runtime model is provided by Pollinations for this request.'
    ].join('\n');

    return [{ role: 'system', content: guardInstruction }, ...(Array.isArray(messages) ? messages : [])];
};

const toBooleanFlag = (value) => {
    if (value === true || value === false) return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    }
    return false;
};

const clampUnitInterval = (value, fallback = 1) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed <= 0) return 0;
    if (parsed >= 1) return 1;
    return parsed;
};

const shouldEmitSearchMonitoring = (searchRequested = false) => {
    if (!searchRequested) return false;
    const enabled = toBooleanFlag(process.env.CHAT_WEB_SEARCH_MONITORING_ENABLED || false);
    if (!enabled) return false;
    const sampleRate = clampUnitInterval(process.env.CHAT_WEB_SEARCH_MONITORING_SAMPLE_RATE, 1);
    if (sampleRate <= 0) return false;
    if (sampleRate >= 1) return true;
    return Math.random() < sampleRate;
};

const buildSearchMonitoringMessage = ({
    modelId = '',
    payloadMode = '',
    searchTelemetry = {},
    searchDegraded = null,
    searchFilterStats = {},
    latencyMs = 0
}) => {
    const mode = String(searchTelemetry?.searchMode || 'off');
    const provider = String(searchTelemetry?.searchProvider || 'none');
    const requested = searchTelemetry?.searchRequested === true ? 1 : 0;
    const applied = searchTelemetry?.searchApplied === true ? 1 : 0;
    const warning = searchTelemetry?.searchWarning ? 'yes' : 'no';
    const degradedCode = String(searchDegraded?.code || 'none');
    const denied = Number(searchFilterStats?.filteredByDeny || 0);
    const allowFiltered = Number(searchFilterStats?.filteredByAllow || 0);
    const latency = Number.isFinite(Number(latencyMs)) ? Math.max(0, Math.round(Number(latencyMs))) : 0;
    return redactSearchSensitiveText(
        `model=${String(modelId || 'unknown')} payloadMode=${String(payloadMode || 'text')} requested=${requested} applied=${applied} mode=${mode} provider=${provider} warning=${warning} degraded=${degradedCode} denied=${denied} allowFiltered=${allowFiltered} latencyMs=${latency}`
    );
};

const emitSearchMonitoringEvent = async ({
    userId = 'anonymous',
    modelId = '',
    payloadMode = '',
    searchTelemetry = {},
    searchDegraded = null,
    searchFilterStats = {},
    latencyMs = 0
}) => {
    if (!shouldEmitSearchMonitoring(searchTelemetry?.searchRequested === true)) return;
    const message = buildSearchMonitoringMessage({
        modelId,
        payloadMode,
        searchTelemetry,
        searchDegraded,
        searchFilterStats,
        latencyMs
    });
    try {
        await logSystemEvent('INFO', 'CHAT_SEARCH_METRIC', message, userId || 'anonymous');
    } catch {
        // Monitoring should never break chat responses.
    }
};

const parseListSetting = (input) => (
    String(input || '')
        .split(/[,\n;|]/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
);

const shouldForceFallbackSearch = (engine = {}) => {
    const provider = String(engine?.provider || '').trim().toLowerCase();
    const category = String(engine?.category || '').trim().toLowerCase();
    const engineId = String(engine?.id || '').trim().toLowerCase();
    const upstreamId = String(engine?.upstreamId || '').trim().toLowerCase();
    const forcedProviders = parseListSetting(process.env.CHAT_WEB_SEARCH_FORCE_FALLBACK_PROVIDERS || '');
    const forcedModels = parseListSetting(process.env.CHAT_WEB_SEARCH_FORCE_FALLBACK_MODELS || '');
    if (forcedProviders.length > 0 && provider && forcedProviders.includes(provider)) return true;
    if (forcedModels.length > 0) {
        if (engineId && forcedModels.includes(engineId)) return true;
        if (upstreamId && forcedModels.includes(upstreamId)) return true;
    }
    // Pollinations chat models often reject native web_search tool payloads on this route.
    // Default them to our server-side fallback search path for more reliable grounding.
    if (provider === 'pollinations' && (!category || category === 'language')) return true;
    return false;
};

const resolveChatWebSearchMode = (payload = {}, engine = null) => {
    const modeFromPayload = String(payload?.searchMode || payload?.dynamicParams?.searchMode || '').trim().toLowerCase();
    const modeFromEnv = String(process.env.CHAT_WEB_SEARCH_MODE || '').trim().toLowerCase();
    const candidate = modeFromPayload || modeFromEnv || 'native';
    if (candidate === 'off') return 'off';
    if (shouldForceFallbackSearch(engine)) return 'fallback';
    if (candidate === 'native' || candidate === 'fallback') return candidate;
    return 'native';
};

const buildSearchQueryFromMessages = (messages = [], fallbackPrompt = '') => {
    const lastUser = [...messages].reverse().find((msg) => String(msg?.role || '').toLowerCase() === 'user');
    if (lastUser) {
        const text = extractTextFromContentParts(lastUser.content);
        if (text) return text;
    }
    return String(fallbackPrompt || '').trim();
};

const MAX_FALLBACK_CONTEXT_SOURCES = 5;
const MAX_FALLBACK_CONTEXT_CHARS = 6000;

const buildFallbackSearchPrelude = ({ query = '', sources = [] }) => {
    if (!Array.isArray(sources) || sources.length === 0) return '';
    const timestamp = new Date().toISOString();
    const normalizedQuery = String(query || '').replace(/\s+/g, ' ').trim();
    const cappedSources = sources.slice(0, MAX_FALLBACK_CONTEXT_SOURCES);

    const lines = [
        'WEB_SEARCH_CONTEXT_V1',
        `Query: ${normalizedQuery || '(none)'}`,
        `Timestamp: ${timestamp}`,
        'Sources:'
    ];

    for (let i = 0; i < cappedSources.length; i += 1) {
        const src = cappedSources[i];
        const title = String(src?.title || 'Untitled').replace(/\s+/g, ' ').trim();
        const url = String(src?.url || '').trim();
        const snippet = String(src?.snippet || '').replace(/\s+/g, ' ').trim();
        lines.push(`[${i + 1}] ${title}`);
        lines.push(`URL: ${url}`);
        if (snippet) lines.push(`Snippet: ${snippet}`);
    }

    lines.push('Citation instruction: when using source-backed facts, cite the exact source URL.');

    const full = lines.join('\n');
    if (full.length <= MAX_FALLBACK_CONTEXT_CHARS) return full;
    return `${full.slice(0, MAX_FALLBACK_CONTEXT_CHARS)}\n[Context truncated to fit safety length budget]`;
};

const DEFAULT_URL_CONTEXT_SOURCES = 3;
const DEFAULT_URL_CONTEXT_CHARS = 8000;

const resolveUrlIngestLimit = (value, fallback, min = 1, max = 20) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const resolveUrlIngestSettings = () => ({
    maxLinks: resolveUrlIngestLimit(process.env.CHAT_URL_INGEST_MAX_LINKS, DEFAULT_URL_CONTEXT_SOURCES, 1, 10),
    maxBytes: resolveUrlIngestLimit(process.env.CHAT_URL_INGEST_MAX_BYTES, 1_000_000, 64 * 1024, 5 * 1024 * 1024),
    maxChars: resolveUrlIngestLimit(process.env.CHAT_URL_INGEST_MAX_CHARS, 4000, 500, 20000),
    timeoutMs: resolveUrlIngestLimit(process.env.CHAT_URL_INGEST_TIMEOUT_MS, 8000, 1000, 30000),
    maxContextChars: resolveUrlIngestLimit(process.env.CHAT_URL_INGEST_MAX_CONTEXT_CHARS, DEFAULT_URL_CONTEXT_CHARS, 1000, 40000)
});

const buildUrlContextPrelude = ({ items = [], maxChars = DEFAULT_URL_CONTEXT_CHARS, maxSources = DEFAULT_URL_CONTEXT_SOURCES }) => {
    if (!Array.isArray(items) || items.length === 0) return '';
    const timestamp = new Date().toISOString();
    const capped = items.slice(0, maxSources);

    const lines = [
        'URL_CONTEXT_V1',
        `Timestamp: ${timestamp}`,
        'Sources:'
    ];

    capped.forEach((item, idx) => {
        const title = String(item?.title || 'Untitled').replace(/\s+/g, ' ').trim();
        const url = String(item?.url || '').trim();
        const note = String(item?.note || '').replace(/\s+/g, ' ').trim();
        const content = String(item?.content || '').trim();
        lines.push(`[${idx + 1}] ${title}`);
        if (url) lines.push(`URL: ${url}`);
        if (item?.source) lines.push(`Type: ${String(item.source || '').trim()}`);
        if (note) lines.push(`Note: ${note}`);
        if (content) {
            lines.push('Content:');
            lines.push(content);
        }
    });

    lines.push('Citation instruction: when using source-backed facts, cite the exact source URL.');

    const full = lines.join('\n');
    if (full.length <= maxChars) return full;
    return `${full.slice(0, maxChars)}\n[Context truncated to fit safety length budget]`;
};

const mergeSources = (primary = [], secondary = []) => {
    const out = [];
    const seen = new Set();
    const append = (src) => {
        if (!src || typeof src !== 'object') return;
        const url = String(src.url || '').trim();
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push(src);
    };
    (Array.isArray(primary) ? primary : []).forEach(append);
    (Array.isArray(secondary) ? secondary : []).forEach(append);
    return out;
};

const resolveLinkIngestRequested = (payload = {}) => (
    toBooleanFlag(payload?.useLinks) || toBooleanFlag(payload?.dynamicParams?.useLinks)
);

const REASONING_SUMMARY_MARKER = 'REASONING_SUMMARY_INSTRUCTION_V1';
const buildReasoningSummaryInstruction = () => ([
    REASONING_SUMMARY_MARKER,
    'When reasoning mode is enabled, format your response in two sections:',
    'Final Answer: Provide the direct answer first.',
    'Reasoning Summary: Provide a visible reasoning overview using short markdown bullets.',
    'Inside Reasoning Summary, include these labels when relevant:',
    '- Approach',
    '- What I checked',
    '- Key assumptions',
    '- Tradeoffs',
    '- Conclusion',
    'Keep the reasoning overview concise and useful.',
    'Do not reveal chain-of-thought, private scratch work, or step-by-step hidden reasoning.'
].join('\n'));

const applyReasoningSummaryInstruction = ({ payload = {}, messages = [] }) => {
    const reasoningRequested = (
        toBooleanFlag(payload?.reasoning)
        || toBooleanFlag(payload?.useReasoning)
        || toBooleanFlag(payload?.dynamicParams?.reasoning)
        || toBooleanFlag(payload?.dynamicParams?.useReasoning)
    );
    if (!reasoningRequested) return messages;
    if (!Array.isArray(messages)) return messages;
    const alreadyInjected = messages.some(
        (msg) => msg?.role === 'system' && String(msg?.content || '').includes(REASONING_SUMMARY_MARKER)
    );
    if (alreadyInjected) return messages;
    const instruction = buildReasoningSummaryInstruction();
    return [{ role: 'system', content: instruction }, ...messages];
};

const applyUrlIngestAugmentation = async ({ payload = {}, messages = [], capabilityWarnings = [] }) => {
    const linkRequested = resolveLinkIngestRequested(payload);
    if (!linkRequested) {
        return {
            messages,
            sources: [],
            warning: '',
            applied: false,
            attempted: false
        };
    }

    const lastUser = [...messages].reverse().find((msg) => String(msg?.role || '').toLowerCase() === 'user');
    const lastUserText = lastUser ? extractTextFromContentParts(lastUser.content) : '';
    const urls = extractUrlsFromText(lastUserText);
    if (urls.length === 0) {
        return {
            messages,
            sources: [],
            warning: '',
            applied: false,
            attempted: false
        };
    }

    const settings = resolveUrlIngestSettings();
    const ingest = await ingestUrls({
        urls,
        timeoutMs: settings.timeoutMs,
        maxBytes: settings.maxBytes,
        maxChars: settings.maxChars,
        maxLinks: settings.maxLinks
    });

    if (ingest.warning) pushCapabilityWarning(capabilityWarnings, ingest.warning);
    const items = Array.isArray(ingest.items) ? ingest.items : [];
    const sources = Array.isArray(ingest.sources) ? ingest.sources : [];
    if (items.length === 0) {
        return {
            messages,
            sources,
            warning: ingest.warning || 'URL ingest returned no sources.',
            applied: false,
            attempted: true
        };
    }

    const prelude = buildUrlContextPrelude({ items, maxChars: settings.maxContextChars, maxSources: settings.maxLinks });
    if (!prelude) {
        return {
            messages,
            sources,
            warning: ingest.warning || 'URL ingest context could not be generated.',
            applied: false,
            attempted: true
        };
    }

    const augmentedMessages = [{ role: 'system', content: prelude }, ...messages];
    return {
        messages: augmentedMessages,
        sources,
        warning: ingest.warning || '',
        applied: true,
        attempted: true
    };
};

const applyFallbackSearchAugmentation = async ({
    payload = {},
    engineConfig = {},
    engine = null,
    messages = [],
    capabilityWarnings = [],
    forceFallback = false
}) => {
    const forced = forceFallback === true;
    const mode = forced ? 'fallback' : resolveChatWebSearchMode(payload, engine);
    const searchRequested = toBooleanFlag(payload?.useSearch) || toBooleanFlag(payload?.dynamicParams?.useSearch);
    const toolsSupported = supportsTextSearchTools(engineConfig);
    const forceFallbackFlag = forced || shouldForceFallbackSearch(engine);

    if (!searchRequested || mode !== 'fallback' || (toolsSupported && !forceFallbackFlag)) {
        return {
            messages,
            sources: [],
            provider: 'none',
            warning: '',
            applied: false,
            filterStats: { filteredByDeny: 0, filteredByAllow: 0 },
            degraded: null
        };
    }

    const query = buildSearchQueryFromMessages(messages, payload?.prompt || '');
    if (!query) {
        const warning = sanitizeWarningText('Search fallback requested but no usable query text was found.');
        pushCapabilityWarning(capabilityWarnings, warning);
        return {
            messages,
            sources: [],
            provider: 'none',
            warning,
            applied: false,
            filterStats: { filteredByDeny: 0, filteredByAllow: 0 },
            degraded: { provider: 'none', code: 'empty_query', retryable: false }
        };
    }

    const allowDomains = payload?.dynamicParams?.allowDomains ?? payload?.allowDomains ?? '';
    const denyDomains = payload?.dynamicParams?.denyDomains ?? payload?.denyDomains ?? '';
    const lookup = await searchWeb({
        query,
        maxResults: 5,
        timeoutMs: 8000,
        allowDomains,
        denyDomains
    });
    if (lookup.warning) pushCapabilityWarning(capabilityWarnings, lookup.warning);
    const filterStats = lookup?.filterStats || { filteredByDeny: 0, filteredByAllow: 0 };
    if ((filterStats.filteredByDeny || 0) > 0 || (filterStats.filteredByAllow || 0) > 0) {
        pushCapabilityWarning(
            capabilityWarnings,
            `Search domain policy applied: denied=${Number(filterStats.filteredByDeny || 0)}, allow-filtered=${Number(filterStats.filteredByAllow || 0)}.`
        );
    }
    const sources = Array.isArray(lookup.results) ? lookup.results : [];
    if (sources.length === 0) {
        if (!lookup.warning) pushCapabilityWarning(capabilityWarnings, 'Search fallback returned zero results; skipped context block.');
        return {
            messages,
            sources: [],
            provider: lookup.provider || 'none',
            warning: sanitizeWarningText(lookup.warning || 'Search fallback returned zero results; skipped context block.'),
            applied: false,
            filterStats,
            degraded: lookup.degraded || null
        };
    }

    const prelude = buildFallbackSearchPrelude({ query, sources });
    if (!prelude) {
        return {
            messages,
            sources: [],
            provider: lookup.provider || 'none',
            warning: sanitizeWarningText(lookup.warning || ''),
            applied: false,
            filterStats,
            degraded: lookup.degraded || null
        };
    }

    const augmentedMessages = [{ role: 'system', content: prelude }, ...messages];
    return {
        messages: augmentedMessages,
        sources,
        provider: lookup.provider || 'none',
        warning: sanitizeWarningText(lookup.warning || ''),
        applied: true,
        filterStats,
        degraded: lookup.degraded || null
    };
};

const resolveSearchTelemetry = ({
    payload = {},
    engineConfig = {},
    engine = null,
    parsedBody = null,
    fallbackApplied = false,
    fallbackProvider = 'none',
    fallbackWarning = '',
    capabilityWarnings = []
}) => {
    // Canonical runtime switch for chat grounding comes from dynamicParams.useSearch.
    const searchRequested = toBooleanFlag(payload?.useSearch) || toBooleanFlag(payload?.dynamicParams?.useSearch);
    const toolsSupported = supportsTextSearchTools(engineConfig);
    const forceFallbackFlag = shouldForceFallbackSearch(engine);
    let searchApplied = false;
    let searchMode = resolveChatWebSearchMode(payload, engine);
    let searchProvider = 'none';
    let searchWarning = '';

    const applyNativeSearchTooling = () => {
        if (!toolsSupported) {
            searchWarning = 'Search requested but model does not advertise tools/search support. Sent as plain completion.';
            pushCapabilityWarning(capabilityWarnings, searchWarning);
            return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
        }

        if (!parsedBody || typeof parsedBody !== 'object') {
            searchWarning = 'Search requested and supported, but payload body could not be parsed for search injection.';
            pushCapabilityWarning(capabilityWarnings, searchWarning);
            return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
        }

        if (Array.isArray(parsedBody.tools) && parsedBody.tools.length > 0) {
            const hasWebSearchTool = parsedBody.tools.some((tool) => String(tool?.type || '').toLowerCase() === 'web_search');
            if (!hasWebSearchTool) {
                searchWarning = 'Search requested but payload already has explicit tools config; web-search tool not auto-injected.';
                pushCapabilityWarning(capabilityWarnings, searchWarning);
            }
        } else {
            parsedBody.tools = [{ type: 'web_search' }];
        }
        if (parsedBody.tool_choice === undefined || parsedBody.tool_choice === null || parsedBody.tool_choice === '') {
            parsedBody.tool_choice = 'auto';
        }
        if (!Array.isArray(parsedBody.tools) || parsedBody.tools.length === 0) {
            return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
        }
        searchApplied = true;
        searchMode = 'native';
        searchProvider = 'pollinations';
        return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
    };

    if (!searchRequested) {
        return { searchRequested, searchApplied, searchMode: 'off', searchProvider, searchWarning };
    }

    if (searchMode === 'off') {
        searchWarning = 'Search requested but disabled by CHAT_WEB_SEARCH_MODE=off.';
        pushCapabilityWarning(capabilityWarnings, searchWarning);
        return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
    }

    if (searchMode === 'fallback') {
        if (fallbackApplied) {
            searchApplied = true;
            searchProvider = fallbackProvider || 'web-fallback';
            searchWarning = sanitizeWarningText(fallbackWarning || '');
            return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
        }
        if (toolsSupported && !forceFallbackFlag) {
            return applyNativeSearchTooling();
        }
        searchWarning = sanitizeWarningText(
            fallbackWarning || 'Search fallback mode is enabled but no fallback results were available. Sent as plain completion.'
        );
        pushCapabilityWarning(capabilityWarnings, searchWarning);
        return { searchRequested, searchApplied, searchMode, searchProvider, searchWarning };
    }

    return applyNativeSearchTooling();
};

const stripSearchToolingFromBody = (body = {}) => {
    if (!body || typeof body !== 'object') return body;
    const clone = { ...body };
    delete clone.tools;
    delete clone.tool_choice;
    delete clone.useSearch;
    delete clone.search;
    return clone;
};

const shouldRetryWithoutSearchTools = (errorMessage = '', searchTelemetry = {}) => {
    if (!searchTelemetry?.searchApplied) return false;
    const lower = String(errorMessage || '').toLowerCase();
    if (!lower) return false;
    return (
        lower.includes('tool')
        || lower.includes('tools')
        || lower.includes('web_search')
        || lower.includes('tool_choice')
        || lower.includes('unknown field')
        || lower.includes('json body validation failed')
        || lower.includes('body validation failed')
        || lower.includes('schema')
        || lower.includes('invalid')
        || lower.includes('unsupported')
    );
};

function parseTemplate(template, vars) {
    if (!template) return "";
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        const regex = new RegExp(`{{\\s*${escapeRegex(key)}\\s*}}`, 'g');
        let stringValue = value;
        if (value === 'undefined' || value === 'null') stringValue = "";
        if (value === true) stringValue = "true";
        if (value === false) stringValue = "false";
        if (value === null || value === undefined) stringValue = "";
        
        result = result.replace(regex, stringValue);
    }
    return result;
}

function sanitizeUrlQuery(url) {
    try {
        const parsed = new URL(url);
        const toDelete = [];
        for (const [key, value] of parsed.searchParams.entries()) {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized || normalized === 'undefined' || normalized === 'null') {
                toDelete.push(key);
            }
        }
        toDelete.forEach((key) => parsed.searchParams.delete(key));
        return parsed.toString();
    } catch {
        return url;
    }
}

async function fetchArtifact(url, options = {}, retries = 1) {
    const TIMEOUT_MS = 300000; // 5 Minutes
    assertSafeTargetUrl(url);
    
    for (let i = 0; i <= retries; i++) {
        try {
            const fetchOptions = {
                method: options.method || 'GET',
                headers: { 
                    'Accept': 'image/*, video/*, audio/*, application/json, text/plain', 
                    'User-Agent': 'AIMANA/Orchestrator-1.6',
                    ...options.headers 
                },
                signal: AbortSignal.timeout(TIMEOUT_MS)
            };
            if (options.body) fetchOptions.body = options.body;
            
            const response = await fetch(url, fetchOptions);
            
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                const pollenUsed = response.headers.get('x-pollen-used') || response.headers.get('x-credit-usage') || '';

                if (contentType.includes('application/json')) return { response, data: await readJsonWithLimit(response, MAX_PROXY_JSON_BYTES), type: 'json', pollenUsed };
                if (contentType.includes('text/plain')) return { response, text: await readTextWithLimit(response, MAX_PROXY_TEXT_BYTES), type: 'text', pollenUsed };
                if (contentType.includes('text/html')) {
                    const htmlBody = await readTextWithLimit(response, MAX_PROXY_ERROR_BYTES).catch(() => '');
                    const normalizedHtmlError = normalizeKnownUpstreamHtmlError({
                        rawMessage: htmlBody,
                        rawBody: htmlBody,
                        status: response.status,
                        engine: options.engine || null
                    });
                    if (normalizedHtmlError) {
                        throw new Error(redactSearchSensitiveText(normalizedHtmlError));
                    }
                }
                
                const blob = await response.blob();
                if (blob.size > 0) return { response, blob, type: 'binary', pollenUsed };
            } else {
                const errorBody = await readTextWithLimit(response, MAX_PROXY_ERROR_BYTES).catch(() => "Unknown Upstream Error");
                const engineMarker = String(options?.engine?.id || options?.engine?.upstreamId || options?.engine?.label || '').trim();
                
                let errorMessage = redactSearchSensitiveText(errorBody);
                let requestId = '';
                let parsedErrorPayload = null;
                let isPermanentFailure = response.status >= 400 && response.status < 500;

                try {
                    const parsed = JSON.parse(errorBody);
                    parsedErrorPayload = parsed;
                    if (parsed.requestId) requestId = parsed.requestId;
                    if (parsed.error?.requestId) requestId = parsed.error.requestId;

                    if (parsed.error?.message) {
                        errorMessage = parsed.error.message;
                    } else if (parsed.message) {
                        errorMessage = parsed.message;
                    }
                } catch(e) {}

                errorMessage = unwrapNestedErrorMessage(errorMessage, (nestedId) => {
                    if (!requestId) requestId = nestedId;
                });

                const normalizedHtmlError = normalizeKnownUpstreamHtmlError({
                    rawMessage: errorMessage,
                    rawBody: errorBody,
                    status: response.status,
                    engine: options.engine || null
                });
                if (normalizedHtmlError) {
                    isPermanentFailure = true;
                    errorMessage = normalizedHtmlError;
                }

                const normalizedJsonError = normalizeKnownUpstreamJsonError({
                    rawMessage: errorMessage,
                    payload: parsedErrorPayload,
                    status: response.status,
                    engine: options.engine || null
                });
                if (normalizedJsonError) {
                    errorMessage = normalizedJsonError;
                }

                const safeLogMessage = summarizeUpstreamErrorForLog({
                    rawMessage: errorMessage,
                    rawBody: errorBody,
                    status: response.status,
                    engine: options.engine || null
                });
                console.error(`[PROXY_UPSTREAM_ERR]${engineMarker ? ` Engine: ${engineMarker} |` : ''} Status: ${response.status} | ${safeLogMessage}`);

                const safetyKeywords = ['safety', 'moderation', 'blocked', 'policy', 'no image data', 'vertex ai', 'sensitive information'];
                if (safetyKeywords.some(kw => errorMessage.toLowerCase().includes(kw))) {
                    isPermanentFailure = true;
                    errorMessage = `[Blocked] ${errorMessage}`;
                }

                const billingLimitHit = /billing cycle spend limit reached|billing limit|spend limit reached/i.test(errorMessage);
                if (billingLimitHit) {
                    isPermanentFailure = true;
                    errorMessage = 'Workspace billing limit reached. Update provider billing or switch models.';
                }

                const upstreamServiceConfigMatch = errorMessage.match(/^(.+?) service is not configured \(missing api key\)$/i);
                if (upstreamServiceConfigMatch) {
                    isPermanentFailure = true;
                    const serviceName = String(upstreamServiceConfigMatch[1] || 'This service').trim();
                    errorMessage = `${serviceName} is not enabled for the active Pollinations account. This is an upstream service configuration issue, not a missing AIMANA .env key. Try another model or use a Pollinations account with access to ${serviceName}.`;
                }

                // Normalize opaque provider bridge failures into actionable guidance.
                // Treat provider-side 4xx wrapped by a 5xx bridge response as permanent (no retry),
                // so UI can stop generation immediately and surface the actionable error.
                if (response.status >= 500 && /api\\.airforce|grok-imagine-video|grok-video/i.test(errorMessage)) {
                    errorMessage = `[Provider Gateway] ${errorMessage}. This is usually transient or content/payload-rejected upstream. Retry with a milder prompt or different reference image.`;
                    if (/provider error \((4\d\d)\b|bad request|invalid|payload-rejected|request rejected/i.test(errorMessage)) {
                        isPermanentFailure = true;
                    }
                }

                const detailedError = requestId ? `[RID:${requestId}] ${redactSearchSensitiveText(errorMessage)}` : redactSearchSensitiveText(errorMessage);

                if (isPermanentFailure || i === retries) {
                    throw new Error(detailedError || `Upstream Status ${response.status}`);
                }
            }
        } catch (err) { 
            if (i === retries || err.name === 'TimeoutError' || !err.message.includes('Retry')) throw err; 
            console.warn(`[PROXY_RETRY] Attempt ${i + 1} failed. Retrying...`);
        }
    }
    throw new Error("Neural Pipeline Gateway Timeout");
}

const stripHeadersCaseInsensitive = (headers = {}, names = []) => {
    const blocked = new Set((Array.isArray(names) ? names : []).map((name) => String(name || '').toLowerCase()));
    if (blocked.size === 0) return headers;
    for (const key of Object.keys(headers || {})) {
        if (blocked.has(String(key || '').toLowerCase())) {
            delete headers[key];
        }
    }
    return headers;
};

const engineSupportsAudioToText = (engine = {}) => {
    const upstreamId = String(engine?.upstreamId || '').toLowerCase();
    const responsePath = String(engine?.responsePath || '').trim().toLowerCase();
    if (responsePath === 'text') return true;
    if (upstreamId.includes('whisper') || upstreamId.includes('scribe')) return true;

    try {
        const parsedConfig = engine?.configJson ? JSON.parse(engine.configJson) : {};
        const inputs = Array.isArray(parsedConfig?.textInputModalities)
            ? parsedConfig.textInputModalities.map((value) => String(value || '').toLowerCase())
            : [];
        const outputs = Array.isArray(parsedConfig?.textOutputModalities)
            ? parsedConfig.textOutputModalities.map((value) => String(value || '').toLowerCase())
            : [];
        return inputs.includes('audio') && outputs.includes('text');
    } catch (_e) {
        return false;
    }
};

const isAudioTranscriptionRequest = (engine = {}, payload = {}) => {
    const audioData = String(payload?.audioData || '').trim();
    if (!audioData) return false;
    if (toBooleanFlag(payload?.isTranscription)) return true;

    const requestUrl = String(engine?.requestUrl || '').toLowerCase();
    if (requestUrl.includes('/audio/transcriptions') || requestUrl.includes('/transcriptions')) {
        return true;
    }

    return String(engine?.category || '').toLowerCase() === 'audio' && engineSupportsAudioToText(engine);
};

function getRequestOrigin(req) {
    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    const proto = (typeof forwardedProto === 'string' && forwardedProto) ? forwardedProto.split(',')[0].trim() : req?.protocol || 'http';
    const host = req?.get?.('host') || req?.headers?.host || '';
    if (!host) return '';
    return `${proto}://${host}`;
}

function absolutizeImageUrl(imageUrl, req) {
    const raw = String(imageUrl || '').trim();
    if (!raw) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/')) {
        const origin = getRequestOrigin(req);
        return origin ? `${origin}${raw}` : raw;
    }
    return raw;
}

function normalizePollinationsImageQuery(rawUrl, engine, imageUrl = '') {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname !== 'gen.pollinations.ai') return rawUrl;
        if (!parsed.pathname.startsWith('/image/')) return rawUrl;

        const modelName = String(
            parsed.searchParams.get('model') ||
            engine?.upstreamId ||
            engine?.id ||
            ''
        ).trim().toLowerCase();

        // Klein Large currently rejects several generic image params that other
        // Pollinations image models accept. Strip them defensively so older
        // database blueprints keep working too.
        if (modelName === 'klein-large' || modelName === 'pollinations-klein-large') {
            ['nologo', 'private', 'nofeed', 'guidance'].forEach((key) => parsed.searchParams.delete(key));
        }

        if (imageUrl && !parsed.searchParams.has('image')) {
            parsed.searchParams.set('image', imageUrl);
        }

        return parsed.toString();
    } catch {
        return rawUrl;
    }
}

function looksLikeBase64Asset(value = '') {
    const raw = String(value || '').trim();
    if (!raw || raw.length < 64) return false;
    if (raw.startsWith('data:')) return false;
    if (/^https?:\/\//i.test(raw)) return false;
    if (/\s/.test(raw)) return false;
    return /^[A-Za-z0-9+/=]+$/.test(raw);
}

function inferMimeTypeFromBase64(value = '') {
    const raw = String(value || '').trim();
    if (raw.startsWith('iVBOR')) return 'image/png';
    if (raw.startsWith('/9j/')) return 'image/jpeg';
    if (raw.startsWith('UklGR')) return 'image/webp';
    if (raw.startsWith('R0lGOD')) return 'image/gif';
    return 'application/octet-stream';
}

function normalizeImageInputValue(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
        return raw;
    }
    const compact = raw.replace(/\s+/g, '');
    if (!looksLikeBase64Asset(compact)) return raw;
    return `data:${inferMimeTypeFromBase64(compact)};base64,${compact}`;
}

function requiresPollinationsPublicImageUrl(engine = {}) {
    const requestUrl = String(engine?.requestUrl || '');
    return String(engine?.provider || '').toLowerCase() === 'pollinations'
        && !requestUrl.includes('gen.pollinations.ai/image/');
}

function dataUriToImageFile(dataUri = '', filename = 'reference.png') {
    const match = String(dataUri || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1] || 'image/png';
    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
    const buffer = Buffer.from(match[2], 'base64');
    const blob = new Blob([buffer], { type: mimeType });
    return new File([blob], filename.includes('.') ? filename : `${filename}.${extension}`, { type: mimeType });
}

function normalizePollinationsVideoQuery(rawUrl, imageUrl = '') {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname !== 'gen.pollinations.ai') return rawUrl;
        if (!parsed.pathname.startsWith('/video/')) return rawUrl;
        if (imageUrl && !parsed.searchParams.has('image')) {
            parsed.searchParams.set('image', imageUrl);
        }
        return parsed.toString();
    } catch {
        return rawUrl;
    }
}

function normalizePollinationsAudioQuery(rawUrl, payload = {}, engine = {}) {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname !== 'gen.pollinations.ai') return rawUrl;
        if (!parsed.pathname.startsWith('/audio/')) return rawUrl;

        const dynamicParams = payload?.dynamicParams && typeof payload.dynamicParams === 'object'
            ? payload.dynamicParams
            : {};
        const modelName = String(
            parsed.searchParams.get('model')
            || payload?.model
            || engine?.upstreamId
            || engine?.id
            || ''
        ).trim().toLowerCase();
        const isMusicRequest = (
            modelName.includes('music') ||
            modelName.includes('suno') ||
            modelName.includes('acestep') ||
            modelName.includes('ace-step') ||
            modelName.includes('ace_step')
        );
        if (!isMusicRequest) return rawUrl;

        const styleValue = String(payload?.style ?? dynamicParams?.style ?? '').trim();
        if (styleValue) parsed.searchParams.set('style', styleValue);

        const durationValue = Number(payload?.duration ?? dynamicParams?.duration);
        if (Number.isFinite(durationValue) && durationValue > 0) {
            parsed.searchParams.set('duration', String(Math.round(durationValue)));
        }

        const instrumentalRaw = payload?.instrumental ?? dynamicParams?.instrumental;
        if (instrumentalRaw !== undefined && instrumentalRaw !== null && String(instrumentalRaw).trim() !== '') {
            parsed.searchParams.set('instrumental', toBooleanFlag(instrumentalRaw) ? 'true' : 'false');
        }

        return parsed.toString();
    } catch {
        return rawUrl;
    }
}

function injectPollinationsAudioBodyParams(rawBody, payload = {}, engine = {}) {
    if (!rawBody || typeof rawBody !== 'string') return rawBody;

    let parsedBody;
    try {
        parsedBody = JSON.parse(rawBody);
    } catch {
        return rawBody;
    }
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return rawBody;

    const dynamicParams = payload?.dynamicParams && typeof payload.dynamicParams === 'object'
        ? payload.dynamicParams
        : {};
    const modelName = String(parsedBody.model || payload?.model || engine?.upstreamId || engine?.id || '').trim().toLowerCase();
    const isMusicRequest = (
        modelName.includes('music') ||
        modelName.includes('suno') ||
        modelName.includes('acestep') ||
        modelName.includes('ace-step') ||
        modelName.includes('ace_step')
    );
    if (!isMusicRequest) return rawBody;

    const styleValue = String(payload?.style ?? dynamicParams?.style ?? '').trim();
    if (styleValue) parsedBody.style = styleValue;

    const durationValue = Number(payload?.duration ?? dynamicParams?.duration);
    if (Number.isFinite(durationValue) && durationValue > 0) {
        parsedBody.duration = Math.round(durationValue);
    }

    const instrumentalRaw = payload?.instrumental ?? dynamicParams?.instrumental;
    if (instrumentalRaw !== undefined && instrumentalRaw !== null && String(instrumentalRaw).trim() !== '') {
        parsedBody.instrumental = toBooleanFlag(instrumentalRaw);
    }

    return JSON.stringify(parsedBody);
}

async function normalizeChatImageUrl(rawUrl, req, apiKey, capabilityWarnings = []) {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';
    const absolute = absolutizeImageUrl(raw, req);
    try {
        const resolved = await ensurePublicReferenceUrl(absolute, req, apiKey, { fallbackToDataUri: true });
        if (resolved) return resolved;
        pushCapabilityWarning(capabilityWarnings, 'Reference image could not be resolved; omitted from chat request.');
        return '';
    } catch (e) {
        const message = String(e?.message || '');
        if (message.includes('ENOENT') || message.includes('no such file')) {
            pushCapabilityWarning(capabilityWarnings, 'Reference image missing on disk; omitted from chat request.');
            return '';
        }
        pushCapabilityWarning(capabilityWarnings, 'Reference image could not be resolved; omitted from chat request.');
        return '';
    }
}

async function normalizeChatMessagesForMedia(messages = [], req, apiKey, capabilityWarnings = []) {
    if (!Array.isArray(messages) || messages.length === 0) return messages;
    const normalized = [];
    for (const msg of messages) {
        const next = { ...msg };
        const content = msg?.content;
        if (Array.isArray(content)) {
            const parts = [];
            for (const part of content) {
                const type = String(part?.type || '').toLowerCase();
                if (type === 'image_url') {
                    const rawUrl = part?.image_url?.url || part?.image_url || part?.url || '';
                    const resolvedUrl = await normalizeChatImageUrl(rawUrl, req, apiKey, capabilityWarnings);
                    if (!resolvedUrl) continue;
                    parts.push({
                        ...part,
                        image_url: {
                            ...(typeof part?.image_url === 'object' && part.image_url ? part.image_url : {}),
                            url: resolvedUrl
                        }
                    });
                    continue;
                }
                parts.push(part);
            }
            next.content = parts;
            normalized.push(next);
            continue;
        }

        if (content && typeof content === 'object') {
            const type = String(content?.type || '').toLowerCase();
            if (type === 'image_url') {
                const rawUrl = content?.image_url?.url || content?.image_url || content?.url || '';
                const resolvedUrl = await normalizeChatImageUrl(rawUrl, req, apiKey, capabilityWarnings);
                if (resolvedUrl) {
                    next.content = {
                        ...content,
                        image_url: {
                            ...(typeof content?.image_url === 'object' && content.image_url ? content.image_url : {}),
                            url: resolvedUrl
                        }
                    };
                    normalized.push(next);
                }
                continue;
            }
        }

        normalized.push(next);
    }
    return normalized;
}

async function orchestrateInference(engine, payload, res, userId, req = null) {
    let finalSeed = payload.seed;
    if (finalSeed === -1 || finalSeed === "-1" || finalSeed === undefined || finalSeed === null) {
        finalSeed = Math.floor(Math.random() * 10000000);
    }

    const getFlag = (key, defaultValue) => {
        if (payload[key] !== undefined) return payload[key];
        if (payload.dynamicParams && payload.dynamicParams[key] !== undefined) return payload.dynamicParams[key];
        return defaultValue;
    };

    // Dynamic Key Selection Logic
    const activeKey = engine.apiKey ||
                      ((engine.isSystem === 1 || engine.isSystem === true)
                        ? (engine.provider === 'pollinations' ? resolvePollinationsKey(engine) :
                          (engine.provider === 'AirForce' ? process.env.AIRFORCE_API_KEY : process.env.API_KEY))
                        : "") || "";
    if (engine.provider === 'pollinations' && requiresPollinationsMusicKey(engine) && !activeKey) {
        throw new Error('Pollinations music engines require an API key. Set POLLINATIONS_API_KEY or configure an engine-specific key.');
    }

    // Support ratio coming from either top-level payload or dynamic Checkpoint Hub controls.
    let ratio = payload.aspectRatio || payload.dynamicParams?.aspectRatio || "1:1";
    if (engine.category === 'Motion') {
        ratio = normalizeVideoAspectRatio(ratio === '1:1' ? '16:9' : ratio);
    }

    const requestedImageRaw = String(
        payload.image
        || (payload.dynamicParams && payload.dynamicParams.image)
        || ''
    ).trim();
    const requestedImage = normalizeImageInputValue(requestedImageRaw);
    const engineRequestUrl = String(engine.requestUrl || '');
    const isPollinationsMediaRoute =
        String(engine.provider || '').toLowerCase() === 'pollinations'
        && (
            engineRequestUrl.includes('gen.pollinations.ai/image/')
            || engineRequestUrl.includes('gen.pollinations.ai/video/')
        );
    const usesImage = (engine.requestUrl || "").includes('{{image}}') || 
                      (engine.requestBodyTemplate || "").includes('{{image}}') ||
                      (engine.requestHeaders || "").includes('{{image}}') ||
                      (!!requestedImage && isPollinationsMediaRoute);

    const canUsePollinationsDirectImage =
        String(engine.provider || '').toLowerCase() === 'pollinations'
        && engineRequestUrl.includes('gen.pollinations.ai/image/')
        && !requiresPollinationsPublicImageUrl(engine);

    let processedImage = requestedImage;
    let referenceMeta = null;
    if (usesImage && processedImage.startsWith('data:')) {
        if (userId && userId !== 'anonymous') {
            try {
                referenceMeta = await ensureReferenceAsset({ ownerId: userId, dataUri: processedImage });
                processedImage = canUsePollinationsDirectImage
                    ? processedImage
                    : referenceMeta.fileUrl;
            } catch (e) {
                if (!canUsePollinationsDirectImage) {
                    processedImage = await uploadToTempHost(processedImage, activeKey);
                }
            }
        } else if (!canUsePollinationsDirectImage) {
            processedImage = await uploadToTempHost(processedImage, activeKey);
        }
        if (!processedImage || (!canUsePollinationsDirectImage && processedImage.startsWith('data:'))) {
            throw new Error("Reference image upload failed. Please use a public image URL or try again.");
        }
    }
    processedImage = absolutizeImageUrl(processedImage, req);
    if (usesImage && processedImage && canUsePollinationsDirectImage) {
        processedImage = await resolvePollinationsDirectImageInput(processedImage, req);
    } else if (usesImage && processedImage && !processedImage.startsWith('data:')) {
        try {
            processedImage = await ensurePublicReferenceUrl(processedImage, req, activeKey);
        } catch (e) {
            const message = String(e?.message || '');
            if (message.includes('ENOENT') || message.includes('no such file or directory')) {
                console.warn('[NEURAL_REF_WARN] Reference file missing on disk. Continuing without reference image.');
                processedImage = '';
            } else {
                throw e;
            }
        }
        if (processedImage.startsWith('data:')) {
            throw new Error("Reference image must be publicly accessible for upstream inference.");
        }
    }

    const templateVarsRaw = { 
        ...(payload.dynamicParams || {}),
        prompt: payload.prompt || '',
        prompt_raw: payload.prompt || '',
        prompt_encoded: encodeURIComponent(payload.prompt || ''),
        prompt_json: JSON.stringify(payload.prompt || ''),
        width: payload.width || 1024, 
        height: payload.height || 1024, 
        seed: finalSeed, 
        negative_prompt: payload.negative_prompt || "",
        negative_prompt_raw: payload.negative_prompt || "",
        negative_prompt_encoded: encodeURIComponent(payload.negative_prompt || ""),
        negative_prompt_json: JSON.stringify(payload.negative_prompt || ""),
        system: engine.systemInstruction || "",
        system_raw: engine.systemInstruction || "",
        system_encoded: encodeURIComponent(engine.systemInstruction || ""),
        system_json: JSON.stringify(engine.systemInstruction || ""),
        upstreamId: engine.upstreamId || "",
        upstream_id: engine.upstreamId || "",
        api_key: activeKey, 
        video: payload.video || false,
        duration: getFlag('duration', 4),
        voiceName: payload.voiceName || getFlag('voiceName', 'alloy'),
        voice_name: payload.voiceName || getFlag('voiceName', 'alloy'),
        temperature: getFlag('temperature', 0.7),
        aspectRatio: ratio,
        nologo: getFlag('nologo', true),
        enhance: getFlag('enhance', false),
        safe: getFlag('safe', true),
        audio: getFlag('audio', false),
        private: getFlag('private', false),
        nofeed: getFlag('nofeed', true),
        transparent: getFlag('transparent', false),
        quality: getFlag('quality', 'medium'),
        guidance_scale: getFlag('guidance_scale', 7.5),
        image: processedImage || "",
        image_raw: processedImage || "",
        image_encoded: processedImage ? encodeURIComponent(processedImage) : "",
        image_json: JSON.stringify(processedImage || "")
    };

    const templateVarsUrl = {
        ...templateVarsRaw,
        prompt: templateVarsRaw.prompt_encoded,
        negative_prompt: templateVarsRaw.negative_prompt_encoded,
        system: templateVarsRaw.system_encoded,
        image: templateVarsRaw.image_encoded
    };

    let targetUrl = parseTemplate(engine.requestUrl, templateVarsUrl);
    targetUrl = sanitizeUrlQuery(targetUrl);
    targetUrl = moveImageParamToEnd(targetUrl);
    targetUrl = normalizePollinationsImageQuery(targetUrl, engine, processedImage);
    targetUrl = normalizePollinationsVideoQuery(targetUrl, processedImage);
    targetUrl = normalizePollinationsAudioQuery(targetUrl, payload, engine);

    let usePollinationsOpenAiImageRoute = false;
    try {
        const parsedTarget = new URL(targetUrl);
        if (
            String(engine.provider || '').toLowerCase() === 'pollinations'
            && parsedTarget.hostname === 'gen.pollinations.ai'
            && parsedTarget.pathname.startsWith('/image/')
            && !!processedImage
        ) {
            usePollinationsOpenAiImageRoute = true;
            targetUrl = 'https://gen.pollinations.ai/v1/images/edits';
        }
    } catch {}

    // Harden Pollinations video requests: if width/height aren't provided in template,
    // append ratio-aligned dimensions so upstream doesn't infer square defaults.
    try {
        const parsedTarget = new URL(targetUrl);
        const isPollinationsVideo =
            parsedTarget.hostname === 'gen.pollinations.ai' &&
            parsedTarget.pathname.startsWith('/video/');
        if (isPollinationsVideo) {
            const hasWidth = parsedTarget.searchParams.has('width');
            const hasHeight = parsedTarget.searchParams.has('height');
            const requestedAspect = parsedTarget.searchParams.get('aspectRatio') || ratio;
            const dims = getVideoDimensionsForAspect(requestedAspect);

            if (!hasWidth || !hasHeight) {
                if (!hasWidth) parsedTarget.searchParams.set('width', String(dims.width));
                if (!hasHeight) parsedTarget.searchParams.set('height', String(dims.height));
            } else {
                const rawW = parsedTarget.searchParams.get('width');
                const rawH = parsedTarget.searchParams.get('height');
                if (dimensionsConflictWithAspect(rawW, rawH, requestedAspect)) {
                    parsedTarget.searchParams.set('width', String(dims.width));
                    parsedTarget.searchParams.set('height', String(dims.height));
                }
            }
            targetUrl = parsedTarget.toString();
        }
    } catch (_) {}

    if (!processedImage) {
        targetUrl = targetUrl.replace(/[&?]image=$/, '');
        targetUrl = targetUrl.replace(/[&?]image=&/, '&');
        targetUrl = sanitizeUrlQuery(targetUrl);
    }

    const rawHeaders = parseTemplate(engine.requestHeaders, templateVarsRaw);
    const rawBody = parseTemplate(engine.requestBodyTemplate, templateVarsRaw);
    
    let headers = {};
    try { if (rawHeaders) headers = JSON.parse(rawHeaders); } catch(e) {}

    if (activeKey && !rawHeaders.includes('Authorization')) {
        headers['Authorization'] = `Bearer ${activeKey}`;
    }

    if (engine.provider === 'AirForce') {
        console.log(`[NEURAL_GATEWAY] Dispatching to AirForce Node: ${engine.label}`);
    }

    try {
        let requestMethod = String(engine.requestMethod || 'POST').toUpperCase();
        let requestBody = requestMethod !== 'GET' ? rawBody : undefined;
        const isAudioTranscription = isAudioTranscriptionRequest(engine, payload);
        if (usePollinationsOpenAiImageRoute) {
            requestMethod = 'POST';
            const rawResolvedModel = String(
                engine?.upstreamId
                || payload?.model
                || engine?.id
                || 'flux'
            ).trim();
            const resolvedModel = rawResolvedModel.replace(/^pollinations-/, '') || 'flux';
            const resolvedWidth = Number(payload?.width || templateVarsRaw.width || 1024);
            const resolvedHeight = Number(payload?.height || templateVarsRaw.height || 1024);
            const requestedImageResponseFormat = String(payload?.dynamicParams?.response_format || '').trim().toLowerCase();
            const imageResponseFormat =
                requestedImageResponseFormat === 'url' || requestedImageResponseFormat === 'b64_json'
                    ? requestedImageResponseFormat
                    : 'b64_json';
            const imageRequestBody = {
                model: resolvedModel,
                prompt: String(payload?.prompt || ''),
                image: processedImage,
                size: `${Math.max(1, Math.round(resolvedWidth))}x${Math.max(1, Math.round(resolvedHeight))}`,
                quality: String(payload?.quality || payload?.dynamicParams?.quality || templateVarsRaw.quality || 'medium'),
                response_format: imageResponseFormat,
                seed: finalSeed,
                negative_prompt: String(payload?.negative_prompt || ''),
                safe: getFlag('safe', true),
                private: getFlag('private', false),
                enhance: getFlag('enhance', false),
                nologo: getFlag('nologo', true)
            };
            stripHeadersCaseInsensitive(headers, ['content-type', 'content-length', 'accept']);
            headers.Accept = 'application/json';
            const imageFile = processedImage.startsWith('data:')
                ? dataUriToImageFile(processedImage, 'reference.png')
                : null;
            if (imageFile) {
                const formData = new FormData();
                formData.append('model', imageRequestBody.model);
                formData.append('prompt', imageRequestBody.prompt);
                formData.append('image', imageFile);
                formData.append('size', imageRequestBody.size);
                formData.append('quality', imageRequestBody.quality);
                formData.append('response_format', imageRequestBody.response_format);
                formData.append('seed', String(imageRequestBody.seed));
                formData.append('negative_prompt', imageRequestBody.negative_prompt);
                formData.append('safe', String(imageRequestBody.safe));
                formData.append('private', String(imageRequestBody.private));
                formData.append('enhance', String(imageRequestBody.enhance));
                formData.append('nologo', String(imageRequestBody.nologo));
                requestBody = formData;
            } else {
                requestBody = JSON.stringify(imageRequestBody);
                headers['Content-Type'] = 'application/json';
            }
        }
        if (
            !isAudioTranscription
            && String(engine?.category || '').toLowerCase() === 'audio'
            && requestMethod !== 'GET'
            && typeof requestBody === 'string'
        ) {
            requestBody = injectPollinationsAudioBodyParams(requestBody, payload, engine);
        }
        const requestedResponseFormat = String(payload?.dynamicParams?.response_format || '').trim().toLowerCase();
        let effectiveResponseFormat = requestedResponseFormat;

        if (isAudioTranscription) {
            const audioData = String(payload.audioData || '');
            let base64 = audioData;
            let mimeType = '';
            if (audioData.startsWith('data:')) {
                const match = audioData.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    mimeType = match[1];
                    base64 = match[2];
                }
            }
            const format = String(payload.audioFormat || 'mp3').toLowerCase();
            const formatToMime = {
                mp3: 'audio/mpeg',
                mpeg: 'audio/mpeg',
                wav: 'audio/wav',
                webm: 'audio/webm',
                m4a: 'audio/mp4',
                mp4: 'audio/mp4',
                flac: 'audio/flac',
                ogg: 'audio/ogg',
                opus: 'audio/opus',
                aac: 'audio/aac'
            };
            const resolvedMime = mimeType || formatToMime[format] || 'audio/mpeg';
            const buffer = Buffer.from(base64, 'base64');

            const formData = new FormData();
            const blob = new Blob([buffer], { type: resolvedMime });
            const file = new File([blob], `audio.${format}`, { type: resolvedMime });
            formData.append('file', file);

            const modelValue = engine.upstreamId || 'whisper-large-v3';
            const normalizedModelValue = String(modelValue || '').trim().toLowerCase();
            const isScribeTranscription = normalizedModelValue.includes('scribe');
            const diarizationRequested = isScribeTranscription && toBooleanFlag(payload?.dynamicParams?.diarize);
            const rawSpeakerCount = String(payload?.dynamicParams?.num_speakers ?? '').trim();
            const parsedSpeakerCount = Number(rawSpeakerCount);
            const resolvedSpeakerCount = diarizationRequested
                && Number.isInteger(parsedSpeakerCount)
                && parsedSpeakerCount >= 1
                && parsedSpeakerCount <= 32
                ? parsedSpeakerCount
                : null;
            const rawDiarizationThreshold = String(payload?.dynamicParams?.diarization_threshold ?? '').trim();
            const parsedDiarizationThreshold = Number(rawDiarizationThreshold);
            const resolvedDiarizationThreshold = diarizationRequested
                && resolvedSpeakerCount === null
                && Number.isFinite(parsedDiarizationThreshold)
                && parsedDiarizationThreshold >= 0.1
                && parsedDiarizationThreshold <= 0.4
                ? Number(parsedDiarizationThreshold.toFixed(2))
                : null;
            if (diarizationRequested && (!effectiveResponseFormat || effectiveResponseFormat === 'text')) {
                effectiveResponseFormat = 'json';
            }
            if (modelValue) formData.append('model', String(modelValue));
            if (payload?.prompt) formData.append('prompt', String(payload.prompt));
            if (payload?.dynamicParams?.language) formData.append('language', String(payload.dynamicParams.language));
            // Pollinations whisper workers can throw on plain text response parsing; align with sandbox-safe JSON flow.
            if (effectiveResponseFormat && effectiveResponseFormat !== 'text') {
                formData.append('response_format', effectiveResponseFormat);
            }
            if (payload?.dynamicParams?.temperature !== undefined) formData.append('temperature', String(payload.dynamicParams.temperature));
            if (diarizationRequested) {
                formData.append('diarize', 'true');
                if (resolvedSpeakerCount !== null) {
                    formData.append('num_speakers', String(resolvedSpeakerCount));
                } else if (resolvedDiarizationThreshold !== null) {
                    formData.append('diarization_threshold', String(resolvedDiarizationThreshold));
                }
            }

            requestMethod = 'POST';
            requestBody = formData;
            stripHeadersCaseInsensitive(headers, ['content-type', 'content-length']);
            headers.Accept = 'application/json, text/plain;q=0.9, */*;q=0.8';
        }

        const fetchResult = await fetchArtifact(targetUrl, {
            method: requestMethod,
            headers,
            body: requestBody,
            engine
        });
        await recordPollenCreditUsageEstimate(req?.user?.id || userId || 'anonymous', fetchResult?.pollenUsed);

        if (isAudioTranscription && fetchResult.type === 'json' && effectiveResponseFormat !== 'text') {
            // Preserve full transcription JSON payload (including segment timing) for cue-accurate playback sync.
            res.set({
                'Content-Type': 'application/json',
                'X-Pollen-Used': String(fetchResult.pollenUsed || '')
            });
            if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
            if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
            return res.send(JSON.stringify(fetchResult.data || {}));
        }

        if (fetchResult.type === 'binary') {
            const buffer = Buffer.from(await fetchResult.blob.arrayBuffer());
            res.set({ 
                'Content-Type': fetchResult.response.headers.get('content-type'),
                'X-Generated-Seed': String(finalSeed),
                'X-Pollen-Used': String(fetchResult.pollenUsed || '')
            });
            if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
            if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
            return res.send(buffer);
        } else if (fetchResult.type === 'text') {
            res.set({ 
                'Content-Type': 'text/plain',
                'X-Pollen-Used': String(fetchResult.pollenUsed || '')
            });
            if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
            if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
            return res.send(fetchResult.text);
        } else if (usePollinationsOpenAiImageRoute && fetchResult.type === 'json') {
            const imageUrl = String(
                fetchResult?.data?.data?.[0]?.url
                || fetchResult?.data?.url
                || ''
            ).trim();
            const imageBase64 = String(
                fetchResult?.data?.data?.[0]?.b64_json
                || fetchResult?.data?.b64_json
                || ''
            ).trim();
            const urlFieldLooksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(imageUrl) && !/^https?:\/\//i.test(imageUrl);
            if (imageUrl) {
                if (imageUrl.startsWith('data:')) {
                    const dataUriMatch = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (dataUriMatch) {
                        const buffer = Buffer.from(dataUriMatch[2], 'base64');
                        res.set({
                            'Content-Type': dataUriMatch[1] || 'image/png',
                            'X-Generated-Seed': String(finalSeed),
                            'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                        });
                        if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
                        if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
                        return res.send(buffer);
                    }
                }
                if (urlFieldLooksLikeBase64 || looksLikeBase64Asset(imageUrl)) {
                    const buffer = Buffer.from(imageUrl, 'base64');
                    res.set({
                        'Content-Type': inferMimeTypeFromBase64(imageUrl),
                        'X-Generated-Seed': String(finalSeed),
                        'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                    });
                    if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
                    if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
                    return res.send(buffer);
                }
                try {
                    assertSafeTargetUrl(imageUrl);
                    const imageResponse = await fetch(imageUrl);
                    const buffer = Buffer.from(await (await imageResponse.blob()).arrayBuffer());
                    res.set({
                        'Content-Type': imageResponse.headers.get('content-type') || 'image/png',
                        'X-Generated-Seed': String(finalSeed),
                        'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                    });
                    if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
                    if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
                    return res.send(buffer);
                } catch (imageFetchError) {
                    if (!imageBase64) {
                        throw imageFetchError;
                    }
                }
            }
            if (imageBase64) {
                const buffer = Buffer.from(imageBase64, 'base64');
                res.set({
                    'Content-Type': 'image/png',
                    'X-Generated-Seed': String(finalSeed),
                    'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                });
                if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
                if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
                return res.send(buffer);
            }
            throw new Error('Pollinations image generation completed without a usable image payload.');
        } else {
            const pathParts = (engine.responsePath || "").split('.');
            let current = fetchResult.data;
            for (const part of pathParts) {
                if (!part) continue;
                if (current !== null && current !== undefined && Object.prototype.hasOwnProperty.call(current, part)) {
                    current = current[part];
                } else {
                    current = undefined;
                    break;
                }
            }
            if (typeof current === 'string' && (current.startsWith('http') || current.startsWith('data:'))) {
                if (current.startsWith('http')) assertSafeTargetUrl(current);
                const imgRes = await fetch(current);
                const buffer = Buffer.from(await (await imgRes.blob()).arrayBuffer());
                res.set({ 
                    'Content-Type': imgRes.headers.get('content-type') || 'image/png',
                    'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                });
                return res.send(buffer);
            }
            if (typeof current === 'string' && looksLikeBase64Asset(current)) {
                const buffer = Buffer.from(current, 'base64');
                res.set({
                    'Content-Type': inferMimeTypeFromBase64(current),
                    'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                });
                if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
                if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
                return res.send(buffer);
            }
            if (typeof current === 'string') { 
                res.set({ 
                    'Content-Type': 'text/plain',
                    'X-Pollen-Used': String(fetchResult.pollenUsed || '')
                }); 
                if (referenceMeta?.referenceItemId) res.set('X-Reference-Item-Id', referenceMeta.referenceItemId);
                if (referenceMeta?.referenceHash) res.set('X-Reference-Hash', referenceMeta.referenceHash);
                return res.send(current); 
            }
            throw new Error("Neural response mapping failed.");
        }
    } catch (e) {
        const message = String(e?.message || '');
        const isModerationBlock = message.includes('[Blocked]');
        const engineIdentity = [
            String(engine?.id || ''),
            String(engine?.upstreamId || ''),
            String(payload?.model || '')
        ].join(' ').toLowerCase();
        const isLikelyKleinModel =
            engineIdentity.includes('klein') || engineIdentity.includes('pollinations-klein');
        const isReferenceImageUpstreamFailure =
            usesImage
            && !!processedImage
            && (
                /internal server error/i.test(message)
                || /upstream status 500/i.test(message)
                || /upstreamerror/i.test(message)
                || /klein api request failed/i.test(message)
            );

        if (isModerationBlock && usesImage && processedImage) {
            throw new Error(`${message} (Provider moderation likely triggered by the reference image. Try a different image or less sensitive visual content.)`);
        }
        if (isReferenceImageUpstreamFailure) {
            const guidance = isLikelyKleinModel
                ? 'Klein upstream failed while processing the reference image.'
                : 'Upstream failed while processing the reference image.';
            throw new Error(`${message} (${guidance} Try the same prompt without a reference image, use a different publicly accessible image URL, or switch models.)`);
        }
        throw e;
    }
}

async function orchestrateTextSandbox(engine, payload = {}, req = null) {
    if (!engine || engine.category !== 'Language') {
        throw new Error('Text sandbox only supports Language engines.');
    }

    let engineConfig = {};
    try {
        engineConfig = engine.configJson ? JSON.parse(engine.configJson) : {};
    } catch (_e) {
        engineConfig = {};
    }
    engineConfig.capabilities = typeof engine?.capabilities === 'string' ? engine.capabilities : '';

    const activeKey = engine.apiKey ||
        ((engine.isSystem === 1 || engine.isSystem === true) ? resolveSystemProviderKey(engine) : '') ||
        '';

    const getFlag = (key, defaultValue) => {
        if (payload[key] !== undefined) return payload[key];
        if (payload.dynamicParams && payload.dynamicParams[key] !== undefined) return payload.dynamicParams[key];
        return defaultValue;
    };

    const supportedInputModalities = (
        Array.isArray(engineConfig.textInputModalities) && engineConfig.textInputModalities.length > 0
            ? engineConfig.textInputModalities
            : ['text']
    )
        .map((m) => String(m || '').toLowerCase())
        .filter(Boolean);

    const buildDefaultMessages = () => {
        const textPrompt = String(payload.prompt || '');
        const systemInstruction = String(engine.systemInstruction || '').trim();
        const base = [];
        if (systemInstruction) base.push({ role: 'system', content: systemInstruction });
        base.push({
            role: 'user',
            content: [{ type: 'text', text: textPrompt }]
        });
        return base;
    };

    const rawMessages = Array.isArray(payload.messages) && payload.messages.length > 0
        ? payload.messages
        : buildDefaultMessages();
    const guardedMessages = withPollinationsIdentityGuard(engine, engineConfig, rawMessages);

    const detectRequestedModalities = (rawMessages = []) => {
        const mods = new Set();
        for (const msg of rawMessages) {
            const content = msg?.content;
            if (typeof content === 'string') {
                if (content.trim()) mods.add('text');
                continue;
            }
            if (Array.isArray(content)) {
                for (const part of content) {
                    const type = String(part?.type || '').toLowerCase();
                    if (type === 'text') mods.add('text');
                    if (type === 'image_url') mods.add('image');
                    if (type === 'input_audio') mods.add('audio');
                    if (type === 'video_url') mods.add('video');
                    if (type === 'file') mods.add('file');
                }
                continue;
            }
            if (content && typeof content === 'object') {
                const type = String(content?.type || '').toLowerCase();
                if (type === 'text') mods.add('text');
                if (type === 'image_url') mods.add('image');
                if (type === 'input_audio') mods.add('audio');
                if (type === 'video_url') mods.add('video');
                if (type === 'file') mods.add('file');
            }
        }
        if (mods.size === 0) mods.add('text');
        return Array.from(mods);
    };

    const capabilityWarnings = [];
    const urlIngest = await applyUrlIngestAugmentation({
        payload,
        messages: guardedMessages,
        capabilityWarnings
    });
    const fallbackSearch = await applyFallbackSearchAugmentation({
        payload,
        engineConfig,
        engine,
        messages: urlIngest.messages,
        capabilityWarnings
    });
    const reasoningMessages = applyReasoningSummaryInstruction({
        payload,
        messages: fallbackSearch.messages
    });
    const messages = await normalizeChatMessagesForMedia(reasoningMessages, req, activeKey, capabilityWarnings);
    const linkSources = urlIngest.sources || [];
    let searchSources = fallbackSearch.sources;
    let combinedSources = mergeSources(linkSources, searchSources);
    let searchFilterStats = fallbackSearch.filterStats || { filteredByDeny: 0, filteredByAllow: 0 };
    let searchDegraded = fallbackSearch.degraded || null;
    const linkAttempted = urlIngest.attempted === true;
    const linkApplied = linkAttempted ? urlIngest.applied === true : undefined;
    const linkWarningRaw = linkAttempted ? urlIngest.warning || '' : '';

    const requestedModalities = detectRequestedModalities(messages);
    const unsupportedModalities = requestedModalities.filter((m) => m !== 'text' && !supportedInputModalities.includes(m));
    if (unsupportedModalities.length > 0) {
        throw new Error(
            `Unsupported input modality for this model: ${unsupportedModalities.join(', ')}. Supported: ${supportedInputModalities.join(', ')}.`
        );
    }
    const payloadMode = requestedModalities.slice().sort().join('+') || 'text';
    if (!requestedModalities.includes('text')) {
        pushCapabilityWarning(capabilityWarnings, 'No explicit text part detected in request payload.');
    }

    const templateVarsRaw = {
        prompt: payload.prompt || '',
        prompt_raw: payload.prompt || '',
        prompt_encoded: encodeURIComponent(payload.prompt || ''),
        prompt_json: JSON.stringify(payload.prompt || ''),
        messages_json: JSON.stringify(messages),
        system: engine.systemInstruction || '',
        system_raw: engine.systemInstruction || '',
        system_encoded: encodeURIComponent(engine.systemInstruction || ''),
        system_json: JSON.stringify(engine.systemInstruction || ''),
        upstreamId: engine.upstreamId || '',
        upstream_id: engine.upstreamId || '',
        api_key: activeKey,
        temperature: getFlag('temperature', 0.7),
        max_tokens: getFlag('max_tokens', 1024),
        ...(payload.dynamicParams || {})
    };

    const templateVarsUrl = {
        ...templateVarsRaw,
        prompt: templateVarsRaw.prompt_encoded,
        system: templateVarsRaw.system_encoded
    };

    let targetUrl = parseTemplate(engine.requestUrl, templateVarsUrl);
    targetUrl = sanitizeUrlQuery(targetUrl);

    const rawHeaders = parseTemplate(engine.requestHeaders, templateVarsRaw);
    const rawBody = parseTemplate(engine.requestBodyTemplate, templateVarsRaw);

    let headers = {};
    try { if (rawHeaders) headers = JSON.parse(rawHeaders); } catch (_e) {}
    if (activeKey && !rawHeaders.includes('Authorization')) {
        headers['Authorization'] = `Bearer ${activeKey}`;
    }

    const startedAt = Date.now();
    const parsedBody = (() => {
        if ((engine.requestMethod || 'POST') === 'GET') return null;
        try {
            return rawBody ? JSON.parse(rawBody) : {};
        } catch (_e) {
            return null;
        }
    })();

    let finalBody = rawBody;
    let searchTelemetry = {
        searchRequested: false,
        searchApplied: false,
        searchMode: 'off',
        searchProvider: 'none'
    };
    if (parsedBody && typeof parsedBody === 'object') {
        parsedBody.model = parsedBody.model || engine.upstreamId || 'openai';
        parsedBody.messages = messages;
        if (payload.temperature !== undefined || payload?.dynamicParams?.temperature !== undefined) {
            parsedBody.temperature = getFlag('temperature', parsedBody.temperature ?? 0.7);
        }
        if (payload.max_tokens !== undefined || payload?.dynamicParams?.max_tokens !== undefined) {
            parsedBody.max_tokens = getFlag('max_tokens', parsedBody.max_tokens ?? 1024);
        }
        searchTelemetry = resolveSearchTelemetry({
            payload,
            engineConfig,
            engine,
            parsedBody,
            fallbackApplied: fallbackSearch.applied,
            fallbackProvider: fallbackSearch.provider,
            fallbackWarning: fallbackSearch.warning,
            capabilityWarnings
        });
        finalBody = JSON.stringify(parsedBody);
    } else {
        searchTelemetry = resolveSearchTelemetry({
            payload,
            engineConfig,
            engine,
            parsedBody: null,
            fallbackApplied: fallbackSearch.applied,
            fallbackProvider: fallbackSearch.provider,
            fallbackWarning: fallbackSearch.warning,
            capabilityWarnings
        });
    }

    let fetchResult;
    try {
        fetchResult = await fetchArtifact(targetUrl, {
            method: engine.requestMethod || 'POST',
            headers,
            body: (engine.requestMethod || 'POST') !== 'GET' ? finalBody : undefined,
            engine
        });
    } catch (e) {
        const errorMessage = String(e?.message || '');
        if (parsedBody && shouldRetryWithoutSearchTools(errorMessage, searchTelemetry)) {
            const retryPayloadBody = stripSearchToolingFromBody(parsedBody);
            let retryBody = JSON.stringify(retryPayloadBody);
            searchTelemetry = { ...searchTelemetry, searchApplied: false, searchProvider: 'none' };

                const forcedFallback = await applyFallbackSearchAugmentation({
                    payload,
                    engineConfig: { ...engineConfig, textTools: false },
                    engine,
                    messages,
                    capabilityWarnings,
                    forceFallback: true
                });
            if (forcedFallback.applied) {
                retryPayloadBody.messages = forcedFallback.messages;
                retryBody = JSON.stringify(retryPayloadBody);
                searchSources = forcedFallback.sources;
                searchFilterStats = forcedFallback.filterStats || { filteredByDeny: 0, filteredByAllow: 0 };
                searchDegraded = forcedFallback.degraded || null;
                combinedSources = mergeSources(linkSources, searchSources);
                searchTelemetry = {
                    ...searchTelemetry,
                    searchApplied: true,
                    searchMode: 'fallback',
                    searchProvider: forcedFallback.provider || 'web-fallback',
                    searchWarning: sanitizeWarningText(forcedFallback.warning || '')
                };
            } else {
                searchTelemetry = {
                    ...searchTelemetry,
                    searchWarning: sanitizeWarningText(
                        forcedFallback.warning || 'Native search tools were not accepted by the upstream model, and fallback web search could not provide results.'
                    )
                };
            }
            fetchResult = await fetchArtifact(targetUrl, {
                method: engine.requestMethod || 'POST',
                headers,
                body: (engine.requestMethod || 'POST') !== 'GET' ? retryBody : undefined,
                engine
            });
        } else {
            throw e;
        }
    }
    const latencyMs = Date.now() - startedAt;

    if (fetchResult.type === 'binary') {
        throw new Error('Text sandbox blocked binary response. Use the media sandbox for image/video/audio models.');
    }

    const requestId =
        fetchResult.response?.headers?.get('x-request-id') ||
        fetchResult.response?.headers?.get('request-id') ||
        fetchResult.response?.headers?.get('x-amzn-requestid') ||
        '';
    await recordPollenCreditUsageEstimate(req?.user?.id || 'anonymous', fetchResult?.pollenUsed);
    const telemetryUserId = req?.user?.id || 'anonymous';
    const safeSearchTelemetry = sanitizeSearchTelemetry(searchTelemetry);
    const safeCapabilityWarnings = sanitizeWarningList(capabilityWarnings);
    const safeLinkWarning = linkAttempted ? sanitizeWarningText(linkWarningRaw) : '';

    if (fetchResult.type === 'text') {
        await emitSearchMonitoringEvent({
            userId: telemetryUserId,
            modelId: engine.id || engine.upstreamId || '',
            payloadMode,
            searchTelemetry: safeSearchTelemetry,
            searchDegraded,
            searchFilterStats,
            latencyMs
        });
        return {
            content: fetchResult.text || '',
            raw: { text: fetchResult.text || '' },
            diagnostics: {
                provider: engine.provider,
                engineId: engine.id,
                upstreamId: engine.upstreamId || '',
                latencyMs,
                pollenUsed: String(fetchResult.pollenUsed || ''),
                requestId,
                targetUrl,
                payloadMode,
                ...safeSearchTelemetry,
                ...(typeof linkApplied === 'boolean' ? { linkApplied } : {}),
                ...(safeLinkWarning ? { linkWarning: safeLinkWarning } : {}),
                sources: combinedSources,
                searchFilterStats,
                searchDegraded,
                capabilityChecks: {
                    supportedInputModalities,
                    requestedModalities,
                    unsupportedModalities,
                    tools: typeof engineConfig.textTools === 'boolean' ? engineConfig.textTools : null,
                    reasoning: typeof engineConfig.textReasoning === 'boolean' ? engineConfig.textReasoning : null,
                    specialized: typeof engineConfig.textSpecialized === 'boolean' ? engineConfig.textSpecialized : null,
                    paidOnly: typeof engineConfig.textPaidOnly === 'boolean' ? engineConfig.textPaidOnly : null
                },
                warnings: safeCapabilityWarnings
            }
        };
    }

    const data = fetchResult.data || {};
    let mapped = data;
    if (engine.responsePath) {
        const pathParts = String(engine.responsePath).split('.');
        let current = data;
        for (const part of pathParts) {
            if (!part) continue;
            if (current !== null && current !== undefined && Object.prototype.hasOwnProperty.call(current, part)) {
                current = current[part];
            } else {
                current = undefined;
                break;
            }
        }
        mapped = current;
    }

    const content = resolveTextSandboxContent(data, mapped);
    if (!String(content || '').trim()) {
        pushCapabilityWarning(capabilityWarnings, 'Upstream completed without visible text content (empty payload).');
    }

    await emitSearchMonitoringEvent({
        userId: telemetryUserId,
        modelId: engine.id || engine.upstreamId || '',
        payloadMode,
        searchTelemetry: safeSearchTelemetry,
        searchDegraded,
        searchFilterStats,
        latencyMs
    });

    return {
        content,
        raw: data,
        diagnostics: {
            provider: engine.provider,
            engineId: engine.id,
            upstreamId: engine.upstreamId || '',
            latencyMs,
            pollenUsed: String(fetchResult.pollenUsed || ''),
            requestId,
            targetUrl,
            payloadMode,
            ...safeSearchTelemetry,
            ...(typeof linkApplied === 'boolean' ? { linkApplied } : {}),
            ...(safeLinkWarning ? { linkWarning: safeLinkWarning } : {}),
            sources: combinedSources,
            searchFilterStats,
            searchDegraded,
            capabilityChecks: {
                supportedInputModalities,
                requestedModalities,
                unsupportedModalities,
                tools: typeof engineConfig.textTools === 'boolean' ? engineConfig.textTools : null,
                reasoning: typeof engineConfig.textReasoning === 'boolean' ? engineConfig.textReasoning : null,
                specialized: typeof engineConfig.textSpecialized === 'boolean' ? engineConfig.textSpecialized : null,
                paidOnly: typeof engineConfig.textPaidOnly === 'boolean' ? engineConfig.textPaidOnly : null
            },
            warnings: safeCapabilityWarnings
        }
    };
}

const extractStreamTextDelta = (packet = {}) => {
    if (typeof packet?.delta === 'string') return packet.delta;
    if (typeof packet?.content === 'string') return packet.content;

    const choice = packet?.choices?.[0];
    if (!choice) return '';

    if (typeof choice?.delta?.content === 'string') return choice.delta.content;
    if (typeof choice?.text === 'string') return choice.text;
    if (typeof choice?.message?.content === 'string') return choice.message.content;

    if (Array.isArray(choice?.delta?.content)) {
        return choice.delta.content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (typeof part?.text === 'string') return part.text;
                if (typeof part?.content === 'string') return part.content;
                if (typeof part?.text?.value === 'string') return part.text.value;
                if (typeof part?.output_text === 'string') return part.output_text;
                return '';
            })
            .join('');
    }

    return '';
};

async function orchestrateTextSandboxStream(engine, payload = {}, req, res) {
    if (!engine || engine.category !== 'Language') {
        throw new Error('Text sandbox only supports Language engines.');
    }

    let engineConfig = {};
    try {
        engineConfig = engine.configJson ? JSON.parse(engine.configJson) : {};
    } catch (_e) {
        engineConfig = {};
    }
    engineConfig.capabilities = typeof engine?.capabilities === 'string' ? engine.capabilities : '';

    const activeKey = engine.apiKey ||
        ((engine.isSystem === 1 || engine.isSystem === true) ? resolveSystemProviderKey(engine) : '') ||
        '';

    const getFlag = (key, defaultValue) => {
        if (payload[key] !== undefined) return payload[key];
        if (payload.dynamicParams && payload.dynamicParams[key] !== undefined) return payload.dynamicParams[key];
        return defaultValue;
    };

    const supportedInputModalities = (
        Array.isArray(engineConfig.textInputModalities) && engineConfig.textInputModalities.length > 0
            ? engineConfig.textInputModalities
            : ['text']
    )
        .map((m) => String(m || '').toLowerCase())
        .filter(Boolean);

    const buildDefaultMessages = () => {
        const textPrompt = String(payload.prompt || '');
        const systemInstruction = String(engine.systemInstruction || '').trim();
        const base = [];
        if (systemInstruction) base.push({ role: 'system', content: systemInstruction });
        base.push({
            role: 'user',
            content: [{ type: 'text', text: textPrompt }]
        });
        return base;
    };

    const rawMessages = Array.isArray(payload.messages) && payload.messages.length > 0
        ? payload.messages
        : buildDefaultMessages();
    const guardedMessages = withPollinationsIdentityGuard(engine, engineConfig, rawMessages);

    const detectRequestedModalities = (rawMessages = []) => {
        const mods = new Set();
        for (const msg of rawMessages) {
            const content = msg?.content;
            if (typeof content === 'string') {
                if (content.trim()) mods.add('text');
                continue;
            }
            if (Array.isArray(content)) {
                for (const part of content) {
                    const type = String(part?.type || '').toLowerCase();
                    if (type === 'text') mods.add('text');
                    if (type === 'image_url') mods.add('image');
                    if (type === 'input_audio') mods.add('audio');
                    if (type === 'video_url') mods.add('video');
                    if (type === 'file') mods.add('file');
                }
                continue;
            }
            if (content && typeof content === 'object') {
                const type = String(content?.type || '').toLowerCase();
                if (type === 'text') mods.add('text');
                if (type === 'image_url') mods.add('image');
                if (type === 'input_audio') mods.add('audio');
                if (type === 'video_url') mods.add('video');
                if (type === 'file') mods.add('file');
            }
        }
        if (mods.size === 0) mods.add('text');
        return Array.from(mods);
    };

    const capabilityWarnings = [];
    const urlIngest = await applyUrlIngestAugmentation({
        payload,
        messages: guardedMessages,
        capabilityWarnings
    });
    const fallbackSearch = await applyFallbackSearchAugmentation({
        payload,
        engineConfig,
        engine,
        messages: urlIngest.messages,
        capabilityWarnings
    });
    const reasoningMessages = applyReasoningSummaryInstruction({
        payload,
        messages: fallbackSearch.messages
    });
    const messages = await normalizeChatMessagesForMedia(reasoningMessages, req, activeKey, capabilityWarnings);
    const linkSources = urlIngest.sources || [];
    let searchSources = fallbackSearch.sources;
    let combinedSources = mergeSources(linkSources, searchSources);
    let searchFilterStats = fallbackSearch.filterStats || { filteredByDeny: 0, filteredByAllow: 0 };
    let searchDegraded = fallbackSearch.degraded || null;
    const linkAttempted = urlIngest.attempted === true;
    const linkApplied = linkAttempted ? urlIngest.applied === true : undefined;
    const linkWarningRaw = linkAttempted ? urlIngest.warning || '' : '';

    const requestedModalities = detectRequestedModalities(messages);
    const unsupportedModalities = requestedModalities.filter((m) => m !== 'text' && !supportedInputModalities.includes(m));
    if (unsupportedModalities.length > 0) {
        throw new Error(
            `Unsupported input modality for this model: ${unsupportedModalities.join(', ')}. Supported: ${supportedInputModalities.join(', ')}.`
        );
    }
    const payloadMode = requestedModalities.slice().sort().join('+') || 'text';
    if (!requestedModalities.includes('text')) {
        pushCapabilityWarning(capabilityWarnings, 'No explicit text part detected in request payload.');
    }

    const templateVarsRaw = {
        prompt: payload.prompt || '',
        prompt_raw: payload.prompt || '',
        prompt_encoded: encodeURIComponent(payload.prompt || ''),
        prompt_json: JSON.stringify(payload.prompt || ''),
        messages_json: JSON.stringify(messages),
        system: engine.systemInstruction || '',
        system_raw: engine.systemInstruction || '',
        system_encoded: encodeURIComponent(engine.systemInstruction || ''),
        system_json: JSON.stringify(engine.systemInstruction || ''),
        upstreamId: engine.upstreamId || '',
        upstream_id: engine.upstreamId || '',
        api_key: activeKey,
        temperature: getFlag('temperature', 0.7),
        max_tokens: getFlag('max_tokens', 1024),
        ...(payload.dynamicParams || {})
    };

    const templateVarsUrl = {
        ...templateVarsRaw,
        prompt: templateVarsRaw.prompt_encoded,
        system: templateVarsRaw.system_encoded
    };

    let targetUrl = parseTemplate(engine.requestUrl, templateVarsUrl);
    targetUrl = sanitizeUrlQuery(targetUrl);

    const rawHeaders = parseTemplate(engine.requestHeaders, templateVarsRaw);
    const rawBody = parseTemplate(engine.requestBodyTemplate, templateVarsRaw);

    let headers = {};
    try { if (rawHeaders) headers = JSON.parse(rawHeaders); } catch (_e) {}
    if (activeKey && !rawHeaders.includes('Authorization')) {
        headers['Authorization'] = `Bearer ${activeKey}`;
    }
    headers['Accept'] = 'text/event-stream';

    const parsedBody = (() => {
        if ((engine.requestMethod || 'POST') === 'GET') return null;
        try {
            return rawBody ? JSON.parse(rawBody) : {};
        } catch (_e) {
            return null;
        }
    })();

    let finalBody = rawBody;
    let searchTelemetry = {
        searchRequested: false,
        searchApplied: false,
        searchMode: 'off',
        searchProvider: 'none'
    };
    if (parsedBody && typeof parsedBody === 'object') {
        parsedBody.model = parsedBody.model || engine.upstreamId || 'openai';
        parsedBody.messages = messages;
        parsedBody.stream = true;
        if (payload.temperature !== undefined || payload?.dynamicParams?.temperature !== undefined) {
            parsedBody.temperature = getFlag('temperature', parsedBody.temperature ?? 0.7);
        }
        if (payload.max_tokens !== undefined || payload?.dynamicParams?.max_tokens !== undefined) {
            parsedBody.max_tokens = getFlag('max_tokens', parsedBody.max_tokens ?? 1024);
        }
        searchTelemetry = resolveSearchTelemetry({
            payload,
            engineConfig,
            engine,
            parsedBody,
            fallbackApplied: fallbackSearch.applied,
            fallbackProvider: fallbackSearch.provider,
            fallbackWarning: fallbackSearch.warning,
            capabilityWarnings
        });
        finalBody = JSON.stringify(parsedBody);
    } else {
        searchTelemetry = resolveSearchTelemetry({
            payload,
            engineConfig,
            engine,
            parsedBody: null,
            fallbackApplied: fallbackSearch.applied,
            fallbackProvider: fallbackSearch.provider,
            fallbackWarning: fallbackSearch.warning,
            capabilityWarnings
        });
    }

    const startedAt = Date.now();
    const upstreamController = new AbortController();
    const onClose = () => upstreamController.abort();
    req.on('close', onClose);

    try {
        const doFetch = (body) => fetch(targetUrl, {
            method: engine.requestMethod || 'POST',
            headers,
            body: (engine.requestMethod || 'POST') !== 'GET' ? body : undefined,
            signal: upstreamController.signal
        });

        let upstream = await doFetch(finalBody);

        if (!upstream.ok) {
            const errorBody = await readTextWithLimit(upstream, MAX_PROXY_ERROR_BYTES).catch(() => '');
            let errorMessage = redactSearchSensitiveText(errorBody || `Upstream Status ${upstream.status}`);
            try {
                const parsed = JSON.parse(errorBody);
                errorMessage = parsed?.error?.message || parsed?.error || parsed?.message || errorMessage;
            } catch (_e) {}

            if (parsedBody && shouldRetryWithoutSearchTools(errorMessage, searchTelemetry)) {
                searchTelemetry = { ...searchTelemetry, searchApplied: false, searchProvider: 'none' };
                const retryPayloadBody = stripSearchToolingFromBody(parsedBody);
                let retryBody = JSON.stringify(retryPayloadBody);

                const forcedFallback = await applyFallbackSearchAugmentation({
                    payload,
                    engineConfig: { ...engineConfig, textTools: false },
                    engine,
                    messages,
                    capabilityWarnings,
                    forceFallback: true
                });
                if (forcedFallback.applied) {
                    retryPayloadBody.messages = forcedFallback.messages;
                    retryBody = JSON.stringify(retryPayloadBody);
                    searchSources = forcedFallback.sources;
                    searchFilterStats = forcedFallback.filterStats || { filteredByDeny: 0, filteredByAllow: 0 };
                    searchDegraded = forcedFallback.degraded || null;
                    combinedSources = mergeSources(linkSources, searchSources);
                    searchTelemetry = {
                        ...searchTelemetry,
                        searchApplied: true,
                        searchMode: 'fallback',
                        searchProvider: forcedFallback.provider || 'web-fallback',
                        searchWarning: sanitizeWarningText(forcedFallback.warning || '')
                    };
                } else {
                    searchTelemetry = {
                        ...searchTelemetry,
                        searchWarning: sanitizeWarningText(
                            forcedFallback.warning || 'Native search tools were not accepted by the upstream model, and fallback web search could not provide results.'
                        )
                    };
                }
                upstream = await doFetch(retryBody);
                if (!upstream.ok) {
                    const retryErrorBody = await readTextWithLimit(upstream, MAX_PROXY_ERROR_BYTES).catch(() => '');
                    let retryErrorMessage = redactSearchSensitiveText(retryErrorBody || `Upstream Status ${upstream.status}`);
                    try {
                        const parsedRetry = JSON.parse(retryErrorBody);
                        retryErrorMessage = parsedRetry?.error?.message || parsedRetry?.error || parsedRetry?.message || retryErrorMessage;
                    } catch (_e) {}
                    throw new Error(redactSearchSensitiveText(retryErrorMessage));
                }
            } else {
                throw new Error(redactSearchSensitiveText(errorMessage));
            }
        }

        const requestId =
            upstream.headers.get('x-request-id') ||
            upstream.headers.get('request-id') ||
            upstream.headers.get('x-amzn-requestid') ||
            '';
        const pollenUsed =
            upstream.headers.get('x-pollen-used') ||
            upstream.headers.get('x-credit-usage') ||
            '';
        await recordPollenCreditUsageEstimate(req?.user?.id || 'anonymous', pollenUsed);
        const telemetryUserId = req?.user?.id || 'anonymous';
        const safeSearchTelemetry = sanitizeSearchTelemetry(searchTelemetry);
        const safeCapabilityWarnings = sanitizeWarningList(capabilityWarnings);
        const safeLinkWarning = linkAttempted ? sanitizeWarningText(linkWarningRaw) : '';

        res.set({
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Pollen-Used': String(pollenUsed || ''),
            'X-Accel-Buffering': 'no'
        });
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/event-stream') || !upstream.body) {
            const textBody = await readTextWithLimit(upstream, MAX_PROXY_TEXT_BYTES);
            let parsed = {};
            try {
                parsed = JSON.parse(textBody);
            } catch (_e) {}
            const fallbackContent = typeof parsed?.content === 'string'
                ? parsed.content
                : (typeof parsed?.choices?.[0]?.message?.content === 'string'
                    ? parsed.choices[0].message.content
                    : textBody);
            const latencyMs = Date.now() - startedAt;
            await emitSearchMonitoringEvent({
                userId: telemetryUserId,
                modelId: engine.id || engine.upstreamId || '',
                payloadMode,
                searchTelemetry: safeSearchTelemetry,
                searchDegraded,
                searchFilterStats,
                latencyMs
            });
            res.write(`data: ${JSON.stringify({
                done: true,
                content: fallbackContent,
                requestId,
                latencyMs,
                pollenUsed: String(pollenUsed || ''),
                diagnostics: {
                    payloadMode,
                    pollenUsed: String(pollenUsed || ''),
                    ...safeSearchTelemetry,
                    ...(typeof linkApplied === 'boolean' ? { linkApplied } : {}),
                    ...(safeLinkWarning ? { linkWarning: safeLinkWarning } : {}),
                    sources: combinedSources,
                    searchFilterStats,
                    searchDegraded,
                    warnings: safeCapabilityWarnings
                }
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const rawEvent of events) {
                const dataLines = rawEvent
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart());
                for (const dataLine of dataLines) {
                    if (!dataLine || dataLine === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataLine);
                        const delta = extractStreamTextDelta(parsed);
                        if (delta) {
                            fullContent += delta;
                            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                        }
                    } catch (_e) {
                        // Ignore malformed stream chunks and continue.
                    }
                }
            }
        }

        if (buffer.trim()) {
            const dataLines = buffer
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart());
            for (const dataLine of dataLines) {
                if (!dataLine || dataLine === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(dataLine);
                    const delta = extractStreamTextDelta(parsed);
                    if (delta) fullContent += delta;
                } catch (_e) {
                    // Ignore malformed trailing stream chunks.
                }
            }
        }

        const latencyMs = Date.now() - startedAt;
        await emitSearchMonitoringEvent({
            userId: telemetryUserId,
            modelId: engine.id || engine.upstreamId || '',
            payloadMode,
            searchTelemetry: safeSearchTelemetry,
            searchDegraded,
            searchFilterStats,
            latencyMs
        });
        res.write(`data: ${JSON.stringify({
            done: true,
            content: fullContent,
            requestId,
            latencyMs,
            pollenUsed: String(pollenUsed || ''),
            diagnostics: {
                payloadMode,
                pollenUsed: String(pollenUsed || ''),
                ...safeSearchTelemetry,
                ...(typeof linkApplied === 'boolean' ? { linkApplied } : {}),
                ...(safeLinkWarning ? { linkWarning: safeLinkWarning } : {}),
                sources: combinedSources,
                searchFilterStats,
                searchDegraded,
                warnings: safeCapabilityWarnings
            }
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    } finally {
        req.off('close', onClose);
    }
}

router.get('/pollinations/account/balance', async (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const apiKey = getRuntimePollinationsApiKey();
    const now = Date.now();
    const manualHourlyRate = await readManualPollenHourlyRate();

    if (!apiKey) {
        return res.json({
            balance: manualHourlyRate,
            cap: manualHourlyRate,
            source: 'manual-fallback',
            refreshedAt: now,
            cached: true,
            live: false,
            reason: 'POLLINATIONS_API_KEY is not configured.',
            stateUpdatedAt: null
        });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POLLINATIONS_ACCOUNT_TIMEOUT_MS);

    try {
        let lastFailure = {
            status: 502,
            error: 'Pollinations account balance request failed.'
        };

        for (const balanceUrl of POLLINATIONS_ACCOUNT_BALANCE_URLS) {
            const upstream = await fetch(balanceUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                signal: controller.signal
            });

            const payload = await upstream.json().catch(() => ({}));
            if (!upstream.ok) {
                lastFailure = {
                    status: Number.isFinite(upstream.status) ? upstream.status : 502,
                    error: toUpstreamErrorMessage(payload, `Pollinations account balance request failed (${upstream.status}).`)
                };
                continue;
            }

            const balance = getPollinationsBalanceFromPayload(payload);
            if (balance === null) {
                lastFailure = {
                    status: 502,
                    error: 'Unexpected balance payload from Pollinations.'
                };
                continue;
            }

            await storePollinationsLiveBalance(userId, balance, balanceUrl);

            return res.json({
                balance,
                cap: balance,
                source: 'pollinations-account',
                refreshedAt: now,
                cached: false,
                live: true,
                endpoint: balanceUrl
            });
        }

        await storePollinationsBalanceFailure(userId, lastFailure.status, lastFailure.error);
        return res.json({
            balance: manualHourlyRate,
            cap: manualHourlyRate,
            source: 'manual-fallback',
            refreshedAt: now,
            cached: true,
            live: false,
            reason: lastFailure.error,
            status: lastFailure.status,
            stateUpdatedAt: null
        });
    } catch (e) {
        const isTimeout = e?.name === 'AbortError';
        const message = isTimeout
            ? 'Pollinations account balance request timed out.'
            : redactSearchSensitiveText(e?.message || 'Pollinations account balance request failed.');

        await logSystemEvent(
            'WARN',
            'POLLINATIONS_ACCOUNT',
            `Balance fetch failed for ${userId}: ${message}`,
            userId
        );

        await storePollinationsBalanceFailure(userId, isTimeout ? 504 : 502, message);
        return res.json({
            balance: manualHourlyRate,
            cap: manualHourlyRate,
            source: 'manual-fallback',
            refreshedAt: now,
            cached: true,
            live: false,
            reason: message,
            status: isTimeout ? 504 : 502,
            stateUpdatedAt: null
        });
    } finally {
        clearTimeout(timeoutId);
    }
});

router.post('/source-preview', async (req, res) => {
    try {
        const rawUrl = String(req.body?.url || '').trim();
        if (!rawUrl) {
            return res.status(400).json({ error: 'Source URL is required.' });
        }

        const ingest = await ingestUrls({
            urls: [rawUrl],
            maxLinks: 1,
            maxChars: 20000
        });
        const item = Array.isArray(ingest.items) ? ingest.items[0] : null;
        const source = Array.isArray(ingest.sources) ? ingest.sources[0] : null;
        if (!item) {
            return res.status(422).json({
                error: ingest.warning || 'No readable source content was available.',
                warning: ingest.warning || ''
            });
        }

        return res.json({
            title: item.title || source?.title || rawUrl,
            url: item.url || source?.url || rawUrl,
            content: item.content || '',
            snippet: source?.snippet || '',
            source: item.source || source?.source || '',
            warning: ingest.warning || item.note || ''
        });
    } catch (error) {
        return res.status(400).json({
            error: redactSearchSensitiveText(String(error?.message || 'Source preview failed.')).slice(0, MAX_SAFE_WARNING_LENGTH)
        });
    }
});

router.post('/reference-assets/ensure', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        const dataUri = req.body?.dataUri;
        if (!dataUri || typeof dataUri !== 'string') {
            return res.status(400).json({ error: 'Missing dataUri payload' });
        }
        const result = await ensureReferenceAsset({ ownerId: userId, dataUri });
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message || 'Failed to persist reference asset' });
    }
});

router.post('/test', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const engineLabel = req.body.engine?.label || req.body.engine?.id || 'Unknown Engine';
    try { 
        await orchestrateInference(req.body.engine, req.body.payload, res, userId, req);
        await logSystemEvent('INFO', 'INFERENCE_TEST', `Sandbox success [${engineLabel}]`, userId);
    } catch (e) { 
        console.error(`[SANDBOX_ERR] ${redactSearchSensitiveText(e.message)}`);
        await createErrorReport({
            level: 'ERROR',
            module: 'INFERENCE_TEST',
            source: 'server',
            errorName: e?.name || 'SandboxInferenceError',
            message: `Sandbox fail [${engineLabel}]: ${redactSearchSensitiveText(e.message)}`,
            stack: e?.stack || '',
            route: req.originalUrl || '/api/proxy/test',
            userId,
            context: {
                engineId: req.body?.engine?.id || '',
                engineProvider: req.body?.engine?.provider || '',
                requestUrl: req.body?.engine?.requestUrl || '',
                payload: req.body?.payload || {}
            }
        });
        res.status(502).json({ error: redactSearchSensitiveText(e.message) }); 
    }
});

router.post('/test-text', requireAdmin, async (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const engineLabel = req.body.engine?.label || req.body.engine?.id || 'Unknown Engine';
    try {
        const output = await orchestrateTextSandbox(req.body.engine, req.body.payload || {}, req);
        await logSystemEvent('INFO', 'INFERENCE_TEST_TEXT', `Text sandbox success [${engineLabel}]`, userId);
        res.json(output);
    } catch (e) {
        console.error(`[SANDBOX_TEXT_ERR] ${redactSearchSensitiveText(e.message)}`);
        await createErrorReport({
            level: 'ERROR',
            module: 'INFERENCE_TEST_TEXT',
            source: 'server',
            errorName: e?.name || 'TextSandboxInferenceError',
            message: `Text sandbox fail [${engineLabel}]: ${redactSearchSensitiveText(e.message)}`,
            stack: e?.stack || '',
            route: req.originalUrl || '/api/proxy/test-text',
            userId,
            context: {
                engineId: req.body?.engine?.id || '',
                engineProvider: req.body?.engine?.provider || '',
                requestUrl: req.body?.engine?.requestUrl || '',
                payload: req.body?.payload || {}
            }
        });
        res.status(502).json({ error: redactSearchSensitiveText(e.message || 'Text sandbox failed') });
    }
});

router.post('/chat', async (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const modelId = String(req.body?.model || '').trim();

    if (!modelId) {
        return res.status(400).json({ error: 'Missing model id.' });
    }

    try {
        const engine = await dbGet("SELECT * FROM custom_engines WHERE id = ?", [modelId]);
        if (!engine) {
            await logSystemEvent('ERROR', 'CHAT_INFERENCE', `Chat request for unregistered model ID: ${modelId}`, userId);
            return res.status(404).json({ error: 'Engine not found' });
        }
        if (engine.category !== 'Language') {
            return res.status(400).json({ error: 'Chat route only supports Language engines.' });
        }
        if (!engine.requestUrl || !engine.requestBodyTemplate) {
            return res.status(400).json({ error: 'Chat route requires a programmable Language engine.' });
        }

        const inputPayload = {
            prompt: req.body?.prompt || '',
            messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
            temperature: req.body?.temperature,
            max_tokens: req.body?.max_tokens,
            dynamicParams: req.body?.dynamicParams || {}
        };

        const wantsStream = req.body?.stream === true || String(req.body?.stream || '').toLowerCase() === 'true';
        if (wantsStream) {
            await orchestrateTextSandboxStream(engine, inputPayload, req, res);
            await logSystemEvent('INFO', 'CHAT_INFERENCE', `Chat stream success [${modelId}]`, userId);
            return;
        }

        const output = await orchestrateTextSandbox(engine, inputPayload, req);
        await logSystemEvent('INFO', 'CHAT_INFERENCE', `Chat success [${modelId}]`, userId);
        return res.json(output);
    } catch (e) {
        console.error(`[CHAT_PROXY_ERR] ${redactSearchSensitiveText(e.message)}`);
        await createErrorReport({
            level: 'ERROR',
            module: 'CHAT_INFERENCE',
            source: 'server',
            errorName: e?.name || 'ChatInferenceError',
            message: `Chat fail [${modelId}]: ${redactSearchSensitiveText(e.message)}`,
            stack: e?.stack || '',
            route: req.originalUrl || '/api/proxy/chat',
            userId,
            context: {
                model: modelId,
                temperature: req.body?.temperature,
                max_tokens: req.body?.max_tokens,
                hasMessages: Array.isArray(req.body?.messages) && req.body.messages.length > 0
            }
        });
        return res.status(502).json({ error: redactSearchSensitiveText(e.message || 'Chat inference failed') });
    }
});

router.post('/pollinations', async (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const modelId = req.body.model;
    try {
        const engine = await dbGet("SELECT * FROM custom_engines WHERE id = ?", [modelId]);
        if (!engine) {
            await logSystemEvent('ERROR', 'INFERENCE', `Inference request for unregistered model ID: ${modelId}`, userId);
            return res.status(404).json({ error: "Engine not found" });
        }
        await orchestrateInference(engine, req.body, res, userId, req);
        await logSystemEvent('INFO', 'INFERENCE', `Synthesis success [${modelId}]`, userId);
    } catch (e) { 
        const rawMessage = e?.message || 'Pollinations inference failed';
        const normalizedHtmlError = normalizeKnownUpstreamHtmlError({
            rawMessage,
            rawBody: rawMessage,
            status: e?.status || e?.statusCode || 0,
            engine: { id: modelId, label: modelId }
        });
        const message = redactSearchSensitiveText(normalizedHtmlError || rawMessage);
        const status = resolveProxyErrorStatus(message);
        const code = resolveProxyErrorCode(message);
        console.error(`[POLLINATIONS_ERR] ${message}`);
        await logSystemEvent('ERROR', 'INFERENCE', `Synthesis fail [${modelId}]: ${message}`, userId);
        res.status(status).json({ error: message, code }); 
    }
});

export const __proxyTestUtils = {
    resolveChatWebSearchMode,
    resolveSearchTelemetry,
    applyFallbackSearchAugmentation,
    normalizeChatMessagesForMedia,
    ensurePublicReferenceUrl,
    orchestrateInference,
    orchestrateTextSandbox,
    orchestrateTextSandboxStream,
    readTextWithLimit,
    readJsonWithLimit,
    normalizeKnownUpstreamHtmlError,
    normalizeKnownUpstreamJsonError,
    summarizeUpstreamErrorForLog,
    resolveProxyErrorCode
};

export default router;
