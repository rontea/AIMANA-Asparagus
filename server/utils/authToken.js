import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const DEFAULT_SECRET = 'dev-only-change-this-secret';

const base64UrlEncode = (value) =>
    Buffer.from(value).toString('base64url');

const base64UrlDecode = (value) =>
    Buffer.from(value, 'base64url').toString('utf8');

const getAuthSecret = () => process.env.AUTH_SECRET || DEFAULT_SECRET;

const isUnsafeSecret = (secret) => {
    if (!secret) return true;
    if (secret === DEFAULT_SECRET) return true;
    return false;
};

export const isUnsafeAuthSecret = (secret = getAuthSecret()) => isUnsafeSecret(secret);

const enforceAuthSecret = () => {
    const env = String(process.env.NODE_ENV || '').toLowerCase();
    if (env === 'development' || env === 'test') return;
    const secret = getAuthSecret();
    if (isUnsafeSecret(secret)) {
        throw new Error('AUTH_SECRET must be set to a non-default value.');
    }
};

const sign = (input) => {
    enforceAuthSecret();
    const secret = getAuthSecret();
    return crypto.createHmac('sha256', secret).update(input).digest('base64url');
};

export const createAuthToken = (payload, ttlSeconds = DEFAULT_TTL_SECONDS) => {
    enforceAuthSecret();
    const now = Math.floor(Date.now() / 1000);
    const body = {
        ...payload,
        iat: now,
        exp: now + ttlSeconds
    };

    const encodedPayload = base64UrlEncode(JSON.stringify(body));
    const signature = sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
};

export const verifyAuthToken = (token) => {
    try {
        enforceAuthSecret();
    } catch {
        return null;
    }
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [encodedPayload, providedSignature] = token.split('.');
    if (!encodedPayload || !providedSignature) return null;

    const expectedSignature = sign(encodedPayload);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (providedBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

    let payload;
    try {
        payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload?.sub || !payload?.exp || payload.exp <= now) return null;
    return payload;
};
