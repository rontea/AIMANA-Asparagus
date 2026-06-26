import test from 'node:test';
import assert from 'node:assert/strict';
import { __proxyTestUtils } from '../routes/proxy.js';

test('upstream html normalization: Cloudflare tunnel page becomes actionable outage message', () => {
    const html = `
        <!doctype html>
        <html lang="en-US">
        <head>
          <title>Cloudflare Tunnel error | bpaigen.com | Cloudflare</title>
        </head>
        <body>
          <h1>Error 1033</h1>
          <p>Ensure that cloudflared is running and can reach the network.</p>
        </body>
        </html>
    `;

    const out = __proxyTestUtils.normalizeKnownUpstreamHtmlError({
        rawMessage: 'bpaigen API request failed: ' + html,
        rawBody: html,
        status: 530,
        engine: { id: 'pollinations-klein', label: 'Klein' }
    });

    assert.match(out, /Klein is temporarily unavailable/i);
    assert.match(out, /bpaigen\.com/i);
    assert.match(out, /Cloudflare Tunnel error 1033/i);
});

test('upstream html normalization: generic html error page becomes actionable provider message', () => {
    const html = `
        <!DOCTYPE html>
        <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
        <html lang="en-US">
        <head>
          <title>502 Bad Gateway</title>
        </head>
        <body>
          <h1>Bad Gateway</h1>
        </body>
        </html>
    `;

    const out = __proxyTestUtils.normalizeKnownUpstreamHtmlError({
        rawMessage: html,
        rawBody: html,
        status: 502,
        engine: { id: 'pollinations-klein', label: 'Klein' }
    });

    assert.match(out, /Klein failed/i);
    assert.match(out, /502 Bad Gateway/i);
    assert.doesNotMatch(out, /<!doctype html/i);
});

test('upstream log summary: Cloudflare 502 html is not logged verbatim', () => {
    const html = `
        <!DOCTYPE html>
        <html lang="en-US">
        <head>
          <title>502 Bad Gateway</title>
        </head>
        <body>
          <div class="w-240 lg:w-full mx-auto mb-8 lg:px-8">
            <h2>What happened?</h2>
            <p>The web server reported a bad gateway error.</p>
          </div>
        </body>
        </html>
    `;

    const out = __proxyTestUtils.summarizeUpstreamErrorForLog({
        rawMessage: html,
        rawBody: html,
        status: 502,
        engine: { id: 'pollinations-klein', label: 'Klein' }
    });

    assert.match(out, /Klein failed/i);
    assert.match(out, /502 Bad Gateway/i);
    assert.doesNotMatch(out, /<div class=/i);
    assert.doesNotMatch(out, /<!doctype html/i);
});

test('upstream json normalization: 522 unknown error becomes actionable timeout message', () => {
    const out = __proxyTestUtils.normalizeKnownUpstreamJsonError({
        rawMessage: 'error code: 522',
        payload: {
            success: false,
            status: 522,
            error: {
                message: 'error code: 522',
                code: 'UNKNOWN_ERROR'
            }
        },
        status: 522,
        engine: { id: 'pollinations-openai', label: 'OpenAI' }
    });

    assert.match(out, /OpenAI is temporarily unavailable/i);
    assert.match(out, /Cloudflare 522/i);
});

test('proxy error code resolver: reference-image upstream guidance maps to stable code', () => {
    const code = __proxyTestUtils.resolveProxyErrorCode(
        'Klein API request failed: Internal Server Error (Klein upstream failed while processing the reference image. Try the same prompt without a reference image, use a different publicly accessible image URL, or switch models.)'
    );
    assert.equal(code, 'REFERENCE_IMAGE_UPSTREAM_FAILURE');
});
