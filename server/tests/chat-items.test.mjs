import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatTranscript, buildCreateChatItemInsert, listChatSessionModelIds, sanitizeChatSessionPayload } from '../logic/chatItems.js';

test('chat items: sanitize replaces data URI images and collects attachments', async () => {
    const session = {
        id: 'session-1',
        title: 'My Chat',
        modelId: 'model-x',
        systemPrompt: 'Be helpful.',
        temperature: 0.7,
        maxTokens: 512,
        messages: [
            {
                id: 'msg-1',
                role: 'user',
                content: 'Hello',
                status: 'done',
                imageInputs: [
                    { id: 'img-1', name: 'ref.png', url: 'data:image/png;base64,AAAA' }
                ],
                audioInputs: [
                    { id: 'aud-1', name: 'audio', data: 'AAA', format: 'mp3' }
                ]
            }
        ]
    };

    const ensureReferenceAssetFn = async () => ({
        referenceItemId: 'ref-1',
        referenceHash: 'hash',
        fileUrl: '/storage/uploads/Neural_Reference/x/ref.png',
        mimeType: 'image/png',
        size: 123
    });

    const result = await sanitizeChatSessionPayload({
        session,
        ownerId: 'owner-1',
        ensureReferenceAssetFn
    });

    assert.equal(result.payload.messages.length, 1);
    const msg = result.payload.messages[0];
    assert.ok(Array.isArray(msg.imageInputs));
    assert.equal(msg.imageInputs[0].url, '/storage/uploads/Neural_Reference/x/ref.png');
    assert.equal(msg.audioInputs, undefined);
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0].referenceItemId, 'ref-1');
});

test('chat items: build transcript includes system prompt and messages', () => {
    const transcript = buildChatTranscript({
        title: 'Chat A',
        modelId: 'model-y',
        systemPrompt: 'System rules',
        createdAt: 1730000000000,
        updatedAt: 1730000000000,
        messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' }
        ]
    });

    assert.ok(transcript.includes('System rules'));
    assert.ok(transcript.includes('[USER]'));
    assert.ok(transcript.includes('[ASSISTANT]'));
});

test('chat items: sanitize throws on invalid payload', async () => {
    await assert.rejects(
        () => sanitizeChatSessionPayload({ session: {}, ownerId: 'owner-1' }),
        /messages are required/
    );
});

test('chat items: model list includes unique session and message model ids in order', () => {
    const modelIds = listChatSessionModelIds({
        modelId: 'model-a',
        messages: [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello', modelId: 'model-a' },
            { role: 'assistant', content: 'follow-up', modelId: 'model-b' },
            { role: 'assistant', content: 'alt', modelId: 'model-c' },
            { role: 'assistant', content: 'repeat', modelId: 'model-b' }
        ]
    });

    assert.deepEqual(modelIds, ['model-a', 'model-b', 'model-c']);
});

test('chat items: create insert includes transcript placeholder and aligned params', () => {
    const insert = buildCreateChatItemInsert({
        chatItemId: 'chat-1',
        projectId: 'project-1',
        title: 'Chat Capture',
        sessionId: 'session-1',
        payload: {
            modelId: 'model-x',
            systemPrompt: 'Be helpful',
            temperature: 0.7,
            maxTokens: 1024,
            useSearch: true,
            useLinks: false,
            useReasoning: true
        },
        messageCount: 2,
        payloadJson: '{"ok":true}',
        transcriptText: 'Transcript body',
        now: 1730000000000
    });

    const placeholderCount = (insert.sql.match(/\?/g) || []).length;
    assert.equal(placeholderCount, insert.params.length);
    assert.equal(insert.params[13], 'Transcript body');
});
