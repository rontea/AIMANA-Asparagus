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

test('integration (mocked provider): grounded fallback response includes at least one citation/source URL', async () => {
    process.env.CHAT_WEB_SEARCH_MODE = 'fallback';
    process.env.CHAT_WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'test-key';

    const sourceUrl = 'https://example.com/article';

    globalThis.fetch = async (url, init) => {
        const target = String(url || '');
        if (target.includes('api.tavily.com/search')) {
            return jsonResponse({
                results: [
                    { title: 'Example Article', url: sourceUrl, content: 'Important facts.' }
                ]
            });
        }

        const body = JSON.parse(String(init?.body || '{}'));
        const systemPrelude = String(body?.messages?.[0]?.content || '');
        assert.match(systemPrelude, /WEB_SEARCH_CONTEXT_V1/);
        assert.match(systemPrelude, /https:\/\/example\.com\/article/);

        return jsonResponse({
            content: `Grounded summary with citation: ${sourceUrl}`,
            choices: [{ message: { content: `Grounded summary with citation: ${sourceUrl}` } }]
        });
    };

    const engine = {
        id: 'engine-integration',
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

    const out = await __proxyTestUtils.orchestrateTextSandbox(engine, {
        prompt: 'Summarize latest updates',
        dynamicParams: { useSearch: true }
    });

    assert.equal(typeof out.content, 'string');
    assert.match(out.content, /https:\/\/example\.com\/article/);
    assert.equal(out.diagnostics.searchRequested, true);
    assert.equal(out.diagnostics.searchApplied, true);
    assert.equal(out.diagnostics.searchMode, 'fallback');
    assert.equal(Array.isArray(out.diagnostics.sources), true);
    assert.equal(out.diagnostics.sources.length > 0, true);
    assert.equal(out.diagnostics.sources[0].url, sourceUrl);
});

test('integration (mocked provider): NVIDIA language engine uses NIM chat completion payload', async () => {
    let captured = null;

    globalThis.fetch = async (url, init) => {
        captured = {
            url: String(url || ''),
            headers: init?.headers || {},
            body: JSON.parse(String(init?.body || '{}'))
        };

        return jsonResponse({
            choices: [{ message: { content: 'NVIDIA response' } }]
        });
    };

    const engine = {
        id: 'nvidia-minimax-m3',
        category: 'Language',
        provider: 'nvidia',
        upstreamId: 'minimaxai/minimax-m3',
        configJson: JSON.stringify({
            textTools: false,
            textInputModalities: ['text', 'image', 'video'],
            textOutputModalities: ['text']
        }),
        requestUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        requestMethod: 'POST',
        requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
        requestBodyTemplate: '{"model":"{{upstreamId}}","messages":[{"role":"user","content":{{prompt_json}}}],"temperature":{{temperature}},"top_p":{{top_p}},"max_tokens":{{max_tokens}},"stream":false}',
        responsePath: 'choices.0.message.content',
        systemInstruction: '',
        apiKey: 'test-nvidia-key'
    };

    const out = await __proxyTestUtils.orchestrateTextSandbox(engine, {
        prompt: 'hello',
        temperature: 1,
        max_tokens: 8192,
        dynamicParams: { top_p: 0.95 }
    });

    assert.equal(out.content, 'NVIDIA response');
    assert.equal(captured.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(captured.headers.Authorization, 'Bearer test-nvidia-key');
    assert.equal(captured.body.model, 'minimaxai/minimax-m3');
    assert.equal(captured.body.temperature, 1);
    assert.equal(captured.body.top_p, 0.95);
    assert.equal(captured.body.max_tokens, 8192);
    assert.equal(captured.body.stream, false);
    assert.equal(captured.body.messages[0].role, 'user');
});
