import React from 'react';
import { BrainCircuit, Check, Copy, Loader2, Pause, Pencil, RotateCw, Sparkles, Square, ThumbsDown, ThumbsUp, Volume2, X } from 'lucide-react';
import MessageMarkdown from './MessageMarkdown';
import { ChatMessage } from './types';
import { getReadAloudTextForMessage, splitReasoningSummary } from './readAloud';

type ReadAloudUiState = 'idle' | 'playing' | 'paused' | 'disabled';

interface ChatMessageListProps {
    messages: ChatMessage[];
    isSending: boolean;
    showSources: boolean;
    editingMessageId: string | null;
    editingContent: string;
    setEditingContent: (value: string) => void;
    cancelInlineEdit: () => void;
    saveInlineEditAndRegenerate: () => void;
    startInlineEdit: (message: ChatMessage) => void;
    handleCopyMessage: (content: string) => void;
    handleCopyRenderedMessage: (messageId: string, fallbackContent: string) => void;
    showCaptureStatus: (message: string) => void;
    onRetry: () => void;
    canRetry: boolean;
    messageEndRef: React.MutableRefObject<HTMLDivElement | null>;
    onOpenImageGallery: (imageId: string) => void;
    isReadAloudSupported?: boolean;
    readAloudUiStateByMessageId?: Partial<Record<string, ReadAloudUiState>>;
    onReadAloudUiClick?: (payload: {
        message: ChatMessage;
        text: string;
        includeReasoningSummary: boolean;
        truncated: boolean;
    }) => void;
    useInternalScroll?: boolean;
    onOpenReasoningPanel?: (message: ChatMessage) => void;
    activeReasoningMessageId?: string | null;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({
    messages,
    isSending,
    showSources,
    editingMessageId,
    editingContent,
    setEditingContent,
    cancelInlineEdit,
    saveInlineEditAndRegenerate,
    startInlineEdit,
    handleCopyMessage,
    handleCopyRenderedMessage,
    showCaptureStatus,
    onRetry,
    canRetry,
    messageEndRef,
    onOpenImageGallery,
    isReadAloudSupported = false,
    readAloudUiStateByMessageId,
    onReadAloudUiClick,
    useInternalScroll = true,
    onOpenReasoningPanel,
    activeReasoningMessageId = null
}) => {
    const assistantIconActionClass = 'chat-token-icon-btn chat-focus-ring p-2 transition-colors';
    const getReadAloudUiState = (messageId: string, disabledByRule: boolean): ReadAloudUiState => {
        if (!isReadAloudSupported || disabledByRule) return 'disabled';
        const state = readAloudUiStateByMessageId?.[messageId];
        if (state === 'playing' || state === 'paused' || state === 'disabled') return state;
        return 'idle';
    };
    const listShellClass = useInternalScroll
        ? 'flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-8 flex flex-col items-center bg-slate-950'
        : 'flex-1 p-3 sm:p-4 md:p-8 flex flex-col items-center bg-slate-950';
    const emptyStateClass = useInternalScroll
        ? 'h-full min-h-[280px] flex items-center justify-center text-center text-slate-500'
        : 'min-h-[280px] flex items-center justify-center py-12 text-center text-slate-500';
    const getReadAloudButtonMeta = (state: ReadAloudUiState) => {
        if (state === 'playing') {
            return {
                title: 'Pause reading',
                ariaLabel: 'Pause reading',
                icon: <Pause size={14} />,
                className: `${assistantIconActionClass} rounded-lg bg-indigo-500/10 text-indigo-300`
            };
        }
        if (state === 'paused') {
            return {
                title: 'Resume reading',
                ariaLabel: 'Resume reading',
                icon: <Volume2 size={14} />,
                className: `${assistantIconActionClass} rounded-lg bg-indigo-500/10 text-indigo-300`
            };
        }
        if (state === 'disabled') {
            const unsupported = !isReadAloudSupported;
            return {
                title: unsupported ? 'Read aloud unavailable in this browser' : 'Read aloud unavailable',
                ariaLabel: unsupported ? 'Read aloud unavailable in this browser' : 'Read response aloud unavailable',
                icon: <Volume2 size={14} />,
                className: `${assistantIconActionClass} opacity-40 cursor-not-allowed`
            };
        }
        return {
            title: 'Read aloud',
            ariaLabel: 'Read response aloud',
            icon: <Volume2 size={14} />,
            className: assistantIconActionClass
        };
    };
    const injectCitationLinks = (content: string, sources?: ChatMessage['sources']) => {
        if (!content || !Array.isArray(sources) || sources.length === 0) return content;
        const urls = sources.map((src) => String(src?.url || '').trim());
        if (urls.every((u) => !u)) return content;

        const replaceCitations = (segment: string) => (
            segment.replace(/\[(\d{1,3})\](?!\(|\s*:)/g, (match, rawIndex) => {
                const index = Number(rawIndex);
                if (!Number.isFinite(index) || index <= 0) return match;
                const url = urls[index - 1];
                if (!url) return match;
                return `[\\[${index}\\]](${url})`;
            })
        );

        const replaceInline = (segment: string) => {
            const parts = segment.split('`');
            return parts.map((part, idx) => (idx % 2 === 0 ? replaceCitations(part) : part)).join('`');
        };

        const fenced = content.split('```');
        return fenced.map((part, idx) => (idx % 2 === 0 ? replaceInline(part) : part)).join('```');
    };
    const renderSearchStatus = (msg: ChatMessage) => {
        if (msg.searchApplied === true) return 'Search: On (Grounded)';
        if (msg.searchMode === 'native' || msg.searchMode === 'fallback' || msg.searchWarning) return 'Search: On (Unavailable)';
        return '';
    };
    const renderLinkStatus = (msg: ChatMessage) => {
        if (msg.linkApplied === true) return 'Links: On (Ingested)';
        if (msg.linkWarning) return 'Links: On (Unavailable)';
        return '';
    };

    return (
        <div className={listShellClass}>
            <div className="w-full max-w-3xl xl:max-w-5xl 2xl:max-w-6xl space-y-8 pb-4">
                {messages.length === 0 && !isSending && (
                    <div className={emptyStateClass}>
                        <div>
                            <p className="text-sm font-semibold text-slate-300 mb-1">Start a chat</p>
                            <p className="text-xs">Session history is saved to your workspace and kept separate from image/video galleries.</p>
                        </div>
                    </div>
                )}

                {messages.map((msg, index) => (
                    <div
                        key={msg.id}
                        className="w-full chat-motion-message"
                        style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                    >
                        {msg.role === 'assistant' ? (
                            <div className="flex gap-3 sm:gap-4 md:gap-6 w-full">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                                    <Sparkles size={14} className="text-indigo-400" />
                                </div>
                                <div className={`flex-1 min-w-0 ${msg.status === 'error' ? 'text-red-200' : 'text-slate-200'}`}>
                                    {msg.status === 'loading' ? (
                                        <div className="space-y-3">
                                            {msg.content.trim() ? (
                                                <MessageMarkdown
                                                    content={msg.content}
                                                    onCopyStatus={showCaptureStatus}
                                                    isStreaming
                                                    messageId={msg.id}
                                                />
                                            ) : null}
                                            <div className="inline-flex items-center gap-2 text-slate-300">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span className="text-sm">Generating response...</span>
                                            </div>
                                        </div>
                                    ) : msg.status === 'stopped' ? (
                                        <div className="text-slate-300 leading-relaxed text-[15px] font-medium flex items-center gap-2">
                                            Generation stopped. <Square size={12} className="text-slate-500 fill-current" />
                                        </div>
                                    ) : (
                                        (() => {
                                            const { answer, summary } = splitReasoningSummary(msg.content);
                                            const isReasoningOpen = activeReasoningMessageId === msg.id;
                                            return (
                                                <div className="space-y-3">
                                                    <MessageMarkdown
                                                        content={injectCitationLinks(answer, msg.sources)}
                                                        onCopyStatus={showCaptureStatus}
                                                        isStreaming={false}
                                                        messageId={msg.id}
                                                    />
                                                    {summary ? (
                                                        <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2.5">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onOpenReasoningPanel?.(msg)}
                                                                    className="chat-focus-ring min-w-0 flex-1 rounded-lg text-left"
                                                                    aria-expanded={isReasoningOpen}
                                                                    aria-controls={summary ? `reasoning-inline-${msg.id}` : undefined}
                                                                >
                                                                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
                                                                        Reasoning Summary
                                                                    </p>
                                                                    <p className="mt-1 truncate text-xs text-slate-400">
                                                                        Reveal the AI-visible reasoning overview under this answer.
                                                                    </p>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onOpenReasoningPanel?.(msg)}
                                                                    className={`chat-focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                                                                        isReasoningOpen
                                                                            ? 'border-violet-500/40 bg-violet-500/10 text-violet-200'
                                                                            : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white'
                                                                    }`}
                                                                    aria-expanded={isReasoningOpen}
                                                                    aria-controls={summary ? `reasoning-inline-${msg.id}` : undefined}
                                                                >
                                                                    <BrainCircuit size={12} />
                                                                    {isReasoningOpen ? 'Hide Thinking' : 'Thinking'}
                                                                </button>
                                                            </div>
                                                            <div
                                                                id={`reasoning-inline-${msg.id}`}
                                                                className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                                                                    isReasoningOpen ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0'
                                                                }`}
                                                            >
                                                                <div className="overflow-hidden">
                                                                    <div className="rounded-xl border border-violet-500/20 bg-slate-950/75 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.24)]">
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div className="min-w-0">
                                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">
                                                                                    Thinking View
                                                                                </p>
                                                                                <p className="mt-1 text-xs text-slate-400">
                                                                                    Visible reasoning overview only, not hidden chain-of-thought.
                                                                                </p>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => onOpenReasoningPanel?.(msg)}
                                                                                className="chat-focus-ring rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
                                                                                aria-label="Hide thinking summary"
                                                                            >
                                                                                <X size={14} />
                                                                            </button>
                                                                        </div>
                                                                        <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-900/50 p-3">
                                                                            <MessageMarkdown
                                                                                content={injectCitationLinks(summary, msg.sources)}
                                                                                onCopyStatus={showCaptureStatus}
                                                                                isStreaming={false}
                                                                                messageId={`reasoning-inline-${msg.id}`}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })()
                                    )}
                                    {msg.status !== 'loading' && (
                                        <>
                                            {(() => {
                                                const warnings = [msg.searchWarning, msg.linkWarning].filter(Boolean);
                                                if (warnings.length === 0) return null;
                                                return (
                                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                                                        {warnings.map((warning, warnIndex) => (
                                                            <div key={`${msg.id}-warn-${warnIndex}`}>{warning}</div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                            {showSources && Array.isArray(msg.sources) && msg.sources.length > 0 && (
                                                <details className="border border-slate-800/70 rounded-xl bg-slate-900/40 p-3">
                                                    <summary className="cursor-pointer text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                                                        Sources ({msg.sources.length})
                                                    </summary>
                                                    <div className="mt-3 space-y-2">
                                                        {msg.sources.map((src, sourceIndex) => (
                                                            <div key={`${msg.id}-src-${sourceIndex}`} className="text-xs text-slate-300">
                                                                <span className="text-slate-500 font-mono text-[10px] uppercase tracking-widest mr-2">
                                                                    [{sourceIndex + 1}]
                                                                </span>
                                                                <a
                                                                    href={src.url}
                                                                    target="_blank"
                                                                    rel="noreferrer noopener"
                                                                    className="text-cyan-300 hover:text-cyan-200 font-semibold break-all"
                                                                >
                                                                    {src.title}
                                                                </a>
                                                                {src.snippet ? (
                                                                    <p className="text-slate-400 mt-1 whitespace-pre-wrap break-words">{src.snippet}</p>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}
                                            <div className="flex flex-wrap items-center gap-1 pt-1">
                                                <button
                                                    onClick={() => handleCopyRenderedMessage(msg.id, msg.content)}
                                                    className={assistantIconActionClass}
                                                    title="Copy"
                                                    aria-label="Copy response"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                {(() => {
                                                    const includeReasoningSummary = activeReasoningMessageId === msg.id;
                                                    const extraction = getReadAloudTextForMessage(msg, { includeReasoningSummary });
                                                    const disabledByRule = !extraction.text;
                                                    const state = getReadAloudUiState(msg.id, disabledByRule);
                                                    const meta = getReadAloudButtonMeta(state);
                                                    const disabled = state === 'disabled';
                                                    const handleActivateReadAloud = () => {
                                                        if (disabled) return;
                                                        if (onReadAloudUiClick) {
                                                            onReadAloudUiClick({
                                                                message: msg,
                                                                text: extraction.text,
                                                                includeReasoningSummary,
                                                                truncated: extraction.truncated
                                                            });
                                                        } else {
                                                            showCaptureStatus(
                                                                extraction.truncated
                                                                    ? 'Read aloud text ready (truncated). Playback wiring comes next.'
                                                                    : 'Read aloud text ready. Playback wiring comes next.'
                                                            );
                                                        }
                                                    };
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={handleActivateReadAloud}
                                                            onKeyDown={(event) => {
                                                                if (disabled) return;
                                                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                                                event.preventDefault();
                                                                handleActivateReadAloud();
                                                            }}
                                                            disabled={disabled}
                                                            className={meta.className}
                                                            title={meta.title}
                                                            aria-label={meta.ariaLabel}
                                                            aria-pressed={state === 'playing' || state === 'paused'}
                                                            aria-keyshortcuts="Enter Space"
                                                            data-read-aloud-state={state}
                                                        >
                                                            {meta.icon}
                                                        </button>
                                                    );
                                                })()}
                                                <button
                                                    onClick={onRetry}
                                                    disabled={!canRetry}
                                                    className={`${assistantIconActionClass} disabled:opacity-40 disabled:cursor-not-allowed`}
                                                    title="Regenerate"
                                                    aria-label="Regenerate response"
                                                >
                                                    <RotateCw size={14} />
                                                </button>
                                                <button
                                                    onClick={() => showCaptureStatus('Response marked helpful.')}
                                                    className={assistantIconActionClass}
                                                    title="Good response"
                                                    aria-label="Mark response as helpful"
                                                >
                                                    <ThumbsUp size={14} />
                                                </button>
                                                <button
                                                    onClick={() => showCaptureStatus('Response marked not helpful.')}
                                                    className={assistantIconActionClass}
                                                    title="Bad response"
                                                    aria-label="Mark response as not helpful"
                                                >
                                                    <ThumbsDown size={14} />
                                                </button>
                                                <div className="w-full sm:w-auto text-[10px] font-mono text-slate-600 uppercase tracking-widest sm:ml-auto font-bold break-words">
                                                    {msg.modelId || 'assistant'}
                                                    {msg.requestId ? ` | request: ${msg.requestId}` : ''}
                                                    {msg.latencyMs ? ` | ${(msg.latencyMs / 1000).toFixed(2)}s` : ''}
                                                    {(() => {
                                                        const searchStatus = renderSearchStatus(msg);
                                                        const linkStatus = renderLinkStatus(msg);
                                                        const statuses = [searchStatus, linkStatus].filter(Boolean);
                                                        return statuses.length > 0 ? ` | ${statuses.join(' | ')}` : '';
                                                    })()}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-end w-full group">
                                <div className="flex items-start gap-2 sm:gap-3 w-full max-w-full sm:max-w-[90%] md:max-w-[85%]">
                                    <button
                                        onClick={() => startInlineEdit(msg)}
                                        className="chat-token-icon-btn chat-focus-ring p-2 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                                        title="Edit message"
                                        aria-label="Edit message"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <div className={`${editingMessageId === msg.id ? 'w-full sm:min-w-[320px]' : ''} flex-1 min-w-0 chat-token-panel text-slate-200 px-4 sm:px-6 py-4 rounded-3xl rounded-tr-sm text-[15px] leading-relaxed shadow-sm`}>
                                        {(() => {
                                            const images = Array.isArray(msg.imageInputs) ? msg.imageInputs : [];
                                            const readyImages = images.filter((image) => Boolean(image.url));
                                            if (images.length === 0) return null;
                                            if (readyImages.length === 0) {
                                                return (
                                                    <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
                                                        Loading image preview...
                                                    </div>
                                                );
                                            }
                                            return (
                                            <div className="mb-3 flex flex-wrap gap-2">
                                                {readyImages.map((image) => (
                                                    <button
                                                        key={image.id}
                                                        type="button"
                                                        onClick={() => {
                                                            if (!image.id) return;
                                                            onOpenImageGallery(image.id);
                                                        }}
                                                        className="block w-20 h-20 rounded-lg overflow-hidden border border-indigo-300/30 bg-slate-900/60 cursor-pointer"
                                                        title={image.name}
                                                        aria-label={`Open ${image.name || 'image'} in gallery`}
                                                    >
                                                        <img src={image.url} alt={image.name} className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                            );
                                        })()}
                                        {(() => {
                                            const audios = Array.isArray(msg.audioInputs) ? msg.audioInputs : [];
                                            const readyAudios = audios.filter((audio) => Boolean(audio.url || (audio.data && audio.format)));
                                            if (audios.length === 0) return null;
                                            if (readyAudios.length === 0) {
                                                return (
                                                    <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
                                                        Loading audio preview...
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div className="mb-3 flex flex-col gap-2">
                                                {readyAudios.map((audio) => (
                                                    <audio
                                                        key={audio.id}
                                                        controls
                                                        preload="none"
                                                        className="w-full max-w-sm"
                                                        src={audio.url || `data:${audio.mimeType || `audio/${audio.format}`};base64,${audio.data}`}
                                                    />
                                                ))}
                                            </div>
                                            );
                                        })()}
                                        {editingMessageId === msg.id ? (
                                            <div className="space-y-2">
                                                <textarea
                                                    value={editingContent}
                                                    onChange={(e) => setEditingContent(e.target.value)}
                                                    rows={5}
                                                    className="chat-focus-ring w-full min-h-[140px] max-h-[45vh] bg-slate-900/60 border border-indigo-500/40 rounded-lg px-3 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 resize-y"
                                                />
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={cancelInlineEdit}
                                                        className="chat-focus-ring inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-white rounded px-2 py-1 border border-slate-600"
                                                    >
                                                        <X size={11} /> Cancel
                                                    </button>
                                                    <button
                                                        onClick={saveInlineEditAndRegenerate}
                                                        disabled={!editingContent.trim() || isSending}
                                                        className="chat-focus-ring inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Check size={11} /> Save + Regenerate
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                                        )}
                                    </div>
                                </div>
                                {editingMessageId !== msg.id && (
                                    <div className="mt-2 mr-1 sm:mr-2 shrink-0 self-start">
                                        <button
                                            onClick={() => handleCopyMessage(msg.content)}
                                            className="chat-focus-ring inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white rounded px-1.5 py-1 transition-colors"
                                        >
                                            <Copy size={11} /> Copy
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messageEndRef} />
            </div>
        </div>
    );
};

export default ChatMessageList;
