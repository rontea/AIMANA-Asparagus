
import { createHash, randomUUID } from 'crypto';
import { dbRun } from './connection.js';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 16000;
const MAX_CONTEXT_LENGTH = 12000;

const redactSecrets = (input = '') => {
    let value = String(input || '');

    value = value.replace(/(authorization\s*:\s*bearer\s+)[a-z0-9._-]+/ig, '$1[REDACTED]');
    value = value.replace(/(x-api-key\s*:\s*)[^\s,;]+/ig, '$1[REDACTED]');
    value = value.replace(/(api[_-]?key[=:]\s*)[^\s,;]+/ig, '$1[REDACTED]');
    value = value.replace(/(token[=:]\s*)[^\s,;]+/ig, '$1[REDACTED]');
    value = value.replace(/(password[=:]\s*)[^\s,;]+/ig, '$1[REDACTED]');
    value = value.replace(/(cookie\s*:\s*)[^\n]+/ig, '$1[REDACTED]');

    return value;
};

const clamp = (input, maxLen) => {
    const value = String(input || '');
    if (value.length <= maxLen) return value;
    return `${value.slice(0, maxLen)}...[TRUNCATED ${value.length - maxLen} chars]`;
};

const extractHtmlTitle = (html = '') => {
    const match = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? String(match[1] || '').trim() : '';
};

const normalizeAuditMessage = (input = '') => {
    const value = String(input || '');
    const lower = value.toLowerCase();
    const htmlStart = value.search(/<!doctype html|<html|<!--\[if lt ie 7\]/i);
    if (htmlStart === -1) return value;

    const prefix = value.slice(0, htmlStart).trimEnd();
    const html = value.slice(htmlStart);
    const title = extractHtmlTitle(html);
    const isCloudflareTunnel =
        lower.includes('cloudflare tunnel error')
        || lower.includes('error 1033')
        || lower.includes('cloudflared is running');

    const normalizedDetail = isCloudflareTunnel
        ? 'Upstream HTML error page (Cloudflare Tunnel error 1033).'
        : `Upstream HTML error page${title ? ` (${title})` : ''}.`;

    return prefix ? `${prefix} ${normalizedDetail}` : normalizedDetail;
};

const serializeContext = (context) => {
    if (!context) return '{}';
    try {
        return clamp(redactSecrets(JSON.stringify(context)), MAX_CONTEXT_LENGTH);
    } catch {
        return '{"error":"Context serialization failed"}';
    }
};

const buildFingerprint = ({ module = '', message = '', stack = '' }) => {
    const firstStackLine = String(stack || '').split('\n')[0] || '';
    return createHash('sha256').update(`${module}|${message}|${firstStackLine}`).digest('hex').slice(0, 16);
};

export const logSystemEvent = async (level, module, message, userId = 'system') => {
    try {
        const safeMessage = clamp(redactSecrets(normalizeAuditMessage(message)), MAX_MESSAGE_LENGTH);
        await dbRun(`INSERT INTO system_logs (timestamp, level, module, message, userId) VALUES (?, ?, ?, ?, ?)`, 
            [Date.now(), level, module, safeMessage, userId]);
    } catch (e) {
        console.error("Critical: Logging failed", e);
    }
};

export const createErrorReport = async ({
    level = 'ERROR',
    module = 'SYSTEM',
    source = 'server',
    errorName = 'Error',
    message = '',
    stack = '',
    route = '',
    userId = 'system',
    context = null,
    fingerprint = ''
} = {}) => {
    try {
        const reportId = randomUUID();
        const safeMessage = clamp(redactSecrets(normalizeAuditMessage(message || 'Unknown error')), MAX_MESSAGE_LENGTH);
        const safeStack = clamp(redactSecrets(stack || ''), MAX_STACK_LENGTH);
        const safeRoute = clamp(redactSecrets(route || ''), 500);
        const finalFingerprint = fingerprint || buildFingerprint({ module, message: safeMessage, stack: safeStack });
        const contextJson = serializeContext(context);

        await dbRun(
            `INSERT INTO error_reports (id, timestamp, level, module, source, errorName, message, stack, route, userId, fingerprint, contextJson)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [reportId, Date.now(), level, module, source, errorName, safeMessage, safeStack, safeRoute, userId, finalFingerprint, contextJson]
        );

        await logSystemEvent(level, module, `${safeMessage} [ERR_REPORT:${reportId}]`, userId);
        return reportId;
    } catch (e) {
        console.error("Critical: Error report persistence failed", e);
        return null;
    }
};

export const __loggerTestUtils = {
    normalizeAuditMessage
};
