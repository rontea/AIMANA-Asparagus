import { ChatContext, ChatSession, MemoryProfile } from './types';

export const STORAGE_KEY = 'aimana_chat_sessions_v1';
export const MAX_SESSIONS = 50;
export const DEFAULT_SYSTEM_PROMPT = 'You are a concise and reliable assistant.';
export const MEMORY_SUMMARY_KEEP_LAST = 8;
export const MEMORY_SUMMARY_TRIGGER = 16;
export const MEMORY_SUMMARY_MIN_DELTA = 6;
export const MEMORY_SUMMARY_MAX_CHARS = 1600;

export interface MemoryPolicy {
    keepLast: number;
    trigger: number;
    minDelta: number;
    maxSummaryChars: number;
}

const applyMemoryProfile = (policy: MemoryPolicy, profile: MemoryProfile = 'balanced'): MemoryPolicy => {
    if (profile === 'balanced') return policy;
    const adjustment = profile === 'light'
        ? { keepLast: 4, trigger: 8, minDelta: 2, maxSummaryChars: -200 }
        : { keepLast: -2, trigger: -4, minDelta: -2, maxSummaryChars: 400 };
    const keepLast = Math.max(4, policy.keepLast + adjustment.keepLast);
    const trigger = Math.max(8, policy.trigger + adjustment.trigger);
    const minDelta = Math.max(2, policy.minDelta + adjustment.minDelta);
    const maxSummaryChars = Math.max(800, policy.maxSummaryChars + adjustment.maxSummaryChars);
    return { keepLast, trigger, minDelta, maxSummaryChars };
};

export const getMemoryPolicy = (contextLength?: number, profile: MemoryProfile = 'balanced'): MemoryPolicy => {
    const length = Number(contextLength);
    if (!Number.isFinite(length) || length <= 0) {
        const base = {
            keepLast: MEMORY_SUMMARY_KEEP_LAST,
            trigger: MEMORY_SUMMARY_TRIGGER,
            minDelta: MEMORY_SUMMARY_MIN_DELTA,
            maxSummaryChars: MEMORY_SUMMARY_MAX_CHARS
        };
        return applyMemoryProfile(base, profile);
    }

    if (length <= 8000) {
        return applyMemoryProfile({ keepLast: 6, trigger: 12, minDelta: 4, maxSummaryChars: 1200 }, profile);
    }
    if (length <= 16000) {
        return applyMemoryProfile({ keepLast: 8, trigger: 16, minDelta: 6, maxSummaryChars: 1600 }, profile);
    }
    if (length <= 32000) {
        return applyMemoryProfile({ keepLast: 12, trigger: 24, minDelta: 8, maxSummaryChars: 2000 }, profile);
    }
    if (length <= 64000) {
        return applyMemoryProfile({ keepLast: 16, trigger: 32, minDelta: 10, maxSummaryChars: 2400 }, profile);
    }
    return applyMemoryProfile({ keepLast: 20, trigger: 40, minDelta: 12, maxSummaryChars: 2800 }, profile);
};

let fallbackIdCounter = 0;

const createHexIdFromBytes = (bytes: Uint8Array) => {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const createId = () => {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (cryptoApi?.getRandomValues) {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        return createHexIdFromBytes(bytes);
    }
    fallbackIdCounter += 1;
    return `fallback-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
};

export const sanitizeSessionTitle = (raw: string) => {
    const title = raw.replace(/\s+/g, ' ').trim();
    return title.length > 40 ? `${title.slice(0, 40)}...` : title;
};

export const createSession = (context: ChatContext): ChatSession => ({
    id: createId(),
    title: 'New Chat',
    source: context.source,
    projectId: context.projectId,
    modelId: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 16384,
    useSearch: false,
    useLinks: true,
    useReasoning: false,
    useMemory: true,
    memoryProfile: 'balanced',
    memoryProfileUpdatedAt: 0,
    showSources: true,
    pinnedMemory: '',
    pinnedMemoryUpdatedAt: 0,
    memorySummary: '',
    memorySummaryUpdatedAt: 0,
    memorySummaryMessageCount: 0,
    readAloudVoiceURI: '',
    readAloudVoiceName: '',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
});

export const getMemorySummaryTargetCount = (totalMessages: number, keepLast = MEMORY_SUMMARY_KEEP_LAST) => {
    if (!Number.isFinite(totalMessages) || totalMessages <= 0) return 0;
    return Math.max(0, Math.floor(totalMessages) - keepLast);
};

export const shouldUpdateMemorySummary = (
    totalMessages: number,
    summaryCount = 0,
    policy: MemoryPolicy = getMemoryPolicy()
) => {
    const targetCount = getMemorySummaryTargetCount(totalMessages, policy.keepLast);
    if (totalMessages < policy.trigger) return false;
    if (!summaryCount || summaryCount <= 0) return true;
    return targetCount - summaryCount >= policy.minDelta;
};

export const getContextWindowInfo = (session: ChatSession | null, contextLength?: number) => {
    const policy = getMemoryPolicy(contextLength);
    if (!session) {
        return { totalMessages: 0, summaryCount: 0, sentMessages: 0, targetSummaryCount: 0 };
    }
    const totalMessages = Array.isArray(session.messages) ? session.messages.length : 0;
    const summaryCount = session.memorySummary
        ? Math.min(Number(session.memorySummaryMessageCount || 0), totalMessages)
        : 0;
    const targetSummaryCount = getMemorySummaryTargetCount(totalMessages, policy.keepLast);
    const effectiveSummaryCount = targetSummaryCount > 0 ? summaryCount : 0;
    const rawSentMessages = effectiveSummaryCount > 0
        ? Math.max(0, totalMessages - effectiveSummaryCount)
        : totalMessages;
    const sentMessages = policy.keepLast > 0 ? Math.min(rawSentMessages, policy.keepLast) : rawSentMessages;
    return { totalMessages, summaryCount: effectiveSummaryCount, sentMessages, targetSummaryCount };
};

export const hydrateSessions = (raw: string | null): ChatSession[] => {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    const isValidMessage = (message: any) => {
        if (!message || typeof message !== 'object') return false;
        if (typeof message.id !== 'string' || !message.id.trim()) return false;
        if (message.role !== 'user' && message.role !== 'assistant') return false;
        if (typeof message.content !== 'string') return false;
        if (!['done', 'loading', 'error', 'stopped'].includes(String(message.status))) return false;
        if (message.requestId !== undefined && typeof message.requestId !== 'string') return false;
        if (message.latencyMs !== undefined && !Number.isFinite(message.latencyMs)) return false;
        if (message.pollenUsed !== undefined && typeof message.pollenUsed !== 'string') return false;
        if (message.searchApplied !== undefined && typeof message.searchApplied !== 'boolean') return false;
        if (message.searchMode !== undefined && !['off', 'native', 'fallback'].includes(String(message.searchMode))) return false;
        if (message.searchProvider !== undefined && typeof message.searchProvider !== 'string') return false;
        if (message.searchWarning !== undefined && typeof message.searchWarning !== 'string') return false;
        if (message.linkApplied !== undefined && typeof message.linkApplied !== 'boolean') return false;
        if (message.linkWarning !== undefined && typeof message.linkWarning !== 'string') return false;
        if (message.sources !== undefined) {
            if (!Array.isArray(message.sources)) return false;
            for (const src of message.sources) {
                if (!src || typeof src !== 'object') return false;
                if (typeof src.title !== 'string') return false;
                if (typeof src.url !== 'string') return false;
                if (src.snippet !== undefined && typeof src.snippet !== 'string') return false;
                if (src.source !== undefined && typeof src.source !== 'string') return false;
                if (src.publishedAt !== undefined && typeof src.publishedAt !== 'string') return false;
            }
        }
        if (message.imageInputs !== undefined) {
            if (!Array.isArray(message.imageInputs)) return false;
            for (const image of message.imageInputs) {
                if (!image || typeof image !== 'object') return false;
                if (typeof image.id !== 'string' || !image.id.trim()) return false;
                if (typeof image.name !== 'string') return false;
                if (image.url !== undefined && typeof image.url !== 'string') return false;
                if (image.mimeType !== undefined && typeof image.mimeType !== 'string') return false;
                if (image.size !== undefined && !Number.isFinite(image.size)) return false;
            }
        }
        if (message.audioInputs !== undefined) {
            if (!Array.isArray(message.audioInputs)) return false;
            for (const audio of message.audioInputs) {
                if (!audio || typeof audio !== 'object') return false;
                if (typeof audio.id !== 'string' || !audio.id.trim()) return false;
                if (typeof audio.name !== 'string') return false;
                if (audio.url !== undefined && typeof audio.url !== 'string') return false;
                if (audio.data !== undefined && typeof audio.data !== 'string') return false;
                if (audio.format !== undefined && typeof audio.format !== 'string') return false;
                if (audio.mimeType !== undefined && typeof audio.mimeType !== 'string') return false;
                if (audio.size !== undefined && !Number.isFinite(audio.size)) return false;
            }
        }
        return true;
    };
    return parsed
        .filter((item: any) => item && typeof item.id === 'string')
        .map((item: any): ChatSession => ({
            id: item.id,
            title: typeof item.title === 'string' && item.title.trim() ? item.title : 'New Chat',
            source: typeof item.source === 'string' ? item.source : 'generate',
            projectId: typeof item.projectId === 'string' ? item.projectId : '',
            modelId: typeof item.modelId === 'string' ? item.modelId : '',
            systemPrompt: typeof item.systemPrompt === 'string' ? item.systemPrompt : DEFAULT_SYSTEM_PROMPT,
            temperature: Number.isFinite(item.temperature) ? Number(item.temperature) : 0.7,
            maxTokens: Number.isFinite(item.maxTokens) ? Number(item.maxTokens) : 16384,
            useSearch: typeof item.useSearch === 'boolean' ? item.useSearch : false,
            useLinks: typeof item.useLinks === 'boolean' ? item.useLinks : true,
            useReasoning: typeof item.useReasoning === 'boolean' ? item.useReasoning : false,
            useMemory: typeof item.useMemory === 'boolean' ? item.useMemory : true,
            memoryProfile: ['light', 'balanced', 'deep'].includes(String(item.memoryProfile))
                ? (item.memoryProfile as MemoryProfile)
                : 'balanced',
            memoryProfileUpdatedAt: Number.isFinite(item.memoryProfileUpdatedAt) ? Number(item.memoryProfileUpdatedAt) : 0,
            showSources: typeof item.showSources === 'boolean' ? item.showSources : true,
            pinnedMemory: typeof item.pinnedMemory === 'string' ? item.pinnedMemory : '',
            pinnedMemoryUpdatedAt: Number.isFinite(item.pinnedMemoryUpdatedAt) ? Number(item.pinnedMemoryUpdatedAt) : 0,
            memorySummary: typeof item.memorySummary === 'string' ? item.memorySummary : '',
            memorySummaryUpdatedAt: Number.isFinite(item.memorySummaryUpdatedAt) ? Number(item.memorySummaryUpdatedAt) : 0,
            memorySummaryMessageCount: Number.isFinite(item.memorySummaryMessageCount) ? Number(item.memorySummaryMessageCount) : 0,
            readAloudVoiceURI: typeof item.readAloudVoiceURI === 'string' ? item.readAloudVoiceURI : '',
            readAloudVoiceName: typeof item.readAloudVoiceName === 'string' ? item.readAloudVoiceName : '',
            messages: Array.isArray(item.messages) ? item.messages.filter(isValidMessage) : [],
            createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now(),
            updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : Date.now()
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_SESSIONS);
};

export const buildTranscript = (session: ChatSession) => {
    const lines: string[] = [];
    lines.push('# AIMANA AI Chat Transcript');
    lines.push(`Session: ${session.title}`);
    lines.push(`Model: ${session.modelId || 'n/a'}`);
    lines.push(`Created: ${new Date(session.createdAt).toISOString()}`);
    lines.push(`Updated: ${new Date(session.updatedAt).toISOString()}`);
    lines.push('');
    if (session.systemPrompt.trim()) {
        lines.push('[SYSTEM]');
        lines.push(session.systemPrompt.trim());
        lines.push('');
    }
    session.messages.forEach((m) => {
        lines.push(`[${m.role.toUpperCase()}]`);
        const imageCount = Array.isArray(m.imageInputs) ? m.imageInputs.length : 0;
        const audioCount = Array.isArray(m.audioInputs) ? m.audioInputs.length : 0;
        if (imageCount > 0 || audioCount > 0) {
            const parts = [];
            if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
            if (audioCount > 0) parts.push(`${audioCount} audio${audioCount > 1 ? 's' : ''}`);
            lines.push(`[Attachments: ${parts.join(', ')}]`);
        }
        lines.push(m.content || '');
        lines.push('');
    });
    return lines.join('\n');
};

export const isDataUri = (value?: string) => typeof value === 'string' && value.startsWith('data:');

export const serializeSessionsForStorage = (
    sessions: ChatSession[],
    options: { maxMessagesPerSession?: number } = {}
) => {
    const maxMessages = Number.isFinite(options.maxMessagesPerSession)
        ? Math.max(0, Number(options.maxMessagesPerSession))
        : Number.POSITIVE_INFINITY;
    const trimmed = sessions.map((session) => ({
        ...session,
        messages: session.messages
            .slice(-maxMessages)
            .map((message) => ({
                ...message,
                imageInputs: Array.isArray(message.imageInputs)
                    ? message.imageInputs.map((image) => ({
                        id: image.id,
                        name: image.name,
                        url: image.url && !isDataUri(image.url) ? image.url : undefined,
                        mimeType: image.mimeType,
                        size: image.size
                    }))
                    : undefined,
                audioInputs: Array.isArray(message.audioInputs)
                    ? message.audioInputs.map((audio) => ({
                        id: audio.id,
                        name: audio.name,
                        url: audio.url,
                        format: audio.format,
                        mimeType: audio.mimeType,
                        size: audio.size
                    }))
                    : undefined
            }))
    }));
    return JSON.stringify(trimmed);
};
