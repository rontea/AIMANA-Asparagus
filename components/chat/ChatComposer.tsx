import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, BrainCircuit, Compass, ImagePlus, Link, Link2, Pin, Plus, RotateCcw, Square, X } from 'lucide-react';
import { ModelOption } from '../project/lab/ModelSelector/registry/index';
import { ChatAudioInput, ChatImageInput, ChatSession } from './types';
import { getContextWindowInfo } from './utils';

interface ChatComposerProps {
    errorMsg: string | null;
    captureMsg: string | null;
    input: string;
    setInput: (value: string) => void;
    onSend: () => void;
    activeSession: ChatSession | null;
    isSending: boolean;
    isLoadingModels: boolean;
    models: ModelOption[];
    updateModelId: (modelId: string) => void;
    onCreateSession: () => void;
    selectedModelLabel: string;
    contextSource: string;
    selectedInputModalities: string[];
    supportsImageInput: boolean;
    supportsAudioInput: boolean;
    supportsSearch: boolean;
    supportsLogic: boolean;
    useSearch: boolean;
    useLinks: boolean;
    useReasoning: boolean;
    useMemory: boolean;
    showSources: boolean;
    onToggleSearch: (nextValue: boolean) => void;
    onToggleLinks: (nextValue: boolean) => void;
    onToggleReasoning: (nextValue: boolean) => void;
    onToggleSources: (nextValue: boolean) => void;
    pendingImageInputs: ChatImageInput[];
    pendingAudioInputs: ChatAudioInput[];
    onUploadImage: (files: FileList | null) => void;
    onUploadAudio: (files: FileList | null) => void;
    onRemoveImage: (imageId: string) => void;
    onRemoveAudio: (audioId: string) => void;
    onClearImages: () => void;
    onClearAudios: () => void;
    onRetry: () => void;
    canRetry: boolean;
    onStop: () => void;
    controlButtonLargeClass: string;
    controlButtonDangerClass: string;
    selectControlClass: string;
    allowNewSession?: boolean;
    modelContextLength?: number;
    pinnedMemory: string;
    onUpdatePinnedMemory: (nextValue: string) => void;
    stickyToBottom?: boolean;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
    errorMsg,
    captureMsg,
    input,
    setInput,
    onSend,
    activeSession,
    isSending,
    isLoadingModels,
    models,
    updateModelId,
    onCreateSession,
    selectedModelLabel,
    contextSource,
    selectedInputModalities,
    supportsImageInput,
    supportsAudioInput,
    supportsSearch,
    supportsLogic,
    useSearch,
    useLinks,
    useReasoning,
    useMemory,
    showSources,
    onToggleSearch,
    onToggleLinks,
    onToggleReasoning,
    onToggleSources,
    pendingImageInputs,
    pendingAudioInputs,
    onUploadImage,
    onUploadAudio,
    onRemoveImage,
    onRemoveAudio,
    onClearImages,
    onClearAudios,
    onRetry,
    canRetry,
    onStop,
    controlButtonLargeClass,
    controlButtonDangerClass,
    selectControlClass,
    allowNewSession = true,
    modelContextLength,
    pinnedMemory,
    onUpdatePinnedMemory,
    stickyToBottom = false
}) => {
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const audioInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const memoryEnabled = useMemory && (activeSession?.useMemory !== false);
    const contextInfo = memoryEnabled
        ? getContextWindowInfo(activeSession, modelContextLength)
        : {
            totalMessages: activeSession?.messages?.length || 0,
            summaryCount: 0,
            sentMessages: activeSession?.messages?.length || 0,
            targetSummaryCount: 0
        };
    const contextLabel = activeSession
        ? (memoryEnabled
            ? (contextInfo.summaryCount > 0
                ? `Context: summary + ${contextInfo.sentMessages} msgs`
                : `Context: ${contextInfo.sentMessages} msgs`)
            : `Context: ${contextInfo.sentMessages} msgs (memory off)`)
        : 'Context: n/a';
    const hasPinnedMemory = Boolean(pinnedMemory && pinnedMemory.trim());
    const [isMemoryOpen, setIsMemoryOpen] = useState(false);
    const [memoryDraft, setMemoryDraft] = useState(pinnedMemory || '');

    useEffect(() => {
        if (!isMemoryOpen) return;
        setMemoryDraft(pinnedMemory || '');
    }, [isMemoryOpen, pinnedMemory]);

    useEffect(() => {
        if (isMemoryOpen) return;
        setMemoryDraft(pinnedMemory || '');
    }, [pinnedMemory, isMemoryOpen]);

    useEffect(() => {
        if (!memoryEnabled && isMemoryOpen) {
            setIsMemoryOpen(false);
        }
    }, [isMemoryOpen, memoryEnabled]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = '0px';
        const nextHeight = Math.min(textarea.scrollHeight, Math.round(window.innerHeight * 0.44));
        textarea.style.height = `${Math.max(nextHeight, 56)}px`;
    }, [input]);

    const shellClass = stickyToBottom
        ? 'sticky bottom-0 z-20 border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-md p-4 sm:p-6 md:p-8 flex justify-center'
        : 'p-6 md:p-8 border-t border-slate-800/80 bg-slate-950 shrink-0 flex justify-center';

    return (
        <div className={shellClass}>
            <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl">
        {errorMsg && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-200 text-xs chat-focus-ring">
                {errorMsg}
            </div>
        )}
        {captureMsg && (
            <div className="mb-3 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs chat-focus-ring">
                {captureMsg}
            </div>
        )}

        <div className="bg-[var(--chat-surface-elevated)] border border-[var(--chat-border-strong)] rounded-[2rem] focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all shadow-lg">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSend();
                        }
                    }}
                    placeholder="Ask for follow-up changes"
                    rows={1}
                    disabled={isSending || !activeSession?.modelId}
                    className="w-full bg-transparent text-slate-200 placeholder-slate-500 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 min-h-[56px] max-h-[44vh] resize-none overflow-y-auto focus:outline-none text-[15px] leading-6 custom-scrollbar disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <div className="border-t border-slate-800/70 px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {(supportsImageInput || supportsAudioInput) && (
                            <div className="chat-token-panel flex shrink-0 items-center gap-1 bg-slate-950/80 p-1 rounded-2xl backdrop-blur-sm">
                                {supportsImageInput && (
                                    <>
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    onUploadImage(e.target.files);
                                    e.currentTarget.value = '';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                disabled={isSending}
                                className="chat-token-icon-btn chat-focus-ring flex items-center justify-center w-10 h-10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Add Image"
                            >
                                <ImagePlus size={16} />
                                <span className="sr-only">Add Image</span>
                            </button>
                                    </>
                                )}
                                {supportsAudioInput && (
                                    <>
                            <input
                                ref={audioInputRef}
                                type="file"
                                accept="audio/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    onUploadAudio(e.target.files);
                                    e.currentTarget.value = '';
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => audioInputRef.current?.click()}
                                disabled={isSending}
                                className="chat-token-icon-btn chat-focus-ring flex items-center justify-center w-10 h-10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Add Audio"
                            >
                                <AudioLines size={16} />
                                <span className="sr-only">Add Audio</span>
                            </button>
                                    </>
                                )}
                            </div>
                        )}

                        {(supportsSearch || supportsLogic || activeSession) && (
                            <div className="chat-token-panel flex min-w-0 flex-wrap items-center gap-1 bg-slate-950/80 p-1 rounded-2xl backdrop-blur-sm">
                                {supportsSearch && (
                        <button
                            type="button"
                            onClick={() => onToggleSearch(!useSearch)}
                            disabled={isSending}
                            className={`chat-focus-ring inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors border border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                                useSearch
                                    ? 'text-emerald-200 bg-emerald-500/10'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700/50'
                            }`}
                            title="Enable web search/tool grounding for supported models"
                        >
                            <Compass size={14} className="opacity-70" /> Search {useSearch ? 'On' : 'Off'}
                        </button>
                                )}
                                {activeSession && (
                        <button
                            type="button"
                            onClick={() => onToggleLinks(!useLinks)}
                            disabled={isSending}
                            className={`chat-focus-ring inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors border border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                                useLinks
                                    ? 'text-amber-200 bg-amber-500/10'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700/50'
                                }`}
                                title="Enable link ingestion for pasted URLs"
                            >
                                <Link size={14} className="opacity-70" /> Links {useLinks ? 'On' : 'Off'}
                            </button>
                                )}
                                {supportsLogic && (
                        <button
                            type="button"
                            onClick={() => onToggleReasoning(!useReasoning)}
                            disabled={isSending}
                            className={`chat-focus-ring inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors border border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                                useReasoning
                                    ? 'text-violet-200 bg-violet-500/10'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700/50'
                                }`}
                                title="Enable enhanced reasoning mode for supported models"
                            >
                                <BrainCircuit size={14} className="opacity-70" /> Logic {useReasoning ? 'On' : 'Off'}
                            </button>
                                )}
                                {activeSession && (
                        <button
                            type="button"
                            onClick={() => onToggleSources(!showSources)}
                            disabled={isSending}
                            className={`chat-focus-ring inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors border border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                                showSources
                                    ? 'text-cyan-200 bg-cyan-500/10'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700/50'
                                }`}
                                title="Show or hide source citations in chat responses"
                            >
                                <Link2 size={14} className="opacity-70" /> Sources {showSources ? 'On' : 'Off'}
                            </button>
                                )}
                                {activeSession && (
                        <button
                            type="button"
                            onClick={() => setIsMemoryOpen((value) => !value)}
                            disabled={isSending || !memoryEnabled}
                            className={`chat-focus-ring inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors border border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isMemoryOpen || hasPinnedMemory
                                        ? 'text-indigo-200 bg-indigo-500/10'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:border-slate-700/50'
                                }`}
                                title={memoryEnabled ? 'Pinned memory injected into every request' : 'Enable memory in session settings to use pinned memory'}
                            >
                                <Pin size={14} className="opacity-70" /> Memory {hasPinnedMemory ? 'Set' : ''}
                            </button>
                                )}
                            </div>
                        )}

                        <select
                            value={activeSession?.modelId || ''}
                            onChange={(e) => updateModelId(e.target.value)}
                            disabled={isLoadingModels || isSending || !activeSession}
                            aria-label="Chat model"
                            className={`${selectControlClass} min-w-0 flex-1 sm:flex-none sm:ml-1 rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 border-slate-700 w-full sm:w-auto sm:max-w-[220px]`}
                        >
                            {isLoadingModels && <option value="">Loading...</option>}
                            {!isLoadingModels && models.length === 0 && <option value="">No models</option>}
                            {models.map((model) => (
                                <option key={model.id} value={model.id}>{model.label}</option>
                            ))}
                        </select>

                        {(pendingImageInputs.length > 0 || pendingAudioInputs.length > 0) && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClearImages();
                                    onClearAudios();
                                }}
                                disabled={isSending}
                                className="chat-token-control-btn chat-focus-ring inline-flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <X size={11} /> Clear
                            </button>
                        )}
                    </div>
                    <button
                        onClick={onSend}
                        disabled={isSending || (!input.trim() && pendingImageInputs.length === 0 && pendingAudioInputs.length === 0) || !activeSession?.modelId}
                        className="chat-token-control-btn chat-focus-ring self-end sm:self-auto inline-flex h-12 w-12 shrink-0 items-center justify-center hover:bg-indigo-600 hover:text-white rounded-2xl transition-all shadow-lg hover:shadow-indigo-500/25 hover:border-indigo-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Send"
                        aria-label="Send message"
                    >
                        <ArrowUp size={20} />
                    </button>
            </div>
            </div>

            {activeSession && isMemoryOpen && (
                <div className="mt-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pinned Memory</div>
                        <button
                            type="button"
                            onClick={() => setIsMemoryOpen(false)}
                            className="chat-focus-ring inline-flex items-center justify-center rounded-md p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                            aria-label="Close pinned memory"
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <textarea
                        value={memoryDraft}
                        onChange={(e) => setMemoryDraft(e.target.value)}
                        placeholder="Add stable facts, preferences, or goals you want the assistant to remember."
                        rows={3}
                        className="w-full rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                        disabled={isSending}
                    />
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">Injected into every request.</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setMemoryDraft('');
                                    onUpdatePinnedMemory('');
                                }}
                                disabled={isSending || !hasPinnedMemory}
                                className="chat-focus-ring px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onUpdatePinnedMemory(memoryDraft.trim());
                                    setIsMemoryOpen(false);
                                }}
                                disabled={isSending}
                                className="chat-focus-ring px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-indigo-500/30 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(pendingImageInputs.length > 0 || pendingAudioInputs.length > 0) && (
                <div className="mt-3 space-y-2">
                    {pendingImageInputs.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {pendingImageInputs.map((image) => (
                                <div key={image.id} className="relative shrink-0 w-16 h-16 rounded-lg border border-slate-700 overflow-hidden bg-slate-950">
                                    <img src={image.url} alt={image.name} className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => onRemoveImage(image.id)}
                                        className="chat-focus-ring absolute top-0.5 right-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/70 text-slate-200 hover:text-white"
                                        aria-label={`Remove ${image.name}`}
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {pendingAudioInputs.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            {pendingAudioInputs.map((audio) => (
                                <div key={audio.id} className="flex items-center justify-between rounded-lg border border-slate-700/70 px-2 py-1.5 text-[11px] text-slate-300">
                                    <span className="truncate pr-2">{audio.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveAudio(audio.id)}
                                        className="chat-focus-ring inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/70 text-slate-200 hover:text-white"
                                        aria-label={`Remove ${audio.name}`}
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-1 sm:px-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {allowNewSession && (
                            <button
                                onClick={onCreateSession}
                                disabled={isSending}
                                className={controlButtonLargeClass}
                            >
                                <Plus size={14} /> New Session
                            </button>
                        )}
                    </div>

                    <div className="text-[11px] text-slate-500 min-w-0 break-words order-last lg:order-none">
                        {selectedModelLabel ? `Model: ${selectedModelLabel}` : 'Select a model to start'} | Inputs: {(selectedInputModalities.length > 0 ? selectedInputModalities.join(', ') : 'text')} | {contextLabel} | {contextSource}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={onRetry}
                            disabled={!canRetry}
                            className={controlButtonLargeClass}
                        >
                            <RotateCcw size={14} /> Retry
                        </button>
                        <button
                            onClick={onStop}
                            disabled={!isSending}
                            className={controlButtonDangerClass}
                        >
                            <Square size={14} /> Stop
                        </button>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};

export default ChatComposer;
