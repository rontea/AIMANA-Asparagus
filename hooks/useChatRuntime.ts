import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { ChatAudioInput, ChatImageInput, ChatMessage, ChatSession, ChatSourceLink } from '../components/chat/types';
import { consumePollenCredit } from '../utils/pollenCreditBalance';
import { resolvePollenCharge } from '../utils/pollenCredits';
import { normalizeUserFacingError, readApiErrorMessage } from '../utils/userFacingErrors';
import type { ModelOption } from '../components/project/lab/ModelSelector/types';
import {
    createId,
    sanitizeSessionTitle,
    getMemorySummaryTargetCount,
    shouldUpdateMemorySummary,
    getMemoryPolicy
} from '../components/chat/utils';
import { parseSseEvents, parseSseTrailingEvents } from '../components/chat/streaming';

interface SendPromptArgs {
    activeSession: ChatSession | null;
    input: string;
    pendingImageInputs: ChatImageInput[];
    pendingAudioInputs: ChatAudioInput[];
    updateActiveSession: (updater: (session: ChatSession) => ChatSession) => void;
    setInput: (value: string) => void;
    clearPendingImageInputs: () => void;
    clearPendingAudioInputs: () => void;
}

interface RetryPromptArgs {
    activeSession: ChatSession | null;
    updateActiveSession: (updater: (session: ChatSession) => ChatSession) => void;
}

type ModelContextLookup = Record<string, Partial<ModelOption>>;

interface UseChatRuntimeResult {
    isSending: boolean;
    errorMsg: string | null;
    setErrorMsg: (message: string | null) => void;
    requestAssistantResponse: (sessionId: string, thread: ChatMessage[], sessionSnapshot?: ChatSession | null) => Promise<void>;
    sendPrompt: (args: SendPromptArgs) => Promise<void>;
    retryPrompt: (args: RetryPromptArgs) => Promise<void>;
    stop: () => void;
}

const toUserMessageContent = (message: ChatMessage) => {
    const imageInputs = Array.isArray(message.imageInputs) ? message.imageInputs.filter((image) => Boolean(image.url)) : [];
    const audioInputs = Array.isArray(message.audioInputs) ? message.audioInputs.filter((audio) => Boolean(audio.data && audio.format)) : [];
    if (imageInputs.length === 0 && audioInputs.length === 0) return message.content;
    return [
        { type: 'text', text: message.content || '' },
        ...imageInputs.map((image) => ({
            type: 'image_url',
            image_url: { url: image.url }
        })),
        ...audioInputs.map((audio) => ({
            type: 'input_audio',
            input_audio: {
                data: audio.data,
                format: audio.format
            }
        }))
    ];
};

const toProxyMessage = (message: ChatMessage) => {
    if (message.role !== 'user') return { role: message.role, content: message.content };
    return { role: message.role, content: toUserMessageContent(message) };
};

const toSearchMetadata = (diagnostics: any = {}) => {
    const meta: Partial<Pick<ChatMessage, 'pollenUsed' | 'searchApplied' | 'searchMode' | 'searchProvider' | 'searchWarning' | 'linkApplied' | 'linkWarning' | 'sources'>> = {};
    if (typeof diagnostics?.pollenUsed === 'string') meta.pollenUsed = diagnostics.pollenUsed;
    if (typeof diagnostics?.searchApplied === 'boolean') meta.searchApplied = diagnostics.searchApplied;
    if (diagnostics?.searchMode === 'off' || diagnostics?.searchMode === 'native' || diagnostics?.searchMode === 'fallback') {
        meta.searchMode = diagnostics.searchMode;
    }
    if (typeof diagnostics?.searchProvider === 'string') meta.searchProvider = diagnostics.searchProvider;
    if (typeof diagnostics?.searchWarning === 'string') meta.searchWarning = diagnostics.searchWarning;
    if (typeof diagnostics?.linkApplied === 'boolean') meta.linkApplied = diagnostics.linkApplied;
    if (typeof diagnostics?.linkWarning === 'string') meta.linkWarning = diagnostics.linkWarning;
    if (Array.isArray(diagnostics?.sources)) {
        meta.sources = diagnostics.sources
            .filter((src: any) => src && typeof src === 'object' && typeof src.title === 'string' && typeof src.url === 'string')
            .map((src: any): ChatSourceLink => ({
                title: src.title,
                url: src.url,
                ...(typeof src.snippet === 'string' ? { snippet: src.snippet } : {}),
                ...(typeof src.source === 'string' ? { source: src.source } : {}),
                ...(typeof src.publishedAt === 'string' ? { publishedAt: src.publishedAt } : {})
            }));
    }
    return meta;
};

const MAX_SUMMARY_MESSAGE_CHARS = 800;
const MAX_SUMMARY_TRANSCRIPT_CHARS = 12000;
const SUMMARY_SYSTEM_PROMPT = [
    'You are a summarization assistant.',
    'Return a concise bullet list of stable facts, preferences, goals, decisions, and open questions.',
    'Do not include meta commentary or analysis.',
    'Keep it compact and suitable for long-term memory.'
].join(' ');

const buildSummaryTranscript = (messages: ChatMessage[]) => {
    const lines: string[] = [];
    messages.forEach((message) => {
        const role = message.role === 'assistant' ? 'ASSISTANT' : 'USER';
        const raw = typeof message.content === 'string' ? message.content : '';
        const normalized = raw.replace(/\s+/g, ' ').trim();
        const content = normalized.length > MAX_SUMMARY_MESSAGE_CHARS
            ? `${normalized.slice(0, MAX_SUMMARY_MESSAGE_CHARS)}...`
            : normalized;
        lines.push(`[${role}] ${content}`);
        const imageCount = Array.isArray(message.imageInputs) ? message.imageInputs.length : 0;
        const audioCount = Array.isArray(message.audioInputs) ? message.audioInputs.length : 0;
        if (imageCount > 0 || audioCount > 0) {
            const parts = [];
            if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
            if (audioCount > 0) parts.push(`${audioCount} audio${audioCount > 1 ? 's' : ''}`);
            lines.push(`[Attachments: ${parts.join(', ')}]`);
        }
    });
    const transcript = lines.join('\n').trim();
    if (transcript.length <= MAX_SUMMARY_TRANSCRIPT_CHARS) return transcript;
    return `${transcript.slice(0, MAX_SUMMARY_TRANSCRIPT_CHARS)}\n[Transcript truncated]`;
};

const extractSummaryFromPayload = (payload: any) => {
    if (!payload) return '';
    if (typeof payload.content === 'string') return payload.content;
    if (typeof payload.output_text === 'string') return payload.output_text;
    const choice = payload?.choices?.[0];
    if (typeof choice?.message?.content === 'string') return choice.message.content;
    if (typeof choice?.text === 'string') return choice.text;
    return '';
};

const summarizeThreadForPollenEstimate = (
    messages: ChatMessage[],
    session?: ChatSession | null,
    summaryText?: string | null
) => {
    const lines: string[] = [];
    const systemPrompt = String(session?.systemPrompt || '').trim();
    const pinnedMemory = String(session?.pinnedMemory || '').trim();
    const memorySummary = String(summaryText || '').trim();

    if (systemPrompt) lines.push(`[SYSTEM] ${systemPrompt}`);
    if (pinnedMemory) lines.push(`[PINNED MEMORY] ${pinnedMemory}`);
    if (memorySummary) lines.push(`[SUMMARY] ${memorySummary}`);

    messages.forEach((message) => {
        const parts: string[] = [];
        const content = String(message.content || '').trim();
        if (content) parts.push(content);
        const imageCount = Array.isArray(message.imageInputs) ? message.imageInputs.length : 0;
        const audioCount = Array.isArray(message.audioInputs) ? message.audioInputs.length : 0;
        if (imageCount > 0) parts.push(`[${imageCount} image input${imageCount > 1 ? 's' : ''}]`);
        if (audioCount > 0) parts.push(`[${audioCount} audio input${audioCount > 1 ? 's' : ''}]`);
        if (parts.length === 0) return;
        lines.push(`[${message.role.toUpperCase()}] ${parts.join(' ')}`);
    });

    return lines.join('\n');
};

const resolveAudioInputsForProxy = async (message: ChatMessage, cache: Map<string, Promise<ChatAudioInput>>) => {
    if (!Array.isArray(message.audioInputs) || message.audioInputs.length === 0) return message;

    const nextAudioInputs = await Promise.all(message.audioInputs.map(async (audio) => {
        if (audio.data && audio.format) return audio;
        if (!audio.url) {
            throw new Error(`Audio attachment "${audio.name || 'audio'}" is unavailable.`);
        }
        let pending = cache.get(audio.url);
        if (!pending) {
            pending = api.chatSessions.fetchAudioAttachmentData(audio)
                .then((resolved) => ({
                    ...audio,
                    data: resolved.data,
                    format: audio.format || resolved.format,
                    mimeType: audio.mimeType || resolved.mimeType,
                    size: audio.size || resolved.size
                }));
            cache.set(audio.url, pending);
        }
        return pending;
    }));

    return { ...message, audioInputs: nextAudioInputs };
};

const resolveThreadMediaForProxy = async (thread: ChatMessage[]) => {
    const cache = new Map<string, Promise<ChatAudioInput>>();
    return Promise.all(thread.map(async (message) => {
        if (message.role !== 'user') return message;
        return resolveAudioInputsForProxy(message, cache);
    }));
};

export const useChatRuntime = (
    sessions: ChatSession[],
    updateSessionById: (sessionId: string, updater: (session: ChatSession) => ChatSession) => void,
    modelLookup: ModelContextLookup = {}
): UseChatRuntimeResult => {
    const sessionsRef = useRef<ChatSession[]>(sessions);
    const abortRef = useRef<AbortController | null>(null);
    const summaryInFlightRef = useRef<Record<string, boolean>>({});
    const [isSending, setIsSending] = useState(false);
    const [errorMsg, setErrorMsgState] = useState<string | null>(null);
    const resolveContextLength = useCallback((session: ChatSession | null) => {
        if (!session) return undefined;
        const model = modelLookup[session.modelId];
        const modelContext = Number(model?.textContextLength);
        if (Number.isFinite(modelContext) && modelContext > 0) return modelContext;
        return undefined;
    }, [modelLookup]);

    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    useEffect(() => {
        return () => {
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    const setErrorMsg = useCallback((message: string | null) => {
        setErrorMsgState(message);
    }, []);

    const updateMemorySummaryIfNeeded = useCallback(async (
        sessionId: string,
        sessionSnapshot: ChatSession,
        fullThread: ChatMessage[]
    ) => {
        const liveSession = sessionsRef.current.find((s) => s.id === sessionId);
        const sessionData = liveSession || sessionSnapshot;
        if (!sessionData?.modelId) return;
        if (sessionData.useMemory === false) return;
        if (!Array.isArray(fullThread) || fullThread.length === 0) return;

        const totalMessages = fullThread.length;
        const summaryCount = sessionData.memorySummary
            ? Math.min(Number(sessionData.memorySummaryMessageCount || 0), totalMessages)
            : 0;
        const policy = getMemoryPolicy(resolveContextLength(sessionData), sessionData.memoryProfile || 'balanced');
        const targetCount = getMemorySummaryTargetCount(totalMessages, policy.keepLast);
        if (targetCount <= 0) return;
        const needsReset = summaryCount > targetCount;
        if (!needsReset && !shouldUpdateMemorySummary(totalMessages, summaryCount, policy)) return;

        const startIndex = needsReset ? 0 : (summaryCount > 0 ? summaryCount : 0);
        const newMessages = fullThread.slice(startIndex, targetCount);
        if (newMessages.length === 0) return;

        if (summaryInFlightRef.current[sessionId]) return;
        summaryInFlightRef.current[sessionId] = true;

        try {
            const existingSummary = needsReset ? '' : sessionData.memorySummary?.trim();
            const transcript = buildSummaryTranscript(newMessages);
            if (!transcript) return;

            const userContent = existingSummary
                ? `Existing summary:\n${existingSummary}\n\nUpdate the summary with these new messages:\n${transcript}`
                : `Summarize the conversation so far:\n${transcript}`;

            const res = await fetch('/api/proxy/chat', {
                method: 'POST',
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    model: sessionData.modelId,
                    messages: [
                        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
                        { role: 'user', content: userContent }
                    ],
                    temperature: 0.2,
                    max_tokens: 400,
                    dynamicParams: {
                        useSearch: false,
                        useLinks: false,
                        reasoning: false
                    },
                    stream: false
                })
            });
            if (!res.ok) return;
            const payload = await res.json().catch(() => ({}));
            const rawSummary = extractSummaryFromPayload(payload);
            const cleaned = String(rawSummary || '').trim().replace(/^summary:\s*/i, '');
            if (!cleaned) return;
            const clipped = cleaned.length > policy.maxSummaryChars
                ? `${cleaned.slice(0, policy.maxSummaryChars)}...`
                : cleaned;

            updateSessionById(sessionId, (session) => ({
                ...session,
                memorySummary: clipped,
                memorySummaryMessageCount: targetCount,
                memorySummaryUpdatedAt: Date.now()
            }));
        } catch {
            // Ignore summary failures to avoid disrupting chat.
        } finally {
            summaryInFlightRef.current[sessionId] = false;
        }
    }, [resolveContextLength, updateSessionById]);

    const requestAssistantResponse = useCallback(async (sessionId: string, thread: ChatMessage[], sessionSnapshot?: ChatSession | null) => {
        const current = sessionSnapshot || sessionsRef.current.find((s) => s.id === sessionId);
        if (!current || !current.modelId || isSending) return;

        const assistantId = createId();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsSending(true);
        setErrorMsgState(null);

        updateSessionById(sessionId, (session) => ({
            ...session,
            messages: [...thread, { id: assistantId, role: 'assistant', content: '', status: 'loading', modelId: current.modelId }]
        }));

        const memoryEnabled = current.useMemory !== false;
        const policy = memoryEnabled
            ? getMemoryPolicy(resolveContextLength(current), current.memoryProfile || 'balanced')
            : getMemoryPolicy();
        const targetSummaryCount = getMemorySummaryTargetCount(thread.length, policy.keepLast);
        const summaryCount = memoryEnabled && current.memorySummary
            ? Math.min(Number(current.memorySummaryMessageCount || 0), thread.length)
            : 0;
        const effectiveSummaryCount = targetSummaryCount > 0 ? summaryCount : 0;
        const pinnedMemoryMessage = memoryEnabled && current.pinnedMemory?.trim()
            ? { role: 'system', content: `Pinned memory:\n${current.pinnedMemory.trim()}` }
            : null;
        const memoryMessage = memoryEnabled && effectiveSummaryCount > 0 && current.memorySummary?.trim()
            ? { role: 'system', content: `Conversation summary (for continuity):\n${current.memorySummary.trim()}` }
            : null;
        let threadForRequest = effectiveSummaryCount > 0 ? thread.slice(effectiveSummaryCount) : thread;
        if (memoryEnabled && policy.keepLast > 0 && threadForRequest.length > policy.keepLast) {
            threadForRequest = threadForRequest.slice(-policy.keepLast);
        }
        const resolvedThreadForRequest = await resolveThreadMediaForProxy(threadForRequest);
        const proxyMessages = [
            ...(current.systemPrompt.trim() ? [{ role: 'system', content: current.systemPrompt.trim() }] : []),
            ...(pinnedMemoryMessage ? [pinnedMemoryMessage] : []),
            ...(memoryMessage ? [memoryMessage] : []),
            ...resolvedThreadForRequest.map(toProxyMessage)
        ];
        const promptUsageText = summarizeThreadForPollenEstimate(
            threadForRequest,
            current,
            memoryMessage?.content || ''
        );
        let clearScheduledFlush: () => void = () => {};

        try {
            const res = await fetch('/api/proxy/chat', {
                method: 'POST',
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    model: current.modelId,
                    messages: proxyMessages,
                    temperature: current.temperature,
                    max_tokens: current.maxTokens,
                    dynamicParams: {
                        ...(current.useSearch ? { useSearch: true } : {}),
                        ...(current.useLinks ? { useLinks: true } : {}),
                        ...(current.useReasoning ? { reasoning: true } : {})
                    },
                    stream: true
                }),
                signal: controller.signal
            });
            if (!res.ok) {
                throw new Error(await readApiErrorMessage(res, 'Chat request failed.'));
            }

            const contentType = String(res.headers.get('content-type') || '').toLowerCase();
            const isEventStream = contentType.includes('text/event-stream');
            if (!isEventStream || !res.body) {
                const payload = await res.json().catch(() => ({}));
                const content = String(payload?.content || '').trim() || '(No response)';
                const searchMeta = toSearchMetadata(payload?.diagnostics || {});
                let pollenUsed = res.headers.get('x-pollen-used') || payload?.diagnostics?.pollenUsed || '';
                const resolvedCharge = resolvePollenCharge({
                    model: modelLookup[current.modelId],
                    pollenUsed,
                    promptText: promptUsageText,
                    completionText: content
                });
                if (!pollenUsed && resolvedCharge.amount !== null) {
                    pollenUsed = String(resolvedCharge.amount);
                }
                updateSessionById(sessionId, (session) => ({
                    ...session,
                    messages: session.messages.map((m) => (
                        m.id === assistantId
                            ? {
                                ...m,
                                content,
                                status: 'done',
                                requestId: payload?.diagnostics?.requestId || '',
                                latencyMs: payload?.diagnostics?.latencyMs,
                                pollenUsed,
                                ...searchMeta
                            }
                            : m
                    ))
                }));
                const finalThread = [
                    ...thread,
                    { id: assistantId, role: 'assistant' as const, content, status: 'done' as const, modelId: current.modelId, pollenUsed }
                ];
                if (pollenUsed) {
                    consumePollenCredit(pollenUsed, resolvedCharge.isEstimated ? 'AI Chat (estimated)' : 'AI Chat');
                }
                updateMemorySummaryIfNeeded(sessionId, current, finalThread);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let requestId = '';
            let latencyMs: number | undefined;
            let pollenUsed = res.headers.get('x-pollen-used') || '';
            let searchMeta: Partial<Pick<ChatMessage, 'pollenUsed' | 'searchApplied' | 'searchMode' | 'searchProvider' | 'searchWarning' | 'linkApplied' | 'linkWarning' | 'sources'>> = {};
            let receivedDelta = false;
            let rafFlushId: number | null = null;
            let timeoutFlushId: ReturnType<typeof setTimeout> | null = null;
            let flushScheduled = false;

            const flushContent = () => {
                updateSessionById(sessionId, (session) => ({
                    ...session,
                    messages: session.messages.map((m) => (
                        m.id === assistantId ? { ...m, content: fullContent, status: 'loading' } : m
                    ))
                }));
            };

            clearScheduledFlush = () => {
                if (rafFlushId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                    window.cancelAnimationFrame(rafFlushId);
                }
                if (timeoutFlushId !== null) {
                    clearTimeout(timeoutFlushId);
                }
                rafFlushId = null;
                timeoutFlushId = null;
                flushScheduled = false;
            };

            const runScheduledFlush = () => {
                rafFlushId = null;
                timeoutFlushId = null;
                flushScheduled = false;
                flushContent();
            };

            const scheduleFlush = () => {
                if (flushScheduled) return;
                flushScheduled = true;
                if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                    rafFlushId = window.requestAnimationFrame(runScheduledFlush);
                    return;
                }
                timeoutFlushId = setTimeout(runScheduledFlush, 16);
            };

            const applyParsedEvent = (event: { delta?: string; content?: string; requestId?: string; latencyMs?: number; pollenUsed?: string; diagnostics?: any }) => {
                if (typeof event.delta === 'string') {
                    receivedDelta = true;
                    fullContent += event.delta;
                    scheduleFlush();
                }
                if (!receivedDelta && typeof event.content === 'string' && event.content) {
                    fullContent = event.content;
                    scheduleFlush();
                }
                if (typeof event.requestId === 'string') requestId = event.requestId;
                if (Number.isFinite(event.latencyMs)) latencyMs = Number(event.latencyMs);
                if (typeof event.pollenUsed === 'string' && event.pollenUsed.trim()) pollenUsed = event.pollenUsed.trim();
                if (event.diagnostics && typeof event.diagnostics === 'object') {
                    if (typeof event.diagnostics.pollenUsed === 'string' && event.diagnostics.pollenUsed.trim()) {
                        pollenUsed = event.diagnostics.pollenUsed.trim();
                    }
                    searchMeta = { ...searchMeta, ...toSearchMetadata(event.diagnostics) };
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const parsed = parseSseEvents(buffer);
                buffer = parsed.remainder;

                for (const event of parsed.events) {
                    applyParsedEvent(event);
                }
            }

            for (const event of parseSseTrailingEvents(buffer)) {
                applyParsedEvent(event);
            }

            clearScheduledFlush();
            const finalContent = fullContent.trim() || '(No response)';
            const resolvedCharge = resolvePollenCharge({
                model: modelLookup[current.modelId],
                pollenUsed,
                promptText: promptUsageText,
                completionText: finalContent
            });
            if (!pollenUsed && resolvedCharge.amount !== null) {
                pollenUsed = String(resolvedCharge.amount);
            }
            updateSessionById(sessionId, (session) => ({
                ...session,
                messages: session.messages.map((m) => (
                    m.id === assistantId
                        ? { ...m, content: finalContent, status: 'done', requestId, latencyMs, pollenUsed, ...searchMeta }
                        : m
                ))
            }));
            const finalThread = [
                ...thread,
                { id: assistantId, role: 'assistant' as const, content: finalContent, status: 'done' as const, modelId: current.modelId, pollenUsed }
            ];
            if (pollenUsed) {
                consumePollenCredit(pollenUsed, resolvedCharge.isEstimated ? 'AI Chat (estimated)' : 'AI Chat');
            }
            updateMemorySummaryIfNeeded(sessionId, current, finalThread);
        } catch (e: any) {
            clearScheduledFlush();
            const aborted = e?.name === 'AbortError';
            const message = aborted
                ? 'Generation stopped.'
                : normalizeUserFacingError(e?.message || 'Chat request failed.');
            setErrorMsgState(aborted ? null : message);
            updateSessionById(sessionId, (session) => ({
                ...session,
                messages: session.messages.map((m) => (
                    m.id === assistantId ? { ...m, content: message, status: aborted ? 'stopped' : 'error' } : m
                ))
            }));
            if (!aborted && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('aimana-notification', {
                    detail: {
                        type: 'error',
                        title: 'Chat Failed',
                        message,
                        source: 'chat-runtime'
                    }
                }));
            }
        } finally {
            clearScheduledFlush();
            if (abortRef.current === controller) abortRef.current = null;
            setIsSending(false);
        }
    }, [isSending, resolveContextLength, updateMemorySummaryIfNeeded, updateSessionById]);

    const sendPrompt = useCallback(async ({ activeSession, input, pendingImageInputs, pendingAudioInputs, updateActiveSession, setInput, clearPendingImageInputs, clearPendingAudioInputs }: SendPromptArgs) => {
        if (!activeSession) return;
        const prompt = input.trim();
        if ((!prompt && pendingImageInputs.length === 0 && pendingAudioInputs.length === 0) || isSending || !activeSession.modelId) return;

        const nextThread = [
            ...activeSession.messages,
            {
                id: createId(),
                role: 'user' as const,
                content: prompt,
                status: 'done' as const,
                imageInputs: pendingImageInputs.map((img) => ({ ...img })),
                audioInputs: pendingAudioInputs.map((audio) => ({ ...audio }))
            }
        ];
        const nextTitleSeed = prompt
            || (pendingImageInputs[0]?.name ? `Image: ${pendingImageInputs[0].name}` : '')
            || (pendingAudioInputs[0]?.name ? `Audio: ${pendingAudioInputs[0].name}` : '')
            || 'Media prompt';
        const nextTitle = activeSession.title === 'New Chat' ? sanitizeSessionTitle(nextTitleSeed) : activeSession.title;

        setInput('');
        clearPendingImageInputs();
        clearPendingAudioInputs();
        updateActiveSession((session) => ({ ...session, title: nextTitle, messages: nextThread }));
        await requestAssistantResponse(activeSession.id, nextThread, activeSession);
    }, [isSending, requestAssistantResponse]);

    const retryPrompt = useCallback(async ({ activeSession, updateActiveSession }: RetryPromptArgs) => {
        if (!activeSession || isSending || activeSession.messages.length === 0 || !activeSession.modelId) return;
        let lastUserIndex = -1;
        for (let i = activeSession.messages.length - 1; i >= 0; i--) {
            if (activeSession.messages[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }
        if (lastUserIndex < 0) return;
        const retryThread = activeSession.messages
            .slice(0, lastUserIndex + 1)
            .map((m) => ({ ...m, status: 'done' as const }));
        updateActiveSession((session) => ({ ...session, messages: retryThread }));
        await requestAssistantResponse(activeSession.id, retryThread, activeSession);
    }, [isSending, requestAssistantResponse]);

    const stop = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
    }, []);

    return {
        isSending,
        errorMsg,
        setErrorMsg,
        requestAssistantResponse,
        sendPrompt,
        retryPrompt,
        stop
    };
};
