import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
    SERVER_EXTENSION_ACCESS_LEVEL,
    SERVER_EXTENSION_BRIDGE_ACCESS,
    SERVER_EXTENSION_BRIDGE_RESOURCE
} from '@aimana/extension-sdk/server';
import {
    buildExtensionApiRouteMountPath,
    createExtensionApiRouter,
    validateExtensionServerApiManifest
} from '../extensions/api.js';
import { ExtensionStorageError, validateExtensionStorageQuery } from '../extensions/storage.js';

const createServer = async (app) => await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolve({
            server,
            baseUrl: `http://127.0.0.1:${address.port}`
        });
    });
});

const closeServer = async (server) => await new Promise((resolve, reject) => {
    server.close((error) => {
        if (error) {
            reject(error);
            return;
        }

        resolve();
    });
});

test('validates server extension API manifests and rejects over-privileged bridge access', () => {
    assert.throws(
        () =>
            validateExtensionServerApiManifest({
                id: 'unsafe-extension',
                version: '0.1.0',
                apiRoutes: [
                    {
                        id: 'unsafe-users',
                        method: 'get',
                        path: 'users',
                        authLevel: SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
                        bridge: [
                            {
                                resource: SERVER_EXTENSION_BRIDGE_RESOURCE.USERS,
                                access: SERVER_EXTENSION_BRIDGE_ACCESS.READ
                            }
                        ],
                        handler: async () => ({ body: { ok: true } })
                    }
                ]
            }),
        /must require admin access/i
    );
});

test('rejects duplicate server route registrations before mounting extension endpoints', () => {
    assert.throws(
        () =>
            validateExtensionServerApiManifest({
                id: 'unsafe-extension',
                version: '0.1.0',
                apiRoutes: [
                    {
                        id: 'duplicate-route',
                        method: 'get',
                        path: 'runs',
                        authLevel: SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
                        handler: async () => ({ body: { ok: true } })
                    },
                    {
                        id: 'duplicate-route',
                        method: 'get',
                        path: 'runs',
                        authLevel: SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
                        handler: async () => ({ body: { ok: true } })
                    }
                ]
            }),
        /reuses API route id/i
    );
});

test('mounts extension API routes through the host wrapper and enforces route auth', async () => {
    const app = express();
    const observedLogs = [];

    app.use(express.json());
    app.use((req, _res, next) => {
        const role = req.headers['x-test-role'];
        const userId = req.headers['x-test-user-id'];

        if (role || userId) {
            req.user = {
                id: typeof userId === 'string' ? userId : 'user-1',
                role: typeof role === 'string' ? role : 'user'
            };
        }

        next();
    });

    app.use(
        '/api/extensions',
        createExtensionApiRouter(
            {
                disabledBuiltInExtensionIds: [],
                installedExtensions: [
                    {
                        packageName: '@aimana/extension-test',
                        enabled: true,
                        manifests: [
                            {
                                id: 'test-extension',
                                version: '0.1.0',
                                apiRoutes: [
                                    {
                                        id: 'admin-ping',
                                        method: 'get',
                                        path: 'admin/ping',
                                        authLevel: SERVER_EXTENSION_ACCESS_LEVEL.ADMIN,
                                        handler: async ({ user }) => ({
                                            body: {
                                                ok: true,
                                                userId: user.id
                                            }
                                        })
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                logEvent: async (_level, _module, message) => {
                    observedLogs.push(message);
                },
                reportError: async () => null
            }
        )
    );

    const { server, baseUrl } = await createServer(app);

    try {
        const forbiddenResponse = await fetch(`${baseUrl}/api/extensions/test-extension/admin/ping`, {
            headers: {
                'x-test-user-id': 'user-1',
                'x-test-role': 'user'
            }
        });
        assert.equal(forbiddenResponse.status, 403);
        assert.equal((await forbiddenResponse.json()).code, 'extension_access_denied');

        const unauthenticatedResponse = await fetch(`${baseUrl}/api/extensions/test-extension/admin/ping`);
        assert.equal(unauthenticatedResponse.status, 403);
        assert.equal((await unauthenticatedResponse.json()).code, 'extension_access_denied');

        const allowedResponse = await fetch(`${baseUrl}/api/extensions/test-extension/admin/ping`, {
            headers: {
                'x-test-user-id': 'admin-1',
                'x-test-role': 'admin'
            }
        });
        assert.equal(allowedResponse.status, 200);
        assert.deepEqual(await allowedResponse.json(), {
            ok: true,
            userId: 'admin-1'
        });

        assert.ok(observedLogs.some((message) => message.includes('[extension:test-extension][route:admin-ping]')));
        assert.equal(buildExtensionApiRouteMountPath('test-extension', 'admin/ping'), '/test-extension/admin/ping');
    } finally {
        await closeServer(server);
    }
});

test('extension storage queries stay inside the extension namespace', () => {
    assert.equal(
        validateExtensionStorageQuery('semantic-forge', 'SELECT id FROM ext_semantic_forge_runs WHERE userId = ?'),
        'SELECT id FROM ext_semantic_forge_runs WHERE userId = ?'
    );

    assert.throws(
        () => validateExtensionStorageQuery('semantic-forge', 'SELECT id FROM users'),
        (error) => error instanceof ExtensionStorageError && /namespaced tables/i.test(error.message)
    );

    assert.throws(
        () => validateExtensionStorageQuery('semantic-forge', 'SELECT id FROM ext_semantic_forge_runs; DELETE FROM ext_semantic_forge_runs'),
        (error) => error instanceof ExtensionStorageError && /single SQL statement/i.test(error.message)
    );

    assert.throws(
        () => validateExtensionStorageQuery('semantic-forge', 'DROP TABLE ext_semantic_forge_runs'),
        (error) => error instanceof ExtensionStorageError && /unsupported storage query type/i.test(error.message)
    );
});
