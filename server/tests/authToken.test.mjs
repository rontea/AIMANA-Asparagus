import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthToken, verifyAuthToken } from '../utils/authToken.js';

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
        process.env[key] = value;
    }
};

test.afterEach(() => {
    restoreEnv();
});

test('authToken: refuses to issue tokens with default secret outside dev/test', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;

    assert.throws(() => createAuthToken({ sub: 'user-1', role: 'user' }), /AUTH_SECRET must be set/i);
});

test('authToken: verify returns null when secret is unsafe outside dev/test', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_SECRET;

    const result = verifyAuthToken('bad.token');
    assert.equal(result, null);
});

test('authToken: issue and verify works with non-default secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_SECRET = 'unit-test-secret-123';

    const token = createAuthToken({ sub: 'user-2', role: 'admin' }, 60);
    const payload = verifyAuthToken(token);
    assert.ok(payload);
    assert.equal(payload.sub, 'user-2');
    assert.equal(payload.role, 'admin');
});
