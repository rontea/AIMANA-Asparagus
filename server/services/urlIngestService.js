import { redactSearchSensitiveText } from './webSearchService.js';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_MAX_LINKS = 3;
const MAX_SNIPPET_LENGTH = 360;

const URL_REGEX = /https?:\/\/[^\s<>"'`)\]]+/gi;

const clampNumber = (value, fallback, min = 1, max = Number.POSITIVE_INFINITY) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const normalizeWhitespace = (value) => (
    String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
);

const stripControlChars = (value) => (
    String(value || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
);

const decodeHtmlEntities = (value) => (
    String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
);

const sanitizeText = (value) => normalizeWhitespace(stripControlChars(value));

const extractTitleFromHtml = (html) => {
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return '';
    return sanitizeText(decodeHtmlEntities(match[1] || ''));
};

const extractReadableText = (html) => {
    if (!html) return '';
    let output = String(html);
    output = output.replace(/<!--[\s\S]*?-->/g, ' ');
    output = output.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    output = output.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    output = output.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    output = output.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
    output = output.replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');
    output = output.replace(/<canvas[\s\S]*?<\/canvas>/gi, ' ');
    output = output.replace(/<header[\s\S]*?<\/header>/gi, ' ');
    output = output.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
    output = output.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
    output = output.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');

    output = output.replace(/<br\s*\/?>/gi, '\n');
    output = output.replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|td|th|pre|blockquote)>/gi, '\n');
    output = output.replace(/<[^>]+>/g, ' ');
    output = decodeHtmlEntities(output);
    output = stripControlChars(output);
    output = output.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
    output = output.replace(/\n{3,}/g, '\n\n');
    output = output.replace(/[ \t]{2,}/g, ' ');
    return output.trim();
};

const toSnippet = (value) => {
    const clean = sanitizeText(value);
    if (!clean) return '';
    return clean.slice(0, MAX_SNIPPET_LENGTH);
};

const trimUrlPunctuation = (raw) => {
    let value = String(raw || '').trim();
    value = value.replace(/^[<(]+/, '');
    const trailing = /[)>.,!?;:'"\]]$/;
    while (trailing.test(value)) {
        const last = value.slice(-1);
        if (last === ')') {
            const opens = (value.match(/\(/g) || []).length;
            const closes = (value.match(/\)/g) || []).length;
            if (opens > closes) break;
        }
        value = value.slice(0, -1);
    }
    return value;
};

export const extractUrlsFromText = (text) => {
    if (!text) return [];
    const matches = String(text).match(URL_REGEX) || [];
    const seen = new Set();
    const urls = [];
    for (const match of matches) {
        const cleaned = trimUrlPunctuation(match);
        if (!cleaned) continue;
        try {
            const parsed = new URL(cleaned);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
            const normalized = parsed.toString();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            urls.push(normalized);
        } catch {
            continue;
        }
    }
    return urls;
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
        throw new Error('Invalid URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Unsupported URL protocol');
    }
    if (isPrivateHostname(parsed.hostname)) {
        throw new Error('Blocked URL target');
    }
    return parsed;
};

const readTextWithLimit = async (response, maxBytes) => {
    if (!response?.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        if (text.length > maxBytes) {
            throw new Error('Response exceeded size limit');
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
            throw new Error('Response exceeded size limit');
        }
        chunks += decoder.decode(value, { stream: true });
    }

    chunks += decoder.decode();
    return chunks;
};

const fetchTextWithLimit = async (url, { timeoutMs, maxBytes } = {}) => {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'text/html, text/plain, application/json',
            'User-Agent': 'AIMANA/UrlIngest-1.0'
        },
        signal: AbortSignal.timeout(timeoutMs || DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
        throw new Error(`URL fetch failed (${response.status})`);
    }
    const text = await readTextWithLimit(response, maxBytes || DEFAULT_MAX_BYTES);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    return { text, contentType };
};

const isYouTubeHostname = (hostname) => {
    const h = String(hostname || '').toLowerCase();
    return (
        h === 'youtu.be'
        || h.endsWith('.youtu.be')
        || h === 'youtube.com'
        || h.endsWith('.youtube.com')
        || h === 'youtube-nocookie.com'
        || h.endsWith('.youtube-nocookie.com')
    );
};

const extractYouTubeVideoId = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);
        const hostname = parsed.hostname.toLowerCase();
        if (!isYouTubeHostname(hostname)) return '';
        if (hostname.includes('youtu.be')) {
            const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
            return id || '';
        }
        const vParam = parsed.searchParams.get('v');
        if (vParam) return vParam;
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'shorts' && pathParts[1]) return pathParts[1];
        if (pathParts[0] === 'embed' && pathParts[1]) return pathParts[1];
        return '';
    } catch {
        return '';
    }
};

const buildTranscriptFromJson = (payload) => {
    if (!payload || typeof payload !== 'object') return '';
    const events = Array.isArray(payload.events) ? payload.events : [];
    const chunks = [];
    for (const event of events) {
        const segs = Array.isArray(event?.segs) ? event.segs : [];
        for (const seg of segs) {
            if (typeof seg?.utf8 === 'string') chunks.push(seg.utf8);
        }
    }
    return sanitizeText(chunks.join(' '));
};

const fetchYouTubeTranscript = async (videoId, { timeoutMs, maxBytes } = {}) => {
    const attempts = [
        { lang: 'en', kind: '' },
        { lang: 'en', kind: 'asr' },
        { lang: 'en-US', kind: '' },
        { lang: 'en-US', kind: 'asr' },
        { lang: 'en-GB', kind: '' },
        { lang: 'en-GB', kind: 'asr' }
    ];

    for (const attempt of attempts) {
        const endpoint = new URL('https://www.youtube.com/api/timedtext');
        endpoint.searchParams.set('v', videoId);
        endpoint.searchParams.set('fmt', 'json3');
        if (attempt.lang) endpoint.searchParams.set('lang', attempt.lang);
        if (attempt.kind) endpoint.searchParams.set('kind', attempt.kind);
        try {
            const { text } = await fetchTextWithLimit(endpoint.toString(), { timeoutMs, maxBytes });
            if (!text || !text.trim()) continue;
            const json = JSON.parse(text);
            const transcript = buildTranscriptFromJson(json);
            if (transcript) {
                return {
                    text: transcript,
                    lang: attempt.lang || '',
                    kind: attempt.kind || ''
                };
            }
        } catch {
            continue;
        }
    }
    return null;
};

const fetchYouTubeMetadata = async (canonicalUrl, { timeoutMs, maxBytes } = {}) => {
    const endpoint = new URL('https://www.youtube.com/oembed');
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('url', canonicalUrl);
    try {
        const { text } = await fetchTextWithLimit(endpoint.toString(), { timeoutMs, maxBytes });
        const parsed = JSON.parse(text);
        return {
            title: sanitizeText(parsed?.title || ''),
            authorName: sanitizeText(parsed?.author_name || ''),
            authorUrl: sanitizeText(parsed?.author_url || ''),
            thumbnailUrl: sanitizeText(parsed?.thumbnail_url || '')
        };
    } catch {
        return null;
    }
};

const ingestYouTubeUrl = async (rawUrl, options) => {
    const videoId = extractYouTubeVideoId(rawUrl);
    if (!videoId) {
        return { item: null, warning: 'YouTube URL did not include a video id.' };
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const transcript = await fetchYouTubeTranscript(videoId, options);
    const metadata = await fetchYouTubeMetadata(canonicalUrl, options);

    if (transcript && transcript.text) {
        const content = transcript.text;
        return {
            item: {
                title: metadata?.title || `YouTube Video ${videoId}`,
                url: canonicalUrl,
                content,
                source: 'youtube',
                note: transcript.kind === 'asr' ? 'Auto-generated transcript.' : ''
            },
            warning: ''
        };
    }

    const title = metadata?.title || `YouTube Video ${videoId}`;
    const metadataLines = [
        `Title: ${title}`,
        metadata?.authorName ? `Channel: ${metadata.authorName}` : '',
        metadata?.authorUrl ? `Channel URL: ${metadata.authorUrl}` : '',
        metadata?.thumbnailUrl ? `Thumbnail: ${metadata.thumbnailUrl}` : ''
    ].filter(Boolean);
    return {
        item: {
            title,
            url: canonicalUrl,
            content: metadataLines.join('\n'),
            source: 'youtube',
            note: 'Transcript unavailable; metadata only.'
        },
        warning: 'YouTube transcript unavailable; used metadata only.'
    };
};

const ingestWebUrl = async (rawUrl, options) => {
    const parsed = assertSafeTargetUrl(rawUrl);
    const { text, contentType } = await fetchTextWithLimit(parsed.toString(), options);

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return { item: null, warning: 'Unsupported content type for URL ingest.' };
    }

    const title = contentType.includes('text/html') ? extractTitleFromHtml(text) : '';
    const content = contentType.includes('text/html') ? extractReadableText(text) : sanitizeText(text);

    if (!content) {
        return { item: null, warning: 'URL ingest returned no readable text.' };
    }

    return {
        item: {
            title: title || parsed.hostname,
            url: parsed.toString(),
            content,
            source: 'url',
            note: ''
        },
        warning: ''
    };
};

export const ingestUrls = async ({
    urls = [],
    timeoutMs,
    maxBytes,
    maxChars,
    maxLinks
} = {}) => {
    const limit = clampNumber(maxLinks ?? process.env.CHAT_URL_INGEST_MAX_LINKS, DEFAULT_MAX_LINKS, 1, 10);
    const maxBytesLimit = clampNumber(maxBytes ?? process.env.CHAT_URL_INGEST_MAX_BYTES, DEFAULT_MAX_BYTES, 64 * 1024, 5 * 1024 * 1024);
    const maxCharsLimit = clampNumber(maxChars ?? process.env.CHAT_URL_INGEST_MAX_CHARS, DEFAULT_MAX_CHARS, 500, 20000);
    const timeoutLimit = clampNumber(timeoutMs ?? process.env.CHAT_URL_INGEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 30000);

    const unique = Array.from(new Set((Array.isArray(urls) ? urls : []).filter(Boolean)));
    const trimmed = unique.slice(0, limit);

    const items = [];
    const warnings = [];
    let blocked = 0;
    let failed = 0;
    let transcriptFallback = 0;

    for (const rawUrl of trimmed) {
        try {
            const safeUrl = assertSafeTargetUrl(rawUrl);
            const isYouTube = isYouTubeHostname(safeUrl.hostname);
            const result = isYouTube
                ? await ingestYouTubeUrl(safeUrl.toString(), { timeoutMs: timeoutLimit, maxBytes: maxBytesLimit })
                : await ingestWebUrl(safeUrl.toString(), { timeoutMs: timeoutLimit, maxBytes: maxBytesLimit });

            if (result?.warning) {
                warnings.push(result.warning);
                if (result.warning.toLowerCase().includes('transcript')) transcriptFallback += 1;
            }
            if (result?.item) {
                const rawContent = sanitizeText(result.item.content);
                const clipped = rawContent.slice(0, maxCharsLimit);
                const truncated = rawContent.length > maxCharsLimit;
                const baseNote = sanitizeText(result.item.note || '');
                const note = sanitizeText([baseNote, truncated ? 'Content truncated.' : ''].filter(Boolean).join(' '));
                items.push({
                    ...result.item,
                    content: clipped,
                    note
                });
            }
        } catch (error) {
            const message = String(error?.message || '');
            if (message.toLowerCase().includes('blocked')) {
                blocked += 1;
            } else {
                failed += 1;
            }
        }
    }

    if (unique.length > limit) {
        warnings.push(`Link ingest capped at ${limit} URL(s).`);
    }
    if (blocked > 0) {
        warnings.push(`${blocked} URL(s) blocked by safety policy.`);
    }
    if (failed > 0) {
        warnings.push(`${failed} URL(s) failed to fetch.`);
    }
    if (transcriptFallback > 0) {
        warnings.push(`${transcriptFallback} YouTube transcript(s) unavailable.`);
    }

    const sources = items.map((item) => ({
        title: item.title || item.url,
        url: item.url,
        snippet: toSnippet(item.content),
        source: item.source
    }));

    const warning = warnings.length > 0
        ? redactSearchSensitiveText(warnings.join(' '))
        : '';

    return {
        items,
        sources,
        warning
    };
};

export const __urlIngestTestUtils = {
    extractYouTubeVideoId,
    extractReadableText,
    extractTitleFromHtml
};
