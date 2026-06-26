import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWeb, redactSearchSensitiveText } from '../services/webSearchService.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
        process.env[key] = value;
    }
};

const jsonResponse = (payload, status = 200) => new Response(
    JSON.stringify(payload),
    { status, headers: { 'Content-Type': 'application/json' } }
);

test.afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv();
});

test('normalizes provider rows: drops non-http(s), sanitizes snippets, and truncates', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            {
                title: 'Good',
                url: 'https://example.com/x',
                content: `<p>Hello</p>\n<script>alert('x')</script>\n<div>${'a'.repeat(600)}</div>`
            },
            { title: 'Bad URL FTP', url: 'ftp://example.com/file', content: 'x' },
            { title: 'Bad URL', url: 'javascript:alert(1)', content: 'x' },
            { title: '', url: 'https://example.com/empty-title', content: 'x' }
        ]
    });

    const out = await searchWeb({ query: 'hello', maxResults: 5, retries: 0 });
    assert.equal(out.provider, 'tavily');
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].title, 'Good');
    assert.equal(out.results[0].snippet.length, 400);
    assert.equal(out.results[0].snippet.includes('<script>'), false);
    assert.equal(out.results[0].snippet.includes('<p>'), false);
    assert.equal(out.results[0].snippet.startsWith('Hello '), true);
});

test('retries once on retryable network failure then succeeds', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('transient network failure');
        return jsonResponse({
            results: [{ title: 'Recovered', url: 'https://example.com/recovered', content: 'ok' }]
        });
    };

    const out = await searchWeb({ query: 'retry case', retries: 1, timeoutMs: 2000 });
    assert.equal(calls, 2);
    assert.equal(out.results.length, 1);
    assert.equal(out.warning, '');
});

test('retries once on timeout-style abort then succeeds', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) throw new DOMException('operation timed out', 'AbortError');
        return jsonResponse({
            results: [{ title: 'Recovered Timeout', url: 'https://example.com/ok', content: 'ok' }]
        });
    };

    const out = await searchWeb({ query: 'timeout case', retries: 1, timeoutMs: 2000 });
    assert.equal(calls, 2);
    assert.equal(out.results.length, 1);
    assert.equal(out.warning, '');
});

test('handles empty/malformed provider payload without throwing', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({ unexpected: { nested: true } });

    const out = await searchWeb({ query: 'malformed payload', retries: 0 });
    assert.equal(out.provider, 'tavily');
    assert.equal(Array.isArray(out.results), true);
    assert.equal(out.results.length, 0);
    assert.equal(out.warning, '');
    assert.equal(out.degraded, undefined);
});

test('applies deny-first then allow domain filters with counters', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            { title: 'Denied', url: 'https://blocked.example.com/a', content: 'x' },
            { title: 'Not Allowed', url: 'https://other.net/b', content: 'x' },
            { title: 'Allowed', url: 'https://news.example.com/c', content: 'x' }
        ]
    });

    const out = await searchWeb({
        query: 'domain filter',
        allowDomains: 'example.com',
        denyDomains: 'blocked.example.com'
    });

    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].url, 'https://news.example.com/c');
    assert.equal(out.filterStats.filteredByDeny, 1);
    assert.equal(out.filterStats.filteredByAllow, 1);
});

test('safety: allow-list only keeps matching domains', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            { title: 'Allowed', url: 'https://docs.example.com/a', content: 'x' },
            { title: 'Blocked', url: 'https://other.net/b', content: 'x' }
        ]
    });

    const out = await searchWeb({
        query: 'allow list',
        allowDomains: 'example.com'
    });

    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].url, 'https://docs.example.com/a');
    assert.equal(out.filterStats.filteredByAllow, 1);
});

test('compliance: blocked deny-list domains are excluded from final results', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            { title: 'Blocked Exact', url: 'https://blocked.example.com/a', content: 'x' },
            { title: 'Blocked Subdomain', url: 'https://sub.blocked.example.com/b', content: 'x' },
            { title: 'Allowed', url: 'https://safe.example.com/c', content: 'x' }
        ]
    });

    const out = await searchWeb({
        query: 'blocked domain test',
        denyDomains: 'blocked.example.com'
    });

    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].url, 'https://safe.example.com/c');
    assert.equal(out.filterStats.filteredByDeny, 2);
});

test('compliance: malicious HTML/script payloads are sanitized in snippets', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            {
                title: 'Sanitize Me',
                url: 'https://example.com/safe',
                content: "<script>alert('x')</script><img src=x onerror=alert(1)><div>Clean text</div>"
            }
        ]
    });

    const out = await searchWeb({ query: 'sanitize payload' });
    const snippet = out.results[0].snippet;

    assert.equal(snippet.includes('<script'), false);
    assert.equal(snippet.includes('</script>'), false);
    assert.equal(snippet.includes('<img'), false);
    assert.equal(snippet.includes('<div'), false);
    assert.equal(snippet.includes('alert('), false);
    assert.equal(snippet.includes('Clean text'), true);
});

test('safety: snippet sanitization normalizes whitespace', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            {
                title: 'Whitespace',
                url: 'https://example.com/whitespace',
                content: 'Line1\n\n\tLine2    <b>Line3</b>'
            }
        ]
    });

    const out = await searchWeb({ query: 'whitespace sanitize' });
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].snippet, 'Line1 Line2 Line3');
});

test('returns degraded structured result with redacted warning on provider failure', async () => {
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => {
        throw new TypeError('Authorization: Bearer secret-token-123');
    };

    const out = await searchWeb({ query: 'failure case', retries: 0 });
    assert.equal(out.provider, 'tavily');
    assert.equal(Array.isArray(out.results), true);
    assert.equal(out.results.length, 0);
    assert.equal(out.degraded.code, 'network');
    assert.equal(out.degraded.retryable, true);
    assert.equal(out.warning.includes('secret-token-123'), false);
    assert.equal(out.warning.includes('[REDACTED]'), true);
});

test('redacts bearer/api key/token secrets from arbitrary warning text', () => {
    const input = 'Authorization: Bearer secret-abc https://x.test?q=ok&api_key=sk-123&token=tkn-999 access_token:xyz';
    const out = redactSearchSensitiveText(input);
    assert.equal(out.includes('secret-abc'), false);
    assert.equal(out.includes('sk-123'), false);
    assert.equal(out.includes('tkn-999'), false);
    assert.equal(out.includes('access_token:xyz'), false);
    assert.equal(out.includes('[REDACTED]'), true);
});
