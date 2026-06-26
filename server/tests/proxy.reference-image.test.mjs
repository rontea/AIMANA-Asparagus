import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { __proxyTestUtils } from '../routes/proxy.js';
import { UPLOADS_DIR } from '../db.js';

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

test('chat media normalizer embeds private storage image URLs when temp hosting is unavailable', async () => {
    const relativePath = 'chat_media/admin_root/image/chat-private-reference.png';
    const physicalPath = path.join(UPLOADS_DIR, ...relativePath.split('/'));
    await fs.mkdir(path.dirname(physicalPath), { recursive: true });
    await fs.writeFile(
        physicalPath,
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=', 'base64')
    );

    const fetchCalls = [];
    globalThis.fetch = async (url) => {
        fetchCalls.push(String(url || ''));
        return new Response(JSON.stringify({ error: 'upload unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' }
        });
    };

    try {
        const warnings = [];
        const normalized = await __proxyTestUtils.normalizeChatMessagesForMedia([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'describe this image' },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `http://127.0.0.1:3101/storage/uploads/${relativePath}`
                        }
                    }
                ]
            }
        ], null, '', warnings);

        const imageUrl = normalized[0].content[1].image_url.url;
        assert.match(imageUrl, /^data:image\/png;base64,/);
        assert.doesNotMatch(imageUrl, /127\.0\.0\.1|\/storage\/uploads/);
        assert.ok(fetchCalls.length >= 1);
        assert.deepEqual(warnings, []);
    } finally {
        await fs.rm(physicalPath, { force: true });
    }
});

test('pollinations image routes forward reference images even when the engine template omits {{image}}', async () => {
    const fetchCalls = [];

    globalThis.fetch = async (url, init = {}) => {
        fetchCalls.push({ url: String(url || ''), init });
        return new Response(JSON.stringify({
            data: [
                {
                    b64_json: Buffer.from('reference-image-ok').toString('base64')
                }
            ]
        }), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-pollen-used': '0.25'
            }
        });
    };

    const engine = {
        id: 'pollinations-flux',
        label: 'Flux',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'flux',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=flux&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&nologo={{nologo}}&private={{private}}&nofeed={{nofeed}}&guidance={{guidance_scale}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-flux',
        prompt: 'Use the reference image composition',
        width: 1024,
        height: 1024,
        image: 'https://cdn.example.com/reference.png',
        seed: 1234,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/v1/images/edits');
    assert.equal(fetchCalls[0].init.method, 'POST');

    const forwardedBody = JSON.parse(String(fetchCalls[0].init.body || '{}'));
    assert.equal(forwardedBody.model, 'flux');
    assert.equal(forwardedBody.image, 'https://cdn.example.com/reference.png');
    assert.equal(forwardedBody.prompt, payload.prompt);

    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.equal(res.headers['X-Pollen-Used'], '0.25');
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'reference-image-ok');
});

test('pollinations image routes send data-uri references as multipart edits', async () => {
    const fetchCalls = [];
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=';

    globalThis.fetch = async (url, init = {}) => {
        const target = String(url || '');
        fetchCalls.push({ url: target, init });
        return new Response(JSON.stringify({
            data: [
                {
                    b64_json: Buffer.from('data-uri-reference-ok').toString('base64')
                }
            ]
        }), {
            status: 200,
            headers: {
                'content-type': 'application/json'
            }
        });
    };

    const engine = {
        id: 'pollinations-flux',
        label: 'Flux',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'flux',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=flux&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&nologo={{nologo}}&private={{private}}&nofeed={{nofeed}}&guidance={{guidance_scale}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-flux',
        prompt: 'Use the embedded reference image',
        width: 1024,
        height: 1024,
        image: dataUri,
        seed: 2468,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/v1/images/edits');
    assert.equal(fetchCalls[0].init.method, 'POST');
    assert.ok(fetchCalls[0].init.body instanceof FormData);
    assert.equal(fetchCalls[0].init.body.get('prompt'), payload.prompt);
    assert.equal(fetchCalls[0].init.body.get('model'), 'flux');
    assert.ok(fetchCalls[0].init.body.get('image') instanceof File);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'data-uri-reference-ok');
});

test('pollinations image routes keep explicit image query support for models that already include {{image}}', async () => {
    const fetchCalls = [];

    globalThis.fetch = async (url, init = {}) => {
        fetchCalls.push({ url: String(url || ''), init });
        return new Response(JSON.stringify({
            data: [
                {
                    b64_json: Buffer.from('existing-image-template-ok').toString('base64')
                }
            ]
        }), {
            status: 200,
            headers: {
                'content-type': 'application/json'
            }
        });
    };

    const engine = {
        id: 'pollinations-qwen-image',
        label: 'Qwen Image',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'qwen-image',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=qwen-image&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-qwen-image',
        prompt: 'Apply the source image faithfully',
        width: 768,
        height: 1024,
        image: 'https://cdn.example.com/source.jpg',
        seed: 5678,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/v1/images/edits');

    const forwardedBody = JSON.parse(String(fetchCalls[0].init.body || '{}'));
    assert.equal(forwardedBody.image, 'https://cdn.example.com/source.jpg');
    assert.equal(forwardedBody.size, '768x1024');
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'existing-image-template-ok');
});

test('generic response-path mapping decodes bare base64 image payloads instead of treating them as URLs', async () => {
    const fetchCalls = [];
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=';

    globalThis.fetch = async (url, init = {}) => {
        fetchCalls.push({ url: String(url || ''), init });
        return new Response(JSON.stringify({
            output: {
                image: pngBase64
            }
        }), {
            status: 200,
            headers: {
                'content-type': 'application/json',
                'x-pollen-used': '0.4'
            }
        });
    };

    const engine = {
        id: 'pollinations-klein',
        label: 'Klein',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'klein',
        requestMethod: 'POST',
        requestUrl: 'https://provider.example/render',
        requestHeaders: '{"Content-Type":"application/json"}',
        requestBodyTemplate: '{"prompt":"{{prompt_json}}"}',
        responsePath: 'output.image',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-klein',
        prompt: 'Return bare base64',
        width: 1024,
        height: 1024,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://provider.example/render');
    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.equal(res.headers['X-Pollen-Used'], '0.4');
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('base64'), pngBase64);
});

test('klein sends data-uri reference images as multipart edits', async () => {
    const fetchCalls = [];
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=';

    globalThis.fetch = async (url, init = {}) => {
        const target = String(url || '');
        fetchCalls.push({ url: target, init });
        if (target === 'https://gen.pollinations.ai/v1/images/edits') {
            return new Response(JSON.stringify({
                data: [
                    {
                        b64_json: Buffer.from('klein-public-url-ok').toString('base64')
                    }
                ]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        throw new Error(`Unexpected fetch target: ${target}`);
    };

    const engine = {
        id: 'pollinations-klein',
        label: 'Klein',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'klein',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=klein&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-klein',
        prompt: 'Use reference image',
        width: 1024,
        height: 1024,
        image: dataUri,
        seed: 1357,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/v1/images/edits');
    assert.ok(fetchCalls[0].init.body instanceof FormData);
    assert.equal(fetchCalls[0].init.body.get('model'), 'klein');
    assert.ok(fetchCalls[0].init.body.get('image') instanceof File);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'klein-public-url-ok');
});

test('klein converts bare base64 reference image input into multipart image file', async () => {
    const fetchCalls = [];
    const bareBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=';

    globalThis.fetch = async (url, init = {}) => {
        const target = String(url || '');
        fetchCalls.push({ url: target, init });
        if (target === 'https://gen.pollinations.ai/v1/images/edits') {
            return new Response(JSON.stringify({
                data: [
                    {
                        b64_json: Buffer.from('klein-bare-base64-ok').toString('base64')
                    }
                ]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        throw new Error(`Unexpected fetch target: ${target}`);
    };

    const engine = {
        id: 'pollinations-klein',
        label: 'Klein',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'klein',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=klein&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-klein',
        prompt: 'Use bare base64 reference image',
        width: 1024,
        height: 1024,
        image: bareBase64,
        seed: 24680,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/v1/images/edits');
    assert.ok(fetchCalls[0].init.body instanceof FormData);
    assert.equal(fetchCalls[0].init.body.get('model'), 'klein');
    assert.ok(fetchCalls[0].init.body.get('image') instanceof File);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'klein-bare-base64-ok');
});

test('klein supports Checkpoint controls reference image via dynamicParams.image', async () => {
    const fetchCalls = [];
    const bareBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=';

    globalThis.fetch = async (url, init = {}) => {
        const target = String(url || '');
        fetchCalls.push({ url: target, init });
        if (target === 'https://gen.pollinations.ai/v1/images/edits') {
            return new Response(JSON.stringify({
                data: [
                    {
                        b64_json: Buffer.from('checkpoint-dynamic-image-ok').toString('base64')
                    }
                ]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        throw new Error(`Unexpected fetch target: ${target}`);
    };

    const engine = {
        id: 'pollinations-klein',
        label: 'Klein',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'klein',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=klein&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-klein',
        prompt: 'Use Checkpoint dynamic image',
        width: 1024,
        height: 1024,
        image: '',
        seed: 97531,
        dynamicParams: {
            image: bareBase64
        }
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://gen.pollinations.ai/v1/images/edits');
    assert.ok(fetchCalls[0].init.body instanceof FormData);
    assert.equal(fetchCalls[0].init.body.get('model'), 'klein');
    assert.ok(fetchCalls[0].init.body.get('image') instanceof File);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'checkpoint-dynamic-image-ok');
});

test('reference image upstream internal errors return actionable guidance', async () => {
    globalThis.fetch = async (url) => {
        const target = String(url || '');
        if (target === 'https://gen.pollinations.ai/v1/images/edits') {
            return new Response(JSON.stringify({
                success: false,
                error: {
                    message: 'Klein API request failed: Internal Server Error',
                    code: 'INTERNAL_ERROR',
                    details: {
                        name: 'UpstreamError',
                        upstreamStatus: 500
                    }
                },
                status: 500
            }), {
                status: 500,
                headers: { 'content-type': 'application/json' }
            });
        }
        throw new Error(`Unexpected fetch target: ${target}`);
    };

    const engine = {
        id: 'pollinations-qwen-image',
        label: 'Qwen Image',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'qwen-image',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=qwen-image&width={{width}}&height={{height}}&seed={{seed}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-qwen-image',
        prompt: 'apply this reference',
        width: 1024,
        height: 1024,
        image: 'https://cdn.example.com/reference.png',
        seed: 1122,
        dynamicParams: {}
    };

    const res = createMockRes();

    await assert.rejects(
        () => __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null),
        /reference image|without a reference image|switch models/i
    );
});

test('pollinations openai image route decodes base64 returned in url field', async () => {
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX0AAAAASUVORK5CYII=';

    globalThis.fetch = async (url) => {
        const target = String(url || '');
        if (target === 'https://gen.pollinations.ai/v1/images/edits') {
            return new Response(JSON.stringify({
                data: [
                    {
                        url: base64Image
                    }
                ]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
        throw new Error(`Unexpected fetch target: ${target}`);
    };

    const engine = {
        id: 'pollinations-qwen-image',
        label: 'Qwen Image',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'qwen-image',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=qwen-image&width={{width}}&height={{height}}&seed={{seed}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-qwen-image',
        prompt: 'apply this reference',
        width: 1024,
        height: 1024,
        image: 'https://cdn.example.com/reference.png',
        seed: 2468,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.equal(res.body.toString('base64'), base64Image);
});

test('pollinations openai image route falls back to b64_json when returned url is unreachable', async () => {
    const base64Image = Buffer.from('qwen-b64-fallback-ok').toString('base64');
    const fetchCalls = [];

    globalThis.fetch = async (url) => {
        const target = String(url || '');
        fetchCalls.push(target);
        if (target === 'https://gen.pollinations.ai/v1/images/edits') {
            return new Response(JSON.stringify({
                data: [
                    {
                        url: 'https://cdn.example.com/unreachable-result.png',
                        b64_json: base64Image
                    }
                ]
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
        if (target === 'https://cdn.example.com/unreachable-result.png') {
            throw new TypeError('fetch failed');
        }
        throw new Error(`Unexpected fetch target: ${target}`);
    };

    const engine = {
        id: 'pollinations-qwen-image',
        label: 'Qwen Image',
        provider: 'pollinations',
        category: 'Visual',
        upstreamId: 'qwen-image',
        requestMethod: 'GET',
        requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=qwen-image&width={{width}}&height={{height}}&seed={{seed}}&image={{image}}',
        requestHeaders: '{"Accept":"image/png"}',
        requestBodyTemplate: '',
        responsePath: '',
        configJson: '{}',
        apiKey: ''
    };

    const payload = {
        model: 'pollinations-qwen-image',
        prompt: 'apply this reference',
        width: 1024,
        height: 1024,
        image: 'https://cdn.example.com/reference.png',
        seed: 9753,
        dynamicParams: {}
    };

    const res = createMockRes();

    await __proxyTestUtils.orchestrateInference(engine, payload, res, 'anonymous', null);

    assert.deepEqual(fetchCalls, [
        'https://gen.pollinations.ai/v1/images/edits',
        'https://cdn.example.com/unreachable-result.png'
    ]);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString('utf8'), 'qwen-b64-fallback-ok');
    assert.equal(res.headers['Content-Type'], 'image/png');
});
