import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { loadDynamicRegistry, ModelOption } from '../components/project/lab/ModelSelector/registry/index';
import ChatHeader from '../components/chat/ChatHeader';
import ChatTopBar, { ReadAloudVoiceOption } from '../components/chat/ChatTopBar';
import ChatMessageList from '../components/chat/ChatMessageList';
import ChatComposer from '../components/chat/ChatComposer';
import ChatSessionPanel from '../components/chat/ChatSessionPanel';
import ChatConfirmDialog from '../components/chat/ChatConfirmDialog';
import { ChatMessage, ChatAudioInput, ChatContext, ChatImageInput, ChatSession, ConfirmDialogState } from '../components/chat/types';
import { buildTranscript, createId, sanitizeSessionTitle } from '../components/chat/utils';
import { createBrowserTtsController } from '../components/chat/browserTts';
import { useChatSessions } from '../hooks/useChatSessions';
import { useChatRuntime } from '../hooks/useChatRuntime';
import { useChatItemCapture } from '../hooks/useChatItemCapture';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import { Project } from '../types';
import { ChatMemory } from '../types/chatMemory';
import { api } from '../services/api';
import { saveChatAudio, saveChatImage } from '../components/chat/mediaStore';
import { clearPollenCreditContext, dispatchPollenCreditContext } from '../utils/pollenCreditChannel';
import { formatPollenAmount, getPrimaryModelCreditRate } from '../utils/pollenCredits';

type CapabilityFilter = 'search' | 'tools' | 'reasoning' | 'image_input' | 'audio_input';
type ReadAloudUiState = 'idle' | 'playing' | 'paused' | 'disabled';
const DEFAULT_READ_ALOUD_VOICE_OPTION: ReadAloudVoiceOption = {
    value: '',
    label: 'System default'
};

const buildReadAloudVoiceOptions = (voices: SpeechSynthesisVoice[]): ReadAloudVoiceOption[] => {
    if (!Array.isArray(voices) || voices.length === 0) return [DEFAULT_READ_ALOUD_VOICE_OPTION];
    const byUri = new Map<string, { value: string; label: string; isDefault: boolean }>();
    voices.forEach((voice) => {
        const voiceURI = String(voice?.voiceURI || '').trim();
        if (!voiceURI || byUri.has(voiceURI)) return;
        const name = String(voice?.name || '').trim() || voiceURI;
        const lang = String(voice?.lang || '').trim();
        const isDefault = voice?.default === true;
        const defaultSuffix = isDefault ? ' [default]' : '';
        const label = lang
            ? `${name} (${lang})${defaultSuffix}`
            : `${name}${defaultSuffix}`;
        byUri.set(voiceURI, { value: voiceURI, label, isDefault });
    });

    const sorted = Array.from(byUri.values()).sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.label.localeCompare(b.label);
    });

    return [
        DEFAULT_READ_ALOUD_VOICE_OPTION,
        ...sorted.map(({ value, label }) => ({ value, label }))
    ];
};

const AIChat: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const messageEndRef = useRef<HTMLDivElement | null>(null);
    const confirmCancelRef = useRef<HTMLButtonElement | null>(null);
    const confirmActionRef = useRef<HTMLButtonElement | null>(null);
    const captureTimeoutRef = useRef<number | null>(null);
    const saveSnapshotTimeoutRef = useRef<number | null>(null);
    const searchAutoDefaultKeyRef = useRef<string>('');
    const loadedChatItemRef = useRef<string>('');
    const lastSavedSnapshotRef = useRef<string>('');
    const pendingSnapshotRef = useRef<{ signature: string; session: any } | null>(null);
    const isSnapshotSavingRef = useRef(false);
    const memoryLoadedRef = useRef<Set<string>>(new Set());
    const memorySyncSignatureRef = useRef<string>('');
    const memorySyncTimeoutRef = useRef<number | null>(null);
    const routeCleanupInitializedRef = useRef(false);
    const ttsControllerRef = useRef<ReturnType<typeof createBrowserTtsController> | null>(null);

    const context = useMemo<ChatContext>(() => {
        const q = new URLSearchParams(location.search);
        return {
            source: q.get('from') || 'generate',
            projectId: q.get('projectId') || ''
        };
    }, [location.search]);

    const chatItemId = useMemo(() => {
        const q = new URLSearchParams(location.search);
        return q.get('chatItemId') || '';
    }, [location.search]);

    const [models, setModels] = useState<ModelOption[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(true);
    const [input, setInput] = useState('');
    const [pendingImageInputs, setPendingImageInputs] = useState<ChatImageInput[]>([]);
    const [pendingAudioInputs, setPendingAudioInputs] = useState<ChatAudioInput[]>([]);
    const [captureMsg, setCaptureMsg] = useState<string | null>(null);
    const [showRuntimeSettings, setShowRuntimeSettings] = useState(false);
    const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
    const [reasoningPanelMessageId, setReasoningPanelMessageId] = useState<string | null>(null);
    const [isConversationFullscreen, setIsConversationFullscreen] = useState(false);
    const [capabilityFilters, setCapabilityFilters] = useState<CapabilityFilter[]>([]);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [isCaptureProjectModalOpen, setIsCaptureProjectModalOpen] = useState(false);
    const [captureProjectId, setCaptureProjectId] = useState('');
    const [captureProjects, setCaptureProjects] = useState<Project[]>([]);
    const [pendingCaptureSessionId, setPendingCaptureSessionId] = useState<string | null>(null);
    const [sessionTitleDraft, setSessionTitleDraft] = useState('');
    const [isReadAloudSupported, setIsReadAloudSupported] = useState(false);
    const [activeReadAloudMessageId, setActiveReadAloudMessageId] = useState<string | null>(null);
    const [readAloudUiStateByMessageId, setReadAloudUiStateByMessageId] = useState<Partial<Record<string, ReadAloudUiState>>>({});
    const [readAloudA11yStatus, setReadAloudA11yStatus] = useState('');
    const [readAloudVoiceOptions, setReadAloudVoiceOptions] = useState<ReadAloudVoiceOption[]>([DEFAULT_READ_ALOUD_VOICE_OPTION]);
    const [globalReadAloudDefault, setGlobalReadAloudDefault] = useState<{ voiceURI: string; voiceName: string }>({
        voiceURI: '',
        voiceName: ''
    });

    const isStandaloneProjectChat = context.source === 'project';
    const {
        sessions,
        activeSessionId,
        activeSession,
        setActiveSessionId,
        updateSessionById,
        updateActiveSession,
        createSessionAndSwitch,
        deleteSession
    } = useChatSessions(context, {
        persist: !isStandaloneProjectChat,
        allowMultiple: !isStandaloneProjectChat
    });

    const modelLookup = useMemo(() => {
        const lookup: Record<string, ModelOption> = {};
        models.forEach((model) => {
            lookup[String(model.id)] = model;
        });
        return lookup;
    }, [models]);

    const {
        isSending,
        errorMsg,
        setErrorMsg,
        requestAssistantResponse,
        sendPrompt,
        retryPrompt,
        stop
    } = useChatRuntime(sessions, updateSessionById, modelLookup);

    const {
        isCapturing,
        error: captureError,
        clearError: clearCaptureError,
        captureToProject
    } = useChatItemCapture();

    const modelSupportsSearch = useCallback((model: ModelOption | null | undefined) => {
        if (!model) return false;
        const caps = Array.isArray(model.capabilities) ? model.capabilities : [];
        if (String(model.provider || '').toLowerCase() === 'pollinations') {
            if (caps.includes('search')) return true;
            if (caps.length === 0 && model.textTools === true) return true;
            return false;
        }
        if (model.textTools === true) return true;
        if (model.textTools === false) return false;
        return caps.includes('search') || caps.includes('tools');
    }, []);

    const modelSupportsTools = useCallback((model: ModelOption | null | undefined) => {
        if (!model) return false;
        if (model.textTools === true) return true;
        const caps = Array.isArray(model.capabilities) ? model.capabilities : [];
        return caps.includes('tools');
    }, []);

    const modelSupportsReasoning = useCallback((model: ModelOption | null | undefined) => {
        if (!model) return false;
        if (model.textReasoning === true) return true;
        const caps = Array.isArray(model.capabilities) ? model.capabilities : [];
        return caps.includes('reasoning');
    }, []);

    const modelHasInputModality = useCallback((model: ModelOption | null | undefined, modality: 'image' | 'audio') => {
        if (!model || !Array.isArray(model.textInputModalities)) return false;
        return model.textInputModalities.some((m) => String(m || '').toLowerCase() === modality);
    }, []);

    const filteredModels = useMemo(() => {
        if (capabilityFilters.length === 0) return models;
        return models.filter((model) => (
            capabilityFilters.every((filter) => {
                if (filter === 'search') return modelSupportsSearch(model);
                if (filter === 'tools') return modelSupportsTools(model);
                if (filter === 'reasoning') return modelSupportsReasoning(model);
                if (filter === 'image_input') return modelHasInputModality(model, 'image');
                if (filter === 'audio_input') return modelHasInputModality(model, 'audio');
                return true;
            })
        ));
    }, [capabilityFilters, modelHasInputModality, modelSupportsReasoning, modelSupportsSearch, modelSupportsTools, models]);

    const capabilityFilterOptions = useMemo(() => ([
        { value: 'search' as CapabilityFilter, label: 'Search', count: models.filter((m) => modelSupportsSearch(m)).length },
        { value: 'tools' as CapabilityFilter, label: 'Tools', count: models.filter((m) => modelSupportsTools(m)).length },
        { value: 'reasoning' as CapabilityFilter, label: 'Reasoning', count: models.filter((m) => modelSupportsReasoning(m)).length },
        { value: 'image_input' as CapabilityFilter, label: 'Image Input', count: models.filter((m) => modelHasInputModality(m, 'image')).length },
        { value: 'audio_input' as CapabilityFilter, label: 'Audio Input', count: models.filter((m) => modelHasInputModality(m, 'audio')).length }
    ]), [modelHasInputModality, modelSupportsReasoning, modelSupportsSearch, modelSupportsTools, models]);

    const selectedModel = useMemo(
        () => models.find((m) => m.id === activeSession?.modelId) || null,
        [models, activeSession?.modelId]
    );
    const activeCreditRate = useMemo(() => getPrimaryModelCreditRate(selectedModel), [selectedModel]);
    const latestChatPollenUsed = useMemo(() => {
        const messages = activeSession?.messages || [];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message?.role !== 'assistant') continue;
            if (message?.pollenUsed && String(message.pollenUsed).trim()) return String(message.pollenUsed).trim();
        }
        return null;
    }, [activeSession?.messages]);
    const latestChatPollenUsedLabel = latestChatPollenUsed ? `${formatPollenAmount(latestChatPollenUsed)} pollen` : null;

    const selectedInputModalities = useMemo(() => {
        const raw = Array.isArray(selectedModel?.textInputModalities) && selectedModel.textInputModalities.length > 0
            ? selectedModel.textInputModalities
            : ['text'];
        return raw.map((m) => String(m || '').toLowerCase()).filter(Boolean);
    }, [selectedModel]);

    const supportsImageInput = selectedInputModalities.includes('image');
    const supportsAudioInput = selectedInputModalities.includes('audio');
    const supportsSearch = useMemo(() => modelSupportsSearch(selectedModel), [modelSupportsSearch, selectedModel]);
    const supportsLogic = Boolean(selectedModel?.textReasoning);
    const maxTokensLimit = useMemo(() => {
        if (selectedModel?.provider === 'pollinations' && Number.isFinite(selectedModel.textContextLength) && (selectedModel.textContextLength as number) > 0) {
            return Number(selectedModel.textContextLength);
        }
        return 16384;
    }, [selectedModel]);
    const sessionImageUploads = useMemo(() => {
        const seen = new Set<string>();
        const uploads: ChatImageInput[] = [];
        const addUpload = (image: ChatImageInput) => {
            if (!image?.id) return;
            if (seen.has(image.id)) return;
            seen.add(image.id);
            uploads.push(image);
        };
        pendingImageInputs.forEach(addUpload);
        activeSession?.messages.forEach((msg) => {
            if (!Array.isArray(msg.imageInputs)) return;
            msg.imageInputs.forEach(addUpload);
        });
        return uploads;
    }, [activeSession, pendingImageInputs]);

    const sessionAudioUploads = useMemo(() => {
        const seen = new Set<string>();
        const uploads: ChatAudioInput[] = [];
        const addUpload = (audio: ChatAudioInput) => {
            if (!audio?.id) return;
            if (seen.has(audio.id)) return;
            seen.add(audio.id);
            uploads.push(audio);
        };
        pendingAudioInputs.forEach(addUpload);
        activeSession?.messages.forEach((msg) => {
            if (!Array.isArray(msg.audioInputs)) return;
            msg.audioInputs.forEach(addUpload);
        });
        return uploads;
    }, [activeSession, pendingAudioInputs]);
    const readAloudVoiceValue = useMemo(() => {
        const selected = String(activeSession?.readAloudVoiceURI || '').trim();
        if (!selected) return '';
        return readAloudVoiceOptions.some((option) => option.value === selected) ? selected : '';
    }, [activeSession?.readAloudVoiceURI, readAloudVoiceOptions]);
    const readAloudDefaultLabel = useMemo(() => {
        const name = String(globalReadAloudDefault.voiceName || '').trim();
        return name ? `Default (${name})` : 'Default (System)';
    }, [globalReadAloudDefault.voiceName]);
    const readAloudVoiceOptionsForUi = useMemo(() => {
        if (readAloudVoiceOptions.length === 0) return [{ value: '', label: readAloudDefaultLabel }];
        if (readAloudVoiceOptions[0]?.value === '') {
            return [{ ...readAloudVoiceOptions[0], label: readAloudDefaultLabel }, ...readAloudVoiceOptions.slice(1)];
        }
        return [{ value: '', label: readAloudDefaultLabel }, ...readAloudVoiceOptions];
    }, [readAloudDefaultLabel, readAloudVoiceOptions]);

    const stopReadAloud = useCallback(() => {
        ttsControllerRef.current?.stop();
        setActiveReadAloudMessageId(null);
        setReadAloudUiStateByMessageId({});
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadDefaultReadAloud = async () => {
            try {
                const settings = await api.settings.get();
                if (cancelled) return;
                setGlobalReadAloudDefault({
                    voiceURI: String(settings?.defaultReadAloudVoiceURI || '').trim(),
                    voiceName: String(settings?.defaultReadAloudVoiceName || '').trim()
                });
            } catch {}
        };
        const handleRefresh = () => {
            loadDefaultReadAloud();
        };

        loadDefaultReadAloud();
        window.addEventListener('settings-updated', handleRefresh);
        return () => {
            cancelled = true;
            window.removeEventListener('settings-updated', handleRefresh);
        };
    }, []);

    const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
    const [imageGalleryIndex, setImageGalleryIndex] = useState(0);
    const portalRoot = typeof document === 'undefined' ? null : document.body;
    const galleryImages = useMemo(
        () => sessionImageUploads.filter((image) => Boolean(image.url)),
        [sessionImageUploads]
    );
    const activeGalleryImage = galleryImages[imageGalleryIndex] || galleryImages[0];
    const goToNextImage = useCallback(() => {
        setImageGalleryIndex((prev) => (galleryImages.length === 0 ? 0 : (prev + 1) % galleryImages.length));
    }, [galleryImages.length]);
    const goToPrevImage = useCallback(() => {
        setImageGalleryIndex((prev) => (galleryImages.length === 0 ? 0 : (prev - 1 + galleryImages.length) % galleryImages.length));
    }, [galleryImages.length]);
    const handleOpenImageGallery = useCallback((imageId: string) => {
        if (galleryImages.length === 0) return;
        const index = galleryImages.findIndex((image) => image.id === imageId);
        setImageGalleryIndex(index >= 0 ? index : 0);
        setIsImageGalleryOpen(true);
    }, [galleryImages]);

    useEffect(() => {
        if (!isImageGalleryOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsImageGalleryOpen(false);
            if (event.key === 'ArrowRight') goToNextImage();
            if (event.key === 'ArrowLeft') goToPrevImage();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [goToNextImage, goToPrevImage, isImageGalleryOpen]);

    useEffect(() => {
        if (!isImageGalleryOpen) return;
        if (galleryImages.length === 0) {
            setIsImageGalleryOpen(false);
            return;
        }
        if (imageGalleryIndex >= galleryImages.length) {
            setImageGalleryIndex(0);
        }
    }, [galleryImages.length, imageGalleryIndex, isImageGalleryOpen]);

    useEffect(() => {
        let disposed = false;
        const loadModels = async () => {
            setIsLoadingModels(true);
            try {
                const registry = await loadDynamicRegistry();
                const languageModels = registry.filter(
                    (m) =>
                        m.category === 'Language' &&
                        ['pollinations', 'nvidia'].includes(String(m.provider || '').toLowerCase()) &&
                        !Boolean(m.textSpecialized)
                );
                if (disposed) return;
                setModels(languageModels);
            } finally {
                if (!disposed) setIsLoadingModels(false);
            }
        };
        loadModels();
        return () => { disposed = true; };
    }, []);

    useEffect(() => {
        if (!activeSession || isLoadingModels || filteredModels.length === 0) return;
        if (activeSession.modelId && filteredModels.some((m) => m.id === activeSession.modelId)) return;
        updateActiveSession((session) => ({ ...session, modelId: filteredModels[0].id as string }));
    }, [activeSession, filteredModels, isLoadingModels, updateActiveSession]);

    useEffect(() => {
        if (!reasoningPanelMessageId) return;
        if (activeSession?.messages.some((message) => message.id === reasoningPanelMessageId)) return;
        setReasoningPanelMessageId(null);
    }, [activeSession?.messages, reasoningPanelMessageId]);

    useEffect(() => {
        if (supportsImageInput) return;
        setPendingImageInputs([]);
    }, [supportsImageInput]);

    useEffect(() => {
        if (supportsAudioInput) return;
        setPendingAudioInputs([]);
    }, [supportsAudioInput]);

    useEffect(() => {
        if (!activeSession) return;
        if (!supportsSearch && activeSession.useSearch) {
            updateActiveSession((session) => ({ ...session, useSearch: false }));
        }
    }, [activeSession, supportsSearch, updateActiveSession]);

    useEffect(() => {
        if (!activeSession || !supportsSearch) return;
        const modelId = String(activeSession.modelId || '');
        if (!modelId) return;
        const autoKey = `${activeSession.id}:${modelId}`;
        if (searchAutoDefaultKeyRef.current === autoKey) return;
        searchAutoDefaultKeyRef.current = autoKey;
        if (!activeSession.useSearch) {
            updateActiveSession((session) => ({ ...session, useSearch: true }));
        }
    }, [activeSession, supportsSearch, updateActiveSession]);

    useEffect(() => {
        if (!activeSession) return;
        if (!supportsLogic && activeSession.useReasoning) {
            updateActiveSession((session) => ({ ...session, useReasoning: false }));
        }
    }, [activeSession, supportsLogic, updateActiveSession]);

    useEffect(() => {
        if (!activeSession) return;
        if (!Number.isFinite(maxTokensLimit)) return;
        if (activeSession.maxTokens <= maxTokensLimit) return;
        updateActiveSession((session) => ({ ...session, maxTokens: maxTokensLimit }));
    }, [activeSession, maxTokensLimit, updateActiveSession]);

    useEffect(() => {
        dispatchPollenCreditContext({
            visible: true,
            mode: 'text',
            activeModelLabel: selectedModel?.label || activeSession?.modelId || 'AI Chat',
            creditRate: activeCreditRate?.displayValue || null,
            creditRateDetail: activeCreditRate?.detail || null,
            lastPollenUsed: latestChatPollenUsedLabel,
            isGenerating: isSending
        });
    }, [
        activeCreditRate?.detail,
        activeCreditRate?.displayValue,
        activeSession?.modelId,
        isSending,
        latestChatPollenUsedLabel,
        selectedModel?.label
    ]);

    useEffect(() => {
        return () => {
            clearPollenCreditContext();
        };
    }, []);

    useEffect(() => {
        messageEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }, [activeSession?.messages, isSending]);

    useEffect(() => {
        if (!confirmDialog) return;
        const timer = window.setTimeout(() => confirmCancelRef.current?.focus(), 0);
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setConfirmDialog(null);
            }
            if (e.key === 'Tab') {
                const first = confirmCancelRef.current;
                const last = confirmActionRef.current;
                if (!first || !last) return;
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [confirmDialog]);

    useEffect(() => {
        if (!isConversationFullscreen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsConversationFullscreen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isConversationFullscreen]);

    useEffect(() => {
        return () => {
            if (captureTimeoutRef.current) {
                window.clearTimeout(captureTimeoutRef.current);
                captureTimeoutRef.current = null;
            }
            if (saveSnapshotTimeoutRef.current) {
                window.clearTimeout(saveSnapshotTimeoutRef.current);
                saveSnapshotTimeoutRef.current = null;
            }
            if (memorySyncTimeoutRef.current) {
                window.clearTimeout(memorySyncTimeoutRef.current);
                memorySyncTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isCaptureProjectModalOpen) return;
        if (captureProjects.length > 0 && !captureProjectId) {
            setCaptureProjectId(captureProjects[0].id);
        }
    }, [captureProjectId, captureProjects, isCaptureProjectModalOpen]);

    const onBack = useCallback(() => {
        ttsControllerRef.current?.stop();
        if (context.source === 'project' && context.projectId) {
            navigate(`/project/${context.projectId}`);
            return;
        }
        if (context.source === 'project') {
            navigate(-1);
            return;
        }
        navigate('/generate');
    }, [context.projectId, context.source, navigate]);

    const requestConfirmation = useCallback((config: Omit<ConfirmDialogState, 'onConfirm'> & { onConfirm: () => void }) => {
        setConfirmDialog({
            title: config.title,
            description: config.description,
            confirmLabel: config.confirmLabel,
            tone: config.tone,
            onConfirm: config.onConfirm
        });
    }, []);

    const handleConfirmDialogAction = useCallback(() => {
        if (!confirmDialog) return;
        const action = confirmDialog.onConfirm;
        setConfirmDialog(null);
        action();
    }, [confirmDialog]);

    const handleCreateSession = useCallback(() => {
        if (isSending || isStandaloneProjectChat) return;
        requestConfirmation({
            title: 'Create New Session',
            description: 'Create a new chat session and switch to it immediately?',
            confirmLabel: 'Create Session',
            onConfirm: () => {
                createSessionAndSwitch((filteredModels[0]?.id || models[0]?.id || '') as string);
                setInput('');
                setErrorMsg(null);
            }
        });
    }, [createSessionAndSwitch, filteredModels, isSending, isStandaloneProjectChat, models, requestConfirmation, setErrorMsg]);

    const handleDeleteSession = useCallback((sessionId: string) => {
        if (isSending || isStandaloneProjectChat) return;
        requestConfirmation({
            title: 'Delete Session',
            description: 'This will permanently remove the selected chat session from saved history.',
            confirmLabel: 'Delete Session',
            tone: 'danger',
            onConfirm: () => {
                api.chatMemory.delete(sessionId).catch(() => {});
                deleteSession(sessionId, (filteredModels[0]?.id || models[0]?.id || '') as string);
            }
        });
    }, [deleteSession, filteredModels, isSending, isStandaloneProjectChat, models, requestConfirmation]);

    const handleRenameSession = useCallback((sessionId: string, nextTitleRaw: string) => {
        const nextTitle = sanitizeSessionTitle(String(nextTitleRaw || ''));
        if (!nextTitle) return;
        updateSessionById(sessionId, (session) => ({ ...session, title: nextTitle }));
    }, [updateSessionById]);

    const downloadFile = useCallback((name: string, content: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    const showCaptureStatus = useCallback((msg: string) => {
        setCaptureMsg(msg);
        if (captureTimeoutRef.current) window.clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = window.setTimeout(() => {
            setCaptureMsg(null);
            captureTimeoutRef.current = null;
        }, 2500);
    }, []);

    const announceReadAloudStatus = useCallback((message: string) => {
        const next = String(message || '').trim();
        if (!next) return;
        setReadAloudA11yStatus(next);
    }, []);

    const setReadAloudUiStateForMessage = useCallback((messageId: string, state: ReadAloudUiState) => {
        setReadAloudUiStateByMessageId((prev) => {
            const next = { ...prev };
            if (state === 'idle') {
                delete next[messageId];
            } else {
                next[messageId] = state;
            }
            return next;
        });
    }, []);

    const handleReadAloudUiClick = useCallback((payload: {
        message: ChatMessage;
        text: string;
        includeReasoningSummary: boolean;
        truncated: boolean;
    }) => {
        const text = String(payload.text || '').trim();
        if (!text) {
            showCaptureStatus('Nothing to read aloud for this message.');
            announceReadAloudStatus('Read aloud unavailable for this message.');
            return;
        }

        const tts = ttsControllerRef.current;
        if (!tts || !tts.isSupported()) {
            showCaptureStatus('Read aloud is not supported in this browser.');
            announceReadAloudStatus('Read aloud is not supported in this browser.');
            return;
        }

        const messageId = payload.message.id;
        const isSameMessage = activeReadAloudMessageId === messageId;
        const currentState = tts.getState();
        const sessionVoiceURI = String(activeSession?.readAloudVoiceURI || '').trim();
        const sessionVoiceName = String(activeSession?.readAloudVoiceName || '').trim();
        const defaultVoiceURI = String(globalReadAloudDefault.voiceURI || '').trim();
        const defaultVoiceName = String(globalReadAloudDefault.voiceName || '').trim();
        const preferredVoiceURI = sessionVoiceURI || defaultVoiceURI;
        const preferredVoiceName = sessionVoiceName || defaultVoiceName;

        if (isSameMessage && currentState === 'playing') {
            tts.pause();
            setReadAloudUiStateForMessage(messageId, 'paused');
            announceReadAloudStatus('Read aloud paused.');
            return;
        }

        if (isSameMessage && currentState === 'paused') {
            tts.resume();
            setReadAloudUiStateForMessage(messageId, 'playing');
            announceReadAloudStatus('Read aloud resumed.');
            return;
        }

        if (activeReadAloudMessageId && activeReadAloudMessageId !== messageId) {
            setReadAloudUiStateForMessage(activeReadAloudMessageId, 'idle');
        }

        setActiveReadAloudMessageId(messageId);
        setReadAloudUiStateForMessage(messageId, 'playing');
        announceReadAloudStatus('Read aloud started.');

        const started = tts.speak(text, {
            voiceURI: preferredVoiceURI || undefined,
            voiceName: preferredVoiceName || undefined,
            onStart: () => {
                setReadAloudUiStateForMessage(messageId, 'playing');
                announceReadAloudStatus('Read aloud started.');
            },
            onPause: () => {
                setReadAloudUiStateForMessage(messageId, 'paused');
                announceReadAloudStatus('Read aloud paused.');
            },
            onResume: () => {
                setReadAloudUiStateForMessage(messageId, 'playing');
                announceReadAloudStatus('Read aloud resumed.');
            },
            onEnd: () => {
                setReadAloudUiStateForMessage(messageId, 'idle');
                setActiveReadAloudMessageId((current) => (current === messageId ? null : current));
                announceReadAloudStatus('Read aloud finished.');
            },
            onError: () => {
                setReadAloudUiStateForMessage(messageId, 'idle');
                setActiveReadAloudMessageId((current) => (current === messageId ? null : current));
                showCaptureStatus('Read aloud playback failed.');
                announceReadAloudStatus('Read aloud playback failed.');
            }
        });

        if (!started) {
            setReadAloudUiStateForMessage(messageId, 'idle');
            setActiveReadAloudMessageId((current) => (current === messageId ? null : current));
            showCaptureStatus('Read aloud is unavailable for this message.');
            announceReadAloudStatus('Read aloud failed to start.');
            return;
        }

        if (payload.truncated) {
            showCaptureStatus('Reading truncated response for playback.');
            announceReadAloudStatus('Read aloud started with truncated content.');
        }
    }, [
        activeReadAloudMessageId,
        globalReadAloudDefault.voiceName,
        globalReadAloudDefault.voiceURI,
        activeSession?.readAloudVoiceName,
        activeSession?.readAloudVoiceURI,
        announceReadAloudStatus,
        setReadAloudUiStateForMessage,
        showCaptureStatus
    ]);

    useEffect(() => {
        const controller = createBrowserTtsController();
        ttsControllerRef.current = controller;
        const supported = controller.isSupported();
        setIsReadAloudSupported(supported);
        setReadAloudVoiceOptions(
            supported
                ? buildReadAloudVoiceOptions(controller.getVoices())
                : [DEFAULT_READ_ALOUD_VOICE_OPTION]
        );

        const warmupTimers: number[] = [];
        if (supported) {
            const syncVoices = () => {
                if (ttsControllerRef.current !== controller) return;
                setReadAloudVoiceOptions(buildReadAloudVoiceOptions(controller.getVoices()));
            };
            warmupTimers.push(window.setTimeout(syncVoices, 250));
            warmupTimers.push(window.setTimeout(syncVoices, 1200));

            const synth = window.speechSynthesis;
            if (typeof synth?.addEventListener === 'function') {
                synth.addEventListener('voiceschanged', syncVoices);
            }
            return () => {
                warmupTimers.forEach((timerId) => window.clearTimeout(timerId));
                if (typeof synth?.removeEventListener === 'function') {
                    synth.removeEventListener('voiceschanged', syncVoices);
                }
                controller.destroy();
                ttsControllerRef.current = null;
                setIsReadAloudSupported(false);
                setReadAloudVoiceOptions([DEFAULT_READ_ALOUD_VOICE_OPTION]);
            };
        }
        return () => {
            controller.destroy();
            ttsControllerRef.current = null;
            setIsReadAloudSupported(false);
            setReadAloudVoiceOptions([DEFAULT_READ_ALOUD_VOICE_OPTION]);
        };
    }, []);

    useEffect(() => {
        stopReadAloud();
    }, [activeSessionId, stopReadAloud]);

    useEffect(() => {
        if (!isSending) return;
        stopReadAloud();
    }, [isSending, stopReadAloud]);

    useEffect(() => {
        if (!routeCleanupInitializedRef.current) {
            routeCleanupInitializedRef.current = true;
            return;
        }
        stopReadAloud();
    }, [location.pathname, location.search, stopReadAloud]);

    useEffect(() => {
        if (!captureError) return;
        showCaptureStatus(captureError);
        clearCaptureError();
    }, [captureError, clearCaptureError, showCaptureStatus]);

    useEffect(() => {
        setSessionTitleDraft(activeSession?.title || '');
    }, [activeSession?.id, activeSession?.title]);

    const handleSaveActiveSessionTitle = useCallback(() => {
        if (!activeSession) return;
        const nextTitle = sanitizeSessionTitle(sessionTitleDraft);
        if (!nextTitle) return;
        if (nextTitle === activeSession.title) return;
        handleRenameSession(activeSession.id, nextTitle);
        setSessionTitleDraft(nextTitle);
        showCaptureStatus('Session title updated.');
    }, [activeSession, handleRenameSession, sessionTitleDraft, showCaptureStatus]);
    const canSaveSessionTitle = Boolean(
        activeSession
        && sanitizeSessionTitle(sessionTitleDraft)
        && sanitizeSessionTitle(sessionTitleDraft) !== activeSession.title
    );
    const canResetSessionTitle = Boolean(
        activeSession
        && sessionTitleDraft !== (activeSession.title || '')
    );

    useEffect(() => {
        if (!chatItemId || !activeSession) return;
        if (loadedChatItemRef.current === chatItemId) return;
        let cancelled = false;

        const loadChatCapture = async () => {
            try {
                const detail = await api.chatItems.get(chatItemId);
                if (cancelled) return;
                if (!detail?.payload) return;
                loadedChatItemRef.current = chatItemId;
                const payload = detail.payload;
                    updateActiveSession((session) => ({
                        ...session,
                        title: payload.title || detail.title || 'Chat Capture',
                        modelId: payload.modelId || session.modelId,
                        systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : session.systemPrompt,
                        temperature: Number.isFinite(payload.temperature) ? payload.temperature : session.temperature,
                        maxTokens: Number.isFinite(payload.maxTokens) ? payload.maxTokens : session.maxTokens,
                        useSearch: typeof payload.useSearch === 'boolean' ? payload.useSearch : session.useSearch,
                        useReasoning: typeof payload.useReasoning === 'boolean' ? payload.useReasoning : session.useReasoning,
                        useMemory: typeof payload.useMemory === 'boolean' ? payload.useMemory : session.useMemory,
                        memoryProfile: typeof payload.memoryProfile === 'string' ? payload.memoryProfile : session.memoryProfile,
                        memoryProfileUpdatedAt: Number.isFinite(payload.memoryProfileUpdatedAt) ? payload.memoryProfileUpdatedAt : session.memoryProfileUpdatedAt,
                        showSources: typeof payload.showSources === 'boolean' ? payload.showSources : session.showSources,
                        pinnedMemory: typeof payload.pinnedMemory === 'string' ? payload.pinnedMemory : session.pinnedMemory,
                        pinnedMemoryUpdatedAt: Number.isFinite(payload.pinnedMemoryUpdatedAt) ? payload.pinnedMemoryUpdatedAt : session.pinnedMemoryUpdatedAt,
                        memorySummary: typeof payload.memorySummary === 'string' ? payload.memorySummary : session.memorySummary,
                        memorySummaryUpdatedAt: Number.isFinite(payload.memorySummaryUpdatedAt) ? payload.memorySummaryUpdatedAt : session.memorySummaryUpdatedAt,
                        memorySummaryMessageCount: Number.isFinite(payload.memorySummaryMessageCount) ? payload.memorySummaryMessageCount : session.memorySummaryMessageCount,
                        readAloudVoiceURI: typeof payload.readAloudVoiceURI === 'string' ? payload.readAloudVoiceURI : session.readAloudVoiceURI,
                        readAloudVoiceName: typeof payload.readAloudVoiceName === 'string' ? payload.readAloudVoiceName : session.readAloudVoiceName,
                        messages: Array.isArray(payload.messages) ? payload.messages : []
                    }));
                showCaptureStatus('Chat loaded. Continue the conversation.');
            } catch {
                if (!cancelled) showCaptureStatus('Failed to load chat capture.');
            }
        };

        loadChatCapture();
        return () => {
            cancelled = true;
        };
    }, [activeSession, chatItemId, showCaptureStatus, updateActiveSession]);

    useEffect(() => {
        if (!activeSession?.id) return;
        if (chatItemId) return;
        if (activeSession.useMemory === false) return;
        if (memoryLoadedRef.current.has(activeSession.id)) return;
        memoryLoadedRef.current.add(activeSession.id);
        let cancelled = false;

        const loadServerMemory = async () => {
            try {
                const memory = await api.chatMemory.get(activeSession.id);
                if (cancelled || !memory) return;
                updateActiveSession((session) => {
                    if (session.id !== activeSession.id) return session;
                    let next = session;
                    const incomingPinnedUpdatedAt = Number.isFinite(memory.pinnedMemoryUpdatedAt)
                        ? Number(memory.pinnedMemoryUpdatedAt)
                        : 0;
                    const localPinnedUpdatedAt = Number.isFinite(session.pinnedMemoryUpdatedAt)
                        ? Number(session.pinnedMemoryUpdatedAt)
                        : 0;
                    if (incomingPinnedUpdatedAt > localPinnedUpdatedAt || (!session.pinnedMemory?.trim() && memory.pinnedMemory)) {
                        next = {
                            ...next,
                            pinnedMemory: memory.pinnedMemory || '',
                            pinnedMemoryUpdatedAt: incomingPinnedUpdatedAt
                        };
                    }

                    const incomingSummaryUpdatedAt = Number.isFinite(memory.memorySummaryUpdatedAt)
                        ? Number(memory.memorySummaryUpdatedAt)
                        : 0;
                    const localSummaryUpdatedAt = Number.isFinite(session.memorySummaryUpdatedAt)
                        ? Number(session.memorySummaryUpdatedAt)
                        : 0;
                    if (incomingSummaryUpdatedAt > localSummaryUpdatedAt || (!session.memorySummary?.trim() && memory.memorySummary)) {
                        next = {
                            ...next,
                            memorySummary: memory.memorySummary || '',
                            memorySummaryUpdatedAt: incomingSummaryUpdatedAt,
                            memorySummaryMessageCount: Number.isFinite(memory.memorySummaryMessageCount)
                                ? Number(memory.memorySummaryMessageCount)
                                : session.memorySummaryMessageCount
                        };
                    }

                    const incomingProfileUpdatedAt = Number.isFinite(memory.memoryProfileUpdatedAt)
                        ? Number(memory.memoryProfileUpdatedAt)
                        : 0;
                    const localProfileUpdatedAt = Number.isFinite(session.memoryProfileUpdatedAt)
                        ? Number(session.memoryProfileUpdatedAt)
                        : 0;
                    if (incomingProfileUpdatedAt > localProfileUpdatedAt || (!session.memoryProfile && memory.memoryProfile)) {
                        next = {
                            ...next,
                            memoryProfile: memory.memoryProfile || 'balanced',
                            memoryProfileUpdatedAt: incomingProfileUpdatedAt
                        };
                    }
                    return next;
                });
            } catch {
                // Ignore sync failures to avoid blocking chat.
            }
        };

        loadServerMemory();
        return () => {
            cancelled = true;
        };
    }, [activeSession?.id, activeSession?.useMemory, chatItemId, updateActiveSession]);

    useEffect(() => {
        if (!activeSession?.id) return;
        if (chatItemId) return;
        if (activeSession.useMemory === false) return;
        const payload: Partial<ChatMemory> = {
            sessionId: activeSession.id,
            modelId: activeSession.modelId,
            pinnedMemory: activeSession.pinnedMemory || '',
            pinnedMemoryUpdatedAt: Number.isFinite(activeSession.pinnedMemoryUpdatedAt)
                ? Number(activeSession.pinnedMemoryUpdatedAt)
                : 0,
            memorySummary: activeSession.memorySummary || '',
            memorySummaryMessageCount: Number.isFinite(activeSession.memorySummaryMessageCount)
                ? Number(activeSession.memorySummaryMessageCount)
                : 0,
            memorySummaryUpdatedAt: Number.isFinite(activeSession.memorySummaryUpdatedAt)
                ? Number(activeSession.memorySummaryUpdatedAt)
                : 0,
            memoryProfile: activeSession.memoryProfile || 'balanced',
            memoryProfileUpdatedAt: Number.isFinite(activeSession.memoryProfileUpdatedAt)
                ? Number(activeSession.memoryProfileUpdatedAt)
                : 0
        };
        const signature = JSON.stringify(payload);
        if (signature === memorySyncSignatureRef.current) return;
        memorySyncSignatureRef.current = signature;

        const shouldSync = Boolean(
            payload.pinnedMemoryUpdatedAt ||
            payload.memorySummaryUpdatedAt ||
            payload.pinnedMemory?.trim() ||
            payload.memorySummary?.trim() ||
            payload.memoryProfileUpdatedAt
        );
        if (!shouldSync) return;

        if (memorySyncTimeoutRef.current) {
            window.clearTimeout(memorySyncTimeoutRef.current);
        }
        memorySyncTimeoutRef.current = window.setTimeout(() => {
            api.chatMemory.upsert(activeSession.id, payload).catch(() => {});
        }, 400);
    }, [
        activeSession?.id,
        activeSession?.modelId,
        activeSession?.pinnedMemory,
        activeSession?.pinnedMemoryUpdatedAt,
        activeSession?.memorySummary,
        activeSession?.memorySummaryMessageCount,
        activeSession?.memorySummaryUpdatedAt,
        activeSession?.memoryProfile,
        activeSession?.memoryProfileUpdatedAt,
        activeSession?.useMemory,
        chatItemId
    ]);

    const flushSnapshotSave = useCallback(async (signature: string, session: any) => {
        if (!chatItemId) return;
        if (isSnapshotSavingRef.current) {
            pendingSnapshotRef.current = { signature, session };
            return;
        }
        isSnapshotSavingRef.current = true;
        try {
            await api.chatItems.updateSnapshot(chatItemId, session);
            lastSavedSnapshotRef.current = signature;
        } catch {
            showCaptureStatus('Failed to save chat capture.');
        } finally {
            isSnapshotSavingRef.current = false;
            const pending = pendingSnapshotRef.current;
            if (pending && pending.signature !== lastSavedSnapshotRef.current) {
                pendingSnapshotRef.current = null;
                flushSnapshotSave(pending.signature, pending.session);
            } else {
                pendingSnapshotRef.current = null;
            }
        }
    }, [chatItemId, showCaptureStatus]);

    const scheduleSnapshotSave = useCallback((signature: string, session: any) => {
        if (saveSnapshotTimeoutRef.current) {
            window.clearTimeout(saveSnapshotTimeoutRef.current);
        }
        saveSnapshotTimeoutRef.current = window.setTimeout(() => {
            flushSnapshotSave(signature, session);
        }, 800);
    }, [flushSnapshotSave]);

    useEffect(() => {
        if (!isStandaloneProjectChat) return;
        if (!chatItemId || !activeSession) return;
        if (loadedChatItemRef.current !== chatItemId) return;
        if (activeSession.messages.length === 0) return;
        if (isSending) return;

        const lastMessage = activeSession.messages[activeSession.messages.length - 1];
        if (lastMessage?.status === 'loading') return;

        const signature = [
            activeSession.updatedAt,
            activeSession.messages.length,
            lastMessage?.id || '',
            lastMessage?.status || ''
        ].join('|');

        if (signature === lastSavedSnapshotRef.current) return;
        scheduleSnapshotSave(signature, activeSession);
    }, [activeSession, chatItemId, isSending, isStandaloneProjectChat, scheduleSnapshotSave]);

    const handleExportJson = useCallback(() => {
        if (!activeSession) return;
        downloadFile(
            `aimana-chat-${activeSession.id}.json`,
            JSON.stringify(activeSession, null, 2),
            'application/json'
        );
        showCaptureStatus('Transcript exported as JSON.');
    }, [activeSession, downloadFile, showCaptureStatus]);

    const handleExportTxt = useCallback(() => {
        if (!activeSession) return;
        downloadFile(
            `aimana-chat-${activeSession.id}.txt`,
            buildTranscript(activeSession),
            'text/plain;charset=utf-8'
        );
        showCaptureStatus('Transcript exported as text.');
    }, [activeSession, downloadFile, showCaptureStatus]);

    const canSaveChat = Boolean(activeSession && activeSession.messages.length > 0 && !isSending && !isCapturing);

    const handleCopyTranscript = useCallback(async () => {
        if (!activeSession) return;
        try {
            await navigator.clipboard.writeText(buildTranscript(activeSession));
            showCaptureStatus('Transcript copied to clipboard.');
        } catch {
            showCaptureStatus('Clipboard copy failed.');
        }
    }, [activeSession, showCaptureStatus]);

    const handleCopyMessage = useCallback(async (content: string) => {
        try {
            await navigator.clipboard.writeText(content || '');
            showCaptureStatus('Message copied to clipboard.');
        } catch {
            showCaptureStatus('Clipboard copy failed.');
        }
    }, [showCaptureStatus]);

    const handleCopyRenderedMessage = useCallback(async (messageId: string, fallbackContent: string) => {
        try {
            const selector = `[data-message-markdown-id="${messageId}"]`;
            const node = document.querySelector(selector) as HTMLElement | null;
            const rendered = (node?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
            await navigator.clipboard.writeText(rendered || fallbackContent || '');
            showCaptureStatus('Rendered markdown copied to clipboard.');
        } catch {
            showCaptureStatus('Clipboard copy failed.');
        }
    }, [showCaptureStatus]);

    const startInlineEdit = useCallback((message: ChatMessage) => {
        if (isSending || message.role !== 'user') return;
        setEditingMessageId(message.id);
        setEditingContent(message.content || '');
    }, [isSending]);

    const cancelInlineEdit = useCallback(() => {
        setEditingMessageId(null);
        setEditingContent('');
    }, []);

    const saveInlineEditAndRegenerate = useCallback(async () => {
        if (!activeSession || !editingMessageId || isSending) return;
        const nextContent = editingContent.trim();
        if (!nextContent) return;

        const userIndex = activeSession.messages.findIndex((m) => m.id === editingMessageId && m.role === 'user');
        if (userIndex < 0) return;

        const editedUserMessage: ChatMessage = {
            ...activeSession.messages[userIndex],
            content: nextContent,
            status: 'done'
        };
        const nextThread = [
            ...activeSession.messages.slice(0, userIndex),
            editedUserMessage
        ];
        const nextTitle = activeSession.title === 'New Chat' ? sanitizeSessionTitle(nextContent) : activeSession.title;

        setEditingMessageId(null);
        setEditingContent('');
        stopReadAloud();
        updateActiveSession((session) => ({ ...session, title: nextTitle, messages: nextThread }));
        await requestAssistantResponse(activeSession.id, nextThread, activeSession);
    }, [activeSession, editingContent, editingMessageId, isSending, requestAssistantResponse, stopReadAloud, updateActiveSession]);

    const handleRetryWithReadAloudCleanup = useCallback(async () => {
        stopReadAloud();
        await retryPrompt({ activeSession, updateActiveSession });
    }, [activeSession, retryPrompt, stopReadAloud, updateActiveSession]);

    const canRetry = useMemo(
        () => !!activeSession && activeSession.messages.some((m) => m.role === 'user') && !isSending,
        [activeSession, isSending]
    );

    const handleImageUpload = useCallback((files: FileList | null) => {
        if (!files || files.length === 0 || isSending || !supportsImageInput) return;
        Array.from(files).forEach((file) => {
            if (!String(file.type || '').toLowerCase().startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result !== 'string') return;
                const payload = {
                    id: createId(),
                    name: file.name || 'image',
                    url: reader.result,
                    mimeType: file.type,
                    size: file.size
                };
                saveChatImage(payload).catch(() => {});
                setPendingImageInputs((prev) => [...prev, payload]);
                const uploadImageAttachment = api.chatSessions?.uploadImageAttachment;
                if (typeof uploadImageAttachment !== 'function') return;
                uploadImageAttachment({
                    id: payload.id,
                    name: payload.name,
                    dataUrl: payload.url,
                    mimeType: payload.mimeType,
                    size: payload.size
                })
                    .then((stored) => {
                        if (!stored?.url) return;
                        const nextUrl = stored.url;
                        setPendingImageInputs((prev) => prev.map((img) => (
                            img.id === payload.id
                                ? { ...img, url: nextUrl, mimeType: stored.mimeType || img.mimeType, size: stored.size || img.size }
                                : img
                        )));
                        updateActiveSession((session) => ({
                            ...session,
                            messages: session.messages.map((message) => ({
                                ...message,
                                imageInputs: Array.isArray(message.imageInputs)
                                    ? message.imageInputs.map((img) => (
                                        img.id === payload.id
                                            ? { ...img, url: nextUrl, mimeType: stored.mimeType || img.mimeType, size: stored.size || img.size }
                                            : img
                                    ))
                                    : message.imageInputs
                            }))
                        }));
                    })
                    .catch(() => {});
            };
            reader.readAsDataURL(file);
        });
    }, [isSending, supportsImageInput, updateActiveSession]);

    const removePendingImage = useCallback((imageId: string) => {
        setPendingImageInputs((prev) => prev.filter((image) => image.id !== imageId));
    }, []);

    const clearPendingImageInputs = useCallback(() => {
        setPendingImageInputs([]);
    }, []);

    const handleAudioUpload = useCallback((files: FileList | null) => {
        if (!files || files.length === 0 || isSending || !supportsAudioInput) return;
        Array.from(files).forEach((file) => {
            if (!String(file.type || '').toLowerCase().startsWith('audio/')) return;
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result !== 'string') return;
                const split = reader.result.split(',');
                if (split.length < 2) return;
                const subtype = ((file.type || '').split('/')[1] || '').toLowerCase();
                const formatMap: Record<string, string> = {
                    mpeg: 'mp3',
                    mp3: 'mp3',
                    wav: 'wav',
                    'x-wav': 'wav',
                    flac: 'flac',
                    opus: 'opus',
                    pcm: 'pcm16',
                    'x-pcm': 'pcm16'
                };
                const inferredFormat = formatMap[subtype] || 'mp3';
                const payload = {
                    id: createId(),
                    name: file.name || 'audio',
                    data: split[1],
                    format: inferredFormat,
                    mimeType: file.type,
                    size: file.size
                };
                saveChatAudio(payload).catch(() => {});
                setPendingAudioInputs((prev) => [...prev, payload]);
                const uploadAudioAttachment = api.chatSessions?.uploadAudioAttachment;
                if (typeof uploadAudioAttachment !== 'function') return;
                uploadAudioAttachment({
                    id: payload.id,
                    name: payload.name,
                    data: payload.data,
                    format: payload.format,
                    mimeType: payload.mimeType,
                    size: payload.size
                })
                    .then((stored) => {
                        if (!stored?.url) return;
                        setPendingAudioInputs((prev) => prev.map((audio) => (
                            audio.id === payload.id
                                ? {
                                    ...audio,
                                    url: stored.url,
                                    format: stored.format || audio.format,
                                    mimeType: stored.mimeType || audio.mimeType,
                                    size: stored.size || audio.size,
                                    data: undefined
                                }
                                : audio
                        )));
                        updateActiveSession((session) => ({
                            ...session,
                            messages: session.messages.map((message) => ({
                                ...message,
                                audioInputs: Array.isArray(message.audioInputs)
                                    ? message.audioInputs.map((audio) => (
                                        audio.id === payload.id
                                            ? {
                                                ...audio,
                                                url: stored.url,
                                                format: stored.format || audio.format,
                                                mimeType: stored.mimeType || audio.mimeType,
                                                size: stored.size || audio.size,
                                                data: undefined
                                            }
                                            : audio
                                    ))
                                    : message.audioInputs
                            }))
                        }));
                    })
                    .catch(() => {});
            };
            reader.readAsDataURL(file);
        });
    }, [isSending, supportsAudioInput, updateActiveSession]);

    const removePendingAudio = useCallback((audioId: string) => {
        setPendingAudioInputs((prev) => prev.filter((audio) => audio.id !== audioId));
    }, []);

    const clearPendingAudioInputs = useCallback(() => {
        setPendingAudioInputs([]);
    }, []);

    const handleSendWithReadAloudCleanup = useCallback(async () => {
        stopReadAloud();
        await sendPrompt({
            activeSession,
            input,
            pendingImageInputs,
            pendingAudioInputs,
            updateActiveSession,
            setInput,
            clearPendingImageInputs,
            clearPendingAudioInputs
        });
    }, [
        activeSession,
        input,
        pendingAudioInputs,
        pendingImageInputs,
        sendPrompt,
        stopReadAloud,
        updateActiveSession,
        clearPendingAudioInputs,
        clearPendingImageInputs
    ]);

    const performChatCapture = useCallback(async (projectId: string, session: ChatSession) => {
        const saved = await captureToProject({ projectId, session });
        showCaptureStatus('Chat moved to project.');
        window.dispatchEvent(new CustomEvent('chat-captures-updated', { detail: { projectId } }));

        const isActiveTarget = activeSession?.id === session.id;
        if (isActiveTarget) {
            setInput('');
            clearPendingImageInputs();
            clearPendingAudioInputs();
            cancelInlineEdit();
            updateActiveSession((current) => ({
                ...current,
                title: 'New Chat',
                messages: []
            }));
        } else {
            const preferredModelId = (filteredModels[0]?.id || models[0]?.id || '') as string;
            deleteSession(session.id, preferredModelId);
        }

        return saved;
    }, [
        activeSession,
        captureToProject,
        showCaptureStatus,
        setInput,
        clearPendingImageInputs,
        clearPendingAudioInputs,
        cancelInlineEdit,
        updateActiveSession,
        deleteSession,
        filteredModels,
        models
    ]);

    const handleSaveToProject = useCallback(async () => {
        if (!activeSession || !canSaveChat || isCapturing) return;
        if (context.projectId) {
            await performChatCapture(context.projectId, activeSession);
            return;
        }
        setPendingCaptureSessionId(null);
        setIsCaptureProjectModalOpen(true);
        if (captureProjects.length === 0) {
            try {
                const projects = await api.projects.list();
                setCaptureProjects(projects);
                if (projects.length > 0) setCaptureProjectId(projects[0].id);
            } catch {
                showCaptureStatus('Failed to load projects.');
            }
        }
    }, [activeSession, canSaveChat, captureProjects.length, context.projectId, isCapturing, performChatCapture, showCaptureStatus]);

    const handleMoveSessionToProject = useCallback(async (sessionId: string) => {
        if (isCapturing) return;
        const session = sessions.find((s) => s.id === sessionId);
        if (!session || session.messages.length === 0) return;
        if (context.projectId) {
            await performChatCapture(context.projectId, session);
            return;
        }
        setPendingCaptureSessionId(sessionId);
        setIsCaptureProjectModalOpen(true);
        if (captureProjects.length === 0) {
            try {
                const projects = await api.projects.list();
                setCaptureProjects(projects);
                if (projects.length > 0) setCaptureProjectId(projects[0].id);
            } catch {
                showCaptureStatus('Failed to load projects.');
            }
        }
    }, [captureProjects.length, context.projectId, isCapturing, performChatCapture, sessions, showCaptureStatus]);

    const handleConfirmCaptureProject = useCallback(async () => {
        if (!captureProjectId) return;
        const sessionId = pendingCaptureSessionId || activeSession?.id || '';
        const session = sessions.find((s) => s.id === sessionId) || activeSession;
        if (!session) return;
        await performChatCapture(captureProjectId, session);
        setPendingCaptureSessionId(null);
        setIsCaptureProjectModalOpen(false);
    }, [activeSession, captureProjectId, pendingCaptureSessionId, performChatCapture, sessions]);

    const controlButtonLargeClass = 'chat-token-control-btn chat-focus-ring inline-flex items-center gap-2 px-3 py-2 transition-colors text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed';
    const controlButtonDangerClass = 'chat-token-control-btn-danger chat-focus-ring inline-flex items-center gap-2 px-3 py-2 transition-colors text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed';
    const selectControlClass = 'chat-token-select chat-focus-ring px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed';

    return (
        <div className={`chat-runtime flex flex-col -m-4 sm:-m-6 lg:-m-8 bg-slate-900 relative ${
            isConversationFullscreen ? 'h-full min-h-0 overflow-hidden' : 'min-h-full overflow-visible'
        }`}>
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {readAloudA11yStatus}
            </div>
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.12),transparent_42%),radial-gradient(circle_at_80%_100%,rgba(59,130,246,0.06),transparent_48%)]" />
            <ChatHeader context={context} onBack={onBack} />

            <div className={`relative p-2 sm:p-4 md:p-6 lg:p-10 ${
                isConversationFullscreen ? 'flex-1 min-h-0 overflow-hidden' : 'overflow-visible'
            }`}>
                <div className={`max-w-[1760px] mx-auto ${
                    isConversationFullscreen ? 'h-full min-h-0' : 'min-h-full'
                }`}>
                    <section className={`chat-token-shell flex flex-col ring-1 ring-white/5 ${
                        isConversationFullscreen ? 'min-h-0 h-full' : 'min-h-[calc(100vh-10rem)]'
                    } ${
                        isConversationFullscreen ? 'fixed inset-2 sm:inset-4 md:inset-6 z-[120] max-w-none' : ''
                    }`}>
                        <ChatTopBar
                            isSessionPanelOpen={isSessionPanelOpen}
                            onToggleSessionPanel={() => {
                                if (isStandaloneProjectChat) return;
                                setReasoningPanelMessageId(null);
                                setIsSessionPanelOpen((v) => !v);
                            }}
                            showSessions={!isStandaloneProjectChat}
                            isConversationFullscreen={isConversationFullscreen}
                            onToggleFullscreen={() => setIsConversationFullscreen((v) => !v)}
                            showRuntimeSettings={showRuntimeSettings}
                            setShowRuntimeSettings={setShowRuntimeSettings}
                            activeSession={activeSession}
                            isSending={isSending}
                            updateSessionRuntime={(temperature, maxTokens) => updateActiveSession((session) => ({ ...session, temperature, maxTokens }))}
                            maxTokensLimit={maxTokensLimit}
                            onExportJson={handleExportJson}
                            onExportTxt={handleExportTxt}
                            onCopyTranscript={handleCopyTranscript}
                            onSaveToProject={handleSaveToProject}
                            saveDisabled={!canSaveChat}
                            isSaving={isCapturing}
                            onToggleMemory={(nextValue) => updateActiveSession((session) => ({ ...session, useMemory: nextValue }))}
                            onMemoryProfileChange={(nextValue) => updateActiveSession((session) => ({
                                ...session,
                                memoryProfile: nextValue,
                                memoryProfileUpdatedAt: Date.now()
                            }))}
                            isReadAloudSupported={isReadAloudSupported}
                            readAloudVoiceValue={readAloudVoiceValue}
                            readAloudVoiceOptions={readAloudVoiceOptionsForUi}
                            onReadAloudVoiceChange={(nextValue) => updateActiveSession((session) => {
                                const voiceURI = String(nextValue || '').trim();
                                if (!voiceURI) {
                                    return {
                                        ...session,
                                        readAloudVoiceURI: '',
                                        readAloudVoiceName: ''
                                    };
                                }
                                const matchedVoice = ttsControllerRef.current
                                    ?.getVoices()
                                    .find((voice) => String(voice?.voiceURI || '').trim() === voiceURI);
                                return {
                                    ...session,
                                    readAloudVoiceURI: voiceURI,
                                    readAloudVoiceName: String(matchedVoice?.name || '').trim()
                                };
                            })}
                            capabilityFilters={capabilityFilters}
                            onCapabilityFilterChange={(next) => setCapabilityFilters(next as CapabilityFilter[])}
                            capabilityFilterOptions={capabilityFilterOptions}
                            capabilityFilterTotal={models.length}
                            myStuffItems={sessionImageUploads}
                            myStuffAudioItems={sessionAudioUploads}
                            onOpenImageGallery={handleOpenImageGallery}
                            sessionTitleDraft={sessionTitleDraft}
                            onSessionTitleDraftChange={setSessionTitleDraft}
                            onSaveSessionTitle={handleSaveActiveSessionTitle}
                            onResetSessionTitle={() => setSessionTitleDraft(activeSession?.title || '')}
                            canSaveSessionTitle={canSaveSessionTitle}
                            canResetSessionTitle={canResetSessionTitle}
                        />

                        <div className={`relative flex-1 ${isConversationFullscreen ? 'min-h-0 overflow-hidden' : 'overflow-visible'}`}>
                            <div className={`flex flex-col ${isConversationFullscreen ? 'h-full' : 'min-h-full'}`}>
                                <ChatMessageList
                                    messages={activeSession?.messages || []}
                                    isSending={isSending}
                                    showSources={activeSession?.showSources ?? true}
                                    editingMessageId={editingMessageId}
                                    editingContent={editingContent}
                                    setEditingContent={setEditingContent}
                                    cancelInlineEdit={cancelInlineEdit}
                                    saveInlineEditAndRegenerate={saveInlineEditAndRegenerate}
                                    startInlineEdit={startInlineEdit}
                                    handleCopyMessage={handleCopyMessage}
                                    handleCopyRenderedMessage={handleCopyRenderedMessage}
                                    showCaptureStatus={showCaptureStatus}
                                    onRetry={handleRetryWithReadAloudCleanup}
                                    canRetry={canRetry}
                                    messageEndRef={messageEndRef}
                                    onOpenImageGallery={handleOpenImageGallery}
                                    isReadAloudSupported={isReadAloudSupported}
                                    readAloudUiStateByMessageId={readAloudUiStateByMessageId}
                                    onReadAloudUiClick={handleReadAloudUiClick}
                                    useInternalScroll={isConversationFullscreen}
                                    onOpenReasoningPanel={(message) => {
                                        setReasoningPanelMessageId((current) => (current === message.id ? null : message.id));
                                    }}
                                    activeReasoningMessageId={reasoningPanelMessageId}
                                />
                                <ChatComposer
                                    errorMsg={errorMsg}
                                    captureMsg={captureMsg}
                                    input={input}
                                    setInput={setInput}
                                    onSend={handleSendWithReadAloudCleanup}
                                    activeSession={activeSession}
                                    isSending={isSending}
                                    isLoadingModels={isLoadingModels}
                                    models={filteredModels}
                                    updateModelId={(modelId) => updateActiveSession((session) => ({ ...session, modelId }))}
                                    onCreateSession={handleCreateSession}
                                    selectedModelLabel={selectedModel?.label || ''}
                                    contextSource={context.source}
                                    selectedInputModalities={selectedInputModalities}
                                    supportsImageInput={supportsImageInput}
                                    supportsAudioInput={supportsAudioInput}
                                    supportsSearch={supportsSearch}
                                    supportsLogic={supportsLogic}
                                    useSearch={Boolean(activeSession?.useSearch)}
                                    useLinks={Boolean(activeSession?.useLinks)}
                                    useReasoning={Boolean(activeSession?.useReasoning)}
                                    useMemory={activeSession?.useMemory !== false}
                                    showSources={activeSession?.showSources ?? true}
                                    onToggleSearch={(nextValue) => updateActiveSession((session) => ({ ...session, useSearch: nextValue }))}
                                    onToggleLinks={(nextValue) => updateActiveSession((session) => ({ ...session, useLinks: nextValue }))}
                                    onToggleReasoning={(nextValue) => updateActiveSession((session) => ({ ...session, useReasoning: nextValue }))}
                                    onToggleSources={(nextValue) => updateActiveSession((session) => ({ ...session, showSources: nextValue }))}
                                    pendingImageInputs={pendingImageInputs}
                                    pendingAudioInputs={pendingAudioInputs}
                                    onUploadImage={handleImageUpload}
                                    onUploadAudio={handleAudioUpload}
                                    onRemoveImage={removePendingImage}
                                    onRemoveAudio={removePendingAudio}
                                    onClearImages={clearPendingImageInputs}
                                    onClearAudios={clearPendingAudioInputs}
                                    onRetry={handleRetryWithReadAloudCleanup}
                                    canRetry={canRetry}
                                    onStop={stop}
                                    controlButtonLargeClass={controlButtonLargeClass}
                                    controlButtonDangerClass={controlButtonDangerClass}
                                    selectControlClass={selectControlClass}
                                    allowNewSession={!isStandaloneProjectChat}
                                    modelContextLength={selectedModel?.textContextLength}
                                    pinnedMemory={activeSession?.pinnedMemory || ''}
                                    onUpdatePinnedMemory={(nextValue) => updateActiveSession((session) => ({
                                        ...session,
                                        pinnedMemory: nextValue,
                                        pinnedMemoryUpdatedAt: Date.now()
                                    }))}
                                    stickyToBottom={!isConversationFullscreen}
                                />
                            </div>

                            {!isStandaloneProjectChat && (
                                <ChatSessionPanel
                                    isSessionPanelOpen={isSessionPanelOpen}
                                    setIsSessionPanelOpen={setIsSessionPanelOpen}
                                    sessions={sessions}
                                    activeSessionId={activeSessionId}
                                    setActiveSessionId={setActiveSessionId}
                                    handleDeleteSession={handleDeleteSession}
                                    handleRenameSession={handleRenameSession}
                                    isSending={isSending}
                                    handleCreateSession={handleCreateSession}
                                    handleMoveSessionToProject={handleMoveSessionToProject}
                                    isCapturing={isCapturing}
                                />
                            )}
                        </div>
                    </section>
                </div>
            </div>
            {portalRoot && isImageGalleryOpen && galleryImages.length > 0 ? createPortal(
                <div
                    className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setIsImageGalleryOpen(false)}
                >
                    <button
                        onClick={(event) => { event.stopPropagation(); setIsImageGalleryOpen(false); }}
                        className="absolute top-6 right-6 p-3 text-white/50 hover:text-white transition-colors"
                        aria-label="Close gallery"
                    >
                        <X size={28} />
                    </button>
                    <button
                        onClick={(event) => { event.stopPropagation(); goToPrevImage(); }}
                        className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 md:p-6 text-white/30 hover:text-indigo-300 transition-colors"
                        aria-label="Previous image"
                    >
                        <ChevronLeft size={48} strokeWidth={1.2} />
                    </button>
                    <button
                        onClick={(event) => { event.stopPropagation(); goToNextImage(); }}
                        className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 md:p-6 text-white/30 hover:text-indigo-300 transition-colors"
                        aria-label="Next image"
                    >
                        <ChevronRight size={48} strokeWidth={1.2} />
                    </button>
                    <div
                        className="h-full w-full flex flex-col"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">My Stuff Gallery</p>
                                <p className="text-[11px] text-slate-500 mt-1">Image {imageGalleryIndex + 1} of {galleryImages.length}</p>
                            </div>
                            <div className="text-[11px] text-slate-500 uppercase tracking-widest">{activeGalleryImage?.name || 'Image'}</div>
                        </div>
                        <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-6">
                            <img
                                src={activeGalleryImage?.url}
                                alt={activeGalleryImage?.name || 'Image'}
                                className="max-w-[90vw] max-h-[70vh] object-contain rounded-2xl border border-white/10 shadow-[0_0_120px_rgba(99,102,241,0.12)]"
                            />
                        </div>
                        <div className="border-t border-white/10 px-6 py-4">
                            <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1">
                                {galleryImages.map((image, index) => (
                                    <button
                                        key={image.id}
                                        type="button"
                                        onClick={() => setImageGalleryIndex(index)}
                                        className={`relative w-20 h-14 rounded-xl overflow-hidden border transition-all ${index === imageGalleryIndex ? 'border-indigo-400 ring-2 ring-indigo-500/40' : 'border-white/10 hover:border-indigo-500/40'}`}
                                        aria-label={`View ${image.name}`}
                                    >
                                        <img src={image.url} alt={image.name} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                portalRoot
            ) : null}
            {confirmDialog && (
                <ChatConfirmDialog
                    confirmDialog={confirmDialog}
                    confirmCancelRef={confirmCancelRef}
                    confirmActionRef={confirmActionRef}
                    onClose={() => setConfirmDialog(null)}
                    onConfirm={handleConfirmDialogAction}
                />
            )}
            {isCaptureProjectModalOpen && (
                <ProjectReassignModal
                    projects={captureProjects}
                    selectedProjectId={captureProjectId}
                    onSelectProject={setCaptureProjectId}
                    onConfirm={handleConfirmCaptureProject}
                    onCancel={() => {
                        setPendingCaptureSessionId(null);
                        setIsCaptureProjectModalOpen(false);
                    }}
                    isMoving={isCapturing}
                    title="Move Chat Capture"
                />
            )}
        </div>
    );
};

export default AIChat;
