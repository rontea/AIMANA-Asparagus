import test from 'node:test';
import assert from 'node:assert/strict';

import { dbRun } from '../db.js';
import { initRagSchema } from '../db/schema/rag.js';
import { __ragIndexTestUtils } from '../services/ragIndexService.js';
import { __promptAssistantTestUtils, runPromptAssistant } from '../services/promptAssistantService.js';

const TEST_PREFIX = 'test-prompt-assistant-smoke';
const PROJECT_ID = 'test-smoke-project';

const cleanupRagRows = async () => {
    await dbRun('DELETE FROM rag_chunks WHERE id LIKE ?', [`${TEST_PREFIX}:%`]);
};

const insertSmokeChunk = async () => {
    const now = Date.now();
    await dbRun(`
        INSERT INTO rag_chunks (
            id, sourceType, sourceId, sourceRoute, title, chunkText, contentHash, metadataJson,
            visibility, ownerId, projectId, itemId, collectionId, revisionId,
            accessPolicyJson, allowedRolesJson,
            embeddingModel, embeddingDimensions, embeddingJson, indexVersion, indexedAt,
            sourceUpdatedAt, updatedAt
        )
        VALUES (?, 'prompts', ?, '/prompt-manager', 'Neon Portrait Prompt', ?, ?, ?, 'project', 'owner-1', ?, '', '', '', ?, ?, 'test-embedding', 3, ?, 'rag-v1', ?, ?, ?)
    `, [
        `${TEST_PREFIX}:prompt`,
        `${TEST_PREFIX}:prompt-source`,
        [
            'Source type: prompts',
            'Title: Neon Portrait Prompt',
            'Project: Smoke Test Prompt Library',
            'Tags: neon, portrait, cinematic',
            'Prompt: Create a cinematic neon portrait with reflective rain and a clear subject.',
            'Notes: Good for moody character ideation.'
        ].join('\n'),
        `${TEST_PREFIX}:hash`,
        JSON.stringify({ projectName: 'Smoke Test Prompt Library', collectionName: 'Ready Prompts' }),
        PROJECT_ID,
        JSON.stringify({ public: false, allowedUserIds: ['user-1'], projectId: PROJECT_ID }),
        JSON.stringify(['admin']),
        JSON.stringify([1, 0, 0]),
        now,
        now,
        now
    ]);
};

test.before(async () => {
    await initRagSchema();
    await cleanupRagRows();
});

test.afterEach(async () => {
    __ragIndexTestUtils.resetEmbeddingsClient();
    __promptAssistantTestUtils.resetChatCompletionClient();
    await cleanupRagRows();
});

test('smoke: end-to-end idea search and prompt draft generation use retrieved sources', async () => {
    await insertSmokeChunk();

    __ragIndexTestUtils.setEmbeddingsClient(async ({ input }) => (
        input.map(() => ({ embedding: [1, 0, 0], model: 'test-embedding' }))
    ));

    const chatRequests = [];
    __promptAssistantTestUtils.setChatCompletionClient(async (request) => {
        chatRequests.push(request);
        const userPrompt = request.messages.find((message) => message.role === 'user')?.content || '';
        assert.match(userPrompt, /Neon Portrait Prompt/);
        assert.match(userPrompt, /\/prompt-manager/);

        if (userPrompt.includes('Intent: prompt_draft')) {
            return {
                content: [
                    'Here is a grounded draft from the indexed prompt.',
                    '',
                    'Title: Neon Rain Character Portrait',
                    'Prompt: Create a cinematic neon rain portrait of {{subject}} with reflective pavement, crisp rim light, and moody color contrast.',
                    'Tags: neon, portrait, cinematic',
                    'Variables: subject',
                    'Sources: Neon Portrait Prompt',
                    'Notes: Based only on the retrieved prompt context.'
                ].join('\n'),
                model: 'mock-chat',
                usage: { total_tokens: 42 }
            };
        }

        return {
            content: 'Use the Neon Portrait Prompt for moody character ideation. Source: Neon Portrait Prompt (/prompt-manager).',
            model: 'mock-chat',
            usage: { total_tokens: 24 }
        };
    });

    const user = { id: 'user-1', role: 'user' };
    const filters = { projectId: PROJECT_ID, sourceType: 'prompts' };

    const ideaResult = await runPromptAssistant({
        message: 'show neon portrait ideas',
        intent: 'idea_search',
        user,
        filters
    });

    assert.equal(ideaResult.noSource, false);
    assert.equal(ideaResult.intent, 'idea_search');
    assert.equal(ideaResult.matchCount, 1);
    assert.equal(ideaResult.sources[0].title, 'Neon Portrait Prompt');
    assert.match(ideaResult.answer, /Neon Portrait Prompt/);

    const draftResult = await runPromptAssistant({
        message: 'create a prompt for a neon rain portrait',
        intent: 'prompt_draft',
        user,
        filters
    });

    assert.equal(draftResult.noSource, false);
    assert.equal(draftResult.intent, 'prompt_draft');
    assert.equal(draftResult.matchCount, 1);
    assert.equal(draftResult.draft.title, 'Neon Rain Character Portrait');
    assert.match(draftResult.draft.prompt, /{{subject}}/);
    assert.deepEqual(draftResult.draft.tags, ['neon', 'portrait', 'cinematic']);
    assert.equal(draftResult.draft.sources, 'Neon Portrait Prompt');
    assert.equal(chatRequests.length, 2);
});
