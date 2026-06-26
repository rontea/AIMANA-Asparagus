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

const buildSseUpstreamResponse = (deltas = []) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            for (const delta of deltas) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
        }
    });
    return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
    });
};

const createReqRes = () => {
    const listeners = new Map();
    const req = {
        on(event, handler) {
            listeners.set(event, handler);
        },
        off(event, handler) {
            if (listeners.get(event) === handler) listeners.delete(event);
        }
    };
    const writes = [];
    const res = {
        headers: {},
        flushed: false,
        ended: false,
        set(nextHeaders = {}) {
            this.headers = { ...this.headers, ...nextHeaders };
            return this;
        },
        flushHeaders() {
            this.flushed = true;
        },
        write(chunk) {
            writes.push(String(chunk || ''));
        },
        end() {
            this.ended = true;
        }
    };
    return { req, res, writes };
};

const parseSseDataPayloads = (writes = []) => {
    const payloads = [];
    for (const chunk of writes) {
        const lines = String(chunk || '').split('\n');
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            payloads.push(line.slice(5).trimStart());
        }
    }
    return payloads;
};

test.afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv();
});

test('streaming: final SSE event includes search diagnostics and sources', async () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'fallback';
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async (url) => {
        const target = String(url || '');
        if (target.includes('api.tavily.com/search')) {
            return new Response(JSON.stringify({
                results: [
                    { title: 'Source One', url: 'https://example.com/news', content: 'News snippet' }
                ]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
        return buildSseUpstreamResponse(['Hello ', 'world']);
    };

    const engine = {
        id: 'engine-stream',
        category: 'Language',
        provider: 'pollinations',
        upstreamId: 'openai',
        configJson: JSON.stringify({ textTools: false }),
        requestUrl: 'https://upstream.test/chat',
        requestMethod: 'POST',
        requestHeaders: '{}',
        requestBodyTemplate: '{}',
        systemInstruction: '',
        apiKey: ''
    };

    const payload = {
        prompt: 'latest news',
        dynamicParams: { useSearch: true }
    };

    const { req, res, writes } = createReqRes();
    await __proxyTestUtils.orchestrateTextSandboxStream(engine, payload, req, res);

    const dataPayloads = parseSseDataPayloads(writes);
    const finalEventRaw = dataPayloads.filter((entry) => entry !== '[DONE]').pop();
    const finalEvent = JSON.parse(String(finalEventRaw || '{}'));

    assert.equal(finalEvent.done, true);
    assert.equal(finalEvent.content, 'Hello world');
    assert.equal(finalEvent.diagnostics.searchRequested, true);
    assert.equal(finalEvent.diagnostics.searchApplied, true);
    assert.equal(finalEvent.diagnostics.searchMode, 'fallback');
    assert.equal(finalEvent.diagnostics.searchProvider, 'tavily');
    assert.equal(Array.isArray(finalEvent.diagnostics.sources), true);
    assert.equal(finalEvent.diagnostics.sources.length, 1);
    assert.equal(finalEvent.diagnostics.sources[0].url, 'https://example.com/news');
    assert.equal(res.ended, true);
});

test('streaming: degraded fallback still returns content with searchWarning', async () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'fallback';
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    globalThis.fetch = async (url) => {
        const target = String(url || '');
        if (target.includes('api.tavily.com/search')) {
            throw new TypeError('Authorization: Bearer secret-token-xyz');
        }
        return buildSseUpstreamResponse(['Partial ', 'answer']);
    };

    const engine = {
        id: 'engine-stream-degraded',
        category: 'Language',
        provider: 'pollinations',
        upstreamId: 'openai',
        configJson: JSON.stringify({ textTools: false }),
        requestUrl: 'https://upstream.test/chat',
        requestMethod: 'POST',
        requestHeaders: '{}',
        requestBodyTemplate: '{}',
        systemInstruction: '',
        apiKey: ''
    };

    const payload = {
        prompt: 'policy updates',
        dynamicParams: { useSearch: true }
    };

    const { req, res, writes } = createReqRes();
    await __proxyTestUtils.orchestrateTextSandboxStream(engine, payload, req, res);

    const dataPayloads = parseSseDataPayloads(writes);
    const finalEventRaw = dataPayloads.filter((entry) => entry !== '[DONE]').pop();
    const finalEvent = JSON.parse(String(finalEventRaw || '{}'));

    assert.equal(finalEvent.done, true);
    assert.equal(finalEvent.content, 'Partial answer');
    assert.equal(finalEvent.diagnostics.searchRequested, true);
    assert.equal(finalEvent.diagnostics.searchApplied, false);
    assert.equal(finalEvent.diagnostics.searchMode, 'fallback');
    assert.equal(typeof finalEvent.diagnostics.searchWarning, 'string');
    assert.equal(finalEvent.diagnostics.searchWarning.length > 0, true);
    assert.equal(finalEvent.diagnostics.searchWarning.includes('secret-token-xyz'), false);
    assert.equal(Array.isArray(finalEvent.diagnostics.sources), true);
    assert.equal(finalEvent.diagnostics.sources.length, 0);
    assert.equal(res.ended, true);
});
