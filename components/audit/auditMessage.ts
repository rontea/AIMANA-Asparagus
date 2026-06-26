const extractHtmlTitle = (html = ''): string => {
    const match = String(html || '').match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? String(match[1] || '').trim() : '';
};

export const normalizeAuditMessageForDisplay = (input = ''): string => {
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

export const truncateAuditMessage = (input = '', maxLength = 180): string => {
    const value = normalizeAuditMessageForDisplay(input).trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
};
