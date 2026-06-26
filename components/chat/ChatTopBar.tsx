import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    CircleHelp,
    ChevronRight,
    Copy,
    Download,
    Expand,
    FolderOpen,
    LayoutGrid,
    List as ListIcon,
    Save,
    MessageSquare,
    Minimize2,
    MoreHorizontal,
    Settings,
    X
} from 'lucide-react';
import { ChatAudioInput, ChatImageInput, ChatSession } from './types';

export interface ReadAloudVoiceOption {
    value: string;
    label: string;
}

interface ChatTopBarProps {
    isSessionPanelOpen: boolean;
    onToggleSessionPanel: () => void;
    showSessions?: boolean;
    isConversationFullscreen: boolean;
    onToggleFullscreen: () => void;
    showRuntimeSettings: boolean;
    setShowRuntimeSettings: (next: boolean) => void;
    activeSession: ChatSession | null;
    isSending: boolean;
    updateSessionRuntime: (temperature: number, maxTokens: number) => void;
    maxTokensLimit: number;
    onExportJson: () => void;
    onExportTxt: () => void;
    onCopyTranscript: () => void;
    onSaveToProject: () => void;
    saveDisabled: boolean;
    isSaving: boolean;
    onToggleMemory: (nextValue: boolean) => void;
    onMemoryProfileChange: (nextValue: 'light' | 'balanced' | 'deep') => void;
    isReadAloudSupported: boolean;
    readAloudVoiceValue: string;
    readAloudVoiceOptions: ReadAloudVoiceOption[];
    onReadAloudVoiceChange: (nextValue: string) => void;
    capabilityFilters: string[];
    onCapabilityFilterChange: (next: string[]) => void;
    capabilityFilterOptions: Array<{ value: string; label: string; count: number }>;
    capabilityFilterTotal: number;
    myStuffItems: ChatImageInput[];
    myStuffAudioItems: ChatAudioInput[];
    onOpenImageGallery: (imageId: string) => void;
    sessionTitleDraft: string;
    onSessionTitleDraftChange: (nextValue: string) => void;
    onSaveSessionTitle: () => void;
    onResetSessionTitle: () => void;
    canSaveSessionTitle: boolean;
    canResetSessionTitle: boolean;
}

const topButtonClass = 'chat-focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const iconButtonClass = 'chat-focus-ring inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors';

const ChatTopBar: React.FC<ChatTopBarProps> = ({
    isSessionPanelOpen,
    onToggleSessionPanel,
    showSessions,
    isConversationFullscreen,
    onToggleFullscreen,
    showRuntimeSettings,
    setShowRuntimeSettings,
    activeSession,
    isSending,
    updateSessionRuntime,
    maxTokensLimit,
    onExportJson,
    onExportTxt,
    onCopyTranscript,
    onSaveToProject,
    saveDisabled,
    isSaving,
    onToggleMemory,
    onMemoryProfileChange,
    isReadAloudSupported,
    readAloudVoiceValue,
    readAloudVoiceOptions,
    onReadAloudVoiceChange,
    capabilityFilters,
    onCapabilityFilterChange,
    capabilityFilterOptions,
    capabilityFilterTotal,
    myStuffItems,
    myStuffAudioItems,
    onOpenImageGallery,
    sessionTitleDraft,
    onSessionTitleDraftChange,
    onSaveSessionTitle,
    onResetSessionTitle,
    canSaveSessionTitle,
    canResetSessionTitle
}) => {
    const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);
    const [isMyStuffOpen, setIsMyStuffOpen] = useState(false);
    const [previewAudio, setPreviewAudio] = useState<ChatAudioInput | null>(null);
    const [myStuffView, setMyStuffView] = useState<'grid' | 'list'>(() => (
        (localStorage.getItem('aimana_chat_my_stuff_view') as 'grid' | 'list') || 'grid'
    ));
    const overflowMenuId = 'chat-topbar-overflow-menu';
    const settingsMenuId = 'chat-topbar-settings-menu';
    const menuRef = useRef<HTMLDivElement | null>(null);
    const myStuffCount = myStuffItems.length + myStuffAudioItems.length;
    const portalRoot = typeof document === 'undefined' ? null : document.body;

    const handleMyStuffViewChange = (value: 'grid' | 'list') => {
        setMyStuffView(value);
        localStorage.setItem('aimana_chat_my_stuff_view', value);
    };

    useEffect(() => {
        if (!isOverflowMenuOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (menuRef.current?.contains(target)) return;
            setIsOverflowMenuOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOverflowMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOverflowMenuOpen]);

    useEffect(() => {
        if (!isMyStuffOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMyStuffOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isMyStuffOpen]);

    useEffect(() => {
        if (!previewAudio) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setPreviewAudio(null);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [previewAudio]);

    const filterButtonBase = 'chat-focus-ring inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors';
    const filterButtonActive = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    const filterButtonInactive = 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-300';

    const isAllActive = capabilityFilters.length === 0;
    const memoryEnabled = activeSession?.useMemory !== false;
    const toggleCapability = (value: string) => {
        const next = capabilityFilters.includes(value)
            ? capabilityFilters.filter((item) => item !== value)
            : [...capabilityFilters, value];
        onCapabilityFilterChange(next);
    };

    return (
    <div className="px-3 sm:px-4 md:px-8 py-3 md:py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md shrink-0 z-30 chat-motion-toolbar">
        <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current Chat Title</p>
                        <input
                            type="text"
                            value={sessionTitleDraft}
                            onChange={(event) => onSessionTitleDraftChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    onSaveSessionTitle();
                                }
                            }}
                            disabled={!activeSession}
                            placeholder="Enter chat title..."
                            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Current chat title"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onResetSessionTitle}
                            disabled={!canResetSessionTitle}
                            className="chat-focus-ring rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={onSaveSessionTitle}
                            disabled={!canSaveSessionTitle}
                            className="chat-focus-ring rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save Title
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3 overflow-x-auto custom-scrollbar pb-1 xl:pb-0 w-full">
                <div className="flex items-center gap-2 text-slate-300 font-bold text-sm mr-2 shrink-0">
                    <MessageSquare size={16} className="text-indigo-400" />
                    Conversation
                </div>
                <div className="h-4 w-px bg-slate-700 shrink-0" />
                <div className="flex gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => onCapabilityFilterChange([])}
                        className={`${filterButtonBase} ${isAllActive ? filterButtonActive : filterButtonInactive}`}
                        aria-pressed={isAllActive}
                        title="Show all models"
                    >
                        All ({capabilityFilterTotal})
                    </button>
                    {capabilityFilterOptions.map((option) => {
                        const active = capabilityFilters.includes(option.value);
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleCapability(option.value)}
                                className={`${filterButtonBase} ${active ? filterButtonActive : filterButtonInactive}`}
                                aria-pressed={active}
                                title={`Filter by ${option.label}`}
                            >
                                {option.label} ({option.count})
                            </button>
                        );
                    })}
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end">
                {showSessions !== false && (
                    <button
                        onClick={onToggleSessionPanel}
                        disabled={isSending}
                        className={`${topButtonClass} ${isSessionPanelOpen ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 font-bold' : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-slate-200'}`}
                        title={isSessionPanelOpen ? 'Hide sessions' : 'Show sessions'}
                        aria-expanded={isSessionPanelOpen}
                        aria-controls="chat-session-panel"
                    >
                        <ChevronRight size={14} />
                        Sessions
                    </button>
                )}
                <div className="relative">
                    <button
                        onClick={() => setIsMyStuffOpen((value) => !value)}
                        className={`${topButtonClass} ${isMyStuffOpen ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 font-bold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
                        title="My Stuff"
                        aria-expanded={isMyStuffOpen}
                        aria-controls={isMyStuffOpen ? 'chat-my-stuff-modal' : undefined}
                    >
                        <FolderOpen size={14} />
                        My Stuff
                        <span className="ml-1 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {myStuffCount}
                        </span>
                    </button>
                </div>
                <div className="hidden sm:block h-4 w-px bg-slate-700 mx-1" />
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setIsOverflowMenuOpen((value) => !value)}
                        className={iconButtonClass}
                        title="More actions"
                        aria-label="More actions"
                        aria-haspopup="menu"
                        aria-expanded={isOverflowMenuOpen}
                        aria-controls={isOverflowMenuOpen ? overflowMenuId : undefined}
                    >
                        <MoreHorizontal size={16} />
                    </button>
                    {isOverflowMenuOpen && (
                        <div
                            id={overflowMenuId}
                            role="menu"
                            aria-label="More chat actions"
                            className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50"
                        >
                            <div className="p-1 space-y-0.5">
                                <button
                                    onClick={() => {
                                        onToggleFullscreen();
                                        setIsOverflowMenuOpen(false);
                                    }}
                                    role="menuitem"
                                    className="chat-focus-ring w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    {isConversationFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
                                    {isConversationFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowRuntimeSettings(!showRuntimeSettings);
                                        setIsOverflowMenuOpen(false);
                                    }}
                                    role="menuitem"
                                    className="chat-focus-ring w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                >
                                    <Settings size={14} />
                                    Settings
                                </button>
                                <div className="h-px bg-slate-800 my-1 mx-2" />
                                <button
                                    onClick={() => {
                                        onSaveToProject();
                                        setIsOverflowMenuOpen(false);
                                    }}
                                    disabled={saveDisabled || isSaving}
                                    role="menuitem"
                                    className="chat-focus-ring w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save size={14} />
                                    Move
                                </button>
                                <div className="h-px bg-slate-800 my-1 mx-2" />
                                <button
                                    onClick={() => {
                                        onExportJson();
                                        setIsOverflowMenuOpen(false);
                                    }}
                                    disabled={!activeSession || activeSession.messages.length === 0}
                                    role="menuitem"
                                    className="chat-focus-ring w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download size={14} />
                                    Export JSON
                                </button>
                                <button
                                    onClick={() => {
                                        onExportTxt();
                                        setIsOverflowMenuOpen(false);
                                    }}
                                    disabled={!activeSession || activeSession.messages.length === 0}
                                    role="menuitem"
                                    className="chat-focus-ring w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download size={14} />
                                    Export TXT
                                </button>
                                <button
                                    onClick={() => {
                                        onCopyTranscript();
                                        setIsOverflowMenuOpen(false);
                                    }}
                                    disabled={!activeSession || activeSession.messages.length === 0}
                                    role="menuitem"
                                    className="chat-focus-ring w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Copy size={14} />
                                    Copy All
                                </button>
                            </div>
                        </div>
                    )}
                    {showRuntimeSettings && (
                        <div
                            id={settingsMenuId}
                            role="menu"
                            aria-label="Runtime settings"
                            className="hidden xl:block chat-token-panel absolute right-0 mt-2 w-52 rounded-xl shadow-2xl p-3 z-30 chat-motion-popover"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Settings</span>
                                <button
                                    type="button"
                                    onClick={() => setShowRuntimeSettings(false)}
                                    className="chat-focus-ring inline-flex items-center justify-center rounded-md p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                                    aria-label="Close settings"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[11px] text-slate-400">Mode</label>
                                    <span
                                        className="inline-flex text-slate-500 hover:text-slate-300"
                                        title="Controls creativity (temperature). Low = precise, Medium = balanced, High = more creative."
                                        aria-label="Mode help: controls creativity and randomness"
                                    >
                                        <CircleHelp size={12} />
                                    </span>
                                </div>
                                <select
                                    value={(activeSession?.temperature ?? 0.7) <= 0.35 ? 'low' : (activeSession?.temperature ?? 0.7) >= 1 ? 'high' : 'medium'}
                                    onChange={(e) => {
                                        const nextTemperature = e.target.value === 'low' ? 0.2 : e.target.value === 'high' ? 1.2 : 0.7;
                                        const currentMax = activeSession?.maxTokens ?? 16384;
                                        const clampedMax = Math.max(64, Math.min(currentMax, maxTokensLimit));
                                        updateSessionRuntime(nextTemperature, clampedMax);
                                    }}
                                    disabled={isSending || !activeSession}
                                    className="chat-token-select chat-focus-ring rounded-md px-2 py-1 text-xs text-slate-200"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <p className="text-[10px] text-slate-500 mb-2">
                                Low = precise, Medium = balanced, High = creative.
                            </p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[11px] text-slate-400">Max</label>
                                    <span
                                        className="inline-flex text-slate-500 hover:text-slate-300"
                                        title="Maximum response tokens. Higher values allow longer replies but can increase latency and cost."
                                        aria-label="Max help: controls maximum response length"
                                    >
                                        <CircleHelp size={12} />
                                    </span>
                                </div>
                                <input
                                    type="number"
                                    min={64}
                                    max={maxTokensLimit}
                                    step={64}
                                    value={activeSession?.maxTokens ?? 16384}
                                    onChange={(e) => {
                                        const nextValue = Number(e.target.value);
                                        if (!Number.isFinite(nextValue)) return;
                                        const clamped = Math.max(64, Math.min(nextValue, maxTokensLimit));
                                        updateSessionRuntime(activeSession?.temperature ?? 0.7, clamped);
                                    }}
                                    disabled={isSending || !activeSession}
                                    className="chat-token-select chat-focus-ring w-24 rounded-md px-2 py-1 text-xs text-slate-200"
                                />
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                Higher Max = longer answers, but slower and potentially costlier.
                            </p>
                            <div className="h-px bg-slate-800 my-3" />
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[11px] text-slate-400">Memory</label>
                                    <span
                                        className="inline-flex text-slate-500 hover:text-slate-300"
                                        title="Toggles pinned memory and auto-summary. Disable to send full chat without memory injection."
                                        aria-label="Memory help: controls pinned memory + summary injection"
                                    >
                                        <CircleHelp size={12} />
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onToggleMemory(!memoryEnabled)}
                                    disabled={!activeSession || isSending}
                                    className={`chat-focus-ring inline-flex items-center justify-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                        memoryEnabled
                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                                    }`}
                                >
                                    {memoryEnabled ? 'On' : 'Off'}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500">
                                When off, pinned memory and summaries are ignored for this session.
                            </p>
                            <div className="flex items-center justify-between mt-3">
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[11px] text-slate-400">Profile</label>
                                    <span
                                        className="inline-flex text-slate-500 hover:text-slate-300"
                                        title="Adjust how aggressively the chat summarizes past messages."
                                        aria-label="Memory profile help"
                                    >
                                        <CircleHelp size={12} />
                                    </span>
                                </div>
                                <select
                                    value={activeSession?.memoryProfile || 'balanced'}
                                    onChange={(e) => onMemoryProfileChange(e.target.value as 'light' | 'balanced' | 'deep')}
                                    disabled={!activeSession || isSending}
                                    className="chat-token-select chat-focus-ring rounded-md px-2 py-1 text-xs text-slate-200"
                                >
                                    <option value="light">Light</option>
                                    <option value="balanced">Balanced</option>
                                    <option value="deep">Deep</option>
                                </select>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                Light keeps more raw messages. Deep summarizes more aggressively.
                            </p>
                            <div className="h-px bg-slate-800 my-3" />
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[11px] text-slate-400">Read Aloud Voice</label>
                                    <span
                                        className="inline-flex text-slate-500 hover:text-slate-300"
                                        title="Choose which browser voice reads assistant responses."
                                        aria-label="Read aloud voice help"
                                    >
                                        <CircleHelp size={12} />
                                    </span>
                                </div>
                            </div>
                            <select
                                value={readAloudVoiceValue}
                                onChange={(e) => onReadAloudVoiceChange(e.target.value)}
                                disabled={!activeSession || isSending || !isReadAloudSupported}
                                className="chat-token-select chat-focus-ring w-full rounded-md px-2 py-1 text-xs text-slate-200"
                                aria-label="Read aloud voice"
                            >
                                {readAloudVoiceOptions.map((option) => (
                                    <option key={option.value || '__default'} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-500 mt-2">
                                {isReadAloudSupported
                                    ? 'Uses voices available in your browser/OS.'
                                    : 'Read aloud is unavailable in this browser.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        {showRuntimeSettings && (
            <div className="mt-3 border-t border-slate-800/70 pt-3 xl:hidden">
                <div
                    role="menu"
                    aria-label="Runtime settings"
                    className="chat-token-panel rounded-xl shadow-2xl p-3 chat-motion-popover"
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Settings</span>
                        <button
                            type="button"
                            onClick={() => setShowRuntimeSettings(false)}
                            className="chat-focus-ring inline-flex items-center justify-center rounded-md p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                            aria-label="Close settings"
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-slate-400">Mode</label>
                                <span
                                    className="inline-flex text-slate-500 hover:text-slate-300"
                                    title="Controls creativity (temperature). Low = precise, Medium = balanced, High = more creative."
                                    aria-label="Mode help: controls creativity and randomness"
                                >
                                    <CircleHelp size={12} />
                                </span>
                            </div>
                            <select
                                value={(activeSession?.temperature ?? 0.7) <= 0.35 ? 'low' : (activeSession?.temperature ?? 0.7) >= 1 ? 'high' : 'medium'}
                                onChange={(e) => {
                                    const nextTemperature = e.target.value === 'low' ? 0.2 : e.target.value === 'high' ? 1.2 : 0.7;
                                    const currentMax = activeSession?.maxTokens ?? 16384;
                                    const clampedMax = Math.max(64, Math.min(currentMax, maxTokensLimit));
                                    updateSessionRuntime(nextTemperature, clampedMax);
                                }}
                                disabled={isSending || !activeSession}
                                className="chat-token-select chat-focus-ring rounded-md px-2 py-1 text-xs text-slate-200"
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-slate-400">Memory</label>
                                <span
                                    className="inline-flex text-slate-500 hover:text-slate-300"
                                    title="Memory stores summaries and uses pinned session memory."
                                    aria-label="Memory help"
                                >
                                    <CircleHelp size={12} />
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToggleMemory(!memoryEnabled)}
                                disabled={!activeSession || isSending}
                                className={`chat-focus-ring inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    memoryEnabled
                                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                                }`}
                            >
                                {memoryEnabled ? 'On' : 'Off'}
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                <label className="text-[11px] text-slate-400">Profile</label>
                                <span
                                    className="inline-flex text-slate-500 hover:text-slate-300"
                                    title="Adjust how aggressively the chat summarizes past messages."
                                    aria-label="Memory profile help"
                                >
                                    <CircleHelp size={12} />
                                </span>
                            </div>
                            <select
                                value={activeSession?.memoryProfile || 'balanced'}
                                onChange={(e) => onMemoryProfileChange(e.target.value as 'light' | 'balanced' | 'deep')}
                                disabled={!activeSession || isSending}
                                className="chat-token-select chat-focus-ring rounded-md px-2 py-1 text-xs text-slate-200"
                            >
                                <option value="light">Light</option>
                                <option value="balanced">Balanced</option>
                                <option value="deep">Deep</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-[11px] text-slate-400">Read Aloud Voice</label>
                            <select
                                value={readAloudVoiceValue}
                                onChange={(e) => onReadAloudVoiceChange(e.target.value)}
                                disabled={!activeSession || isSending || !isReadAloudSupported}
                                className="chat-token-select chat-focus-ring max-w-[13rem] rounded-md px-2 py-1 text-xs text-slate-200"
                                aria-label="Read aloud voice"
                            >
                                {readAloudVoiceOptions.map((option) => (
                                    <option key={option.value || '__default'} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </div>
        {portalRoot && isMyStuffOpen ? createPortal(
            <div
                id="chat-my-stuff-modal"
                className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
                role="dialog"
                aria-modal="true"
                onClick={() => setIsMyStuffOpen(false)}
            >
                <div
                    className="w-full max-w-5xl max-h-[85vh] bg-slate-950 border border-slate-800/80 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-slate-800/70">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">My Stuff Manifest</h2>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Session asset registry</p>
                            <p className="text-[11px] text-slate-500 mt-2">{myStuffCount} items captured in this session</p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800 shadow-xl">
                                <button
                                    onClick={() => handleMyStuffViewChange('grid')}
                                    className={`p-2 rounded-lg transition-all ${myStuffView === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    title="Mosaic Grid"
                                >
                                    <LayoutGrid size={16} />
                                </button>
                                <button
                                    onClick={() => handleMyStuffViewChange('list')}
                                    className={`p-2 rounded-lg transition-all ${myStuffView === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                    title="Technical List"
                                >
                                    <ListIcon size={16} />
                                </button>
                            </div>
                            <button
                                onClick={() => setIsMyStuffOpen(false)}
                                className="p-2 rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-white"
                                aria-label="Close My Stuff"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-8">
                        {myStuffCount === 0 && (
                            <div className="border border-dashed border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-500">
                                Upload images or audio in chat to see them here.
                            </div>
                        )}
                        {myStuffItems.length > 0 && (
                            <section className="space-y-3">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex flex-col">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Images</h3>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">Visual manifests</p>
                                    </div>
                                    <span className="text-[11px] text-slate-500">{myStuffItems.length} items</span>
                                </div>
                                {myStuffView === 'list' ? (
                                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2rem] overflow-x-auto shadow-2xl">
                                        <table className="w-full min-w-[34rem] text-left text-[11px]">
                                            <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/80">
                                                <tr>
                                                    <th className="px-6 py-4 w-20">Preview</th>
                                                    <th className="px-6 py-4">Name</th>
                                                    <th className="px-6 py-4 w-36">Type</th>
                                                    <th className="px-6 py-4 w-28 text-right">Size</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {myStuffItems.map((image) => (
                                                    <tr
                                                        key={image.id}
                                                        className="hover:bg-indigo-600/5 transition-colors cursor-pointer"
                                                        onClick={() => {
                                                            if (!image.url) return;
                                                            onOpenImageGallery(image.id);
                                                            setIsMyStuffOpen(false);
                                                        }}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="w-12 h-12 rounded-lg bg-black border border-slate-700 overflow-hidden shadow-inner">
                                                                {image.url ? (
                                                                    <img src={image.url} className="w-full h-full object-cover opacity-80" alt={image.name} />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600">...</div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-slate-200 font-semibold truncate">{image.name || 'Image'}</td>
                                                        <td className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{image.mimeType || 'image'}</td>
                                                        <td className="px-6 py-4 text-right text-[10px] text-slate-500 uppercase tracking-widest">
                                                            {image.size ? `${(image.size / 1024 / 1024).toFixed(2)} MB` : '--'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
                                        {myStuffItems.map((image) => (
                                            <button
                                                key={image.id}
                                                type="button"
                                                onClick={() => {
                                                    if (!image.url) return;
                                                    onOpenImageGallery(image.id);
                                                    setIsMyStuffOpen(false);
                                                }}
                                                className="group relative aspect-square bg-slate-900/20 border border-slate-800/50 rounded-[1.5rem] overflow-hidden transition-all hover:border-indigo-500/40 hover:-translate-y-1 shadow-2xl"
                                                title={image.name}
                                                aria-label={`Preview ${image.name}`}
                                            >
                                                {image.url ? (
                                                    <img src={image.url} alt={image.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform" />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-[11px] text-slate-500">
                                                        Processing...
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                        {myStuffAudioItems.length > 0 && (
                            <section className="space-y-3">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex flex-col">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Audio</h3>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">Sound manifests</p>
                                    </div>
                                    <span className="text-[11px] text-slate-500">{myStuffAudioItems.length} items</span>
                                </div>
                                {myStuffView === 'list' ? (
                                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2rem] overflow-x-auto shadow-2xl">
                                        <table className="w-full min-w-[28rem] text-left text-[11px]">
                                            <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/80">
                                                <tr>
                                                    <th className="px-6 py-4">Name</th>
                                                    <th className="px-6 py-4 w-36">Format</th>
                                                    <th className="px-6 py-4 w-28 text-right">Size</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/40">
                                                {myStuffAudioItems.map((audio) => (
                                                    <tr
                                                        key={audio.id}
                                                        className="hover:bg-indigo-600/5 transition-colors cursor-pointer"
                                                        onClick={() => setPreviewAudio(audio)}
                                                    >
                                                        <td className="px-6 py-4 text-slate-200 font-semibold truncate">{audio.name || 'Audio'}</td>
                                                        <td className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{audio.format || 'unknown'}</td>
                                                        <td className="px-6 py-4 text-right text-[10px] text-slate-500 uppercase tracking-widest">
                                                            {audio.size ? `${(audio.size / 1024 / 1024).toFixed(2)} MB` : '--'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {myStuffAudioItems.map((audio) => (
                                            <button
                                                key={audio.id}
                                                type="button"
                                                onClick={() => setPreviewAudio(audio)}
                                                className="w-full flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left hover:border-indigo-500/40 transition-all"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm text-slate-200 font-semibold truncate">{audio.name || 'Audio'}</p>
                                                    <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">
                                                        {audio.format || 'unknown'}
                                                        {audio.size ? ` - ${(audio.size / 1024 / 1024).toFixed(2)} MB` : ''}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Preview</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                </div>
            </div>,
            portalRoot
        ) : null}
        {portalRoot && previewAudio ? createPortal(
            <div
                className="fixed inset-0 z-[130] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6"
                role="dialog"
                aria-modal="true"
                onClick={() => setPreviewAudio(null)}
            >
                <div
                    className="relative w-full max-w-xl bg-slate-950 border border-slate-800/80 rounded-2xl p-6 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <button
                        onClick={() => setPreviewAudio(null)}
                        className="absolute -top-10 right-0 p-2 rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-white"
                        aria-label="Close preview"
                    >
                        <X size={18} />
                    </button>
                    <div className="mb-4">
                        <p className="text-sm font-semibold text-slate-200">{previewAudio.name || 'Audio Preview'}</p>
                        <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">
                            {previewAudio.format || 'unknown'}
                            {previewAudio.size ? ` - ${(previewAudio.size / 1024 / 1024).toFixed(2)} MB` : ''}
                        </p>
                    </div>
                    {previewAudio.url || (previewAudio.data && previewAudio.format) ? (
                        <audio
                            controls
                            preload="none"
                            className="w-full"
                            src={previewAudio.url || `data:${previewAudio.mimeType || `audio/${previewAudio.format}`};base64,${previewAudio.data}`}
                        />
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
                            Audio preview unavailable.
                        </div>
                    )}
                </div>
            </div>,
            portalRoot
        ) : null}
    </div>
    );
};

export default ChatTopBar;
