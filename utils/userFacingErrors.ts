const unwrapNestedJsonMessage = (raw: string): string => {
    let message = String(raw || '').trim();
    for (let depth = 0; depth < 3; depth += 1) {
        if (!(message.startsWith('{') && message.endsWith('}'))) break;
        try {
            const parsed = JSON.parse(message);
            if (typeof parsed?.error?.message === 'string') {
                message = parsed.error.message.trim();
                continue;
            }
            if (typeof parsed?.message === 'string') {
                message = parsed.message.trim();
                continue;
            }
            break;
        } catch {
            break;
        }
    }
    return message;
};

const looksLikeHtmlDocument = (value: string): boolean => {
    const sample = String(value || '').trim().slice(0, 512).toLowerCase();
    if (!sample) return false;
    return (
        sample.includes('<!doctype html')
        || sample.includes('<html')
        || sample.includes('<head')
        || sample.includes('<body')
        || sample.includes('<!--[if lt ie 7]')
    );
};

export const normalizeUserFacingError = (rawMessage: string, status?: number): string => {
    const unwrapped = unwrapNestedJsonMessage(rawMessage);
    const message = String(unwrapped || '').trim();
    const lower = message.toLowerCase();

    if (looksLikeHtmlDocument(message)) {
        const isCloudflareTunnel =
            lower.includes('cloudflare tunnel error')
            || lower.includes('error 1033')
            || lower.includes('cloudflared is running');
        if (isCloudflareTunnel) {
            return 'The selected model is temporarily unavailable because its upstream bridge is offline (Cloudflare Tunnel error 1033). Please retry shortly or switch models.';
        }
        return 'The selected model returned an upstream HTML error page instead of a valid result. Please retry shortly or switch models.';
    }

    const is522 = status === 522
        || lower.includes('error code: 522')
        || lower.includes('cloudflare 522')
        || lower.includes('upstream provider timed out');
    if (is522) {
        return 'Provider timeout (Cloudflare 522). The selected model is temporarily unavailable. Please retry shortly or switch models.';
    }

    if (status === 503 && lower.includes('temporarily unavailable')) {
        return message;
    }

    if (lower.includes('insufficient balance') || lower.includes('payment_required')) {
        return `${message} Please top up credits and retry.`;
    }

    if (lower.includes('deprecated and no longer available')) {
        return `${message} Choose another model and try again.`;
    }

    if (status === 401 || lower.includes('authentication required') || lower.includes('unauthorized')) {
        return 'Authentication is required for this request. Please sign in again.';
    }

    if (!message) {
        if (status && status >= 500) return `Upstream service unavailable (HTTP ${status}). Please retry shortly.`;
        return 'Request failed. Please retry.';
    }

    return message;
};

export const readApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
    let rawText = '';
    try {
        rawText = await response.text();
    } catch {
        rawText = '';
    }

    let parsed: any = null;
    if (rawText) {
        try {
            parsed = JSON.parse(rawText);
        } catch {
            parsed = null;
        }
    }

    const candidate = parsed?.error?.message || parsed?.error || parsed?.message || rawText || fallback;
    return normalizeUserFacingError(String(candidate || fallback), response.status);
};
