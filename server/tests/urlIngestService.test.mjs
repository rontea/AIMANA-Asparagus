import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestUrls } from '../services/urlIngestService.js';

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

const textResponse = (payload, status = 200, contentType = 'text/html') => new Response(
    payload,
    { status, headers: { 'Content-Type': contentType } }
);

test.afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreEnv();
});

test('ingests basic HTML content into readable text with title', async () => {
    globalThis.fetch = async () => textResponse(
        '<html><head><title>Example Page</title></head><body><h1>Hello</h1><p>World</p></body></html>',
        200,
        'text/html'
    );

    const out = await ingestUrls({
        urls: ['https://example.com/page'],
        maxLinks: 1,
        maxChars: 2000,
        maxBytes: 20000,
        timeoutMs: 2000
    });

    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].title, 'Example Page');
    assert.equal(out.items[0].url, 'https://example.com/page');
    assert.equal(out.items[0].content.includes('Hello'), true);
    assert.equal(out.sources.length, 1);
    assert.equal(out.sources[0].title, 'Example Page');
});

test('blocks private network targets with a warning', async () => {
    const out = await ingestUrls({
        urls: ['http://127.0.0.1/private']
    });

    assert.equal(out.items.length, 0);
    assert.equal(out.sources.length, 0);
    assert.match(out.warning, /blocked/i);
});

test('falls back to YouTube metadata when transcript is unavailable', async () => {
    globalThis.fetch = async (url) => {
        const raw = String(url);
        if (raw.includes('api/timedtext')) {
            return textResponse('', 200, 'application/json');
        }
        if (raw.includes('oembed')) {
            return textResponse(JSON.stringify({
                title: 'Test Video',
                author_name: 'Test Channel',
                author_url: 'https://youtube.com/@test'
            }), 200, 'application/json');
        }
        return textResponse('', 404, 'text/plain');
    };

    const out = await ingestUrls({
        urls: ['https://www.youtube.com/watch?v=abc123def45'],
        maxLinks: 1
    });

    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].title, 'Test Video');
    assert.equal(out.items[0].note.includes('Transcript unavailable'), true);
    assert.match(out.warning, /transcript/i);
});
