import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckSquare,
  CheckCircle2,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  GitBranch,
  FolderPlus,
  FolderOpen,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Layers,
  List,
  Loader2,
  Maximize2,
  MoreVertical,
  PackageOpen,
  Pin,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { Project, ProjectCollection } from '../../types';
import type { PromptDraft, PromptIngestionState, PromptManagerTab, PromptManagerViewMode } from './types';
import { ProjectReassignModal } from '../lab/history/ProjectReassignModal';
import { mergeRevisionTags } from '../../utils/revisionTags';
import { getPromptThumbnailBlurClass, isPromptThumbnailBlurEnabled } from './utils';

interface PromptManagerBoardProps {
  activeTab: PromptManagerTab;
  viewMode: PromptManagerViewMode;
  searchQuery: string;
  drafts: PromptDraft[];
  projects: Project[];
  queueCollections: ProjectCollection[];
  projectThumbnails: Record<string, { url: string; mimeType: string }>;
  stagingCount: number;
  readyCount: number;
  queueAssetItemCount: number;
  selectedCount: number;
  selectedProjectId: string;
  selectedQueueCollectionId: string;
  isProjectsLoading: boolean;
  isQueueCollectionsLoading: boolean;
  isExporting: boolean;
  selectedDraftIds: Set<string>;
  currentGeneratingDraftId: string | null;
  copiedDraftId: string | null;
  onTabChange: (tab: PromptManagerTab) => void;
  onViewModeChange: (viewMode: PromptManagerViewMode) => void;
  onSearchChange: (query: string) => void;
  onProjectChange: (projectId: string) => void;
  onQueueCollectionChange: (collectionId: string) => void;
  onImportOpen: () => void;
  onSelectAll: () => void;
  onSelectByIngestionState: (state: PromptIngestionState) => void;
  onDeselectAll: () => void;
  onSelectAllWithImages: () => void;
  onSelectAllMissing: () => void;
  onCheckAndMergeDuplicates: () => Promise<boolean> | boolean;
  isCheckingDuplicates: boolean;
  onDeleteSelected: () => Promise<boolean> | boolean;
  onRestoreSelected: () => void;
  onExportReady: (limit?: number) => Promise<void> | void;
  onExportToAssetIngestion: (draftIds?: string[]) => Promise<void> | void;
  onOpenSingleExportToAssetIngestion: (draftId: string) => void;
  onOpenDraft: (draftId: string) => void;
  onToggleSelect: (draftId: string) => void;
  onCopy: (draftId: string, prompt: string) => void;
  onDuplicate: (draftId: string) => void;
  onDuplicateSelected: () => void;
  onDelete: (draftId: string) => Promise<boolean> | boolean;
  onRestore: (draftId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenQueueCollection: (collectionId: string) => void;
  onQueueCollectionImageDrop: (collectionId: string, file: File) => Promise<void> | void;
  onToggleProjectPin: (projectId: string) => void;
  onToggleQueueCollectionPin: (collectionId: string) => void;
  onCreateQueueCollection: () => void;
  onArchiveQueueCollection: (collectionId: string) => Promise<boolean> | boolean;
  onArchiveProject: (projectId: string) => Promise<boolean> | boolean;
  onIngestionStateChange: (draftId: string, state: PromptIngestionState) => void;
  onQueueIndexChange: (draftId: string, updates: Pick<PromptDraft, 'queueLetter' | 'queueNumber'>) => void;
  onToggleThumbnailBlur: (draftId: string, enabled: boolean) => void;
}

const resolveIngestionState = (draft: PromptDraft): PromptIngestionState => draft.ingestionState || 'waiting';

const ingestionStateStyles: Record<PromptIngestionState, { card: string; badge: string }> = {
  waiting: {
    card: 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-400/40',
    badge: 'border-amber-500/30 bg-amber-500/15 text-amber-200'
  },
  pending: {
    card: 'border-cyan-500/30 bg-cyan-500/[0.05] hover:border-cyan-400/40',
    badge: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
  },
  done: {
    card: 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-400/40',
    badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
  }
};

const IngestionStateSelect: React.FC<{
  value: PromptIngestionState;
  onChange: (value: PromptIngestionState) => void;
  className?: string;
}> = ({ value, onChange, className }) => (
  <div className={className}>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as PromptIngestionState)}
      onClick={(event) => event.stopPropagation()}
      className="w-full rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200 outline-none transition-colors focus:border-violet-500/40"
    >
      <option value="waiting">Waiting</option>
      <option value="pending">Pending</option>
      <option value="done">Done</option>
    </select>
  </div>
);

const tabButtonClass = (active: boolean) => (
  `rounded-2xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
    active
      ? 'border-violet-500/35 bg-violet-500/15 text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.35)]'
      : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
  }`
);

const workflowLaneMeta: Array<{
  key: PromptIngestionState;
  title: string;
  description: string;
  accent: string;
  nextLabel?: string;
  nextState?: PromptIngestionState;
}> = [
  {
    key: 'waiting',
    title: 'Waiting',
    description: 'Queued prompts waiting for ingestion work to start.',
    accent: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-100',
    nextLabel: 'Move To Pending',
    nextState: 'pending'
  },
  {
    key: 'pending',
    title: 'Pending',
    description: 'Prompts actively being processed through ingestion.',
    accent: 'border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-100',
    nextLabel: 'Mark Done',
    nextState: 'done'
  },
  {
    key: 'done',
    title: 'Done',
    description: 'Completed prompts ready to export into a collection.',
    accent: 'border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100'
  }
];

const waitingLetterOptions = ['A-Z', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
const waitingNumberOptions = ['0-9', ...Array.from({ length: 10 }, (_, index) => String(index))];
const resolveTagTokens = (value?: string) => mergeRevisionTags(value).split(',').map((tag) => tag.trim()).filter(Boolean);

type PromptCollectionSortMode = 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'count-desc' | 'count-asc';
type PromptDraftSortMode = 'recent' | 'oldest' | 'title-asc' | 'title-desc' | 'preview-first' | 'missing-preview-first';
type QueueDraftSortMode = PromptDraftSortMode | 'status' | 'queue-index';

const comparePromptCollections = (sortMode: PromptCollectionSortMode) => (a: Project, b: Project) => {
  const pinnedDiff = Number(!!b.isPinned) - Number(!!a.isPinned);
  if (pinnedDiff !== 0) return pinnedDiff;

  if (sortMode === 'oldest') return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);
  if (sortMode === 'name-asc') return String(a.name || '').localeCompare(String(b.name || ''));
  if (sortMode === 'name-desc') return String(b.name || '').localeCompare(String(a.name || ''));
  if (sortMode === 'count-desc') return Number(b.itemCount || 0) - Number(a.itemCount || 0);
  if (sortMode === 'count-asc') return Number(a.itemCount || 0) - Number(b.itemCount || 0);
  return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
};

const comparePromptDrafts = (sortMode: PromptDraftSortMode | QueueDraftSortMode) => (a: PromptDraft, b: PromptDraft) => {
  if (sortMode === 'oldest') return (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0);
  if (sortMode === 'title-asc') return String(a.title || '').localeCompare(String(b.title || ''));
  if (sortMode === 'title-desc') return String(b.title || '').localeCompare(String(a.title || ''));
  if (sortMode === 'preview-first') return Number(Boolean(b.previewImageUrl)) - Number(Boolean(a.previewImageUrl));
  if (sortMode === 'missing-preview-first') return Number(Boolean(a.previewImageUrl)) - Number(Boolean(b.previewImageUrl));
  if (sortMode === 'status') {
    const statusRank: Record<PromptIngestionState, number> = { waiting: 0, pending: 1, done: 2 };
    return statusRank[resolveIngestionState(a)] - statusRank[resolveIngestionState(b)]
      || String(a.title || '').localeCompare(String(b.title || ''));
  }
  if (sortMode === 'queue-index') {
    const letterRank = (value?: string) => {
      const normalized = String(value || 'A-Z').trim().toUpperCase();
      return /^[A-Z]$/.test(normalized) ? normalized.charCodeAt(0) - 65 : 99;
    };
    const numberRank = (value?: string) => {
      const normalized = String(value || '0-9').trim();
      return /^[0-9]$/.test(normalized) ? Number(normalized) : 99;
    };
    return letterRank(a.queueLetter) - letterRank(b.queueLetter)
      || numberRank(a.queueNumber) - numberRank(b.queueNumber)
      || String(a.title || '').localeCompare(String(b.title || ''));
  }
  return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
};

const QueueIndexSelectors: React.FC<{
  queueLetter?: string;
  queueNumber?: string;
  onChange?: (updates: { queueLetter: string; queueNumber: string }) => void;
}> = ({ queueLetter = 'A-Z', queueNumber = '0-9', onChange }) => (
  <div className="flex items-center gap-2">
    <select
      value={queueLetter}
      onChange={(event) => onChange?.({ queueLetter: event.target.value, queueNumber })}
      className="min-w-[86px] rounded-xl border border-[#1a2340] bg-[#0a1021] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white outline-none transition-colors focus:border-violet-500/40"
      aria-label="Queue item A-Z dropdown"
    >
      {waitingLetterOptions.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
    <select
      value={queueNumber}
      onChange={(event) => onChange?.({ queueLetter, queueNumber: event.target.value })}
      className="min-w-[86px] rounded-xl border border-[#1a2340] bg-[#0a1021] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white outline-none transition-colors focus:border-violet-500/40"
      aria-label="Queue item 0-9 dropdown"
    >
      {waitingNumberOptions.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
);

const ThumbnailBlurButton: React.FC<{
  enabled: boolean;
  disabled?: boolean;
  compact?: boolean;
  onToggle?: () => void;
}> = ({ enabled, disabled = false, compact = false, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled || !onToggle}
    className={compact
      ? `rounded-xl p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          enabled ? 'text-amber-200 hover:bg-amber-500/10' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      : `inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          enabled
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
            : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
        }`}
    title={enabled ? 'Unblur prompt image' : 'Blur prompt image'}
    aria-label={enabled ? 'Unblur prompt image' : 'Blur prompt image'}
  >
    {enabled ? <EyeOff size={compact ? 13 : 12} /> : <Eye size={compact ? 13 : 12} />}
    {!compact && (enabled ? 'Unblur' : 'Blur')}
  </button>
);

const PromptCard: React.FC<{
  draft: PromptDraft;
  isSelected: boolean;
  isGenerating: boolean;
  copiedDraftId: string | null;
  isDeleted: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onCopy: () => void;
  onPreview?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestore: () => void;
  usePermanentDelete?: boolean;
  hideDuplicate?: boolean;
  showIngestionState?: boolean;
  onIngestionStateChange?: (state: PromptIngestionState) => void;
  onQueueIndexChange?: (updates: { queueLetter: string; queueNumber: string }) => void;
  onExportToAssetIngestion?: () => void;
  onToggleThumbnailBlur?: () => void;
}> = ({ draft, isSelected, isGenerating, copiedDraftId, isDeleted, onOpen, onToggleSelect, onCopy, onPreview, onDuplicate, onDelete, onRestore, usePermanentDelete = false, hideDuplicate = false, showIngestionState = false, onIngestionStateChange, onQueueIndexChange, onExportToAssetIngestion, onToggleThumbnailBlur }) => {
  const ingestionState = resolveIngestionState(draft);
  const stateStyles = ingestionStateStyles[ingestionState];
  const tags = resolveTagTokens(draft.tags);
  const thumbnailBlurClass = getPromptThumbnailBlurClass(draft);
  return (
  <article
    className={`group overflow-hidden rounded-[1.4rem] border backdrop-blur-sm transition-all ${
      isGenerating
        ? 'border-cyan-400/70 bg-slate-950/65 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]'
        : 
      isSelected
        ? 'border-violet-500/55 bg-slate-950/65 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
        : showIngestionState
          ? stateStyles.card
          : 'border-slate-800/80 bg-slate-950/65 hover:border-slate-700'
    }`}
  >
    <div className="relative">
      <button
        onClick={onToggleSelect}
        className={`absolute left-3 top-3 z-10 inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
          isSelected
            ? 'border-violet-400 bg-violet-500 text-white'
            : 'border-slate-500 bg-slate-950/90 text-transparent hover:border-violet-400'
        }`}
        title="Select prompt"
      >
        <CheckCircle2 size={13} />
      </button>

      <button
        onClick={onOpen}
        className="flex h-40 w-full items-center justify-center overflow-hidden border-b border-slate-800/70 bg-[#040918] text-slate-700"
      >
        {draft.previewImageUrl ? (
          String(draft.previewMimeType || '').startsWith('video/') ? (
            <video src={draft.previewImageUrl} className={`h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] ${thumbnailBlurClass}`} muted playsInline loop autoPlay />
          ) : (
            <img src={draft.previewImageUrl} alt={draft.title} className={`h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] ${thumbnailBlurClass}`} />
          )
        ) : (
          <ImageIcon size={28} />
        )}
      </button>
    </div>

    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{draft.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{draft.prompt || 'No prompt yet.'}</p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.slice(0, 4).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-300">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {draft.previewError && (
            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-rose-300">{draft.previewError}</p>
          )}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
          isGenerating
            ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
            : draft.status === 'deleted'
            ? 'border-rose-500/30 bg-rose-500/15 text-rose-200'
            : showIngestionState
            ? stateStyles.badge
            : draft.status === 'ready'
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
            : 'border-violet-500/30 bg-violet-500/10 text-violet-200'
        }`}>
          {isGenerating ? 'generating' : showIngestionState ? ingestionState : draft.status}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
        <button onClick={onCopy} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-white">
          {copiedDraftId === draft.id ? <CheckCircle2 size={12} className="text-emerald-300" /> : <Copy size={12} />}
          Copy
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onPreview}
            disabled={!draft.previewImageUrl}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title={draft.previewImageUrl ? 'View thumbnail' : 'No thumbnail to view'}
            aria-label={draft.previewImageUrl ? 'View thumbnail' : 'No thumbnail to view'}
          >
            <Maximize2 size={12} />
          </button>
          <ThumbnailBlurButton
            compact
            enabled={isPromptThumbnailBlurEnabled(draft)}
            disabled={!draft.previewImageUrl || isDeleted}
            onToggle={onToggleThumbnailBlur}
          />
          {showIngestionState && !isDeleted && onExportToAssetIngestion && (
            <button
              onClick={onExportToAssetIngestion}
              className="rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 transition-colors hover:bg-emerald-500/10 hover:text-emerald-100"
              title="Export prompt draft to Asset Ingestion as a normal item"
            >
              Export
            </button>
          )}
          {showIngestionState && onIngestionStateChange && !isDeleted && (
            <IngestionStateSelect
              value={ingestionState}
              onChange={onIngestionStateChange}
              className="w-[128px]"
            />
          )}
          {showIngestionState && !isDeleted && (
            <QueueIndexSelectors
              queueLetter={draft.queueLetter}
              queueNumber={draft.queueNumber}
              onChange={onQueueIndexChange}
            />
          )}
          {isDeleted ? (
            <button onClick={onRestore} className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200">
              Restore
            </button>
          ) : !hideDuplicate ? (
            <button
              onClick={onDuplicate}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
              title="Duplicate prompt"
            >
              <CopyPlus size={12} />
            </button>
          ) : null}
          <button
            onClick={onDelete}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
            title={isDeleted || usePermanentDelete ? 'Delete forever' : 'Move to recycle bin'}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  </article>
  );
};

const PromptListRow: React.FC<{
  draft: PromptDraft;
  isSelected: boolean;
  isGenerating: boolean;
  copiedDraftId: string | null;
  isDeleted: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onCopy: () => void;
  onPreview?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestore: () => void;
  usePermanentDelete?: boolean;
  hideDuplicate?: boolean;
  showIngestionState?: boolean;
  onIngestionStateChange?: (state: PromptIngestionState) => void;
  onQueueIndexChange?: (updates: { queueLetter: string; queueNumber: string }) => void;
  onExportToAssetIngestion?: () => void;
  onToggleThumbnailBlur?: () => void;
}> = ({ draft, isSelected, isGenerating, copiedDraftId, isDeleted, onOpen, onToggleSelect, onCopy, onPreview, onDuplicate, onDelete, onRestore, usePermanentDelete = false, hideDuplicate = false, showIngestionState = false, onIngestionStateChange, onQueueIndexChange, onExportToAssetIngestion, onToggleThumbnailBlur }) => {
  const ingestionState = resolveIngestionState(draft);
  const stateStyles = ingestionStateStyles[ingestionState];
  const tags = resolveTagTokens(draft.tags);
  const thumbnailBlurClass = getPromptThumbnailBlurClass(draft);
  return (
  <article
    className={`flex items-center gap-4 rounded-2xl border p-4 backdrop-blur-sm transition-all ${
      isGenerating
        ? 'border-cyan-400/70 bg-slate-950/65 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]'
        :
      isSelected
        ? 'border-violet-500/55 bg-slate-950/65 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
        : showIngestionState
          ? stateStyles.card
          : 'border-slate-800/80 bg-slate-950/65 hover:border-slate-700'
    }`}
  >
    <button
      onClick={onToggleSelect}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
        isSelected
          ? 'border-violet-400 bg-violet-500 text-white'
          : 'border-slate-500 bg-slate-950 text-transparent hover:border-violet-400'
      }`}
      title="Select prompt"
    >
      <CheckCircle2 size={13} />
    </button>

    <button onClick={onOpen} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-700">
      {draft.previewImageUrl ? (
        String(draft.previewMimeType || '').startsWith('video/')
          ? <video src={draft.previewImageUrl} className={`h-full w-full object-contain ${thumbnailBlurClass}`} muted playsInline loop autoPlay />
          : <img src={draft.previewImageUrl} alt={draft.title} className={`h-full w-full object-contain ${thumbnailBlurClass}`} />
      ) : (
        <ImageIcon size={20} />
      )}
    </button>

    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{draft.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{draft.prompt || 'No prompt yet.'}</p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.slice(0, 4).map((tag) => (
                <span key={tag} className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-300">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {draft.previewError && (
            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-rose-300">{draft.previewError}</p>
          )}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
          isGenerating
            ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200'
            : draft.status === 'deleted'
            ? 'border-rose-500/30 bg-rose-500/15 text-rose-200'
            : showIngestionState
            ? stateStyles.badge
            : draft.status === 'ready'
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
            : 'border-violet-500/30 bg-violet-500/10 text-violet-200'
        }`}>
          {isGenerating ? 'generating' : showIngestionState ? ingestionState : draft.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onCopy} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800">
          {copiedDraftId === draft.id ? <CheckCircle2 size={12} className="text-emerald-300" /> : <Copy size={12} />}
          Copy
        </button>
        <button
          onClick={onPreview}
          disabled={!draft.previewImageUrl}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          title={draft.previewImageUrl ? 'View thumbnail' : 'No thumbnail to view'}
        >
          <Maximize2 size={12} />
          View
        </button>
        <ThumbnailBlurButton
          enabled={isPromptThumbnailBlurEnabled(draft)}
          disabled={!draft.previewImageUrl || isDeleted}
          onToggle={onToggleThumbnailBlur}
        />
        {showIngestionState && !isDeleted && onExportToAssetIngestion && (
          <button
            onClick={onExportToAssetIngestion}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
            title="Export prompt draft to Asset Ingestion as a normal item"
          >
            <FolderPlus size={12} />
            Export
          </button>
        )}
        {showIngestionState && onIngestionStateChange && !isDeleted && (
          <IngestionStateSelect
            value={ingestionState}
            onChange={onIngestionStateChange}
            className="w-[148px]"
          />
        )}
        {showIngestionState && !isDeleted && (
          <QueueIndexSelectors
            queueLetter={draft.queueLetter}
            queueNumber={draft.queueNumber}
            onChange={onQueueIndexChange}
          />
        )}
        {isDeleted ? (
          <button onClick={onRestore} className="rounded-xl border border-cyan-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200 transition-colors hover:bg-cyan-500/10">
            Restore
          </button>
        ) : !hideDuplicate ? (
          <button
            onClick={onDuplicate}
            className="rounded-xl border border-slate-800 p-2 text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800"
            title="Duplicate prompt"
          >
            <CopyPlus size={12} />
          </button>
        ) : null}
        {isDeleted ? (
          <button onClick={onDelete} className="rounded-xl border border-red-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-300 transition-colors hover:bg-red-500/10">
            Delete Forever
          </button>
        ) : (
          <button
            onClick={onDelete}
            className="rounded-xl border border-red-500/15 p-2 text-red-300 transition-colors hover:bg-red-500/10"
            title={usePermanentDelete ? 'Delete forever' : 'Move to recycle bin'}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  </article>
  );
};

const PromptGalleryTile: React.FC<{
  draft: PromptDraft;
  isSelected: boolean;
  isGenerating: boolean;
  copiedDraftId: string | null;
  isDeleted: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onCopy: () => void;
  onPreview?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestore: () => void;
  usePermanentDelete?: boolean;
  hideDuplicate?: boolean;
  showIngestionState?: boolean;
  onIngestionStateChange?: (state: PromptIngestionState) => void;
  onQueueIndexChange?: (updates: { queueLetter: string; queueNumber: string }) => void;
  onExportToAssetIngestion?: () => void;
  onToggleThumbnailBlur?: () => void;
}> = ({ draft, isSelected, isGenerating, copiedDraftId, isDeleted, onOpen, onToggleSelect, onCopy, onPreview, onDuplicate, onDelete, onRestore, usePermanentDelete = false, hideDuplicate = false, showIngestionState = false, onIngestionStateChange, onQueueIndexChange, onExportToAssetIngestion, onToggleThumbnailBlur }) => {
  const ingestionState = resolveIngestionState(draft);
  const stateStyles = ingestionStateStyles[ingestionState];
  const tags = resolveTagTokens(draft.tags);
  const statusLabel = isGenerating ? 'generating' : showIngestionState ? ingestionState : draft.status;
  const thumbnailBlurClass = getPromptThumbnailBlurClass(draft);

  return (
    <article
      className={`group relative overflow-hidden rounded-[1.35rem] border bg-slate-950/75 transition-all ${
        isGenerating
          ? 'border-cyan-400/70 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]'
          : isSelected
            ? 'border-violet-500/60 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
            : showIngestionState
              ? stateStyles.card
              : 'border-slate-800/80 hover:border-slate-700'
      }`}
    >
      <button
        onClick={onOpen}
        className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-[#040918] text-slate-700"
        title="Open prompt"
      >
        {draft.previewImageUrl ? (
          String(draft.previewMimeType || '').startsWith('video/') ? (
            <video src={draft.previewImageUrl} className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${thumbnailBlurClass}`} muted playsInline loop autoPlay />
          ) : (
            <img src={draft.previewImageUrl} alt={draft.title} className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${thumbnailBlurClass}`} />
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 text-slate-700">
            <ImageIcon size={32} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">No Preview</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/10" />
      </button>

      <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
        <button
          onClick={onToggleSelect}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-lg backdrop-blur transition-colors ${
            isSelected
              ? 'border-violet-300 bg-violet-500 text-white'
              : 'border-white/15 bg-slate-950/70 text-transparent hover:border-violet-300 hover:text-violet-100'
          }`}
          title="Select prompt"
        >
          <CheckCircle2 size={16} />
        </button>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] shadow-lg backdrop-blur ${
          isGenerating
            ? 'border-cyan-400/35 bg-cyan-500/20 text-cyan-100'
            : draft.status === 'deleted'
              ? 'border-rose-400/35 bg-rose-500/20 text-rose-100'
              : showIngestionState
                ? stateStyles.badge
                : draft.status === 'ready'
                  ? 'border-emerald-400/35 bg-emerald-500/20 text-emerald-100'
                  : 'border-violet-400/35 bg-violet-500/20 text-violet-100'
        }`}>
          {statusLabel}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-white">{draft.title || 'Untitled Prompt'}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">{draft.prompt || 'No prompt yet.'}</p>
          {draft.previewError && (
            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-rose-200">{draft.previewError}</p>
          )}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-200 backdrop-blur">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 p-2 backdrop-blur-md">
          <button onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white">
            {copiedDraftId === draft.id ? <CheckCircle2 size={12} className="text-emerald-300" /> : <Copy size={12} />}
            Copy
          </button>
          <button
            onClick={onPreview}
            disabled={!draft.previewImageUrl}
            className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title={draft.previewImageUrl ? 'View thumbnail' : 'No thumbnail to view'}
            aria-label={draft.previewImageUrl ? 'View thumbnail' : 'No thumbnail to view'}
          >
            <Maximize2 size={13} />
          </button>
          <ThumbnailBlurButton
            compact
            enabled={isPromptThumbnailBlurEnabled(draft)}
            disabled={!draft.previewImageUrl || isDeleted}
            onToggle={onToggleThumbnailBlur}
          />
          {showIngestionState && !isDeleted && onExportToAssetIngestion && (
            <button
              onClick={onExportToAssetIngestion}
              className="rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/10"
              title="Export prompt draft to Asset Ingestion as a normal item"
            >
              Export
            </button>
          )}
          {showIngestionState && onIngestionStateChange && !isDeleted && (
            <IngestionStateSelect
              value={ingestionState}
              onChange={onIngestionStateChange}
              className="min-w-[126px] flex-1"
            />
          )}
          {showIngestionState && !isDeleted && (
            <div className="w-full">
              <QueueIndexSelectors
                queueLetter={draft.queueLetter}
                queueNumber={draft.queueNumber}
                onChange={onQueueIndexChange}
              />
            </div>
          )}
          {isDeleted ? (
            <button onClick={onRestore} className="rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-500/10">
              Restore
            </button>
          ) : !hideDuplicate ? (
            <button onClick={onDuplicate} className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" title="Duplicate prompt">
              <CopyPlus size={13} />
            </button>
          ) : null}
          <button
            onClick={onDelete}
            className="ml-auto rounded-xl p-2 text-red-300 transition-colors hover:bg-red-500/10"
            title={isDeleted || usePermanentDelete ? 'Delete forever' : 'Move to recycle bin'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
};

const PromptCollectionCard: React.FC<{
  project: Project;
  thumbnail?: { url: string; mimeType: string };
  onOpen: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
}> = ({ project, thumbnail, onOpen, onTogglePin, onArchive }) => (
  <article
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen();
      }
    }}
    aria-label={`Open prompt collection ${project.name}`}
    className="group cursor-pointer overflow-hidden rounded-[1.4rem] border border-slate-800/80 bg-slate-950/65 text-left backdrop-blur-sm transition-all hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-offset-2 focus:ring-offset-[#050b18]"
  >
    <div className="border-b border-slate-800/70 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_46%),linear-gradient(180deg,#040918,#081122)] p-5">
      <div className="relative rounded-[1.2rem] border border-violet-500/30 bg-violet-500/10 p-4">
        <div className="absolute -top-3 left-5 h-3 w-20 rounded-t-xl border border-b-0 border-violet-400/40 bg-violet-500/20" />
        <div className="mt-2 flex items-center gap-3">
          <div className="rounded-xl border border-violet-400/35 bg-violet-500/20 p-2.5 text-violet-200">
            <FolderOpen size={22} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black uppercase tracking-[0.08em] text-white">{project.name}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-200/80">Prompt Collection Folder</div>
          </div>
        </div>
      </div>
    </div>

    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{project.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
            {project.description || 'Dedicated prompt archive for saved prompt drafts and exports.'}
          </p>
        </div>
        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">
          {(project.itemCount || 0)} item{(project.itemCount || 0) === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {thumbnail ? `${project.storageType} · Cover Saved` : project.storageType}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            title={project.isPinned ? 'Unpin collection' : 'Pin collection'}
            aria-label={project.isPinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
            className={`rounded-lg border p-2 transition-colors ${
              project.isPinned
                ? 'border-amber-500/25 bg-amber-500/15 text-amber-200'
                : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-amber-500/25 hover:bg-amber-500/10 hover:text-amber-200'
            }`}
          >
            <Pin size={13} className={project.isPinned ? 'fill-current' : ''} />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            title="Move collection to recycle bin"
            aria-label={`Move ${project.name} to recycle bin`}
            className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  </article>
  );

const QueueCollectionCard: React.FC<{
  collection: ProjectCollection;
  isSelected: boolean;
  onOpen: () => void;
  onImageDrop: (file: File) => Promise<void> | void;
  onTogglePin: () => void;
  onArchive: () => void;
}> = ({ collection, isSelected, onOpen, onImageDrop, onTogglePin, onArchive }) => (
  <article
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onDragOver={(event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }}
    onDrop={async (event) => {
      event.preventDefault();
      const file = Array.from(event.dataTransfer.files || [])[0]
        || Array.from(event.dataTransfer.items || []).find((item) => item.kind === 'file')?.getAsFile()
        || null;
      if (!file) return;
      event.stopPropagation();
      await onImageDrop(file);
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen();
      }
    }}
    aria-label={`Open queue collection ${collection.name}`}
    className={`group cursor-pointer overflow-hidden rounded-[1.4rem] border text-left backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-[#050b18] ${
      isSelected
        ? 'border-emerald-500/45 bg-emerald-500/[0.07] shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
        : 'border-slate-800/80 bg-slate-950/65 hover:border-slate-700'
    }`}
  >
    <div className="border-b border-slate-800/70 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.20),transparent_46%),linear-gradient(180deg,#040918,#081122)] p-5">
      <div className="relative rounded-[1.2rem] border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="absolute -top-3 left-5 h-3 w-20 rounded-t-xl border border-b-0 border-emerald-400/40 bg-emerald-500/20" />
        <div className="mt-2 flex items-center gap-3">
          <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/20 p-2.5 text-emerald-200">
            <FolderOpen size={22} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black uppercase tracking-[0.08em] text-white">{collection.name}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200/80">Queue Prompt Collection</div>
          </div>
        </div>
      </div>
    </div>

    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{collection.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
            Queue prompts grouped inside Asset Ingestion with per-item workflow controls.
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-200">
          {collection.itemCount} item{collection.itemCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {isSelected ? 'Current export target' : 'Open collection'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            title={collection.isPinned ? 'Unpin collection' : 'Pin collection'}
            aria-label={collection.isPinned ? `Unpin ${collection.name}` : `Pin ${collection.name}`}
            className={`rounded-lg border p-2 transition-colors ${
              collection.isPinned
                ? 'border-amber-500/25 bg-amber-500/15 text-amber-200'
                : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-amber-500/25 hover:bg-amber-500/10 hover:text-amber-200'
            }`}
          >
            <Pin size={13} className={collection.isPinned ? 'fill-current' : ''} />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            title="Move collection to recycle bin"
            aria-label={`Move ${collection.name} to recycle bin`}
            className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
          >
            <Trash2 size={13} />
          </button>
          <ArrowRight size={14} className="text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-200" />
        </div>
      </div>
    </div>
  </article>
);

const EmptyPromptState: React.FC<{
  activeTab: PromptManagerTab;
  onImportOpen: () => void;
}> = ({ activeTab, onImportOpen }) => (
  <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 text-slate-600">
      <PackageOpen size={34} />
    </div>
    <p className="mt-6 text-lg font-semibold text-slate-300">
      {activeTab === 'ready'
        ? 'No prompts are queued for asset ingestion.'
        : activeTab === 'projects'
          ? 'No prompt collections yet.'
          : 'No prompts in this section.'}
    </p>
    {activeTab === 'staging' && (
      <button
        onClick={onImportOpen}
        className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.15em] text-violet-200 transition-colors hover:bg-violet-500/20"
      >
        <Plus size={14} />
        Import prompts to get started
      </button>
    )}
  </div>
);

const QueueWorkflowCard: React.FC<{
  draft: PromptDraft;
  isSelected: boolean;
  copiedDraftId: string | null;
  onOpen: () => void;
  onToggleSelect: () => void;
  onCopy: () => void;
  onPreview?: () => void;
  onDelete: () => void;
  onIngestionStateChange: (state: PromptIngestionState) => void;
  onQueueIndexChange: (updates: { queueLetter: string; queueNumber: string }) => void;
  onExportToAssetIngestion: () => void;
  onToggleThumbnailBlur?: () => void;
}> = ({ draft, isSelected, copiedDraftId, onOpen, onToggleSelect, onCopy, onPreview, onDelete, onIngestionStateChange, onQueueIndexChange, onExportToAssetIngestion, onToggleThumbnailBlur }) => {
  const ingestionState = resolveIngestionState(draft);
  const lane = workflowLaneMeta.find((entry) => entry.key === ingestionState) || workflowLaneMeta[0];
  const stateStyles = ingestionStateStyles[ingestionState];

  return (
    <article
      className={`rounded-[1.35rem] border p-4 backdrop-blur-sm transition-all ${
        isSelected
          ? 'border-violet-500/55 bg-slate-950/70 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
          : stateStyles.card
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleSelect}
          className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            isSelected
              ? 'border-violet-400 bg-violet-500 text-white'
              : 'border-slate-500 bg-slate-950 text-transparent hover:border-violet-400'
          }`}
          title="Select prompt"
        >
          <CheckCircle2 size={13} />
        </button>

        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">{draft.title}</h3>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-400">{draft.prompt || 'No prompt yet.'}</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${stateStyles.badge}`}>
              {ingestionState}
            </span>
          </div>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3">
        <button onClick={onCopy} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800">
          {copiedDraftId === draft.id ? <CheckCircle2 size={12} className="text-emerald-300" /> : <Copy size={12} />}
          Copy
        </button>
        <button
          onClick={onPreview}
          disabled={!draft.previewImageUrl}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          title={draft.previewImageUrl ? 'View thumbnail' : 'No thumbnail to view'}
        >
          <Maximize2 size={12} />
          View
        </button>
        <ThumbnailBlurButton
          enabled={isPromptThumbnailBlurEnabled(draft)}
          disabled={!draft.previewImageUrl}
          onToggle={onToggleThumbnailBlur}
        />
        <button
          onClick={onExportToAssetIngestion}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
          title="Export prompt draft to Asset Ingestion as a normal item"
        >
          <FolderPlus size={12} />
          Export
        </button>
        <IngestionStateSelect value={ingestionState} onChange={onIngestionStateChange} className="min-w-[144px] flex-1" />
        <QueueIndexSelectors
          queueLetter={draft.queueLetter}
          queueNumber={draft.queueNumber}
          onChange={onQueueIndexChange}
        />
        {lane.nextState && lane.nextLabel && (
          <button
            onClick={() => onIngestionStateChange(lane.nextState!)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            <ArrowRight size={12} />
            {lane.nextLabel}
          </button>
        )}
        <button
          onClick={onDelete}
          className="rounded-xl border border-red-500/15 p-2 text-red-300 transition-colors hover:bg-red-500/10"
          title="Delete forever"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </article>
  );
};

export const PromptManagerBoard: React.FC<PromptManagerBoardProps> = ({
  activeTab,
  viewMode,
  searchQuery,
  drafts,
  projects,
  queueCollections,
  projectThumbnails,
  stagingCount,
  readyCount,
  queueAssetItemCount,
  selectedCount,
  selectedProjectId,
  selectedQueueCollectionId,
  isProjectsLoading,
  isQueueCollectionsLoading,
  isExporting,
  selectedDraftIds,
  currentGeneratingDraftId,
  copiedDraftId,
  onTabChange,
  onViewModeChange,
  onSearchChange,
  onProjectChange,
  onQueueCollectionChange,
  onImportOpen,
  onSelectAll,
  onSelectByIngestionState,
  onDeselectAll,
  onSelectAllWithImages,
  onSelectAllMissing,
  onCheckAndMergeDuplicates,
  isCheckingDuplicates,
  onDeleteSelected,
  onRestoreSelected,
  onExportReady,
  onExportToAssetIngestion,
  onOpenSingleExportToAssetIngestion,
  onOpenDraft,
  onToggleSelect,
  onCopy,
  onDuplicate,
  onDuplicateSelected,
  onDelete,
  onRestore,
  onOpenProject,
  onOpenQueueCollection,
  onQueueCollectionImageDrop,
  onToggleProjectPin,
  onToggleQueueCollectionPin,
  onCreateQueueCollection,
  onArchiveQueueCollection,
  onArchiveProject,
  onIngestionStateChange,
  onQueueIndexChange,
  onToggleThumbnailBlur
}) => {
  const usePermanentDelete = false;
  const hideDuplicate = activeTab === 'ready';
  const showIngestionState = activeTab === 'ready';
  const effectiveViewMode = activeTab === 'ready'
    ? viewMode
    : viewMode === 'workflow'
      ? 'grid'
      : viewMode;
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [bulkSelectValue, setBulkSelectValue] = useState('');
  const [promptCollectionSortMode, setPromptCollectionSortMode] = useState<PromptCollectionSortMode>('recent');
  const [promptDraftSortMode, setPromptDraftSortMode] = useState<PromptDraftSortMode>('recent');
  const [queueDraftSortMode, setQueueDraftSortMode] = useState<QueueDraftSortMode>('status');
  const [isStagingActionsOpen, setIsStagingActionsOpen] = useState(false);
  const [previewDraftId, setPreviewDraftId] = useState<string | null>(null);
  const stagingActionsRef = useRef<HTMLDivElement | null>(null);
  const allVisibleSelected = activeTab !== 'projects' && drafts.length > 0 && selectedCount === drafts.length;
  const readyWorkflowCounts = {
    waiting: drafts.filter((draft) => resolveIngestionState(draft) === 'waiting').length,
    pending: drafts.filter((draft) => resolveIngestionState(draft) === 'pending').length,
    done: drafts.filter((draft) => resolveIngestionState(draft) === 'done').length
  };
  const selectedExportableCount = drafts.filter((draft) => selectedDraftIds.has(draft.id) && draft.prompt.trim()).length;
  const selectedMovableCount = drafts.filter((draft) => selectedDraftIds.has(draft.id) && draft.prompt.trim() && draft.status !== 'deleted').length;
  const canExportSelection = activeTab === 'ready' && selectedExportableCount > 0;
  const selectedQueueCollection = queueCollections.find((collection) => collection.id === selectedQueueCollectionId) || null;
  const openDraftThumbnailPreview = (draft: PromptDraft) => {
    if (!draft.previewImageUrl) return;
    setPreviewDraftId(draft.id);
  };
  useEffect(() => {
    if (!isStagingActionsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!stagingActionsRef.current?.contains(event.target as Node)) {
        setIsStagingActionsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsStagingActionsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStagingActionsOpen]);

  useEffect(() => {
    setIsStagingActionsOpen(false);
  }, [activeTab]);

  const runStagingAction = (action: () => Promise<boolean> | boolean | void) => {
    setIsStagingActionsOpen(false);
    void action();
  };

  const sortedPromptCollections = useMemo(
    () => [...projects].sort(comparePromptCollections(promptCollectionSortMode)),
    [projects, promptCollectionSortMode]
  );
  const activeDraftSortMode = activeTab === 'ready' ? queueDraftSortMode : promptDraftSortMode;
  const sortedDrafts = useMemo(
    () => [...drafts].sort(comparePromptDrafts(activeDraftSortMode)),
    [drafts, activeDraftSortMode]
  );
  const previewableDrafts = useMemo(
    () => sortedDrafts.filter((draft) => Boolean(draft.previewImageUrl)),
    [sortedDrafts]
  );
  const previewDraft = previewableDrafts.find((draft) => draft.id === previewDraftId) || null;
  const previewDraftThumbnailBlurClass = getPromptThumbnailBlurClass(previewDraft);
  const previewDraftIndex = previewableDrafts.findIndex((draft) => draft.id === previewDraftId);
  const navigateDraftThumbnailPreview = (direction: 'previous' | 'next') => {
    if (previewableDrafts.length === 0) return;
    const currentIndex = previewDraftIndex >= 0 ? previewDraftIndex : 0;
    const nextIndex = direction === 'previous'
      ? (currentIndex - 1 + previewableDrafts.length) % previewableDrafts.length
      : (currentIndex + 1) % previewableDrafts.length;
    setPreviewDraftId(previewableDrafts[nextIndex]?.id || null);
  };

  const openTransferModal = () => {
    if (projects.length === 0) return;
    setIsTransferModalOpen(true);
  };

  const handleConfirmTransfer = async (itemLimit?: number) => {
    await onExportReady(itemLimit);
    setIsTransferModalOpen(false);
  };

  const renderQueueCollectionsPanel = () => (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.6rem] border border-slate-800/80 bg-slate-950/65 p-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Queue Prompt Collections</div>
          <h3 className="mt-2 text-lg font-black text-white">
            {selectedQueueCollection ? `${selectedQueueCollection.name} selected for export` : 'Choose or create a queue collection'}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Open a Queue Prompt Collection to manage saved queue prompts using the same collection-style viewer.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateQueueCollection}
          className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
        >
          <FolderPlus size={14} />
          New Queue Collection
        </button>
      </div>

      {isQueueCollectionsLoading ? (
        <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/65 p-6 text-sm text-slate-400">
          Loading queue collections...
        </div>
      ) : queueCollections.length === 0 ? (
        <div className="rounded-[1.6rem] border border-dashed border-slate-800/80 bg-slate-950/40 p-6 text-sm text-slate-400">
          {searchQuery.trim()
            ? 'No queue collections match the current search.'
            : 'No queue collections yet. Create one to organize Asset Ingestion prompts like folders.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {queueCollections.map((collection) => (
            <QueueCollectionCard
              key={collection.id}
              collection={collection}
              isSelected={selectedQueueCollectionId === collection.id}
              onOpen={() => {
                onQueueCollectionChange(collection.id);
                onOpenQueueCollection(collection.id);
              }}
              onImageDrop={(file) => onQueueCollectionImageDrop(collection.id, file)}
              onTogglePin={() => onToggleQueueCollectionPin(collection.id)}
              onArchive={() => onArchiveQueueCollection(collection.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const renderReadyTabEmptyState = () => (
    <div className="space-y-4">
      {renderQueueCollectionsPanel()}
      <EmptyPromptState activeTab={activeTab} onImportOpen={onImportOpen} />
    </div>
  );

  const renderContent = () => {
    if (activeTab === 'projects') {
      if (projects.length === 0) {
        return searchQuery.trim()
          ? (
            <div className="p-5">
              <div className="rounded-[1.6rem] border border-dashed border-slate-800/80 bg-slate-950/40 p-8 text-sm text-slate-400">
                No prompt collections match the current search.
              </div>
            </div>
          )
          : <EmptyPromptState activeTab={activeTab} onImportOpen={onImportOpen} />;
      }

      return (
        <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 2xl:grid-cols-3">
          {sortedPromptCollections.map((project) => (
            <PromptCollectionCard
              key={project.id}
              project={project}
              thumbnail={projectThumbnails[project.id]}
              onOpen={() => onOpenProject(project.id)}
              onTogglePin={() => onToggleProjectPin(project.id)}
              onArchive={() => onArchiveProject(project.id)}
            />
          ))}
        </div>
      );
    }

    if (drafts.length === 0) {
      if (activeTab === 'ready') {
        return searchQuery.trim()
          ? (
            <div className="space-y-4">
              {renderQueueCollectionsPanel()}
              <div className="p-5">
                <div className="rounded-[1.6rem] border border-dashed border-slate-800/80 bg-slate-950/40 p-8 text-sm text-slate-400">
                  No queue prompts match the current search.
                </div>
              </div>
            </div>
          )
          : renderReadyTabEmptyState();
      }
      return searchQuery.trim()
        ? (
          <div className="p-5">
            <div className="rounded-[1.6rem] border border-dashed border-slate-800/80 bg-slate-950/40 p-8 text-sm text-slate-400">
              No prompts match the current search.
            </div>
          </div>
        )
        : <EmptyPromptState activeTab={activeTab} onImportOpen={onImportOpen} />;
    }

    if (activeTab === 'ready' && viewMode === 'workflow') {
      return (
        <div className="space-y-5">
          {renderQueueCollectionsPanel()}
          <div className="grid gap-4 px-5 lg:grid-cols-4">
            <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/75 p-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">
                <GitBranch size={12} />
                Workflow View
              </div>
              <h3 className="mt-4 text-lg font-black text-white">Queue Asset Ingestion</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Keep prompts in Prompt Manager, but run the ingestion queue like a focused workflow lane.
              </p>
              <button
                onClick={() => onExportToAssetIngestion()}
                disabled={isExporting || drafts.length === 0}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
              >
                <FolderPlus size={14} />
                {isExporting ? 'Exporting...' : selectedQueueCollection ? 'Export Queue To Collection' : 'Export Queue To Asset Ingestion'}
              </button>
            </div>

            {workflowLaneMeta.map((lane) => (
              <div key={lane.key} className={`rounded-[1.6rem] border p-5 ${lane.accent}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">{lane.title}</div>
                <div className="mt-3 text-3xl font-black text-white">{readyWorkflowCounts[lane.key]}</div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">{lane.description}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 px-5 pb-5 xl:grid-cols-3">
            {workflowLaneMeta.map((lane) => {
              const laneDrafts = sortedDrafts.filter((draft) => resolveIngestionState(draft) === lane.key);
              return (
                <section key={lane.key} className={`rounded-[1.75rem] border p-4 ${lane.accent}`}>
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">{lane.title}</h4>
                      <p className="mt-1 text-xs text-slate-300">{lane.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                        {laneDrafts.length}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {laneDrafts.length === 0 ? (
                      <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-slate-950/45 px-4 py-8 text-center text-xs text-slate-400">
                        No prompts in this lane yet.
                      </div>
                    ) : (
                      laneDrafts.map((draft) => (
                        <QueueWorkflowCard
                          key={draft.id}
                          draft={draft}
                          isSelected={selectedDraftIds.has(draft.id)}
                          copiedDraftId={copiedDraftId}
                          onOpen={() => onOpenDraft(draft.id)}
                          onToggleSelect={() => onToggleSelect(draft.id)}
                          onCopy={() => onCopy(draft.id, draft.prompt)}
                          onPreview={() => openDraftThumbnailPreview(draft)}
                          onDelete={() => onDelete(draft.id)}
                          onIngestionStateChange={(state) => onIngestionStateChange(draft.id, state)}
                          onQueueIndexChange={(updates) => onQueueIndexChange(draft.id, updates)}
                          onExportToAssetIngestion={() => onOpenSingleExportToAssetIngestion(draft.id)}
                          onToggleThumbnailBlur={() => onToggleThumbnailBlur(draft.id, !isPromptThumbnailBlurEnabled(draft))}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      );
    }

    if (effectiveViewMode === 'gallery') {
      return (
        <div className="space-y-4">
          {activeTab === 'ready' && renderQueueCollectionsPanel()}
          <div className="grid grid-cols-1 gap-5 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sortedDrafts.map((draft) => (
              <PromptGalleryTile
                key={draft.id}
                draft={draft}
                isSelected={selectedDraftIds.has(draft.id)}
                isGenerating={currentGeneratingDraftId === draft.id}
                copiedDraftId={copiedDraftId}
                isDeleted={false}
                onOpen={() => onOpenDraft(draft.id)}
                onToggleSelect={() => onToggleSelect(draft.id)}
                onCopy={() => onCopy(draft.id, draft.prompt)}
                onPreview={() => openDraftThumbnailPreview(draft)}
                onDuplicate={() => onDuplicate(draft.id)}
                onDelete={() => onDelete(draft.id)}
                onRestore={() => onRestore(draft.id)}
                usePermanentDelete={usePermanentDelete}
                hideDuplicate={hideDuplicate}
                showIngestionState={showIngestionState}
                onIngestionStateChange={(state) => onIngestionStateChange(draft.id, state)}
                onQueueIndexChange={(updates) => onQueueIndexChange(draft.id, updates)}
                onExportToAssetIngestion={showIngestionState ? () => onOpenSingleExportToAssetIngestion(draft.id) : undefined}
                onToggleThumbnailBlur={() => onToggleThumbnailBlur(draft.id, !isPromptThumbnailBlurEnabled(draft))}
              />
            ))}
          </div>
        </div>
      );
    }

    if (effectiveViewMode === 'list') {
      return (
        <div className="space-y-4">
          {activeTab === 'ready' && renderQueueCollectionsPanel()}
          <div className="space-y-4 px-5 pb-5">
            {sortedDrafts.map((draft) => (
              <PromptListRow
                key={draft.id}
                draft={draft}
                isSelected={selectedDraftIds.has(draft.id)}
                isGenerating={currentGeneratingDraftId === draft.id}
                copiedDraftId={copiedDraftId}
                isDeleted={false}
                onOpen={() => onOpenDraft(draft.id)}
                onToggleSelect={() => onToggleSelect(draft.id)}
                onCopy={() => onCopy(draft.id, draft.prompt)}
                onPreview={() => openDraftThumbnailPreview(draft)}
                onDuplicate={() => onDuplicate(draft.id)}
                onDelete={() => onDelete(draft.id)}
                onRestore={() => onRestore(draft.id)}
                usePermanentDelete={usePermanentDelete}
                hideDuplicate={hideDuplicate}
                showIngestionState={showIngestionState}
                onIngestionStateChange={(state) => onIngestionStateChange(draft.id, state)}
                onQueueIndexChange={(updates) => onQueueIndexChange(draft.id, updates)}
                onExportToAssetIngestion={showIngestionState ? () => onOpenSingleExportToAssetIngestion(draft.id) : undefined}
                onToggleThumbnailBlur={() => onToggleThumbnailBlur(draft.id, !isPromptThumbnailBlurEnabled(draft))}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {activeTab === 'ready' && renderQueueCollectionsPanel()}
        <div className="grid grid-cols-1 gap-5 px-5 pb-5 md:grid-cols-2 2xl:grid-cols-3">
          {sortedDrafts.map((draft) => (
            <PromptCard
              key={draft.id}
              draft={draft}
              isSelected={selectedDraftIds.has(draft.id)}
              isGenerating={currentGeneratingDraftId === draft.id}
              copiedDraftId={copiedDraftId}
              isDeleted={false}
              onOpen={() => onOpenDraft(draft.id)}
              onToggleSelect={() => onToggleSelect(draft.id)}
              onCopy={() => onCopy(draft.id, draft.prompt)}
              onPreview={() => openDraftThumbnailPreview(draft)}
              onDuplicate={() => onDuplicate(draft.id)}
              onDelete={() => onDelete(draft.id)}
              onRestore={() => onRestore(draft.id)}
              usePermanentDelete={usePermanentDelete}
              hideDuplicate={hideDuplicate}
              showIngestionState={showIngestionState}
              onIngestionStateChange={(state) => onIngestionStateChange(draft.id, state)}
              onQueueIndexChange={(updates) => onQueueIndexChange(draft.id, updates)}
              onExportToAssetIngestion={showIngestionState ? () => onOpenSingleExportToAssetIngestion(draft.id) : undefined}
              onToggleThumbnailBlur={() => onToggleThumbnailBlur(draft.id, !isPromptThumbnailBlurEnabled(draft))}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-950/10">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/40 px-4 py-4 backdrop-blur-sm sm:px-5">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => onTabChange('staging')} className={tabButtonClass(activeTab === 'staging')}>
            Prompts ({stagingCount})
          </button>
          <button onClick={() => onTabChange('ready')} className={tabButtonClass(activeTab === 'ready')}>
            Queue Asset Ingestion ({queueAssetItemCount})
          </button>
          <button onClick={() => onTabChange('projects')} className={tabButtonClass(activeTab === 'projects')}>
            Prompt Collections ({projects.length})
          </button>
        </div>

        {activeTab !== 'projects' && (
          <div className="inline-flex items-center rounded-2xl border border-slate-800/80 bg-slate-950/80 p-1">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`rounded-xl p-2 transition-colors ${effectiveViewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => onViewModeChange('gallery')}
              className={`rounded-xl p-2 transition-colors ${effectiveViewMode === 'gallery' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              title="Gallery view"
            >
              <Images size={16} />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`rounded-xl p-2 transition-colors ${effectiveViewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              title="List view"
            >
              <List size={16} />
            </button>
            {activeTab === 'ready' && (
              <button
                onClick={() => onViewModeChange('workflow')}
                className={`rounded-xl p-2 transition-colors ${viewMode === 'workflow' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                title="Workflow view"
              >
                <GitBranch size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/30 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
            {selectedCount} selected
          </div>
          {activeTab !== 'projects' && (
            <>
              <button
                onClick={allVisibleSelected ? onDeselectAll : onSelectAll}
                disabled={drafts.length === 0}
                className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                  allVisibleSelected
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                } disabled:opacity-40`}
              >
                {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                {allVisibleSelected ? 'Deselect All' : 'Select Prompts'}
              </button>
              {activeTab === 'ready' && (
                <div className="relative">
                  <select
                    value={bulkSelectValue}
                    onChange={(event) => {
                      const value = event.target.value as PromptIngestionState | '';
                      setBulkSelectValue('');
                      if (!value) return;
                      onSelectByIngestionState(value);
                    }}
                    disabled={drafts.length === 0}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 outline-none transition-colors hover:text-white focus:border-violet-500/40 disabled:opacity-40"
                    aria-label="Bulk select prompts by ingestion state"
                  >
                    <option value="">Bulk Select</option>
                    <option value="done">Select All Done</option>
                    <option value="pending">Select All Pending</option>
                    <option value="waiting">Select All Waiting</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        {activeTab === 'staging' && (
          <div className="relative" ref={stagingActionsRef}>
            <button
              type="button"
              onClick={() => setIsStagingActionsOpen((open) => !open)}
              disabled={drafts.length === 0 && selectedMovableCount === 0}
              aria-label="Prompt actions"
              aria-expanded={isStagingActionsOpen}
              aria-haspopup="menu"
              title="Prompt actions"
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500 ${
                isStagingActionsOpen
                  ? 'border-indigo-500/50 bg-indigo-500/20 text-white shadow-lg shadow-indigo-950/20'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/40 hover:text-white'
              }`}
            >
              <MoreVertical size={16} />
              <span className="hidden sm:inline">Actions</span>
              <ChevronDown size={13} className={`transition-transform ${isStagingActionsOpen ? 'rotate-180' : ''}`} />
            </button>
            {isStagingActionsOpen && (
              <div
                role="menu"
                aria-label="Prompt actions"
                className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-[1.4rem] border border-slate-700 bg-slate-900 py-1 shadow-2xl shadow-black/30"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runStagingAction(onDuplicateSelected)}
                  disabled={selectedMovableCount === 0}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-indigo-100 transition-colors hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  <CopyPlus size={16} className="text-indigo-300" />
                  Duplicate Selected
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runStagingAction(onCheckAndMergeDuplicates)}
                  disabled={isCheckingDuplicates || drafts.length === 0}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/10 disabled:cursor-wait disabled:text-slate-500"
                >
                  {isCheckingDuplicates ? <Loader2 size={16} className="animate-spin text-amber-300" /> : <Layers size={16} className="text-amber-300" />}
                  {isCheckingDuplicates ? 'Merging Duplicates...' : 'Check & Merge Duplicates'}
                </button>
                <div className="mx-2 my-1 h-px bg-slate-700/80" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runStagingAction(onSelectAllWithImages)}
                  disabled={drafts.length === 0}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-cyan-100 transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  <ImageIcon size={16} className="text-cyan-300" />
                  Select All With Images
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runStagingAction(onSelectAllMissing)}
                  disabled={drafts.length === 0}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-violet-100 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                >
                  <ImageIcon size={16} className="text-violet-300" />
                  Select All Missing Images
                </button>
              </div>
            )}
          </div>
        )}
        {activeTab === 'ready' && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => onExportToAssetIngestion()}
              disabled={isExporting || drafts.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
            >
              <FolderPlus size={14} />
              {isExporting ? 'Exporting...' : selectedQueueCollection ? 'Export To Collection' : 'Export To Asset Ingestion'}
            </button>
          </div>
        )}

      </div>

      <div className="border-b border-slate-800/80 bg-slate-950/20 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block min-w-[260px] max-w-xl flex-1">
            <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={
                activeTab === 'projects'
                  ? 'Search prompt collections'
                  : activeTab === 'ready'
                    ? 'Search queue prompts and queue collections'
                    : 'Search prompts'
              }
              className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/85 py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-violet-500/40"
            />
          </label>
          {activeTab === 'projects' && (
            <label className="relative block min-w-[220px]">
              <ArrowUpDown size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={promptCollectionSortMode}
                onChange={(event) => setPromptCollectionSortMode(event.target.value as PromptCollectionSortMode)}
                className="w-full appearance-none rounded-2xl border border-slate-800/80 bg-slate-950/85 py-3 pl-11 pr-9 text-sm font-bold text-slate-200 outline-none transition-colors focus:border-violet-500/40"
                aria-label="Sort prompt collections"
              >
                <option value="recent">Recently Updated</option>
                <option value="oldest">Oldest Updated</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="count-desc">Most Prompts</option>
                <option value="count-asc">Fewest Prompts</option>
              </select>
            </label>
          )}
          {activeTab === 'staging' && (
            <label className="relative block min-w-[220px]">
              <ArrowUpDown size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={promptDraftSortMode}
                onChange={(event) => setPromptDraftSortMode(event.target.value as PromptDraftSortMode)}
                className="w-full appearance-none rounded-2xl border border-slate-800/80 bg-slate-950/85 py-3 pl-11 pr-9 text-sm font-bold text-slate-200 outline-none transition-colors focus:border-violet-500/40"
                aria-label="Sort prompts"
              >
                <option value="recent">Recently Updated</option>
                <option value="oldest">Oldest Updated</option>
                <option value="title-asc">Title A-Z</option>
                <option value="title-desc">Title Z-A</option>
                <option value="preview-first">With Preview First</option>
                <option value="missing-preview-first">Missing Preview First</option>
              </select>
            </label>
          )}
          {activeTab === 'ready' && (
            <label className="relative block min-w-[240px]">
              <ArrowUpDown size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={queueDraftSortMode}
                onChange={(event) => setQueueDraftSortMode(event.target.value as QueueDraftSortMode)}
                className="w-full appearance-none rounded-2xl border border-slate-800/80 bg-slate-950/85 py-3 pl-11 pr-9 text-sm font-bold text-slate-200 outline-none transition-colors focus:border-violet-500/40"
                aria-label="Sort queue asset ingestion prompts"
              >
                <option value="status">Workflow Status</option>
                <option value="queue-index">Queue A-Z / 0-9</option>
                <option value="recent">Recently Updated</option>
                <option value="oldest">Oldest Updated</option>
                <option value="title-asc">Title A-Z</option>
                <option value="title-desc">Title Z-A</option>
                <option value="preview-first">With Preview First</option>
                <option value="missing-preview-first">Missing Preview First</option>
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{renderContent()}</div>

      {activeTab !== 'projects' && selectedCount > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] w-[min(96vw,1120px)] -translate-x-1/2 animate-in slide-in-from-bottom-8">
          <div className="pointer-events-auto rounded-[1.7rem] border border-indigo-500/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.95))] px-5 py-3.5 shadow-[0_20px_80px_rgba(2,6,23,0.75)] ring-4 ring-indigo-500/10 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[150px] flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Bulk Actions</div>
                <div className="mt-0.5 text-sm font-semibold leading-none text-white md:text-[0.98rem]">
                  {selectedCount} Selected
                </div>
              </div>

              <button
                onClick={onDeselectAll}
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-white"
              >
                <X size={16} />
                Cancel
              </button>

              {activeTab !== 'ready' && (
                <>
                <button
                  onClick={onDuplicateSelected}
                  disabled={selectedMovableCount === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-4 py-2.5 text-sm font-bold text-indigo-200 transition-colors hover:bg-indigo-500/25 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <CopyPlus size={15} />
                  Duplicate
                </button>
                <button
                  onClick={openTransferModal}
                  disabled={isExporting || projects.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-4 py-2.5 text-sm font-bold text-indigo-300 transition-colors hover:bg-indigo-600/35 hover:text-indigo-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <FolderPlus size={15} />
                  {isExporting ? 'Moving...' : 'Move'}
                </button>
                </>
              )}
              {activeTab === 'ready' && (
                <button
                  onClick={() => onExportToAssetIngestion()}
                  disabled={!canExportSelection || isExporting}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  <FolderPlus size={15} />
                  {isExporting ? 'Exporting...' : `${selectedQueueCollection ? 'Export To Collection' : 'Export To Asset Ingestion'}${selectedExportableCount > 0 ? ` (${selectedExportableCount})` : ''}`}
                </button>
              )}

              <button
                onClick={onDeleteSelected}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {previewDraft?.previewImageUrl && (
        <div
          className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/95 p-4 backdrop-blur-3xl animate-in fade-in"
          onClick={() => setPreviewDraftId(null)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewDraftId(null);
            }}
            className="absolute right-6 top-6 z-10 rounded-full p-3 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close thumbnail preview"
          >
            <X size={26} />
          </button>
          {previewableDrafts.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigateDraftThumbnailPreview('previous');
                }}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-4 text-white/35 transition-colors hover:bg-white/10 hover:text-white md:left-8"
                aria-label="Previous prompt thumbnail"
              >
                <ChevronLeft size={46} strokeWidth={1.4} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigateDraftThumbnailPreview('next');
                }}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-4 text-white/35 transition-colors hover:bg-white/10 hover:text-white md:right-8"
                aria-label="Next prompt thumbnail"
              >
                <ChevronRight size={46} strokeWidth={1.4} />
              </button>
            </>
          )}
          <div className="flex max-h-[86vh] max-w-[92vw] flex-col items-center gap-4" onClick={(event) => event.stopPropagation()}>
            {String(previewDraft.previewMimeType || '').startsWith('video/') ? (
              <video src={previewDraft.previewImageUrl} className={`max-h-[78vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-[0_0_100px_rgba(99,102,241,0.16)] ${previewDraftThumbnailBlurClass}`} controls autoPlay loop />
            ) : (
              <img src={previewDraft.previewImageUrl} alt={previewDraft.title || 'Prompt thumbnail'} className={`max-h-[78vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-[0_0_100px_rgba(99,102,241,0.16)] ${previewDraftThumbnailBlurClass}`} />
            )}
            <div className="max-w-3xl text-center">
              <h3 className="line-clamp-1 text-lg font-black uppercase tracking-tight text-white">{previewDraft.title || 'Untitled Prompt'}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-400">{previewDraft.prompt || 'No prompt content available.'}</p>
              {previewableDrafts.length > 1 && (
                <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 backdrop-blur-md">
                  {previewDraftIndex + 1} / {previewableDrafts.length}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isTransferModalOpen && activeTab !== 'ready' && (
        <ProjectReassignModal
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={onProjectChange}
          onConfirm={handleConfirmTransfer}
          onCancel={() => setIsTransferModalOpen(false)}
          isMoving={isExporting || isProjectsLoading}
          title="Move Prompt To Collection"
          description="Select a destination prompt collection for the selected prompts."
          emptyTitle="No prompt collections detected."
          emptyDescription="Create a prompt collection from Prompt Manager first."
          confirmLabel="Move To Collection"
          itemLimitLabel="Prompts to move"
          maxSelectableItems={selectedMovableCount}
          defaultSelectableItems={selectedMovableCount}
          showProjectItemCounts
          projectItemCountLabel="prompts"
        />
      )}
    </section>
  );
};
