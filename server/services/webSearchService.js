const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_RETRIES = 1;
const MAX_SNIPPET_LENGTH = 400;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const SECRET_REDACTION_PATTERNS = [
    /(authorization\s*:\s*bearer\s+)[a-z0-9._~+/-]+/gi,
    /(bearer\s+)[a-z0-9._~+/-]+/gi,
    /([?&](?:api[_-]?key|token|access[_-]?token|auth|authorization)=)[^&\s]+/gi,
    /((?:api[_-]?key|token|access[_-]?token|auth|authorization)\s*[:=]\s*)[^\s,;]+/gi
];

const clampMaxResults = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_RESULTS;
    return Math.max(1, Math.min(10, Math.floor(parsed)));
};

const clampRetries = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETRIES;
    return Math.max(0, Math.min(3, Math.floor(parsed)));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const redactSearchSensitiveText = (input) => {
    let out = String(input || '');
    for (const pattern of SECRET_REDACTION_PATTERNS) {
        out = out.replace(pattern, '$1[REDACTED]');
    }
    return out;
};

const parseDomainList = (input) => {
    if (Array.isArray(input)) {
        return input
            .map((v) => String(v || '').trim().toLowerCase())
            .filter(Boolean);
    }
    return String(input || '')
        .split(/[,\n;|]/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
};

const normalizeHostname = (raw) => String(raw || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '');

const isHttpUrl = (value) => {
    try {
        const parsed = new URL(String(value || ''));
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const extractHostname = (url) => {
    try {
        const parsed = new URL(String(url || ''));
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return normalizeHostname(parsed.hostname);
    } catch {
        return '';
    }
};

const domainMatches = (hostname, domainRule) => {
    const host = normalizeHostname(hostname);
    const rule = normalizeHostname(domainRule);
    if (!host || !rule) return false;
    return host === rule || host.endsWith(`.${rule}`);
};

const toIsoDateOrEmpty = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
};

const sanitizeSnippet = (value) => (
    String(value || '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_SNIPPET_LENGTH)
);

const normalizeResult = (input = {}, source = '') => {
    const title = String(input.title || input.name || '').trim();
    const url = String(input.url || input.link || '').trim();
    const snippet = sanitizeSnippet(input.snippet || input.content || input.description || '');
    const publishedAt = toIsoDateOrEmpty(input.publishedAt || input.published_at || input.date || '');
    if (!title || !url) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    return {
        title,
        url,
        snippet,
        source: source || 'web',
        publishedAt
    };
};

const normalizeAndCapResults = (rows, provider, maxResults) => (
    (Array.isArray(rows) ? rows : [])
        .map((item) => normalizeResult(item, provider))
        .filter(Boolean)
        .slice(0, clampMaxResults(maxResults))
);

const applyDomainPolicy = ({ results = [], allowDomains = [], denyDomains = [] }) => {
    const deny = parseDomainList(denyDomains);
    const allow = parseDomainList(allowDomains);
    const hasAllow = allow.length > 0;
    let filteredByDeny = 0;
    let filteredByAllow = 0;

    const kept = [];
    for (const result of Array.isArray(results) ? results : []) {
        if (!isHttpUrl(result?.url)) continue;
        const hostname = extractHostname(result?.url);
        const denied = deny.some((rule) => domainMatches(hostname, rule));
        if (denied) {
            filteredByDeny += 1;
            continue;
        }
        if (hasAllow) {
            const allowed = allow.some((rule) => domainMatches(hostname, rule));
            if (!allowed) {
                filteredByAllow += 1;
                continue;
            }
        }
        kept.push(result);
    }

    return {
        results: kept,
        filterStats: {
            filteredByDeny,
            filteredByAllow
        },
        allowDomains: allow,
        denyDomains: deny
    };
};

const resolveSearchProviderFromEnv = () => {
    const configured = String(process.env.CHAT_WEB_SEARCH_PROVIDER || '').trim().toLowerCase();
    if (!configured) return 'none';
    if (configured === 'tavily' || configured === 'searxng') return configured;
    return 'none';
};

const buildDegraded = (provider, code, retryable = false) => ({
    provider: String(provider || 'none').toLowerCase(),
    code: String(code || 'search_failed').toLowerCase(),
    retryable: Boolean(retryable)
});

const toStructuredFailure = (provider, code, message, retryable = false) => ({
    provider: String(provider || 'none').toLowerCase(),
    results: [],
    warning: redactSearchSensitiveText(String(message || 'Search provider unavailable.')).slice(0, 240),
    degraded: buildDegraded(provider, code, retryable)
});

const isRetryableError = (error) => {
    const status = Number(error?.status);
    if (Number.isFinite(status) && RETRYABLE_HTTP_STATUSES.has(status)) return true;
    if (error?.name === 'AbortError') return true;
    if (typeof error?.code === 'string' && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(error.code)) {
        return true;
    }
    if (error instanceof TypeError) return true;
    return false;
};

const classifySearchErrorCode = (error) => {
    const status = Number(error?.status);
    if (error?.name === 'AbortError') return 'timeout';
    if (Number.isFinite(status)) {
        if (status === 429) return 'rate_limited';
        if (status >= 500) return 'upstream_5xx';
        if (status >= 400) return 'upstream_4xx';
    }
    if (typeof error?.code === 'string') {
        const normalized = error.code.toUpperCase();
        if (normalized === 'ETIMEDOUT') return 'timeout';
        if (['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(normalized)) return 'network';
    }
    if (error instanceof TypeError) return 'network';
    return 'search_failed';
};

const fetchJsonWithRetry = async ({ provider, url, init, timeoutMs, retries }) => {
    const maxAttempts = 1 + clampRetries(retries);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const signal = AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS);
            const response = await fetch(url, { ...init, signal });
            if (!response.ok) {
                const err = new Error(`${provider} search failed (${response.status}).`);
                err.status = response.status;
                throw err;
            }
            return await response.json().catch(() => ({}));
        } catch (error) {
            lastError = error;
            const shouldRetry = attempt < maxAttempts && isRetryableError(error);
            if (!shouldRetry) break;
            await sleep(150 * attempt);
        }
    }
    const err = lastError || new Error(`${provider} search failed.`);
    err.retryable = isRetryableError(err);
    throw err;
};

const searchWithTavily = async ({ query, maxResults, timeoutMs, retries }) => {
    const apiKey = String(process.env.TAVILY_API_KEY || '').trim();
    if (!apiKey) return toStructuredFailure('tavily', 'misconfigured', 'Tavily provider selected but TAVILY_API_KEY is not configured.');

    const endpoint = String(process.env.TAVILY_API_URL || 'https://api.tavily.com/search').trim();
    try {
        const json = await fetchJsonWithRetry({
            provider: 'Tavily',
            url: endpoint,
            timeoutMs,
            retries,
            init: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    query,
                    max_results: clampMaxResults(maxResults)
                })
            }
        });
        return {
            provider: 'tavily',
            results: normalizeAndCapResults(json?.results, 'tavily', maxResults),
            warning: ''
        };
    } catch (error) {
        const code = classifySearchErrorCode(error);
        return toStructuredFailure('tavily', code, error?.message || 'Tavily search failed.', Boolean(error?.retryable));
    }
};

const searchWithSearxng = async ({ query, maxResults, timeoutMs, retries }) => {
    const endpoint = String(process.env.CHAT_WEB_SEARCH_SEARXNG_URL || '').trim();
    if (!endpoint) return toStructuredFailure('searxng', 'misconfigured', 'SearXNG provider selected but CHAT_WEB_SEARCH_SEARXNG_URL is not configured.');

    const parsed = new URL(endpoint);
    parsed.searchParams.set('q', query);
    parsed.searchParams.set('format', 'json');

    try {
        const json = await fetchJsonWithRetry({
            provider: 'SearXNG',
            url: parsed.toString(),
            timeoutMs,
            retries,
            init: {
                headers: { Accept: 'application/json' }
            }
        });
        return {
            provider: 'searxng',
            results: normalizeAndCapResults(json?.results, 'searxng', maxResults),
            warning: ''
        };
    } catch (error) {
        const code = classifySearchErrorCode(error);
        return toStructuredFailure('searxng', code, error?.message || 'SearXNG search failed.', Boolean(error?.retryable));
    }
};

export const searchWeb = async ({
    query,
    maxResults = DEFAULT_MAX_RESULTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    allowDomains = '',
    denyDomains = ''
}) => {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return { ...toStructuredFailure('none', 'empty_query', 'Search query is empty.'), filterStats: { filteredByDeny: 0, filteredByAllow: 0 } };

    const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs))
        ? Number(timeoutMs)
        : Number(process.env.CHAT_WEB_SEARCH_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const effectiveRetries = Number.isFinite(Number(retries))
        ? Number(retries)
        : Number(process.env.CHAT_WEB_SEARCH_RETRIES || DEFAULT_RETRIES);
    const effectiveAllowDomains = parseDomainList(allowDomains).length > 0
        ? parseDomainList(allowDomains)
        : parseDomainList(process.env.CHAT_WEB_SEARCH_ALLOW_DOMAINS || '');
    const effectiveDenyDomains = parseDomainList(denyDomains).length > 0
        ? parseDomainList(denyDomains)
        : parseDomainList(process.env.CHAT_WEB_SEARCH_DENY_DOMAINS || '');

    const provider = resolveSearchProviderFromEnv();
    if (provider === 'none') {
        return {
            ...toStructuredFailure('none', 'provider_unconfigured', 'No web search provider configured. Set CHAT_WEB_SEARCH_PROVIDER.'),
            filterStats: { filteredByDeny: 0, filteredByAllow: 0 }
        };
    }

    let result;
    if (provider === 'tavily') {
        result = await searchWithTavily({ query: cleanQuery, maxResults, timeoutMs: effectiveTimeoutMs, retries: effectiveRetries });
    } else if (provider === 'searxng') {
        result = await searchWithSearxng({ query: cleanQuery, maxResults, timeoutMs: effectiveTimeoutMs, retries: effectiveRetries });
    } else {
        return {
            ...toStructuredFailure('none', 'provider_unsupported', `Unsupported web search provider: ${provider}`),
            filterStats: { filteredByDeny: 0, filteredByAllow: 0 }
        };
    }

    const domainFiltered = applyDomainPolicy({
        results: result.results || [],
        allowDomains: effectiveAllowDomains,
        denyDomains: effectiveDenyDomains
    });

    return {
        ...result,
        results: domainFiltered.results.slice(0, clampMaxResults(maxResults)),
        filterStats: domainFiltered.filterStats,
        allowDomains: domainFiltered.allowDomains,
        denyDomains: domainFiltered.denyDomains
    };
};
