import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicRegistryRow } from '../utils/registry.js';

test('toPublicRegistryRow removes secret and network execution fields', () => {
    const row = {
        id: 'engine-x',
        label: 'Engine X',
        description: 'desc',
        provider: 'custom',
        category: 'Visual',
        upstreamId: 'upstream',
        iconName: 'Cpu',
        efficiencyTier: 'Tier-Stable',
        uiConfigJson: '{"a":1}',
        featuresJson: '{"b":2}',
        capabilities: 'image,text',
        isSystem: 0,
        limits: 'Unlimited',
        isTested: 1,
        defaultNegativePrompt: 'no blur',
        verifiedPrompt: 'prompt',
        verificationNotes: 'notes',
        verifiedMimeType: 'image/png',
        verifiedParams: '{"seed":1}',
        isPaid: 0,
        isProgrammable: 1,
        apiKey: 'super-secret',
        requestUrl: 'https://example.com',
        requestHeaders: '{"Authorization":"Bearer x"}',
        requestBodyTemplate: '{"prompt":"{{prompt}}"}',
        responsePath: 'data.0.url',
        configJson: '{"legacy":true}'
    };

    const sanitized = toPublicRegistryRow(row);

    assert.equal(sanitized.id, 'engine-x');
    assert.equal(sanitized.label, 'Engine X');
    assert.equal(sanitized.apiKey, undefined);
    assert.equal(sanitized.requestUrl, undefined);
    assert.equal(sanitized.requestHeaders, undefined);
    assert.equal(sanitized.requestBodyTemplate, undefined);
    assert.equal(sanitized.responsePath, undefined);
    assert.equal(sanitized.configJson, undefined);
});

