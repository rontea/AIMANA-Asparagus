import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Eye, EyeOff, History, Image as ImageIcon, RotateCcw, Trash2, Upload, Volume2, X } from 'lucide-react';
import type { PromptDraft, PromptIngestionState } from './types';
import { api } from '../../services/api';
import { createBrowserTtsController } from '../chat/browserTts';
import { getPromptThumbnailBlurClass, isPromptThumbnailBlurEnabled } from './utils';

const queueLetterOptions = ['A-Z', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
const queueNumberOptions = ['0-9', ...Array.from({ length: 10 }, (_, index) => String(index))];
const resolveQueueStatus = (draft: PromptDraft): PromptIngestionState => draft.ingestionState || 'waiting';

const queueStatusChrome: Record<PromptIngestionState, { frame: string; preview: string; badge: string }> = {
  waiting: {
    frame: 'border-amber-500/35 shadow-[0_24px_80px_rgba(245,158,11,0.12)]',
    preview: 'border-amber-500/35',
    badge: 'border-amber-500/30 bg-amber-500/15 text-amber-200'
  },
  pending: {
    frame: 'border-cyan-500/35 shadow-[0_24px_80px_rgba(34,211,238,0.12)]',
    preview: 'border-cyan-500/35',
    badge: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
  },
  done: {
    frame: 'border-emerald-500/35 shadow-[0_24px_80px_rgba(16,185,129,0.12)]',
    preview: 'border-emerald-500/35',
    badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
  }
};

type PromptRevisionField = keyof Pick<NonNullable<PromptDraft['revisionHistory']>[number], 'title' | 'prompt' | 'raw' | 'label' | 'tags' | 'note'>;
const revisionFields: PromptRevisionField[] = ['title', 'prompt', 'raw', 'label', 'tags', 'note'];
const hasRevisionContentDelta = (draft: PromptDraft, revision: NonNullable<PromptDraft['revisionHistory']>[number]) => (
  revisionFields.some((field) => String(draft[field] || '') !== String(revision[field] || ''))
);

interface PromptDetailModalProps {
  draft: PromptDraft | null;
  onClose: () => void;
  onOpenPrevious?: () => void;
  onOpenNext?: () => void;
  onSave: (draftId: string, updates: Partial<PromptDraft>) => void;
  onQueueMetaChange: (draftId: string, updates: Partial<PromptDraft>) => void;
  onReplacePreview: (draftId: string, updates: Partial<PromptDraft>) => void;
  onRemovePreview: (draftId: string) => Promise<boolean> | boolean;
  onDelete: (draftId: string) => Promise<boolean> | boolean;
  onRestore: (draftId: string) => void;
  onRestoreRevision: (draftId: string, revisionId: string) => void;
  onDuplicate: (draftId: string) => void;
  onUploadPreview: (draftId: string, file: File) => Promise<void>;
  onToggleThumbnailBlur?: (draftId: string, enabled: boolean) => void;
  usePermanentDelete?: boolean;
  navigationLabel?: string | null;
}

export const PromptDetailModal: React.FC<PromptDetailModalProps> = ({
  draft,
  onClose,
  onOpenPrevious,
  onOpenNext,
  onSave,
  onQueueMetaChange,
  onReplacePreview,
  onRemovePreview,
  onDelete,
  onRestore,
  onRestoreRevision,
  onDuplicate,
  onUploadPreview,
  onToggleThumbnailBlur,
  usePermanentDelete = false,
  navigationLabel = null
}) => {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [raw, setRaw] = useState('');
  const [label, setLabel] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [ingestionState, setIngestionState] = useState<PromptIngestionState>('waiting');
  const [queueLetter, setQueueLetter] = useState('A-Z');
  const [queueNumber, setQueueNumber] = useState('0-9');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showSavedState, setShowSavedState] = useState(false);
  const [hasCopiedPrompt, setHasCopiedPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const saveFeedbackTimeoutRef = useRef<number | null>(null);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const ttsControllerRef = useRef<ReturnType<typeof createBrowserTtsController> | null>(null);
  const [isReadAloudSupported, setIsReadAloudSupported] = useState(false);
  const [activeReadAloudKey, setActiveReadAloudKey] = useState<string | null>(null);
  const [readAloudState, setReadAloudState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [globalReadAloudDefault, setGlobalReadAloudDefault] = useState<{ voiceURI: string; voiceName: string }>({
    voiceURI: '',
    voiceName: ''
  });

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title);
    setPrompt(draft.prompt);
    setRaw(draft.raw || '');
    setLabel(draft.label || '');
    setTags(draft.tags || '');
    setNote(draft.note || '');
    setIngestionState(resolveQueueStatus(draft));
    setQueueLetter(draft.queueLetter || 'A-Z');
    setQueueNumber(draft.queueNumber || '0-9');
    setShowValidation(false);
    setShowSavedState(false);
    setHasCopiedPrompt(false);
  }, [draft]);

  useEffect(() => () => {
    if (saveFeedbackTimeoutRef.current) {
      window.clearTimeout(saveFeedbackTimeoutRef.current);
    }
    if (copyFeedbackTimeoutRef.current) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    ttsControllerRef.current?.destroy();
  }, []);

  const stopReadAloud = useCallback(() => {
    ttsControllerRef.current?.stop();
    setActiveReadAloudKey(null);
    setReadAloudState('idle');
  }, []);

  useEffect(() => {
    const controller = createBrowserTtsController();
    ttsControllerRef.current = controller;
    setIsReadAloudSupported(controller.isSupported());
    return () => {
      controller.destroy();
      ttsControllerRef.current = null;
      setIsReadAloudSupported(false);
      setActiveReadAloudKey(null);
      setReadAloudState('idle');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDefaultVoice = async () => {
      try {
        const settings = await api.settings.get();
        if (cancelled) return;
        setGlobalReadAloudDefault({
          voiceURI: String(settings?.defaultReadAloudVoiceURI || '').trim(),
          voiceName: String(settings?.defaultReadAloudVoiceName || '').trim()
        });
      } catch {}
    };
    const onSettingsUpdated = () => {
      void loadDefaultVoice();
    };
    void loadDefaultVoice();
    window.addEventListener('settings-updated', onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('settings-updated', onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    stopReadAloud();
  }, [draft?.id, stopReadAloud]);

  useEffect(() => {
    if (!draft) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      );
      if (isTypingTarget) return;
      if (event.key === 'ArrowLeft' && onOpenPrevious) {
        event.preventDefault();
        onOpenPrevious();
      }
      if (event.key === 'ArrowRight' && onOpenNext) {
        event.preventDefault();
        onOpenNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [draft, onOpenNext, onOpenPrevious]);

  const parsedTags = useMemo(
    () => String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags]
  );
  const revisionHistory = useMemo(
    () => draft
      ? [...(draft.revisionHistory || [])]
        .filter((revision) => hasRevisionContentDelta(draft, revision))
        .sort((a, b) => b.createdAt - a.createdAt)
      : [],
    [draft]
  );

  if (!draft) return null;

  const titleValue = title.trim();
  const promptValue = prompt.trim();
  const isTitleInvalid = showValidation && !titleValue;
  const isPromptInvalid = showValidation && !promptValue;
  const isSaveDisabled = !titleValue || !promptValue;
  const displayTitle = titleValue || 'Untitled Prompt';
  const isQueueDraft = draft.status === 'ready';
  const chrome = queueStatusChrome[ingestionState];
  const thumbnailBlurEnabled = isPromptThumbnailBlurEnabled(draft);
  const thumbnailBlurClass = getPromptThumbnailBlurClass(draft);

  const handleSave = () => {
    setShowValidation(true);
    if (isSaveDisabled) return;
    onSave(draft.id, {
      title: titleValue,
      prompt: promptValue,
      raw: raw.trim() || undefined,
      label: label.trim() || undefined,
      tags: tags.trim() || undefined,
      note: note.trim() || undefined,
      status: draft.status || 'staging',
      ingestionState: isQueueDraft ? ingestionState : draft.ingestionState,
      queueLetter: isQueueDraft ? queueLetter : draft.queueLetter,
      queueNumber: isQueueDraft ? queueNumber : draft.queueNumber
    });
    if (isQueueDraft) {
      setShowSavedState(true);
      if (saveFeedbackTimeoutRef.current) {
        window.clearTimeout(saveFeedbackTimeoutRef.current);
      }
      saveFeedbackTimeoutRef.current = window.setTimeout(() => {
        setShowSavedState(false);
        saveFeedbackTimeoutRef.current = null;
      }, 5000);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      await onUploadPreview(draft.id, file);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleQuickCopyPrompt = async () => {
    const value = prompt.trim();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setHasCopiedPrompt(true);
    if (copyFeedbackTimeoutRef.current) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setHasCopiedPrompt(false);
      copyFeedbackTimeoutRef.current = null;
    }, 1800);
  };

  const handleReplacePreviewWithAsset = async (itemId: string) => {
    const item = await api.items.get(itemId);
    const revision = item?.currentRevision;
    const nextUrl = revision?.fileUrl || revision?.thumbnailLink || '';
    if (!nextUrl) return;
    const nextMimeType = revision?.mimeType || (nextUrl.startsWith('data:') ? (nextUrl.match(/^data:([^;,]+)/i)?.[1] || '') : '') || 'image/png';
    onReplacePreview(draft.id, {
      previewImageUrl: nextUrl,
      previewMimeType: nextMimeType,
      previewError: undefined,
      previewErrorDetails: undefined
    });
  };

  const resetDragState = () => {
    dragCounterRef.current = 0;
    setIsDragActive(false);
  };

  const handleQueueStateChange = (nextState: PromptIngestionState) => {
    setIngestionState(nextState);
    onQueueMetaChange(draft.id, { ingestionState: nextState });
  };

  const handleQueueLetterChange = (nextLetter: string) => {
    setQueueLetter(nextLetter);
    onQueueMetaChange(draft.id, { queueLetter: nextLetter });
  };

  const handleQueueNumberChange = (nextNumber: string) => {
    setQueueNumber(nextNumber);
    onQueueMetaChange(draft.id, { queueNumber: nextNumber });
  };

  const handleReadAloudToggle = (key: string, text: string) => {
    const value = String(text || '').trim();
    if (!value) return;
    const tts = ttsControllerRef.current;
    if (!tts || !tts.isSupported()) return;

    const currentState = tts.getState();
    if (activeReadAloudKey === key && currentState === 'playing') {
      tts.pause();
      setReadAloudState('paused');
      return;
    }
    if (activeReadAloudKey === key && currentState === 'paused') {
      tts.resume();
      setReadAloudState('playing');
      return;
    }

    const preferredVoiceURI = String(globalReadAloudDefault.voiceURI || '').trim();
    const preferredVoiceName = String(globalReadAloudDefault.voiceName || '').trim();
    const matchedVoice = preferredVoiceURI
      ? tts.getVoices().find((voice) => String(voice?.voiceURI || '').trim() === preferredVoiceURI)
      : null;

    setActiveReadAloudKey(key);
    const started = tts.speak(value, {
      voiceURI: preferredVoiceURI || undefined,
      voiceName: preferredVoiceName || String(matchedVoice?.name || '').trim() || undefined,
      onStart: () => {
        setActiveReadAloudKey(key);
        setReadAloudState('playing');
      },
      onPause: () => {
        setActiveReadAloudKey(key);
        setReadAloudState('paused');
      },
      onResume: () => {
        setActiveReadAloudKey(key);
        setReadAloudState('playing');
      },
      onEnd: () => {
        setActiveReadAloudKey((current) => (current === key ? null : current));
        setReadAloudState('idle');
      },
      onError: () => {
        setActiveReadAloudKey((current) => (current === key ? null : current));
        setReadAloudState('idle');
      }
    });

    if (!started) {
      setActiveReadAloudKey(null);
      setReadAloudState('idle');
    }
  };

  const renderReadAloudButton = (key: string, label: string, text: string) => {
    const hasText = Boolean(String(text || '').trim());
    const isActive = activeReadAloudKey === key;
    const statusLabel = isActive && readAloudState === 'paused'
      ? 'Resume Reader'
      : isActive && readAloudState === 'playing'
        ? 'Pause Reader'
        : 'Read';

    return (
      <button
        type="button"
        onClick={() => handleReadAloudToggle(key, text)}
        disabled={!isReadAloudSupported || !hasText}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          isActive
            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
            : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
        }`}
        title={hasText ? `Read ${label} aloud` : `No ${label.toLowerCase()} content available`}
        aria-label={hasText ? `Read ${label} aloud` : `No ${label.toLowerCase()} content available`}
      >
        <Volume2 size={12} />
        {statusLabel}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className={`relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border bg-[#050b18] ${isQueueDraft ? chrome.frame : 'border-slate-800/80 shadow-[0_24px_80px_rgba(2,6,23,0.62)]'}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.08),transparent_40%)]" />

        <div className="relative flex items-center justify-between gap-4 border-b border-slate-800/80 px-6 py-5">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-300">Prompt Draft</div>
            <h2 className={`mt-2 break-words text-xl font-black [overflow-wrap:anywhere] ${titleValue ? 'text-white' : 'text-slate-500'}`}>{displayTitle}</h2>
            {navigationLabel && (
              <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{navigationLabel}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onOpenPrevious}
              disabled={!onOpenPrevious}
              aria-label="Open previous prompt"
              className="rounded-xl border border-slate-800/80 p-2 text-slate-400 transition-colors hover:bg-slate-900/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={onOpenNext}
              disabled={!onOpenNext}
              aria-label="Open next prompt"
              className="rounded-xl border border-slate-800/80 p-2 text-slate-400 transition-colors hover:bg-slate-900/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-900/70 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative grid min-w-0 flex-1 gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-4">
            <div
              onDragEnter={(event) => {
                if (!isQueueDraft) return;
                event.preventDefault();
                event.stopPropagation();
                dragCounterRef.current += 1;
                setIsDragActive(true);
              }}
              onDragOver={(event) => {
                if (!isQueueDraft) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onDragLeave={(event) => {
                if (!isQueueDraft) return;
                event.preventDefault();
                event.stopPropagation();
                dragCounterRef.current -= 1;
                if (dragCounterRef.current <= 0) {
                  resetDragState();
                }
              }}
              onDrop={async (event) => {
                if (!isQueueDraft) return;
                event.preventDefault();
                event.stopPropagation();
                try {
                  const internalId = event.dataTransfer.getData('application/x-aimana-asset');
                  if (internalId) {
                    setIsUploading(true);
                    await handleReplacePreviewWithAsset(internalId);
                    return;
                  }
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    setIsUploading(true);
                    await onUploadPreview(draft.id, file);
                  }
                } finally {
                  setIsUploading(false);
                  resetDragState();
                }
              }}
              className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-[2rem] border bg-slate-950/75 transition-colors ${
                isDragActive
                  ? 'border-cyan-400/70 ring-2 ring-cyan-500/20'
                  : isQueueDraft
                    ? chrome.preview
                  : 'border-slate-800/80'
              }`}
            >
              {draft.previewImageUrl ? (
                String(draft.previewMimeType || '').startsWith('video/')
                  ? <video src={draft.previewImageUrl} className={`h-full w-full object-contain ${thumbnailBlurClass}`} controls playsInline />
                  : <img src={draft.previewImageUrl} alt={draft.title} className={`h-full w-full object-contain ${thumbnailBlurClass}`} />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-600">
                  <ImageIcon size={36} />
                  <div className="text-[11px] font-black uppercase tracking-[0.25em]">No Preview Yet</div>
                </div>
              )}
              {isQueueDraft && (
                <div className={`pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                  isDragActive
                    ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                    : 'border-slate-700/80 bg-slate-950/85 text-slate-300'
                }`}>
                  {isDragActive ? 'Drop Item Here To Replace Preview' : 'Drag A Project Item Here To Replace Preview'}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:border-slate-600 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload size={16} />
                {isUploading ? 'Uploading' : isQueueDraft ? 'Upload' : 'Upload Preview'}
              </button>
              {draft.previewImageUrl && (
                <button
                  onClick={async () => {
                    await onRemovePreview(draft.id);
                  }}
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={16} />
                  Remove Image
                </button>
              )}
              <button
                onClick={() => onToggleThumbnailBlur?.(draft.id, !thumbnailBlurEnabled)}
                disabled={!draft.previewImageUrl || !onToggleThumbnailBlur}
                className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  thumbnailBlurEnabled
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                    : 'border-slate-700 bg-slate-950 text-white hover:border-slate-600 hover:bg-slate-900'
                }`}
              >
                {thumbnailBlurEnabled ? <EyeOff size={16} /> : <Eye size={16} />}
                {thumbnailBlurEnabled ? 'Unblur' : 'Blur'}
              </button>
              <button
                onClick={() => onDuplicate(draft.id)}
                disabled={draft.status === 'deleted'}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:border-slate-600 hover:bg-slate-900"
              >
                <Copy size={16} />
                Duplicate
              </button>
              {draft.status === 'deleted' && (
                <button
                  onClick={() => onRestore(draft.id)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                >
                  <RotateCcw size={16} />
                  Restore
                </button>
              )}
              <button
                onClick={async () => {
                  const deleted = await onDelete(draft.id);
                  if (deleted) onClose();
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-red-200 transition-colors hover:bg-red-500/20"
              >
                <Trash2 size={16} />
                {draft.status === 'deleted' || usePermanentDelete ? 'Delete Forever' : 'Move To Recycle Bin'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </div>
            {(draft.previewError || draft.previewErrorDetails) && (
              <div className="rounded-[1.5rem] border border-rose-500/25 bg-rose-500/10 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Latest Preview Generation Error</div>
                {draft.previewError && (
                  <p className="mt-3 text-sm leading-relaxed text-rose-100">{draft.previewError}</p>
                )}
                {draft.previewErrorDetails && (
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-rose-500/20 bg-slate-950/70 p-4 text-xs leading-relaxed text-rose-100 [overflow-wrap:anywhere]">
                    {draft.previewErrorDetails}
                  </pre>
                )}
              </div>
            )}
            <div className="rounded-[1.5rem] border border-slate-800/80 bg-slate-950/65 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <History size={13} />
                    Revisions
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    Previous prompt and preview states are saved when the draft changes.
                  </p>
                </div>
                <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                  {revisionHistory.length}
                </span>
              </div>
              {revisionHistory.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 px-4 py-5 text-xs text-slate-500">
                  No revisions saved yet.
                </div>
              ) : (
                <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1 scrollbar-subtle">
                  {revisionHistory.map((revision) => (
                    <article key={revision.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-700">
                          {revision.previewImageUrl ? (
                            String(revision.previewMimeType || '').startsWith('video/')
                              ? <video src={revision.previewImageUrl} className="h-full w-full object-cover" muted playsInline />
                              : <img src={revision.previewImageUrl} alt={revision.title} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon size={18} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-bold text-white">{revision.title || 'Untitled Prompt'}</h4>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{revision.prompt || 'No prompt saved.'}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-violet-200">
                              v{revision.versionNumber}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                              {new Date(revision.createdAt).toLocaleString()}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRestoreRevision(draft.id, revision.id)}
                              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                            >
                              <RotateCcw size={12} />
                              Restore
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="min-w-0 space-y-4">
            {isQueueDraft && (
              <div className="rounded-[1.5rem] border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Queue Controls</label>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${chrome.badge}`}>
                    {ingestionState}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</label>
                    <select
                      value={ingestionState}
                      onChange={(event) => handleQueueStateChange(event.target.value as PromptIngestionState)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white outline-none transition-colors focus:border-violet-500/40"
                    >
                      <option value="waiting">Waiting</option>
                      <option value="pending">Pending</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">A-Z</label>
                    <select
                      value={queueLetter}
                      onChange={(event) => handleQueueLetterChange(event.target.value)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white outline-none transition-colors focus:border-violet-500/40"
                    >
                      {queueLetterOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">0-9</label>
                    <select
                      value={queueNumber}
                      onChange={(event) => handleQueueNumberChange(event.target.value)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white outline-none transition-colors focus:border-violet-500/40"
                    >
                      {queueNumberOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Required title"
                className={`w-full rounded-2xl border bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition-colors ${
                  isTitleInvalid ? 'border-red-500/60 focus:border-red-500/60' : 'border-slate-800 focus:border-violet-500/50'
                }`}
              />
              {isTitleInvalid && <p className="mt-2 text-[11px] text-red-300">Title is required.</p>}
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Label</label>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Optional grouping label"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tags</label>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Comma-separated tags"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/50"
              />
              {parsedTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {parsedTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Prompt</label>
                <div className="flex items-center gap-2">
                  {renderReadAloudButton(`draft-prompt-${draft.id}`, 'Prompt', prompt)}
                  <button
                    type="button"
                    onClick={() => void handleQuickCopyPrompt()}
                    disabled={!prompt.trim()}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      hasCopiedPrompt
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                        : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                    }`}
                    title={hasCopiedPrompt ? 'Prompt copied' : 'Quick copy prompt'}
                    aria-label={hasCopiedPrompt ? 'Prompt copied' : 'Quick copy prompt'}
                  >
                    <Copy size={12} />
                    {hasCopiedPrompt ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Required prompt"
                className={`min-h-[220px] w-full rounded-[1.5rem] border bg-slate-950/80 p-4 text-sm leading-relaxed text-white outline-none transition-colors ${
                  isPromptInvalid ? 'border-red-500/60 focus:border-red-500/60' : 'border-slate-800 focus:border-violet-500/50'
                }`}
              />
              {isPromptInvalid && <p className="mt-2 text-[11px] text-red-300">Prompt is required.</p>}
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Raw</label>
              <textarea
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder="Original placeholder-based prompt template"
                className="min-h-[140px] w-full rounded-[1.5rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300 outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Notes</label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional implementation notes, delivery context, or review comments"
                className="min-h-[120px] w-full rounded-[1.5rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/50"
              />
            </div>
          </section>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 px-6 py-5">
          <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
            draft.status === 'ready'
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
              : draft.status === 'deleted'
                ? 'border-rose-500/30 bg-rose-500/15 text-rose-200'
              : 'border-violet-500/30 bg-violet-500/15 text-violet-200'
          }`}>
            {draft.status === 'ready'
              ? 'Ready For Export'
              : draft.status === 'deleted'
                ? 'Deleted Draft'
                : 'Staging Draft'}
          </span>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              disabled={isSaveDisabled && showValidation}
              className={`rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                showSavedState
                  ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/25'
                  : 'border border-slate-700 bg-slate-950 text-white hover:border-slate-600 hover:bg-slate-900'
              }`}
            >
              {showSavedState ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
