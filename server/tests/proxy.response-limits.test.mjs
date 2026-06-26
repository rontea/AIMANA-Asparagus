import test from 'node:test';
import assert from 'node:assert/strict';
import { __proxyTestUtils } from '../routes/proxy.js';

test('proxy: readTextWithLimit rejects oversized responses', async () => {
    const { readTextWithLimit } = __proxyTestUtils;
    const response = new Response('x'.repeat(2048), {
        headers: { 'Content-Type': 'text/plain' }
    });
    await assert.rejects(
        () => readTextWithLimit(response, 1024),
        /exceeded size limit/i
    );
});

test('proxy: readTextWithLimit allows small responses', async () => {
    const { readTextWithLimit } = __proxyTestUtils;
    const response = new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
    const out = await readTextWithLimit(response, 1024);
    assert.equal(out, 'ok');
});

test('proxy: readJsonWithLimit rejects oversized JSON payloads', async () => {
    const { readJsonWithLimit } = __proxyTestUtils;
    const payload = JSON.stringify({ data: 'x'.repeat(2048) });
    const response = new Response(payload, {
        headers: { 'Content-Type': 'application/json' }
    });
    await assert.rejects(
        () => readJsonWithLimit(response, 1024),
        /exceeded size limit/i
    );
});

test('proxy: readJsonWithLimit parses JSON within limit', async () => {
    const { readJsonWithLimit } = __proxyTestUtils;
    const response = new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
    const out = await readJsonWithLimit(response, 1024);
    assert.deepEqual(out, { ok: true });
});
