import test from 'node:test';
import assert from 'node:assert/strict';
import { __loggerTestUtils } from '../db/logger.js';

test('audit logger normalization: collapses generic upstream html payloads', () => {
    const message = 'Synthesis fail [pollinations-klein]: <!DOCTYPE html><!--[if lt IE 7]><html lang="en-US"><head><title>502 Bad Gateway</title></head><body>Bad Gateway</body></html>';

    const out = __loggerTestUtils.normalizeAuditMessage(message);

    assert.match(out, /^Synthesis fail \[pollinations-klein\]: Upstream HTML error page \(502 Bad Gateway\)\.$/i);
    assert.doesNotMatch(out, /<!doctype html/i);
});

test('audit logger normalization: collapses cloudflare tunnel html payloads', () => {
    const message = 'Synthesis fail [pollinations-klein]: <!doctype html><html><head><title>Cloudflare Tunnel error | bpaigen.com | Cloudflare</title></head><body><h1>Error 1033</h1><p>Ensure that cloudflared is running and can reach the network.</p></body></html>';

    const out = __loggerTestUtils.normalizeAuditMessage(message);

    assert.match(out, /Cloudflare Tunnel error 1033/i);
    assert.doesNotMatch(out, /<!doctype html/i);
});
