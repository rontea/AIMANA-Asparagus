import assert from 'node:assert/strict';
import test from 'node:test';
import settings from '../routes/settings.js';
import { dbGet, dbRun } from '../db/connection.js';
import { initIntelligenceSchema } from '../db/schema/intelligence.js';
import { initSystemSchema } from '../db/schema/system.js';

test('image sync preserves GPT image controls through catalog aliases', async (t) => {
    await initIntelligenceSchema();
    await initSystemSchema();
    await dbRun('BEGIN');
    t.after(() => dbRun('ROLLBACK'));
    const name = 'openai/gpt-image-1.5';
    t.mock.method(globalThis, 'fetch', async () => Response.json([{
        name, aliases: ['gptimage-large'], input_modalities: ['text', 'image'],
        output_modalities: ['image'], pricing: { completionImageTokens: 0.00003 }
    }]));
    const handler = settings.stack.find((layer) =>
        layer.route?.path === '/registry/sync/pollinations-image'
    ).route.stack.at(-1).handle;
    let result;
    await handler({ user: { id: 'system' } }, {
        json: (value) => { result = value; },
        status: (status) => { assert.equal(status, 200); }
    });
    assert.equal(result.success, true);
    const row = await dbGet('SELECT * FROM custom_engines WHERE upstreamId = ?', [name]);
    assert.ok(row, 'canonical model must survive sync without an alias fallback overwriting it');
    assert.match(row.requestUrl, /quality=\{\{quality\}\}/);
    assert.match(row.requestUrl, /transparent=\{\{transparent\}\}/);
    const controls = JSON.parse(row.uiConfigJson).map((control) => control.key);
    assert.ok(controls.includes('quality'));
    assert.ok(controls.includes('transparent'));
});

test('video sync preserves Veo audio and duration controls through aliases', async (t) => {
    await initIntelligenceSchema();
    await initSystemSchema();
    await dbRun('BEGIN');
    t.after(() => dbRun('ROLLBACK'));
    const name = 'google/veo-3.1-fast';
    t.mock.method(globalThis, 'fetch', async () => Response.json([{
        name, aliases: ['veo'], input_modalities: ['text', 'image'],
        output_modalities: ['video', 'audio']
    }]));
    const handler = settings.stack.find((layer) =>
        layer.route?.path === '/registry/sync/pollinations-video'
    ).route.stack.at(-1).handle;
    await handler({ user: { id: 'system' } }, {
        json: (value) => assert.equal(value.success, true),
        status: (status) => { assert.equal(status, 200); }
    });
    const row = await dbGet('SELECT * FROM custom_engines WHERE upstreamId = ?', [name]);
    assert.match(row.requestUrl, /audio=\{\{audio\}\}/);
    const controls = JSON.parse(row.uiConfigJson);
    assert.ok(controls.some((control) => control.key === 'audio'));
    assert.deepEqual(controls.find((control) => control.key === 'duration').options.map((option) => option.value), [4, 6, 8]);
});
