import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import promptAssistantRoutes from '../routes/prompt-assistant.js';
import { dbRun } from '../db.js';
import { initRagSchema } from '../db/schema/rag.js';
import { __ragIndexTestUtils } from '../services/ragIndexService.js';
import { __promptAssistantTestUtils } from '../services/promptAssistantService.js';

const TEST_PREFIX = 'test-prompt-assistant-route';
const PROJECT_ID = 'test-route-project';
const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
        if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
        process.env[key] = value;
    }
};

const cleanupRagRows = async () => {
    await dbRun('DELETE FROM rag_chunks WHERE id LIKE ?', [`${TEST_PREFIX}:%`]);
};

const insertRouteChunk = async () => {
    const now = Date.now();
    await dbRun(`
        INSERT INTO rag_chunks (
            id, sourceType, sourceId, sourceRoute, title, chunkText, contentHash, metadataJson,
            visibility, ownerId, projectId, itemId, collectionId, revisionId,
            accessPolicyJson, allowedRolesJson,
            embeddingModel, embeddingDimensions, embeddingJson, indexVersion, indexedAt,
            sourceUpdatedAt, updatedAt
        )
        VALUES (?, 'prompts', ?, '/prompt-manager', 'Route Test Prompt', ?, ?, ?, 'project', 'owner-1', ?, '', '', '', ?, ?, 'test-embedding', 3, ?, 'rag-v1', ?, ?, ?)
    `, [
        `${TEST_PREFIX}:chunk`,
        `${TEST_PREFIX}:source`,
        'Prompt: Create a focused route-test prompt with neon search context.',
        `${TEST_PREFIX}:hash`,
        JSON.stringify({ projectName: 'Route Test Project' }),
        PROJECT_ID,
        JSON.stringify({ public: false, allowedUserIds: ['user-1'], projectId: PROJECT_ID }),
        JSON.stringify(['admin']),
        JSON.stringify([1, 0, 0]),
        now,
        now,
        now
    ]);
};

const createTestServer = async ({ getChatClient, getEmbeddingsClient } = {}) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: 'user-1', role: 'user' };
        const embeddingsClient = getEmbeddingsClient?.() || (async ({ input }) => (
            input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }))
        ));
        const chatClient = getChatClient?.() || (async () => ({
            content: 'Use Route Test Prompt as the grounded source. Source: /prompt-manager.',
            model: 'mock-chat',
            usage: { total_tokens: 18 }
        }));
        __ragIndexTestUtils.runWithEmbeddingsClient(embeddingsClient, () => {
            __promptAssistantTestUtils.runWithChatCompletionClient(chatClient, next);
        });
    });
    app.use('/api/prompt-assistant', promptAssistantRoutes);
    app.use((err, _req, res, _next) => {
        res.status(err?.status || 500).json({ error: err?.message || 'test route error' });
    });

    const server = await new Promise((resolve) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const address = server.address();
    return {
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
};

const postJson = async (baseUrl, path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload };
};

test.before(async () => {
    await initRagSchema();
    await cleanupRagRows();
});

test('prompt assistant route caches repeated grounded requests while index is unchanged', async () => {
    process.env.RAG_ENABLED = 'true';
    await insertRouteChunk();
    let chatCalls = 0;
    let embeddingCalls = 0;

    const server = await createTestServer({
        getChatClient: () => async () => {
            chatCalls += 1;
            return {
                content: 'Cached Route Test Prompt answer.',
                model: 'mock-chat',
                usage: { total_tokens: 12 }
            };
        },
        getEmbeddingsClient: () => async ({ input }) => {
            embeddingCalls += 1;
            return input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }));
        }
    });

    try {
        const body = {
            message: 'find neon search context',
            intent: 'idea_search',
            filters: { projectId: PROJECT_ID, sourceType: 'prompts' },
            topK: 5
        };
        const first = await postJson(server.url, '/api/prompt-assistant/chat', body);
        const second = await postJson(server.url, '/api/prompt-assistant/chat', body);

        assert.equal(first.response.status, 200);
        assert.equal(second.response.status, 200);
        assert.equal(first.payload.answer, 'Cached Route Test Prompt answer.');
        assert.equal(second.payload.answer, 'Cached Route Test Prompt answer.');
        assert.equal(chatCalls, 1);
        assert.equal(embeddingCalls, 1);
    } finally {
        await server.close();
    }
});

test.afterEach(async () => {
    __ragIndexTestUtils.resetEmbeddingsClient();
    __promptAssistantTestUtils.resetChatCompletionClient();
    restoreEnv();
    await cleanupRagRows();
});

test('prompt assistant route returns grounded happy-path and no-source chat responses', async () => {
    process.env.RAG_ENABLED = 'true';
    await insertRouteChunk();
    let currentChatClient = async () => ({
        content: 'Use Route Test Prompt as the grounded source. Source: /prompt-manager.',
        model: 'mock-chat',
        usage: { total_tokens: 18 }
    });

    const server = await createTestServer({ getChatClient: () => currentChatClient });
    try {
        const { response, payload } = await postJson(server.url, '/api/prompt-assistant/chat', {
            message: 'find neon search context',
            intent: 'idea_search',
            filters: { projectId: PROJECT_ID, sourceType: 'prompts' }
        });

        assert.equal(response.status, 200);
        assert.equal(payload.success, true);
        assert.equal(payload.noSource, false);
        assert.equal(payload.matchCount, 1);
        assert.equal(payload.sources[0].title, 'Route Test Prompt');
        assert.match(payload.answer, /Route Test Prompt/);

        let chatCalled = false;
        currentChatClient = async () => {
            chatCalled = true;
            return { content: 'should not be called', model: 'mock-chat' };
        };
        const noSource = await postJson(server.url, '/api/prompt-assistant/chat', {
            message: 'missing context',
            intent: 'idea_search',
            filters: { projectId: `${PROJECT_ID}-empty`, sourceType: 'prompts' }
        });

        assert.equal(noSource.response.status, 200);
        assert.equal(noSource.payload.success, true);
        assert.equal(noSource.payload.noSource, true);
        assert.equal(noSource.payload.matchCount, 0);
        assert.deepEqual(noSource.payload.sources, []);
        assert.equal(chatCalled, false);
    } finally {
        await server.close();
    }
});
