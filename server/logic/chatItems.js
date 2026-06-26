import { v4 as uuidv4 } from 'uuid';
import { ensureReferenceAsset } from './referenceAssets.js';

const isDataUri = (value) => typeof value === 'string' && value.startsWith('data:');

const normalizeString = (value, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeNumber = (value, fallback) => {
    return Number.isFinite(value) ? Number(value) : fallback;
};

const normalizeBoolean = (value) => value === true;

const normalizeStatus = (value) => {
    const status = String(value || '').toLowerCase();
    if (status === 'loading' || status === 'error' || status === 'stopped' || status === 'done') return status;
    return 'done';
};

const sanitizeSources = (sources) => {
    if (!Array.isArray(sources)) return undefined;
    const out = sources
        .filter((src) => src && typeof src === 'object')
        .map((src) => ({
            title: normalizeString(src.title),
            url: normalizeString(src.url),
            ...(typeof src.snippet === 'string' ? { snippet: src.snippet } : {}),
            ...(typeof src.source === 'string' ? { source: src.source } : {}),
            ...(typeof src.sourceRoute === 'string' ? { sourceRoute: normalizeString(src.sourceRoute) } : {}),
            ...(typeof src.sourceType === 'string' ? { sourceType: normalizeString(src.sourceType) } : {}),
            ...(typeof src.sourceId === 'string' ? { sourceId: normalizeString(src.sourceId) } : {}),
            ...(typeof src.publishedAt === 'string' ? { publishedAt: src.publishedAt } : {})
        }))
        .filter((src) => src.title && (src.url || src.sourceRoute));
    return out.length > 0 ? out : undefined;
};

export const buildChatTranscript = (session) => {
    const lines = [];
    const createdAt = normalizeNumber(session?.createdAt, Date.now());
    const updatedAt = normalizeNumber(session?.updatedAt, Date.now());

    lines.push('# AIMANA AI Chat Transcript');
    lines.push(`Session: ${normalizeString(session?.title, 'Chat Capture')}`);
    lines.push(`Model: ${normalizeString(session?.modelId, 'n/a')}`);
    lines.push(`Created: ${new Date(createdAt).toISOString()}`);
    lines.push(`Updated: ${new Date(updatedAt).toISOString()}`);
    lines.push('');

    const systemPrompt = normalizeString(session?.systemPrompt);
    if (systemPrompt) {
        lines.push('[SYSTEM]');
        lines.push(systemPrompt);
        lines.push('');
    }

    const messages = Array.isArray(session?.messages) ? session.messages : [];
    messages.forEach((msg) => {
        const role = normalizeString(msg?.role).toUpperCase() || 'MESSAGE';
        lines.push(`[${role}]`);
        const imageCount = Array.isArray(msg?.imageInputs) ? msg.imageInputs.length : 0;
        const audioCount = Array.isArray(msg?.audioInputs) ? msg.audioInputs.length : 0;
        if (imageCount > 0 || audioCount > 0) {
            const parts = [];
            if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
            if (audioCount > 0) parts.push(`${audioCount} audio${audioCount > 1 ? 's' : ''}`);
            lines.push(`[Attachments: ${parts.join(', ')}]`);
        }
        lines.push(typeof msg?.content === 'string' ? msg.content : '');
        lines.push('');
    });

    return lines.join('\n');
};

export const listChatSessionModelIds = (session) => {
    const unique = new Set();
    const ordered = [];

    const pushModelId = (value) => {
        const modelId = normalizeString(value);
        if (!modelId || unique.has(modelId)) return;
        unique.add(modelId);
        ordered.push(modelId);
    };

    pushModelId(session?.modelId);

    const messages = Array.isArray(session?.messages) ? session.messages : [];
    messages.forEach((message) => {
        pushModelId(message?.modelId);
    });

    return ordered;
};

export const sanitizeChatSessionPayload = async ({
    session,
    ownerId,
    ensureReferenceAssetFn = ensureReferenceAsset
}) => {
    if (!session || typeof session !== 'object') {
        throw new Error('Invalid chat session payload');
    }

    const rawMessages = Array.isArray(session.messages) ? session.messages : null;
    if (!rawMessages) {
        throw new Error('Chat session messages are required');
    }

    const now = Date.now();
    const attachments = [];

    const sanitizedMessages = [];
    for (const message of rawMessages) {
        if (!message || typeof message !== 'object') continue;
        const role = message.role === 'user' || message.role === 'assistant' ? message.role : null;
        if (!role) continue;

        const messageId = normalizeString(message.id, uuidv4());
        const sanitized = {
            id: messageId,
            role,
            content: typeof message.content === 'string' ? message.content : '',
            status: normalizeStatus(message.status)
        };

        if (typeof message.modelId === 'string') sanitized.modelId = message.modelId;
        if (typeof message.requestId === 'string') sanitized.requestId = message.requestId;
        if (Number.isFinite(message.latencyMs)) sanitized.latencyMs = Number(message.latencyMs);
        if (typeof message.searchApplied === 'boolean') sanitized.searchApplied = message.searchApplied;
        if (typeof message.searchMode === 'string') sanitized.searchMode = message.searchMode;
        if (typeof message.searchProvider === 'string') sanitized.searchProvider = message.searchProvider;
        if (typeof message.searchWarning === 'string') sanitized.searchWarning = message.searchWarning;
        if (typeof message.linkApplied === 'boolean') sanitized.linkApplied = message.linkApplied;
        if (typeof message.linkWarning === 'string') sanitized.linkWarning = message.linkWarning;
        const sources = sanitizeSources(message.sources);
        if (sources) sanitized.sources = sources;

        const imageInputs = [];
        if (Array.isArray(message.imageInputs)) {
            for (const image of message.imageInputs) {
                if (!image || typeof image !== 'object') continue;
                const inputId = normalizeString(image.id, uuidv4());
                const url = normalizeString(image.url);
                if (!url) continue;

                if (isDataUri(url)) {
                    if (!ownerId) throw new Error('Owner required for image capture');
                    const reference = await ensureReferenceAssetFn({ ownerId, dataUri: url });
                    attachments.push({
                        id: uuidv4(),
                        chatItemId: '',
                        messageId,
                        inputId,
                        referenceItemId: reference.referenceItemId,
                        fileUrl: reference.fileUrl,
                        mimeType: reference.mimeType || '',
                        size: Number.isFinite(reference.size) ? reference.size : null,
                        createdAt: now
                    });
                    imageInputs.push({
                        id: inputId,
                        name: normalizeString(image.name, 'image'),
                        url: reference.fileUrl,
                        mimeType: reference.mimeType || image.mimeType,
                        size: Number.isFinite(reference.size) ? reference.size : image.size
                    });
                } else {
                    imageInputs.push({
                        id: inputId,
                        name: normalizeString(image.name, 'image'),
                        url,
                        mimeType: typeof image.mimeType === 'string' ? image.mimeType : undefined,
                        size: Number.isFinite(image.size) ? image.size : undefined
                    });
                }
            }
        }
        if (imageInputs.length > 0) sanitized.imageInputs = imageInputs;

        const audioInputs = [];
        if (Array.isArray(message.audioInputs)) {
            for (const audio of message.audioInputs) {
                if (!audio || typeof audio !== 'object') continue;
                const inputId = normalizeString(audio.id, uuidv4());
                const audioUrl = normalizeString(audio.url);
                const normalizedAudio = {
                    id: inputId,
                    name: normalizeString(audio.name, 'audio'),
                    ...(typeof audio.format === 'string' ? { format: audio.format } : {}),
                    ...(typeof audio.mimeType === 'string' ? { mimeType: audio.mimeType } : {}),
                    ...(Number.isFinite(audio.size) ? { size: audio.size } : {})
                };
                if (audioUrl) {
                    audioInputs.push({
                        ...normalizedAudio,
                        url: audioUrl
                    });
                    continue;
                }
            }
        }
        if (audioInputs.length > 0) sanitized.audioInputs = audioInputs;

        sanitizedMessages.push(sanitized);
    }

    const payload = {
        id: normalizeString(session.id),
        title: normalizeString(session.title, 'Chat Capture'),
        source: normalizeString(session.source, 'chat'),
        projectId: normalizeString(session.projectId),
        modelId: normalizeString(session.modelId),
        systemPrompt: typeof session.systemPrompt === 'string' ? session.systemPrompt : '',
        temperature: normalizeNumber(session.temperature, 0.7),
        maxTokens: normalizeNumber(session.maxTokens, 1024),
        useSearch: normalizeBoolean(session.useSearch),
        useLinks: normalizeBoolean(session.useLinks),
        useReasoning: normalizeBoolean(session.useReasoning),
        useMemory: normalizeBoolean(session.useMemory),
        memoryProfile: normalizeString(session.memoryProfile, 'balanced'),
        memoryProfileUpdatedAt: normalizeNumber(session.memoryProfileUpdatedAt, 0),
        pinnedMemory: normalizeString(session.pinnedMemory),
        pinnedMemoryUpdatedAt: normalizeNumber(session.pinnedMemoryUpdatedAt, 0),
        memorySummary: normalizeString(session.memorySummary),
        memorySummaryUpdatedAt: normalizeNumber(session.memorySummaryUpdatedAt, 0),
        memorySummaryMessageCount: normalizeNumber(session.memorySummaryMessageCount, 0),
        messages: sanitizedMessages,
        createdAt: normalizeNumber(session.createdAt, now),
        updatedAt: normalizeNumber(session.updatedAt, now)
    };

    const transcriptText = buildChatTranscript(payload);

    return {
        payload,
        attachments,
        transcriptText
    };
};

export const buildCreateChatItemInsert = ({
    chatItemId,
    projectId,
    title,
    sessionId,
    payload,
    messageCount,
    payloadJson,
    transcriptText,
    now
}) => ({
    sql: `INSERT INTO chat_items (
        id, projectId, title, sessionId, modelId, systemPrompt, temperature, maxTokens,
        useSearch, useLinks, useReasoning, messageCount, payloadJson, transcriptText,
        isArchived, isPinned, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    params: [
        chatItemId,
        projectId,
        title,
        sessionId,
        payload?.modelId || '',
        payload?.systemPrompt || '',
        payload?.temperature,
        payload?.maxTokens,
        payload?.useSearch ? 1 : 0,
        payload?.useLinks ? 1 : 0,
        payload?.useReasoning ? 1 : 0,
        messageCount,
        payloadJson,
        transcriptText,
        now,
        now
    ]
});
