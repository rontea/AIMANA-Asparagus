import test from 'node:test';
import assert from 'node:assert/strict';
import { __proxyTestUtils } from '../routes/proxy.js';

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

test('fallback behavior: adapter success injects context and returns sources metadata', async () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'fallback';
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => jsonResponse({
        results: [
            { title: 'Result A', url: 'https://example.com/a', content: 'Snippet A' }
        ]
    });

    const capabilityWarnings = [];
    const messages = [{ role: 'user', content: 'What happened today?' }];

    const out = await __proxyTestUtils.applyFallbackSearchAugmentation({
        payload: { dynamicParams: { useSearch: true } },
        engineConfig: { textTools: false },
        messages,
        capabilityWarnings
    });

    assert.equal(out.applied, true);
    assert.equal(out.provider, 'tavily');
    assert.equal(out.sources.length, 1);
    assert.equal(out.sources[0].url, 'https://example.com/a');
    assert.equal(Array.isArray(out.messages), true);
    assert.equal(out.messages[0].role, 'system');
    assert.match(String(out.messages[0].content || ''), /WEB_SEARCH_CONTEXT_V1/);
    assert.equal(capabilityWarnings.length, 0);
});

test('fallback behavior: adapter failure is degraded and does not throw/request-fail', async () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'fallback';
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async () => {
        throw new TypeError('Authorization: Bearer secret-token-abc');
    };

    const capabilityWarnings = [];
    const messages = [{ role: 'user', content: 'Find recent policy updates' }];

    const out = await __proxyTestUtils.applyFallbackSearchAugmentation({
        payload: { dynamicParams: { useSearch: true } },
        engineConfig: { textTools: false },
        messages,
        capabilityWarnings
    });

    assert.equal(out.applied, false);
    assert.equal(out.provider, 'tavily');
    assert.equal(out.sources.length, 0);
    assert.equal(typeof out.warning, 'string');
    assert.equal(out.warning.includes('secret-token-abc'), false);
    assert.equal(out.warning.includes('[REDACTED]'), true);
    assert.equal(out.degraded?.code, 'network');
    assert.equal(Array.isArray(out.messages), true);
    assert.equal(out.messages.length, messages.length);
    assert.equal(capabilityWarnings.length > 0, true);
});
