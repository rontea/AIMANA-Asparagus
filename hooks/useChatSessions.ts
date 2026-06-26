import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatContext, ChatSession } from '../components/chat/types';
import { createSession, hydrateSessions, MAX_SESSIONS, STORAGE_KEY, serializeSessionsForStorage } from '../components/chat/utils';
import { getChatAudio, getChatImage } from '../components/chat/mediaStore';
import { api } from '../services/api';

interface UseChatSessionsResult {
    sessions: ChatSession[];
    activeSessionId: string;
    activeSession: ChatSession | null;
    setActiveSessionId: (sessionId: string) => void;
    updateSessionById: (sessionId: string, updater: (session: ChatSession) => ChatSession) => void;
    updateActiveSession: (updater: (session: ChatSession) => ChatSession) => void;
    createSessionAndSwitch: (preferredModelId?: string) => void;
    deleteSession: (sessionId: string, preferredModelId?: string) => void;
}

interface UseChatSessionsOptions {
    persist?: boolean;
    allowMultiple?: boolean;
}

const getNewestUpdate = (items: ChatSession[]) =>
    items.reduce((latest, session) => Math.max(latest, Number(session.updatedAt) || 0), 0);

const getReplaceChatSessions = () => {
    const replace = api.chatSessions?.replace;
    return typeof replace === 'function' ? replace.bind(api.chatSessions) : null;
};

export const useChatSessions = (context: ChatContext, options: UseChatSessionsOptions = {}): UseChatSessionsResult => {
    const persist = options.persist !== false;
    const allowMultiple = options.allowMultiple !== false;
    const buildInitial = () => createSession(context);
    const sessionsRef = useRef<ChatSession[]>([]);
    const remoteLoadedRef = useRef(false);
    const lastPersistedPayloadRef = useRef('');

    const [sessions, setSessions] = useState<ChatSession[]>(() => {
        if (!persist) return [buildInitial()];
        try {
            const hydrated = hydrateSessions(localStorage.getItem(STORAGE_KEY));
            if (hydrated.length > 0) return hydrated;
        } catch {}
        return [buildInitial()];
    });
    const [activeSessionId, setActiveSessionId] = useState(() => {
        return sessions[0]?.id || '';
    });
    const [remoteLoaded, setRemoteLoaded] = useState(false);

    const activeSession = useMemo(
        () => sessions.find((s) => s.id === activeSessionId) || null,
        [sessions, activeSessionId]
    );

    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    useEffect(() => {
        remoteLoadedRef.current = remoteLoaded;
    }, [remoteLoaded]);

    const updateSessionById = useCallback((sessionId: string, updater: (session: ChatSession) => ChatSession) => {
        setSessions((prev) => prev.map((session) => (
            session.id === sessionId ? updater({ ...session, updatedAt: Date.now() }) : session
        )));
    }, []);

    const updateActiveSession = useCallback((updater: (session: ChatSession) => ChatSession) => {
        if (!activeSessionId) return;
        updateSessionById(activeSessionId, updater);
    }, [activeSessionId, updateSessionById]);

    const createSessionAndSwitch = useCallback((preferredModelId = '') => {
        if (!allowMultiple) return;
        const session = createSession(context);
        const withModel = { ...session, modelId: preferredModelId };
        setSessions((prev) => [withModel, ...prev].slice(0, MAX_SESSIONS));
        setActiveSessionId(withModel.id);
    }, [allowMultiple, context]);

    const deleteSession = useCallback((sessionId: string, preferredModelId = '') => {
        if (!allowMultiple) return;
        setSessions((prev) => {
            const next = prev.filter((s) => s.id !== sessionId);
            if (next.length > 0) {
                if (activeSessionId === sessionId) setActiveSessionId(next[0].id);
                return next;
            }
            const fallback = createSession(context);
            fallback.modelId = preferredModelId;
            setActiveSessionId(fallback.id);
            return [fallback];
        });
    }, [activeSessionId, allowMultiple, context]);

    useEffect(() => {
        if (!persist) {
            const initial = createSession(context);
            setSessions([initial]);
            setActiveSessionId(initial.id);
            return;
        }
        let cancelled = false;
        const syncFromDatabase = async () => {
            try {
                const remote = await api.chatSessions.list();
                const replaceChatSessions = getReplaceChatSessions();
                let remoteSessions = hydrateSessions(JSON.stringify(remote.sessions || []));
                const localSessions = hydrateSessions(localStorage.getItem(STORAGE_KEY));
                const remoteUpdatedAt = Math.max(Number(remote.updatedAt) || 0, getNewestUpdate(remoteSessions));
                const localUpdatedAt = getNewestUpdate(localSessions);

                if (replaceChatSessions && localSessions.length > 0 && (remoteSessions.length === 0 || localUpdatedAt > remoteUpdatedAt)) {
                    await replaceChatSessions(localSessions);
                    remoteSessions = localSessions;
                }
                if (cancelled) return;
                if (remoteSessions.length > 0) {
                    setSessions(remoteSessions);
                    setActiveSessionId(remoteSessions[0].id);
                } else {
                    const initial = createSession(context);
                    setSessions([initial]);
                    setActiveSessionId(initial.id);
                }
            } catch {
                if (cancelled) return;
                try {
                    const hydrated = hydrateSessions(localStorage.getItem(STORAGE_KEY));
                    if (hydrated.length > 0) {
                        setSessions(hydrated);
                        setActiveSessionId(hydrated[0].id);
                    } else {
                        const initial = createSession(context);
                        setSessions([initial]);
                        setActiveSessionId(initial.id);
                    }
                } catch {
                    const initial = createSession(context);
                    setSessions([initial]);
                    setActiveSessionId(initial.id);
                }
            } finally {
                if (!cancelled) setRemoteLoaded(true);
            }
        };
        void syncFromDatabase();
        return () => {
            cancelled = true;
        };
    }, [context, persist]);

    useEffect(() => {
        if (!persist) return;
        if (sessions.length === 0) return;
        if (!remoteLoaded) return;
        const toPersist = sessions.slice(0, MAX_SESSIONS);
        const payload = JSON.stringify(toPersist);
        try {
            localStorage.setItem(STORAGE_KEY, serializeSessionsForStorage(toPersist));
        } catch {
            try {
                localStorage.setItem(STORAGE_KEY, serializeSessionsForStorage(toPersist, { maxMessagesPerSession: 20 }));
            } catch {
                try {
                    localStorage.removeItem(STORAGE_KEY);
                } catch {}
            }
        }
        if (payload === lastPersistedPayloadRef.current) return;
        const timer = window.setTimeout(() => {
            const replaceChatSessions = getReplaceChatSessions();
            if (!replaceChatSessions) return;
            void replaceChatSessions(toPersist).then(() => {
                lastPersistedPayloadRef.current = payload;
            }).catch(() => {
                // local fallback remains available
            });
        }, 500);
        return () => {
            window.clearTimeout(timer);
        };
    }, [persist, remoteLoaded, sessions]);

    useEffect(() => {
        if (!persist) return;

        const flushToDatabase = () => {
            if (!remoteLoadedRef.current) return;
            const currentSessions = sessionsRef.current.slice(0, MAX_SESSIONS);
            if (currentSessions.length === 0) return;
            const payload = JSON.stringify(currentSessions);
            if (payload === lastPersistedPayloadRef.current) return;
            const replaceChatSessions = getReplaceChatSessions();
            if (!replaceChatSessions) return;
            void replaceChatSessions(currentSessions, { keepalive: true }).then(() => {
                lastPersistedPayloadRef.current = payload;
            }).catch(() => {
                // local fallback remains available
            });
        };

        window.addEventListener('pagehide', flushToDatabase);
        return () => {
            window.removeEventListener('pagehide', flushToDatabase);
        };
    }, [persist]);

    useEffect(() => {
        if (!persist) return;
        if (sessions.length === 0) return;
        let cancelled = false;
        const hydrateMedia = async () => {
            const missingImages = new Set<string>();
            const missingAudios = new Set<string>();
            sessions.forEach((session) => {
                session.messages.forEach((message) => {
                    if (Array.isArray(message.imageInputs)) {
                        message.imageInputs.forEach((image) => {
                            if (!image.url && image.id) missingImages.add(image.id);
                        });
                    }
                    if (Array.isArray(message.audioInputs)) {
                        message.audioInputs.forEach((audio) => {
                            if (!audio.data && !audio.url && audio.id) missingAudios.add(audio.id);
                        });
                    }
                });
            });
            if (missingImages.size === 0 && missingAudios.size === 0) return;

            const imageMap = new Map<string, { url: string }>();
            for (const id of missingImages) {
                try {
                    const record = await getChatImage(id);
                    if (record?.url) imageMap.set(id, { url: record.url });
                } catch {}
            }

            const audioMap = new Map<string, { data: string; format: string; mimeType?: string }>();
            for (const id of missingAudios) {
                try {
                    const record = await getChatAudio(id);
                    if (record?.data && record?.format) {
                        audioMap.set(id, { data: record.data, format: record.format, mimeType: record.mimeType });
                    }
                } catch {}
            }

            if (cancelled) return;
            if (imageMap.size === 0 && audioMap.size === 0) return;

            setSessions((prev) => {
                let changed = false;
                const next = prev.map((session) => {
                    let sessionChanged = false;
                    const nextMessages = session.messages.map((message) => {
                        let updatedMessage = message;
                        if (Array.isArray(message.imageInputs)) {
                            let imagesChanged = false;
                            const nextImages = message.imageInputs.map((image) => {
                                if (image.url || !image.id) return image;
                                const stored = imageMap.get(image.id);
                                if (!stored) return image;
                                sessionChanged = true;
                                imagesChanged = true;
                                return { ...image, url: stored.url };
                            });
                            if (imagesChanged) {
                                updatedMessage = { ...updatedMessage, imageInputs: nextImages };
                            }
                        }
                        if (Array.isArray(message.audioInputs)) {
                            let audiosChanged = false;
                            const nextAudios = message.audioInputs.map((audio) => {
                                if (audio.data || audio.url || !audio.id) return audio;
                                const stored = audioMap.get(audio.id);
                                if (!stored) return audio;
                                sessionChanged = true;
                                audiosChanged = true;
                                return {
                                    ...audio,
                                    data: stored.data,
                                    format: audio.format || stored.format,
                                    mimeType: audio.mimeType || stored.mimeType
                                };
                            });
                            if (audiosChanged) {
                                updatedMessage = { ...updatedMessage, audioInputs: nextAudios };
                            }
                        }
                        return updatedMessage;
                    });
                    if (sessionChanged) {
                        changed = true;
                        return { ...session, messages: nextMessages };
                    }
                    return session;
                });
                return changed ? next : prev;
            });
        };
        hydrateMedia();
        return () => {
            cancelled = true;
        };
    }, [persist, sessions]);

    return {
        sessions,
        activeSessionId,
        activeSession,
        setActiveSessionId,
        updateSessionById,
        updateActiveSession,
        createSessionAndSwitch,
        deleteSession
    };
};
