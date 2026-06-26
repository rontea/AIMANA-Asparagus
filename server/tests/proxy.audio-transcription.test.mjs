import test from 'node:test';
import assert from 'node:assert/strict';
import { __proxyTestUtils } from '../routes/proxy.js';

const ORIGINAL_FETCH = globalThis.fetch;

const createMockRes = () => ({
    headers: {},
    body: null,
    set(nextHeaders = {}) {
        this.headers = { ...this.headers, ...nextHeaders };
        return this;
    },
    send(payload) {
        this.body = payload;
        return this;
    }
});

test.afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
});

test('audio transcription forces multipart POST and strips JSON content-type headers for stale engine configs', async () => {
    const fetchCalls = [];

    globalThis.fetch = async (url, init = {}) => {
        fetchCalls.push({ url: String(url || ''), init });
        return new Response(JSON.stringify({ text: 'transcribed text' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    };

    const engine = {
        id: 'pollinations-whisper-1',
        label: 'Whisper 1',
        provider: 'pollinations',
        category: 'Audio',
        upstreamId: 'whisper-1',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/transcribe',
        requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
        requestBodyTemplate: '',
        responsePath: 'text',
        configJson: JSON.stringify({
            textInputModalities: ['audio'],
            textOutputModalities: ['text']
        }),
        apiKey: ''
    };

    const payload = {
        prompt: 'Please transcribe this audio.',
        audioData: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA',
        audioFormat: 'wav',
        dynamicParams: {
            response_format: 'text',
            temperature: 0
        }
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/transcribe');
    assert.equal(fetchCalls[0].init.method, 'POST');
    assert.equal(fetchCalls[0].init.body instanceof FormData, true);

    const forwardedHeaders = fetchCalls[0].init.headers || {};
    const headerNames = Object.keys(forwardedHeaders).map((key) => key.toLowerCase());
    assert.equal(headerNames.includes('content-type'), false);
    assert.equal(headerNames.includes('content-length'), false);
    assert.equal(res.body, 'transcribed text');
    assert.equal(res.headers['Content-Type'], 'text/plain');
});

test('audio transcription respects the explicit transcription flag from AI Creative uploads', async () => {
    const fetchCalls = [];

    globalThis.fetch = async (url, init = {}) => {
        fetchCalls.push({ url: String(url || ''), init });
        return new Response(JSON.stringify({ text: 'flagged transcription text' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    };

    const engine = {
        id: 'custom-audio-transcribe',
        label: 'Custom Audio Transcribe',
        provider: 'pollinations',
        category: 'Audio',
        upstreamId: 'scribe',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/custom-audio',
        requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
        requestBodyTemplate: '',
        responsePath: 'text',
        configJson: JSON.stringify({
            textInputModalities: ['text'],
            textOutputModalities: ['audio']
        }),
        apiKey: ''
    };

    const payload = {
        prompt: '',
        audioData: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEA',
        audioFormat: 'wav',
        isTranscription: true,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].init.method, 'POST');
    assert.equal(fetchCalls[0].init.body instanceof FormData, true);

    const forwardedHeaders = fetchCalls[0].init.headers || {};
    const headerNames = Object.keys(forwardedHeaders).map((key) => key.toLowerCase());
    assert.equal(headerNames.includes('content-type'), false);
    assert.equal(headerNames.includes('content-length'), false);
    assert.equal(res.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(String(res.body || '{}')), { text: 'flagged transcription text' });
});

test('audio TTS fills a default response format for stale Pollinations GET configs', async () => {
    const fetchCalls = [];

    globalThis.fetch = async (url, init = {}) => {
        fetchCalls.push({ url: String(url || ''), init });
        return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' }
        });
    };

    const engine = {
        id: 'pollinations-qwen3-tts',
        label: 'Qwen3 TTS',
        provider: 'pollinations',
        category: 'Audio',
        upstreamId: 'qwen3-tts',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/audio/{{prompt}}?model={{upstreamId}}',
        requestHeaders: '{"Accept":"audio/*"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: JSON.stringify({
            textInputModalities: ['text'],
            textOutputModalities: ['audio']
        }),
        apiKey: ''
    };

    const payload = {
        prompt: 'hello from aimana',
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    const targetUrl = new URL(fetchCalls[0].url);
    assert.equal(targetUrl.searchParams.get('response_format'), 'mp3');
    assert.equal(fetchCalls[0].init.method, 'GET');
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.equal(Buffer.isBuffer(res.body), true);
});
