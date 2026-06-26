import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
    Bot,
    Check,
    Clipboard,
    Copy,
    ExternalLink,
    FilePlus2,
    History,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    Send,
    Shield,
    Sparkles,
    Trash2,
    Wand2,
    X
} from 'lucide-react';
import MessageMarkdown from '../chat/MessageMarkdown';
import { rewriteWorkspaceSourceUrl } from '../chat/sourceLinks';
import { api } from '../../services/api';
import type {
    PromptAssistantChatResponse,
    PromptAssistantDraft,
    PromptAssistantIntent,
    PromptAssistantSource
} from '../../services/api/promptAssistant';
import type { PromptDraft } from '../prompt-manager/types';

interface PromptAssistantPanelProps {
    initialQuery?: string;
    projectId?: string;
    contextLabel?: string;
    className?: string;
    compact?: boolean;
    showAdminControls?: boolean;
    sessionKey?: string;
    topK?: number;
}

interface PromptAssistantTurn {
    id: string;
    question: string;
    intent: PromptAssistantIntent;
    response: PromptAssistantChatResponse;
}

const intentOptions: Array<{ id: PromptAssistantIntent; label: string; icon: React.ElementType }> = [
    { id: 'idea_search', label: 'Ideas', icon: Search },
    { id: 'prompt_discovery', label: 'Find Prompt', icon: Sparkles },
    { id: 'prompt_draft', label: 'Draft Prompt', icon: Wand2 }
];

const CHAT_TIMEOUT_MS = 90000;
const SESSION_STORAGE_PREFIX = 'aimana_prompt_assistant_session_v1';

interface PromptAssistantSessionState {
    intent?: PromptAssistantIntent;
    turns?: PromptAssistantTurn[];
}

interface PromptAssistantSession {
    id: string;
    title: string;
    intent: PromptAssistantIntent;
    turns: PromptAssistantTurn[];
    createdAt: number;
    updatedAt: number;
}

interface SourcePreviewBounds {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

const createId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const sanitizeSessionTitle = (raw: string, fallback = 'New Session') => {
    const title = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!title) return fallback;
    return title.length > 44 ? `${title.slice(0, 44)}...` : title;
};

const createAssistantSession = (seedTitle = 'New Session'): PromptAssistantSession => {
    const now = Date.now();
    return {
        id: createId(),
        title: sanitizeSessionTitle(seedTitle),
        intent: 'idea_search',
        turns: [],
        createdAt: now,
        updatedAt: now
    };
};

const sourceTypeLabel = (value: string) => String(value || 'source')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const toChatSourceUrl = (source: PromptAssistantSource) => {
    const route = String(source.sourceRoute || '').trim();
    if (!route || route === '#') return '';
    return rewriteWorkspaceSourceUrl(route);
};

const draftTags = (draft: PromptAssistantDraft) => (
    Array.isArray(draft.tags) ? draft.tags.filter(Boolean) : []
);

const draftToPromptManagerRecord = (draft: PromptAssistantDraft): PromptDraft => {
    const now = Date.now();
    return {
        id: createId(),
        title: draft.title || 'Assistant prompt draft',
        prompt: draft.prompt || '',
        raw: draft.prompt || '',
        label: 'Prompt Assistant',
        tags: draftTags(draft).join(', '),
        note: [
            draft.sources ? `Sources: ${draft.sources}` : '',
            draft.variables ? `Variables: ${draft.variables}` : ''
        ].filter(Boolean).join('\n'),
        source: 'manual',
        status: 'staging',
        ingestionState: 'waiting',
        createdAt: now,
        updatedAt: now
    };
};

const buildClipboardDraft = (draft: PromptAssistantDraft) => [
    draft.title ? `Title: ${draft.title}` : '',
    draft.prompt ? `Prompt:\n${draft.prompt}` : '',
    draftTags(draft).length ? `Tags: ${draftTags(draft).join(', ')}` : '',
    draft.variables ? `Variables: ${draft.variables}` : '',
    draft.sources ? `Sources: ${draft.sources}` : ''
].filter(Boolean).join('\n\n');

const isPromptAssistantIntent = (value: unknown): value is PromptAssistantIntent => (
    typeof value === 'string' && intentOptions.some((option) => option.id === value)
);

const isPromptAssistantTurn = (value: unknown): value is PromptAssistantTurn => {
    const turn = value as PromptAssistantTurn;
    return !!turn
        && typeof turn === 'object'
        && typeof turn.id === 'string'
        && typeof turn.question === 'string'
        && isPromptAssistantIntent(turn.intent)
        && !!turn.response
        && typeof turn.response === 'object'
        && typeof turn.response.answer === 'string'
        && Array.isArray(turn.response.sources);
};

const readSessionState = (storageKey: string): PromptAssistantSessionState => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.sessionStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as PromptAssistantSessionState;
        return {
            intent: isPromptAssistantIntent(parsed?.intent) ? parsed.intent : undefined,
            turns: Array.isArray(parsed?.turns) ? parsed.turns.filter(isPromptAssistantTurn) : []
        };
    } catch {
        return {};
    }
};

const isPromptAssistantSession = (value: unknown): value is PromptAssistantSession => {
    const session = value as PromptAssistantSession;
    return !!session
        && typeof session === 'object'
        && typeof session.id === 'string'
        && typeof session.title === 'string'
        && isPromptAssistantIntent(session.intent)
        && Array.isArray(session.turns)
        && session.turns.every(isPromptAssistantTurn)
        && Number.isFinite(session.createdAt)
        && Number.isFinite(session.updatedAt);
};

const readSessions = (storageKey: string): PromptAssistantSession[] => {
    if (typeof window === 'undefined') return [createAssistantSession()];
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const sessions = parsed.filter(isPromptAssistantSession)
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 30);
                if (sessions.length > 0) return sessions;
            }
        }
    } catch {
        // Fall through to legacy session restore.
    }

    const legacy = readSessionState(storageKey);
    if ((legacy.turns || []).length > 0) {
        return [{
            ...createAssistantSession(legacy.turns?.[0]?.question || 'Restored Session'),
            intent: legacy.intent || 'idea_search',
            turns: legacy.turns || []
        }];
    }
    return [createAssistantSession()];
};

const PromptAssistantPanel: React.FC<PromptAssistantPanelProps> = ({
    initialQuery = '',
    projectId,
    contextLabel,
    className = '',
    compact = false,
    showAdminControls = true,
    sessionKey,
    topK
}) => {
    const navigate = useNavigate();
    const user = api.auth.getUser();
    const isAdmin = user?.role === 'admin' || user?.id === 'admin-root';
    const resolvedSessionKey = useMemo(() => (
        `${SESSION_STORAGE_PREFIX}:${sessionKey || projectId || contextLabel || 'default'}`
    ), [contextLabel, projectId, sessionKey]);
    const restoredSessionsRef = useRef<PromptAssistantSession[] | null>(null);
    if (restoredSessionsRef.current === null) {
        restoredSessionsRef.current = readSessions(resolvedSessionKey);
    }
    const [query, setQuery] = useState(initialQuery);
    const [sessions, setSessions] = useState<PromptAssistantSession[]>(restoredSessionsRef.current);
    const [activeSessionId, setActiveSessionId] = useState(restoredSessionsRef.current[0]?.id || '');
    const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
    const [isClearSessionConfirmOpen, setIsClearSessionConfirmOpen] = useState(false);
    const [isCreateSessionConfirmOpen, setIsCreateSessionConfirmOpen] = useState(false);
    const [isReindexConfirmOpen, setIsReindexConfirmOpen] = useState(false);
    const [deleteSessionConfirmId, setDeleteSessionConfirmId] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [activeSource, setActiveSource] = useState<PromptAssistantSource | null>(null);
    const [sourcePreviewBounds, setSourcePreviewBounds] = useState<SourcePreviewBounds | null>(null);
    const [isIndexing, setIsIndexing] = useState(false);
    const endRef = useRef<HTMLDivElement | null>(null);
    const sourcePreviewRef = useRef<HTMLDivElement | null>(null);
    const sourcePreviewAnchorRef = useRef<HTMLElement | null>(null);
    const chatAbortRef = useRef<AbortController | null>(null);
    const chatTimerRef = useRef<number | null>(null);
    const chatStatusTimersRef = useRef<number[]>([]);
    const previousSessionKeyRef = useRef(resolvedSessionKey);
    const skipNextPersistRef = useRef(false);
    const activeSession = useMemo(() => (
        sessions.find((session) => session.id === activeSessionId) || sessions[0] || null
    ), [activeSessionId, sessions]);
    const turns = activeSession?.turns || [];
    const intent = activeSession?.intent || 'idea_search';

    const updateActiveSession = useCallback((updater: (session: PromptAssistantSession) => PromptAssistantSession) => {
        setSessions((current) => current.map((session) => (
            session.id === (activeSession?.id || activeSessionId)
                ? updater({ ...session, updatedAt: Date.now() })
                : session
        )));
    }, [activeSession?.id, activeSessionId]);

    const setIntent = useCallback((nextIntent: PromptAssistantIntent) => {
        updateActiveSession((session) => ({ ...session, intent: nextIntent }));
    }, [updateActiveSession]);

    const setTurns = useCallback((updater: PromptAssistantTurn[] | ((turns: PromptAssistantTurn[]) => PromptAssistantTurn[])) => {
        updateActiveSession((session) => ({
            ...session,
            turns: typeof updater === 'function' ? updater(session.turns) : updater
        }));
    }, [updateActiveSession]);

    const updateSourcePreviewBounds = useCallback(() => {
        if (typeof window === 'undefined') return;
        const viewport = window.visualViewport;
        const viewportWidth = viewport?.width || window.innerWidth;
        const viewportHeight = viewport?.height || window.innerHeight;
        const viewportLeft = viewport?.offsetLeft || 0;
        const viewportTop = viewport?.offsetTop || 0;
        const margin = 16;
        const anchorRect = sourcePreviewAnchorRef.current?.getBoundingClientRect();
        const width = Math.min(600, Math.max(320, viewportWidth - (margin * 2)));

        if (!anchorRect || viewportWidth < 720) {
            setSourcePreviewBounds({
                top: viewportTop + margin,
                left: viewportLeft + margin,
                width: viewportWidth - (margin * 2),
                maxHeight: viewportHeight - (margin * 2)
            });
            return;
        }

        let left = anchorRect.left;
        if (left + width > viewportLeft + viewportWidth - margin) {
            left = viewportLeft + viewportWidth - width - margin;
        }
        left = Math.max(viewportLeft + margin, left);

        const preferredTop = anchorRect.bottom + 10;
        const belowMaxHeight = viewportTop + viewportHeight - preferredTop - margin;
        const aboveMaxHeight = anchorRect.top - viewportTop - (margin * 2);
        let top = preferredTop;
        let maxHeight = Math.min(640, belowMaxHeight);

        if (belowMaxHeight < 350 && aboveMaxHeight > belowMaxHeight) {
            maxHeight = Math.min(640, aboveMaxHeight);
            top = anchorRect.top - maxHeight - 10;
        }

        setSourcePreviewBounds({
            top: Math.max(viewportTop + margin, top),
            left,
            width,
            maxHeight: Math.max(280, maxHeight)
        });
    }, []);

    const closeSourcePreview = useCallback(() => {
        sourcePreviewAnchorRef.current = null;
        setActiveSource(null);
        setSourcePreviewBounds(null);
    }, []);

    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        if (previousSessionKeyRef.current !== resolvedSessionKey) {
            previousSessionKeyRef.current = resolvedSessionKey;
            skipNextPersistRef.current = true;
        }
        const restored = readSessions(resolvedSessionKey);
        setSessions(restored);
        setActiveSessionId(restored[0]?.id || '');
    }, [resolvedSessionKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (skipNextPersistRef.current) {
            skipNextPersistRef.current = false;
            return;
        }
        try {
            window.localStorage.setItem(resolvedSessionKey, JSON.stringify(sessions));
        } catch {
            // Session persistence is a convenience; chat should continue even if storage is unavailable.
        }
    }, [resolvedSessionKey, sessions]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, [turns.length, isSending]);

    useEffect(() => () => {
        chatAbortRef.current?.abort();
        if (chatTimerRef.current !== null) window.clearTimeout(chatTimerRef.current);
        chatStatusTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    }, []);

    useEffect(() => {
        if (!activeSource) return;
        updateSourcePreviewBounds();

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (sourcePreviewRef.current?.contains(target)) return;
            if (sourcePreviewAnchorRef.current?.contains(target)) return;
            closeSourcePreview();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeSourcePreview();
        };

        window.addEventListener('resize', updateSourcePreviewBounds);
        window.addEventListener('scroll', updateSourcePreviewBounds, true);
        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        window.visualViewport?.addEventListener('resize', updateSourcePreviewBounds);
        window.visualViewport?.addEventListener('scroll', updateSourcePreviewBounds);

        return () => {
            window.removeEventListener('resize', updateSourcePreviewBounds);
            window.removeEventListener('scroll', updateSourcePreviewBounds, true);
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
            window.visualViewport?.removeEventListener('resize', updateSourcePreviewBounds);
            window.visualViewport?.removeEventListener('scroll', updateSourcePreviewBounds);
        };
    }, [activeSource, closeSourcePreview, updateSourcePreviewBounds]);

    const latestDraft = useMemo(() => {
        for (let index = turns.length - 1; index >= 0; index -= 1) {
            const draft = turns[index]?.response?.draft;
            if (draft?.prompt) return draft;
        }
        return null;
    }, [turns]);

    const submit = useCallback(async (override?: { message?: string; intent?: PromptAssistantIntent }) => {
        const message = String(override?.message ?? query).trim();
        const selectedIntent = override?.intent || intent;
        if (!message || isSending) return;

        chatAbortRef.current?.abort();
        chatStatusTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        chatStatusTimersRef.current = [];
        if (chatTimerRef.current !== null) window.clearTimeout(chatTimerRef.current);
        const controller = new AbortController();
        let timedOut = false;
        chatAbortRef.current = controller;
        chatTimerRef.current = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, CHAT_TIMEOUT_MS);
        chatStatusTimersRef.current = [
            window.setTimeout(() => setStatusMessage('Still searching indexed context. Large indexes can take a moment.'), 10000),
            window.setTimeout(() => setStatusMessage('Drafting a grounded answer from the best matches.'), 24000)
        ];

        setIsSending(true);
        setError(null);
        setStatusMessage('Searching indexed context.');
        try {
            const response = await api.promptAssistant.chat({
                message,
                intent: selectedIntent,
                projectId,
                filters: projectId ? { projectId } : undefined,
                topK
            }, {
                signal: controller.signal
            });
            setSessions((current) => current.map((session) => {
                if (session.id !== activeSessionId) return session;
                const nextTurn = {
                    id: createId(),
                    question: message,
                    intent: selectedIntent,
                    response
                };
                const hadTurns = session.turns.length > 0;
                return {
                    ...session,
                    title: hadTurns ? session.title : sanitizeSessionTitle(message),
                    intent: selectedIntent,
                    turns: [...session.turns, nextTurn],
                    updatedAt: Date.now()
                };
            }));
            setQuery('');
        } catch (err: any) {
            if (timedOut) {
                setError('Prompt Assistant timed out while waiting for indexed context or the AI model. Try a shorter question, re-index, or try again in a moment.');
            } else if (err?.name === 'AbortError') {
                setStatusMessage('Prompt Assistant request stopped.');
            } else {
                setError(err?.message || 'Prompt Assistant could not answer right now.');
            }
        } finally {
            if (chatAbortRef.current === controller) chatAbortRef.current = null;
            if (chatTimerRef.current !== null) {
                window.clearTimeout(chatTimerRef.current);
                chatTimerRef.current = null;
            }
            chatStatusTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            chatStatusTimersRef.current = [];
            setIsSending(false);
            if (!timedOut && !controller.signal.aborted) setStatusMessage(null);
        }
    }, [activeSessionId, intent, isSending, projectId, query, topK]);

    const stopChat = useCallback(() => {
        chatAbortRef.current?.abort();
    }, []);

    const confirmClearSession = useCallback(() => {
        setIsClearSessionConfirmOpen(false);
        chatAbortRef.current?.abort();
        updateActiveSession((session) => ({
            ...session,
            title: 'New Session',
            intent: 'idea_search',
            turns: []
        }));
        setError(null);
        setStatusMessage('Prompt Assistant session cleared.');
        try {
            window.sessionStorage.removeItem(resolvedSessionKey);
        } catch {
            // Ignore storage failures.
        }
        window.setTimeout(() => setStatusMessage(null), 2600);
    }, [resolvedSessionKey, updateActiveSession]);

    const requestClearSession = useCallback(() => {
        setIsClearSessionConfirmOpen(true);
    }, []);

    const confirmCreateSession = useCallback(() => {
        setIsCreateSessionConfirmOpen(false);
        chatAbortRef.current?.abort();
        const session = createAssistantSession();
        setSessions((current) => [session, ...current].slice(0, 30));
        setActiveSessionId(session.id);
        setQuery('');
        setError(null);
        setStatusMessage('New Prompt Assistant session created.');
        setIsSessionPanelOpen(false);
        window.setTimeout(() => setStatusMessage(null), 2200);
    }, []);

    const requestCreateSession = useCallback(() => {
        if (isSending) return;
        setIsCreateSessionConfirmOpen(true);
    }, [isSending]);

    const confirmDeleteSession = useCallback(() => {
        const sessionId = deleteSessionConfirmId;
        if (!sessionId || isSending) return;
        setDeleteSessionConfirmId(null);
        setSessions((current) => {
            const next = current.filter((session) => session.id !== sessionId);
            if (next.length > 0) {
                if (sessionId === activeSessionId) setActiveSessionId(next[0].id);
                return next;
            }
            const fallback = createAssistantSession();
            setActiveSessionId(fallback.id);
            return [fallback];
        });
    }, [activeSessionId, deleteSessionConfirmId, isSending]);

    const requestDeleteSession = useCallback((sessionId: string) => {
        if (isSending) return;
        setDeleteSessionConfirmId(sessionId);
    }, [isSending]);

    const copyText = useCallback(async (value: string, label = 'Copied') => {
        try {
            await navigator.clipboard.writeText(value);
            setStatusMessage(label);
            window.setTimeout(() => setStatusMessage(null), 2600);
        } catch {
            setError('Clipboard access is unavailable in this browser.');
        }
    }, []);

    const saveDraft = useCallback(async (draft: PromptAssistantDraft) => {
        if (!draft.prompt.trim()) return;
        setStatusMessage(null);
        setError(null);
        try {
            await api.settings.appendPromptManagerDrafts([draftToPromptManagerRecord(draft)]);
            setStatusMessage('Draft saved to Prompt Manager staging.');
            window.dispatchEvent(new CustomEvent('settings-updated'));
        } catch (err: any) {
            setError(err?.message || 'Unable to save draft to Prompt Manager.');
        }
    }, []);

    const refineDraft = useCallback((draft: PromptAssistantDraft) => {
        const seed = [
            'Refine this generated prompt using the strongest related source context.',
            draft.title ? `Title: ${draft.title}` : '',
            draft.prompt ? `Prompt: ${draft.prompt}` : ''
        ].filter(Boolean).join('\n\n');
        setQuery(seed);
        setIntent('prompt_refinement');
        setStatusMessage('Draft loaded for refinement.');
    }, []);

    const runIndex = useCallback(async () => {
        if (!isAdmin || isIndexing) return;
        setIsReindexConfirmOpen(false);
        setIsIndexing(true);
        setError(null);
        setStatusMessage(null);
        try {
            const result = await api.promptAssistant.index();
            setStatusMessage(`Index refreshed: ${result.chunksCreated} created, ${result.chunksUpdated} updated, ${result.chunksDeleted} deleted.`);
        } catch (err: any) {
            setError(err?.message || 'Re-index failed.');
        } finally {
            setIsIndexing(false);
        }
    }, [isAdmin, isIndexing]);

    const requestReindex = useCallback(() => {
        if (!isAdmin || isIndexing) return;
        setIsReindexConfirmOpen(true);
    }, [isAdmin, isIndexing]);

    const openSource = useCallback((source: PromptAssistantSource, anchor?: HTMLElement | null) => {
        sourcePreviewAnchorRef.current = anchor || null;
        setActiveSource(source);
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(updateSourcePreviewBounds);
        } else {
            updateSourcePreviewBounds();
        }
    }, [updateSourcePreviewBounds]);

    const openActiveSourceRoute = useCallback(() => {
        if (!activeSource) return;
        const route = toChatSourceUrl(activeSource);
        if (!route) {
            setStatusMessage('This source does not have a workspace route.');
            window.setTimeout(() => setStatusMessage(null), 2600);
            return;
        }
        window.open(route, '_blank', 'noopener,noreferrer');
    }, [activeSource]);

    const empty = turns.length === 0 && !isSending;

    const panelHeightClass = compact
        ? 'min-h-[420px] max-h-[720px]'
        : 'min-h-[520px] max-h-[calc(100vh-8rem)]';

    return (
        <section className={`relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#08101e] shadow-xl shadow-black/10 ${panelHeightClass} ${className}`}>
            <div className="border-b border-slate-800 bg-slate-950/60 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
                                <Bot size={17} />
                            </span>
                            <div>
                                <h2 className="text-lg font-black text-white">Prompt Assistant</h2>
                                <p className="text-xs text-slate-400">
                                    Grounded idea search across indexed AIMANA projects, prompts, and manifests.
                                </p>
                            </div>
                        </div>
                        {contextLabel && (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-300">
                                <Shield size={12} className="text-cyan-300" />
                                Context: {contextLabel}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setIsSessionPanelOpen((value) => !value)}
                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black uppercase tracking-widest transition-colors ${
                            isSessionPanelOpen
                                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100'
                                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-400/50 hover:text-white'
                        }`}
                        aria-expanded={isSessionPanelOpen}
                        aria-controls="prompt-assistant-session-panel"
                    >
                        <History size={14} />
                        Sessions
                    </button>
                    <button
                        type="button"
                        onClick={requestCreateSession}
                        disabled={isSending}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Plus size={14} />
                        New Session
                    </button>
                    {turns.length > 0 && (
                        <button
                            type="button"
                            onClick={requestClearSession}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-red-400/50 hover:text-white"
                        >
                            <X size={14} />
                            Clear Session
                        </button>
                    )}
                    {showAdminControls && isAdmin && (
                        <button
                            type="button"
                            onClick={requestReindex}
                            disabled={isIndexing}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-black uppercase tracking-widest text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isIndexing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Re-index
                        </button>
                    )}
                    </div>
                </div>
            </div>

            {isSessionPanelOpen && (
                <>
                    <button
                        type="button"
                        onClick={() => setIsSessionPanelOpen(false)}
                        className="absolute inset-0 z-20 bg-black/40 lg:hidden"
                        aria-label="Close sessions panel"
                    />
                    <aside
                        id="prompt-assistant-session-panel"
                        className="absolute right-0 top-0 z-30 flex h-full w-full max-w-96 flex-col border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-md sm:w-[92vw] lg:w-96"
                    >
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/60 p-4">
                            <h3 className="flex items-center gap-2 text-sm font-black text-white">
                                <History size={16} className="text-indigo-300" />
                                Session History
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsSessionPanelOpen(false)}
                                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
                                aria-label="Hide sessions"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar">
                            <div className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Recent Sessions</div>
                            {sessions.map((session) => {
                                const isActive = session.id === activeSessionId;
                                return (
                                    <div
                                        key={session.id}
                                        className={`group relative overflow-hidden rounded-xl border p-4 transition-colors ${
                                            isActive
                                                ? 'border-indigo-500/40 bg-indigo-500/10'
                                                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                                        }`}
                                    >
                                        {isActive && <div className="absolute bottom-0 left-0 top-0 w-1 bg-indigo-500" />}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                chatAbortRef.current?.abort();
                                                setActiveSessionId(session.id);
                                                setIsSessionPanelOpen(false);
                                            }}
                                            disabled={isSending}
                                            className="w-full min-w-0 rounded-md pr-11 text-left disabled:cursor-not-allowed disabled:opacity-60"
                                            aria-current={isActive ? 'true' : undefined}
                                        >
                                            <p className={`truncate text-sm font-black ${isActive ? 'pl-2 text-indigo-100' : 'text-slate-200'}`}>
                                                {session.title || 'New Session'}
                                            </p>
                                            <p className={`mt-1.5 truncate text-[10px] font-mono ${isActive ? 'pl-2 text-indigo-300/70' : 'text-slate-500'}`}>
                                                {new Date(session.updatedAt).toLocaleString()}
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => requestDeleteSession(session.id)}
                                            disabled={isSending}
                                            className="absolute right-3 top-3 rounded-lg border border-slate-700/60 p-2 text-slate-500 opacity-100 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 sm:opacity-0 sm:group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                                            aria-label="Delete session"
                                            title="Delete session"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                            <button
                                type="button"
                                onClick={requestCreateSession}
                                disabled={isSending}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 py-3 text-xs font-black uppercase tracking-widest text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Plus size={14} />
                                New Session
                            </button>
                        </div>
                    </aside>
                </>
            )}

            {deleteSessionConfirmId && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-assistant-delete-title" aria-describedby="prompt-assistant-delete-description">
                    <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                        <div className="border-b border-slate-800 px-5 py-4">
                            <h3 id="prompt-assistant-delete-title" className="text-sm font-black uppercase tracking-widest text-white">Delete Session?</h3>
                            <p id="prompt-assistant-delete-description" className="mt-2 text-xs text-slate-400">Are you sure you want to delete this session? This action cannot be undone.</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setDeleteSessionConfirmId(null)}
                                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                            >
                                No
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteSession}
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isReindexConfirmOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-assistant-reindex-title" aria-describedby="prompt-assistant-reindex-description">
                    <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                        <div className="border-b border-slate-800 px-5 py-4">
                            <h3 id="prompt-assistant-reindex-title" className="text-sm font-black uppercase tracking-widest text-white">Re-Index Workspace?</h3>
                            <p id="prompt-assistant-reindex-description" className="mt-2 text-xs text-slate-400">Are you sure you want to refresh the Aima Chat index now?</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setIsReindexConfirmOpen(false)}
                                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                            >
                                No
                            </button>
                            <button
                                type="button"
                                onClick={runIndex}
                                className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isCreateSessionConfirmOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-assistant-create-title" aria-describedby="prompt-assistant-create-description">
                    <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                        <div className="border-b border-slate-800 px-5 py-4">
                            <h3 id="prompt-assistant-create-title" className="text-sm font-black uppercase tracking-widest text-white">Create New Session?</h3>
                            <p id="prompt-assistant-create-description" className="mt-2 text-xs text-slate-400">Are you sure you want to create a new session? Your current conversation will stay saved in Session History.</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setIsCreateSessionConfirmOpen(false)}
                                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                            >
                                No
                            </button>
                            <button
                                type="button"
                                onClick={confirmCreateSession}
                                className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isClearSessionConfirmOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-assistant-clear-title" aria-describedby="prompt-assistant-clear-description">
                    <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                        <div className="border-b border-slate-800 px-5 py-4">
                            <h3 id="prompt-assistant-clear-title" className="text-sm font-black uppercase tracking-widest text-white">Clear Session?</h3>
                            <p id="prompt-assistant-clear-description" className="mt-2 text-xs text-slate-400">This will remove the current Prompt Assistant turns from this session.</p>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setIsClearSessionConfirmOpen(false)}
                                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                            >
                                No
                            </button>
                            <button
                                type="button"
                                onClick={confirmClearSession}
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeSource && (
                <div className="fixed inset-0 z-50 pointer-events-none">
                    <div
                        ref={sourcePreviewRef}
                        className="pointer-events-auto fixed flex max-w-[calc(100vw-2rem)] origin-top-left flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl transition-[top,left]"
                        style={sourcePreviewBounds ? {
                            top: sourcePreviewBounds.top,
                            left: sourcePreviewBounds.left,
                            width: sourcePreviewBounds.width,
                            maxHeight: sourcePreviewBounds.maxHeight
                        } : {
                            top: 16,
                            left: 16,
                            width: 'calc(100vw - 2rem)',
                            maxHeight: 'calc(100vh - 2rem)'
                        }}
                        role="dialog"
                        aria-modal="false"
                        aria-labelledby="prompt-assistant-source-title"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-3 sm:px-5">
                            <div className="min-w-0">
                                <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-300">
                                    <ExternalLink size={13} />
                                    {sourceTypeLabel(activeSource.sourceType)}
                                </div>
                                <h3 id="prompt-assistant-source-title" className="truncate text-base font-black text-white">
                                    {activeSource.title || activeSource.sourceId || 'Source'}
                                </h3>
                                <p className="mt-1 truncate text-xs text-slate-500">
                                    {toChatSourceUrl(activeSource) || 'No workspace route available'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeSourcePreview}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                                aria-label="Close source preview"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar sm:px-5">
                            {activeSource.snippet ? (
                                <div className="whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm leading-6 text-slate-200">
                                    {activeSource.snippet}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
                                    No preview text was captured for this source.
                                </div>
                            )}
                            <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Source ID</div>
                                    <div className="mt-1 break-all font-mono">{activeSource.sourceId || 'n/a'}</div>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Match Score</div>
                                    <div className="mt-1 font-mono">{Number.isFinite(activeSource.score) ? activeSource.score.toFixed(3) : 'n/a'}</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 sm:px-5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Preview keeps AIMA chat open
                            </span>
                            <button
                                type="button"
                                onClick={openActiveSourceRoute}
                                disabled={!toChatSourceUrl(activeSource)}
                                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-100 transition-colors hover:bg-cyan-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <ExternalLink size={14} />
                                Open Source
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950/50 p-4 custom-scrollbar sm:p-5">
                {empty && (
                    <div className="flex min-h-[220px] items-center justify-center text-center">
                        <div className="max-w-lg">
                            <Sparkles size={24} className="mx-auto text-cyan-300" />
                            <h3 className="mt-3 text-sm font-black text-slate-100">Ask from indexed workspace content</h3>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                Search for creative direction, locate useful prompts, or draft a new prompt from related records.
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-5">
                    {turns.map((turn) => (
                        <article key={turn.id} className="space-y-3">
                            <div className="flex justify-end">
                                <div className="max-w-[88%] rounded-xl rounded-tr-sm border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm leading-relaxed text-slate-100">
                                    {turn.question}
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-200">
                                        <Sparkles size={12} />
                                        {intentOptions.find((option) => option.id === turn.intent)?.label || sourceTypeLabel(turn.intent)}
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        {turn.response.matchCount} match{turn.response.matchCount === 1 ? '' : 'es'}
                                    </div>
                                </div>

                                {turn.response.noSource ? (
                                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                                        {turn.response.indexEmpty
                                            ? 'No indexed workspace context is available yet. Refresh the index and ask again.'
                                            : 'No reliable indexed source was found for this request.'}
                                    </div>
                                ) : null}

                                <div className="mt-3 text-sm text-slate-200">
                                    <MessageMarkdown
                                        content={turn.response.answer || '(No answer returned)'}
                                        onCopyStatus={setStatusMessage}
                                        messageId={`prompt-assistant-${turn.id}`}
                                    />
                                </div>

                                {turn.response.draft?.prompt && (
                                    <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-cyan-200">Generated Draft</div>
                                                <h3 className="mt-1 text-base font-black text-white">{turn.response.draft.title || 'Untitled draft'}</h3>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => copyText(buildClipboardDraft(turn.response.draft!), 'Draft copied.')}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400/50"
                                                >
                                                    <Copy size={13} /> Copy
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => refineDraft(turn.response.draft!)}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-400/50"
                                                >
                                                    <Wand2 size={13} /> Refine
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => saveDraft(turn.response.draft!)}
                                                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-500"
                                                >
                                                    <FilePlus2 size={13} /> Save
                                                </button>
                                            </div>
                                        </div>
                                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-200 custom-scrollbar">
                                            {turn.response.draft.prompt}
                                        </pre>
                                        {draftTags(turn.response.draft).length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {draftTags(turn.response.draft).map((tag) => (
                                                    <span key={tag} className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {turn.response.sources.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sources</div>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            {turn.response.sources.map((source, index) => (
                                                <button
                                                    key={`${turn.id}-${source.id}-${index}`}
                                                    type="button"
                                                    onClick={(event) => openSource(source, event.currentTarget)}
                                                    className="group rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-slate-900"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] font-mono text-slate-500">[{index + 1}] {sourceTypeLabel(source.sourceType)}</div>
                                                            <div className="mt-1 truncate text-xs font-bold text-cyan-200">{source.title || source.sourceId}</div>
                                                        </div>
                                                        <ExternalLink size={13} className="mt-0.5 shrink-0 text-slate-600 group-hover:text-cyan-300" />
                                                    </div>
                                                    {source.snippet && (
                                                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{source.snippet}</p>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </article>
                    ))}

                    {isSending && (
                        <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm font-semibold text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <Loader2 size={16} className="animate-spin text-cyan-300" />
                                {statusMessage || 'Searching indexed context and drafting an answer.'}
                            </div>
                            <button
                                type="button"
                                onClick={stopChat}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-red-400/50 hover:text-white"
                            >
                                <X size={13} />
                                Stop
                            </button>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>
            </div>

            <div className="sticky bottom-0 z-20 shrink-0 border-t border-slate-800 bg-slate-950/95 p-4 shadow-[0_-15px_30px_rgba(0,0,0,0.3)] backdrop-blur sm:p-5">
                {error && (
                    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
                        <span>{error}</span>
                        <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="text-red-200 hover:text-white">
                            <X size={13} />
                        </button>
                    </div>
                )}
                {!isSending && statusMessage && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                        <Check size={13} />
                        {statusMessage}
                    </div>
                )}

                <div className="mb-3 flex flex-wrap gap-2">
                    {intentOptions.map((option) => {
                        const Icon = option.icon;
                        const active = intent === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setIntent(option.id)}
                                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                                    active
                                        ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-white'
                                }`}
                            >
                                <Icon size={13} />
                                {option.label}
                            </button>
                        );
                    })}
                    {latestDraft && (
                        <button
                            type="button"
                            onClick={() => copyText(buildClipboardDraft(latestDraft), 'Latest draft copied.')}
                            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-400/40 hover:text-white"
                        >
                            <Clipboard size={13} />
                            Copy Latest Draft
                        </button>
                    )}
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                    className="flex flex-col gap-3 sm:flex-row"
                >
                    <textarea
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        rows={compact ? 2 : 3}
                        placeholder="Ask for ideas, matching prompts, or a new prompt draft..."
                        className="min-h-[52px] flex-1 resize-y rounded-lg border border-slate-800 bg-[#020b18] px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/10"
                    />
                    <button
                        type="submit"
                        disabled={isSending || !query.trim()}
                        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 text-sm font-black text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Ask
                    </button>
                </form>
            </div>
        </section>
    );
};

export default PromptAssistantPanel;
