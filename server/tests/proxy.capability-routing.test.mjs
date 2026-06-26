import test from 'node:test';
import assert from 'node:assert/strict';
import { __proxyTestUtils } from '../routes/proxy.js';

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
        process.env[key] = value;
    }
};

test.afterEach(() => {
    restoreEnv();
});

test('capability routing: useSearch + tool-capable model injects native tool payload', () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'native';

    const payload = { dynamicParams: { useSearch: true } };
    const engineConfig = { textTools: true };
    const parsedBody = { model: 'x', messages: [{ role: 'user', content: 'hello' }] };
    const capabilityWarnings = [];

    const telemetry = __proxyTestUtils.resolveSearchTelemetry({
        payload,
        engineConfig,
        parsedBody,
        fallbackApplied: false,
        fallbackProvider: 'none',
        fallbackWarning: '',
        capabilityWarnings
    });

    assert.equal(telemetry.searchRequested, true);
    assert.equal(telemetry.searchApplied, true);
    assert.equal(telemetry.searchMode, 'native');
    assert.equal(telemetry.searchProvider, 'pollinations');
    assert.equal(parsedBody.tool_choice, 'auto');
    assert.equal(Array.isArray(parsedBody.tools), true);
    assert.equal(parsedBody.tools[0]?.type, 'web_search');
});

test('capability routing: unsupported model sets warning and stays ungrounded', () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'native';

    const payload = { dynamicParams: { useSearch: true } };
    const engineConfig = { textTools: false };
    const parsedBody = { model: 'x', messages: [{ role: 'user', content: 'hello' }] };
    const capabilityWarnings = [];

    const telemetry = __proxyTestUtils.resolveSearchTelemetry({
        payload,
        engineConfig,
        parsedBody,
        fallbackApplied: false,
        fallbackProvider: 'none',
        fallbackWarning: '',
        capabilityWarnings
    });

    assert.equal(telemetry.searchRequested, true);
    assert.equal(telemetry.searchApplied, false);
    assert.equal(telemetry.searchMode, 'native');
    assert.match(telemetry.searchWarning, /does not advertise tools\/search support/i);
    assert.equal(capabilityWarnings.length > 0, true);
});

test('capability routing: CHAT_WEB_SEARCH_MODE=off never applies search', () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'off';

    const payload = { dynamicParams: { useSearch: true } };
    const engineConfig = { textTools: true };
    const parsedBody = { model: 'x', messages: [{ role: 'user', content: 'hello' }] };
    const capabilityWarnings = [];

    const telemetry = __proxyTestUtils.resolveSearchTelemetry({
        payload,
        engineConfig,
        parsedBody,
        fallbackApplied: false,
        fallbackProvider: 'none',
        fallbackWarning: '',
        capabilityWarnings
    });

    assert.equal(telemetry.searchRequested, true);
    assert.equal(telemetry.searchApplied, false);
    assert.equal(telemetry.searchMode, 'off');
    assert.match(telemetry.searchWarning, /CHAT_WEB_SEARCH_MODE=off/i);
    assert.equal(parsedBody.tools, undefined);
    assert.equal(parsedBody.tool_choice, undefined);
});

test('capability routing: fallback mode skips native tools when adapter results are used', () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'fallback';

    const payload = { dynamicParams: { useSearch: true } };
    const engineConfig = { textTools: true };
    const parsedBody = { model: 'x', messages: [{ role: 'user', content: 'hello' }] };
    const capabilityWarnings = [];

    const telemetry = __proxyTestUtils.resolveSearchTelemetry({
        payload,
        engineConfig,
        parsedBody,
        fallbackApplied: true,
        fallbackProvider: 'tavily',
        fallbackWarning: '',
        capabilityWarnings
    });

    assert.equal(telemetry.searchRequested, true);
    assert.equal(telemetry.searchApplied, true);
    assert.equal(telemetry.searchMode, 'fallback');
    assert.equal(telemetry.searchProvider, 'tavily');
    assert.equal(parsedBody.tools, undefined);
    assert.equal(parsedBody.tool_choice, undefined);
});

test('capability routing: pollinations language models default to fallback search mode', () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'native';

    const mode = __proxyTestUtils.resolveChatWebSearchMode(
        { dynamicParams: { useSearch: true } },
        { provider: 'pollinations', category: 'Language', id: 'pollinations-openai' }
    );

    assert.equal(mode, 'fallback');
});

test('capability routing: forced fallback models do not fall back to native tool injection when fallback is unavailable', () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'native';

    const payload = { dynamicParams: { useSearch: true } };
    const engineConfig = { textTools: true };
    const engine = { provider: 'pollinations', category: 'Language', id: 'pollinations-openai' };
    const parsedBody = { model: 'x', messages: [{ role: 'user', content: 'hello' }] };
    const capabilityWarnings = [];

    const telemetry = __proxyTestUtils.resolveSearchTelemetry({
        payload,
        engineConfig,
        engine,
        parsedBody,
        fallbackApplied: false,
        fallbackProvider: 'none',
        fallbackWarning: 'Search fallback returned zero results; skipped context block.',
        capabilityWarnings
    });

    assert.equal(telemetry.searchRequested, true);
    assert.equal(telemetry.searchApplied, false);
    assert.equal(telemetry.searchMode, 'fallback');
    assert.match(telemetry.searchWarning, /fallback returned zero results/i);
    assert.equal(parsedBody.tools, undefined);
    assert.equal(parsedBody.tool_choice, undefined);
});
