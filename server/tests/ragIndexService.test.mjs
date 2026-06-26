import test from 'node:test';
import assert from 'node:assert/strict';
import { dbRun } from '../db.js';
import { initRagSchema } from '../db/schema/rag.js';
import { __ragIndexTestUtils, cosineSimilarity, retrieveRagContext } from '../services/ragIndexService.js';

const TEST_PREFIX = 'test-rag-integration';

const cleanupRagRows = async () => {
    await dbRun('DELETE FROM rag_chunks WHERE id LIKE ?', [`${TEST_PREFIX}:%`]);
};

const insertRagChunk = async ({
    id,
    sourceType = 'prompts',
    sourceId = id,
    sourceRoute = '/prompt-manager',
    title = 'Test Prompt',
    chunkText = 'Prompt: neon portrait creative direction',
    visibility = 'project',
    ownerId = 'owner-1',
    projectId = 'test-rag-project',
    embeddingJson = JSON.stringify([1, 0, 0]),
    accessPolicy = { public: false, allowedUserIds: ['user-1'] }
} = {}) => {
    await dbRun(`
        INSERT INTO rag_chunks (
            id, sourceType, sourceId, sourceRoute, title, chunkText, contentHash, metadataJson,
            visibility, ownerId, projectId, itemId, collectionId, revisionId,
            accessPolicyJson, allowedRolesJson,
            embeddingModel, embeddingDimensions, embeddingJson, indexVersion, indexedAt,
            sourceUpdatedAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, ?, ?, ?, 'rag-v1', ?, ?, ?)
    `, [
        id,
        sourceType,
        sourceId,
        sourceRoute,
        title,
        chunkText,
        `${id}:hash`,
        JSON.stringify({ test: true }),
        visibility,
        ownerId,
        projectId,
        JSON.stringify(accessPolicy),
        JSON.stringify(['admin']),
        'test-embedding',
        3,
        embeddingJson,
        Date.now(),
        Date.now(),
        Date.now()
    ]);
};

test.before(async () => {
    await initRagSchema();
    await cleanupRagRows();
});

test.afterEach(async () => {
    __ragIndexTestUtils.resetEmbeddingsClient();
    await cleanupRagRows();
});

test('cosineSimilarity returns 1 for identical vectors', () => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('cosineSimilarity returns 0 for invalid or mismatched vectors', () => {
    assert.equal(cosineSimilarity([], [1, 2]), 0);
    assert.equal(cosineSimilarity([1, 2], [1]), 0);
    assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
});

test('cosineSimilarity ranks related direction above opposite direction', () => {
    const related = cosineSimilarity([1, 1], [2, 2]);
    const opposite = cosineSimilarity([1, 1], [-2, -2]);
    assert.ok(related > opposite);
    assert.ok(opposite < 0);
});

test('local fallback embeddings rank repeated keywords above unrelated text', () => {
    const query = __ragIndexTestUtils.createLocalEmbedding('neon portrait prompt');
    const related = __ragIndexTestUtils.createLocalEmbedding('cinematic neon portrait prompt direction');
    const unrelated = __ragIndexTestUtils.createLocalEmbedding('database backup and maintenance schedule');

    assert.ok(cosineSimilarity(query, related) > cosineSimilarity(query, unrelated));
});

test('retrieveRagContext scores local index chunks when primary query embeddings use another dimension', async () => {
    __ragIndexTestUtils.setEmbeddingsClient(async ({ input }) => (
        input.map(() => ({ embedding: [1, 0, 0, 0], model: 'remote-test-embedding' }))
    ));

    await insertRagChunk({
        id: `${TEST_PREFIX}:local-dimension`,
        title: 'Local Neon Prompt',
        chunkText: 'Prompt: neon portrait prompt with cinematic rain',
        projectId: 'test-rag-local-dimension',
        embeddingJson: JSON.stringify(__ragIndexTestUtils.createLocalEmbedding('Prompt: neon portrait prompt with cinematic rain')),
        accessPolicy: { public: false, allowedUserIds: ['user-1'] }
    });

    await dbRun(
        'UPDATE rag_chunks SET embeddingModel = ?, embeddingDimensions = ? WHERE id = ?',
        ['aimana-local-hash-v1', 384, `${TEST_PREFIX}:local-dimension`]
    );

    const result = await retrieveRagContext({
        query: 'neon portrait prompt',
        user: { id: 'user-1', role: 'user' },
        topK: 3,
        filters: { projectId: 'test-rag-local-dimension', sourceType: 'prompts' }
    });

    assert.equal(result.matches.length, 1);
    assert.equal(result.sources[0].title, 'Local Neon Prompt');
    assert.ok(result.sources[0].score > 0);
});

test('chunkDocument splits long source text while preserving citation metadata', () => {
    const chunks = __ragIndexTestUtils.chunkDocument({
        sourceType: 'project-items',
        sourceId: 'item-1',
        sourceRoute: '/project/project-1?itemId=item-1',
        title: 'Long item',
        visibility: 'project',
        projectId: 'project-1',
        chunkText: [
            'Title: Long item',
            'Prompt: a compact prompt paragraph',
            'Notes: a second compact paragraph',
            'Generation metadata: a third compact paragraph'
        ].join('\n')
    }, 54);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.sourceId === 'item-1'));
    assert.ok(chunks.every((chunk) => chunk.sourceRoute === '/project/project-1?itemId=item-1'));
    assert.ok(chunks.every((chunk) => chunk.visibility === 'project'));
});

test('buildItemDocument maps prompt item metadata and access policy without public visibility', () => {
    const doc = __ragIndexTestUtils.buildItemDocument({
        itemId: 'item-1',
        projectId: 'project-1',
        collectionId: 'collection-1',
        itemUpdatedAt: 123,
        projectName: 'Prompt Workspace',
        projectDescription: 'Reusable prompt library',
        projectType: 'prompt',
        projectSystemKey: '',
        ownerId: 'owner-1',
        memberAccess: 'member-1:editor,viewer-1:viewer',
        collectionName: 'Ready Prompts',
        revisionId: 'rev-1',
        revisionTitle: 'Portrait Prompt',
        label: 'portrait',
        tags: 'portrait, studio',
        prompt: 'Create a cinematic portrait.',
        engine: 'pollinations-openai',
        note: 'Use with character briefs.',
        aiParameters: JSON.stringify({
            advanced_params: {
                variables: ['subject', 'lighting'],
                intent: 'portrait',
                negative_prompt: 'blur'
            }
        }),
        mimeType: 'text/plain',
        originalFilename: 'portrait.txt'
    });

    assert.equal(doc.sourceType, 'prompts');
    assert.equal(doc.visibility, 'project');
    assert.equal(doc.accessPolicy.public, false);
    assert.equal(doc.accessPolicy.ownerId, 'owner-1');
    assert.deepEqual(doc.accessPolicy.allowedUserIds.sort(), ['member-1', 'owner-1', 'viewer-1'].sort());
    assert.ok(doc.accessPolicy.allowedRoles.includes('admin'));
    assert.equal(doc.metadata.collectionName, 'Ready Prompts');
    assert.equal(doc.metadata.negativePrompt, 'blur');
    assert.match(doc.chunkText, /Prompt: Create a cinematic portrait/);
});

test('buildProjectDocument stores project visibility and role metadata per chunk source', () => {
    const doc = __ragIndexTestUtils.buildProjectDocument({
        id: 'project-1',
        name: 'Private Ideas',
        description: 'Private creative direction.',
        projectType: 'image',
        defaultEngine: 'pollinations',
        ownerId: 'owner-1',
        memberAccess: 'member-1:editor',
        updatedAt: 1000,
        createdAt: 500,
        itemCount: 3,
        collectionCount: 1,
        isSystem: 0,
        systemKey: ''
    });

    assert.equal(doc.sourceType, 'projects');
    assert.equal(doc.visibility, 'project');
    assert.equal(doc.accessPolicy.public, false);
    assert.deepEqual(doc.accessPolicy.allowedUserIds.sort(), ['member-1', 'owner-1'].sort());
    assert.ok(doc.accessPolicy.allowedRoles.includes('owner'));
    assert.ok(doc.accessPolicy.allowedRoles.includes('editor'));
});

test('buildItemDocument maps Neural Archive items as manifest sources with revision context', () => {
    const doc = __ragIndexTestUtils.buildItemDocument({
        itemId: 'archive-item-1',
        projectId: 'archive-project-1',
        itemUpdatedAt: 2000,
        projectName: 'Neural Saved',
        projectDescription: 'Automatic history of generated content.',
        projectType: 'image',
        projectSystemKey: 'neural-saved',
        projectIsSystem: 1,
        ownerId: 'owner-1',
        memberAccess: 'owner-1:owner',
        revisionId: 'revision-1',
        revisionTitle: 'Archive Manifest Entry',
        label: 'manifest',
        tags: 'archive, prompt',
        prompt: 'A saved prompt from an archived generation.',
        note: 'Version metadata retained for prompt reuse.',
        aiParameters: '{}',
        mimeType: 'image/png',
        originalFilename: 'archive.png'
    });

    assert.equal(doc.sourceType, 'manifests');
    assert.equal(doc.accessPolicy.isSystem, true);
    assert.equal(doc.accessPolicy.systemKey, 'neural-saved');
    assert.equal(doc.revisionId, 'revision-1');
    assert.match(doc.chunkText, /Version metadata retained/);
});

test('canAccessRagRow enforces server-side permission metadata', async () => {
    const privateRow = {
        visibility: 'project',
        ownerId: 'owner-1',
        projectId: '',
        accessPolicyJson: JSON.stringify({
            public: false,
            allowedUserIds: ['owner-1', 'member-1']
        })
    };

    assert.equal(await __ragIndexTestUtils.canAccessRagRow(privateRow, { id: 'member-1', role: 'user' }), true);
    assert.equal(await __ragIndexTestUtils.canAccessRagRow(privateRow, { id: 'stranger-1', role: 'user' }), false);
    assert.equal(await __ragIndexTestUtils.canAccessRagRow(privateRow, { id: 'admin-root', role: 'admin' }), true);

    const publicRow = {
        visibility: 'public',
        ownerId: '',
        projectId: '',
        accessPolicyJson: JSON.stringify({ public: true, allowedUserIds: [] })
    };
    assert.equal(await __ragIndexTestUtils.canAccessRagRow(publicRow, { id: 'user-1', role: 'user' }), false);
});

test('retrieveRagContext uses mocked embeddings and returns matching local index sources', async () => {
    __ragIndexTestUtils.setEmbeddingsClient(async ({ input }) => (
        input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }))
    ));
    await insertRagChunk({
        id: `${TEST_PREFIX}:success`,
        title: 'Neon Portrait Prompt',
        chunkText: 'Prompt: neon portrait creative direction with reflective rain',
        projectId: 'test-rag-success',
        embeddingJson: JSON.stringify([1, 0, 0])
    });

    const result = await retrieveRagContext({
        query: 'neon portrait',
        user: { id: 'user-1', role: 'user' },
        topK: 3,
        filters: { projectId: 'test-rag-success', sourceType: 'prompts' }
    });

    assert.equal(result.matches.length, 1);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].title, 'Neon Portrait Prompt');
    assert.equal(result.sources[0].sourceRoute, '/prompt-manager');
    assert.ok(result.sources[0].score > 0.9);
});

test('retrieveRagContext returns no matches when the local index has no filtered rows', async () => {
    __ragIndexTestUtils.setEmbeddingsClient(async ({ input }) => (
        input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }))
    ));

    const result = await retrieveRagContext({
        query: 'missing workspace context',
        user: { id: 'user-1', role: 'user' },
        filters: { projectId: 'test-rag-empty', sourceType: 'prompts' }
    });

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.sources, []);
});

test('retrieveRagContext surfaces mocked Pollinations embedding failures', async () => {
    __ragIndexTestUtils.setEmbeddingsClient(async () => {
        throw new Error('mock embedding failure');
    });
    await insertRagChunk({
        id: `${TEST_PREFIX}:failure`,
        title: 'Failure Prompt',
        chunkText: 'Prompt: neon portrait requires a remote query embedding failure',
        projectId: 'test-rag-failure',
        embeddingJson: JSON.stringify([1, 0, 0])
    });

    await assert.rejects(
        () => retrieveRagContext({
            query: 'neon portrait',
            user: { id: 'user-1', role: 'user' },
            filters: { projectId: 'test-rag-failure', sourceType: 'prompts' }
        }),
        /mock embedding failure/
    );
});

test('retrieveRagContext skips corrupt local index vectors', async () => {
    __ragIndexTestUtils.setEmbeddingsClient(async ({ input }) => (
        input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }))
    ));
    await insertRagChunk({
        id: `${TEST_PREFIX}:corrupt`,
        title: 'Corrupt Vector Prompt',
        chunkText: 'Prompt: neon portrait should not be returned with corrupt vector',
        projectId: 'test-rag-corrupt',
        embeddingJson: '{"broken": true}'
    });

    const result = await retrieveRagContext({
        query: 'neon portrait',
        user: { id: 'user-1', role: 'user' },
        filters: { projectId: 'test-rag-corrupt', sourceType: 'prompts' }
    });

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.sources, []);
});

test('retrieveRagContext filters restricted records before returning sources', async () => {
    __ragIndexTestUtils.setEmbeddingsClient(async ({ input }) => (
        input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }))
    ));
    await insertRagChunk({
        id: `${TEST_PREFIX}:restricted`,
        title: 'Restricted Prompt',
        projectId: 'test-rag-restricted',
        embeddingJson: JSON.stringify([1, 0, 0]),
        ownerId: 'owner-1',
        accessPolicy: { public: false, allowedUserIds: ['owner-1'] }
    });

    const result = await retrieveRagContext({
        query: 'neon portrait',
        user: { id: 'stranger-1', role: 'user' },
        filters: { projectId: 'test-rag-restricted', sourceType: 'prompts' }
    });

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.sources, []);
});
