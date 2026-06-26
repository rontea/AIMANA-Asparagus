import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, GitMerge, Image as ImageIcon, Loader2, Square, X } from 'lucide-react';
import type { PromptDraft } from './types';
import type { PromptDraftDuplicateGroup } from './utils';

interface PromptDuplicateMergeModalProps {
  isOpen: boolean;
  groups: PromptDraftDuplicateGroup[];
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: (selectedDuplicateIds: string[]) => Promise<void> | void;
}

const renderText = (value?: string, fallback = 'Empty') => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const resolveTagTokens = (value?: string) => (
  String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
);

const PreviewPanel: React.FC<{ draft: PromptDraft; accent: string; label: string }> = ({ draft, accent, label }) => (
  <section className={`flex min-h-0 flex-col rounded-[1.6rem] border ${accent} bg-slate-950/70`}>
    <div className="flex items-center justify-between border-b border-inherit px-5 py-4">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{label}</div>
        <h3 className="mt-2 text-base font-black text-white">{draft.title.trim() || 'Untitled Prompt'}</h3>
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {new Date(draft.createdAt).toLocaleString()}
      </div>
    </div>

    <div className="grid gap-4 p-5 xl:grid-cols-[200px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[1.4rem] border border-slate-800 bg-[#040918]">
        <div className="flex aspect-square items-center justify-center text-slate-700">
          {draft.previewImageUrl ? (
            String(draft.previewMimeType || '').startsWith('video/')
              ? <video src={draft.previewImageUrl} className="h-full w-full object-contain" muted playsInline loop autoPlay />
              : <img src={draft.previewImageUrl} alt={draft.title} className="h-full w-full object-contain" />
          ) : (
            <ImageIcon size={28} />
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Prompt</div>
          <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-800 bg-black/30 px-4 py-3 text-sm leading-relaxed text-slate-200">
            {renderText(draft.prompt)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Label</div>
            <div className="mt-2 rounded-2xl border border-slate-800 bg-black/30 px-4 py-3 text-xs text-slate-300">
              {renderText(draft.label)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Queue State</div>
            <div className="mt-2 rounded-2xl border border-slate-800 bg-black/30 px-4 py-3 text-xs uppercase tracking-[0.16em] text-slate-300">
              {draft.ingestionState || 'waiting'}
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Tags</div>
          <div className="mt-2 rounded-2xl border border-slate-800 bg-black/30 px-4 py-3">
            {resolveTagTokens(draft.tags).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {resolveTagTokens(draft.tags).map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-300">Empty</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Note</div>
          <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-800 bg-black/30 px-4 py-3 text-xs leading-relaxed text-slate-300">
            {renderText(draft.note)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Raw Prompt</div>
          <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-800 bg-black/30 px-4 py-3 font-mono text-[11px] leading-relaxed text-slate-400">
            {renderText(draft.raw)}
          </div>
        </div>
      </div>
    </div>
  </section>
);

export const PromptDuplicateMergeModal: React.FC<PromptDuplicateMergeModalProps> = ({
  isOpen,
  groups,
  isProcessing = false,
  onClose,
  onConfirm
}) => {
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeDuplicateIndex, setActiveDuplicateIndex] = useState(0);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());

  const totalDuplicateCount = useMemo(
    () => groups.reduce((sum, group) => sum + Math.max(0, group.items.length - 1), 0),
    [groups]
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveGroupIndex(0);
    setActiveDuplicateIndex(0);
    setSelectedDuplicateIds(new Set(groups.flatMap((group) => group.items.slice(1).map((item) => item.id))));
  }, [groups, isOpen]);

  const activeGroup = groups[activeGroupIndex] || null;
  const primaryDraft = activeGroup?.items[0] || null;
  const duplicateDrafts = activeGroup?.items.slice(1) || [];
  const activeDuplicate = duplicateDrafts[activeDuplicateIndex] || duplicateDrafts[0] || null;

  useEffect(() => {
    setActiveDuplicateIndex(0);
  }, [activeGroupIndex]);

  if (!isOpen) return null;

  const toggleDuplicate = (draftId: string) => {
    setSelectedDuplicateIds((previous) => {
      const next = new Set(previous);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  };

  const selectGroup = (group: PromptDraftDuplicateGroup, selected: boolean) => {
    setSelectedDuplicateIds((previous) => {
      const next = new Set(previous);
      group.items.slice(1).forEach((item) => {
        if (selected) next.add(item.id);
        else next.delete(item.id);
      });
      return next;
    });
  };

  const allSelected = selectedDuplicateIds.size > 0 && selectedDuplicateIds.size === totalDuplicateCount;
  const selectedCount = selectedDuplicateIds.size;

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xl animate-in fade-in">
      <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[2.6rem] border border-slate-700 bg-slate-900 shadow-[0_30px_90px_-16px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-7 py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <GitMerge size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">Review Duplicate Prompts</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
                Compare duplicates side by side, keep the oldest draft on the left, and choose which duplicates should merge into it before archiving the extra drafts.
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isProcessing} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-slate-800 xl:border-b-0 xl:border-r">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Duplicate Groups</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {groups.length} group{groups.length === 1 ? '' : 's'} • {totalDuplicateCount} duplicate{totalDuplicateCount === 1 ? '' : 's'}
                </div>
              </div>
              <button
                onClick={() => setSelectedDuplicateIds(allSelected ? new Set() : new Set(groups.flatMap((group) => group.items.slice(1).map((item) => item.id))))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:text-white"
              >
                {allSelected ? 'Clear All' : 'Select All'}
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-3">
              <div className="space-y-3">
                {groups.map((group, groupIndex) => {
                  const groupDuplicateIds = group.items.slice(1).map((item) => item.id);
                  const selectedInGroup = groupDuplicateIds.filter((id) => selectedDuplicateIds.has(id)).length;
                  const groupAllSelected = selectedInGroup === groupDuplicateIds.length;
                  return (
                    <div
                      key={group.normalizedKey}
                      className={`w-full rounded-[1.4rem] border p-4 text-left transition-all ${
                        groupIndex === activeGroupIndex
                          ? 'border-violet-500/40 bg-violet-500/10'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => setActiveGroupIndex(groupIndex)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-sm font-black text-white">{group.title}</div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            Keep 1 • Merge {groupDuplicateIds.length}
                          </div>
                        </button>
                        <button
                          onClick={() => selectGroup(group, !groupAllSelected)}
                          className={`inline-flex h-7 min-w-[72px] items-center justify-center rounded-xl border px-2 text-[10px] font-black uppercase tracking-[0.16em] ${
                            groupAllSelected
                              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                              : 'border-slate-700 bg-slate-900 text-slate-400'
                          }`}
                        >
                          {groupAllSelected ? 'Selected' : 'Select'}
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em]">
                        <span className="text-slate-500">{selectedInGroup}/{groupDuplicateIds.length} queued</span>
                        <span className="text-slate-500">Group {groupIndex + 1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 flex-col">
            {activeGroup && primaryDraft && activeDuplicate ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Comparison</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      Group {activeGroupIndex + 1} of {groups.length} • Duplicate {activeDuplicateIndex + 1} of {duplicateDrafts.length}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {duplicateDrafts.map((draft, index) => {
                      const checked = selectedDuplicateIds.has(draft.id);
                      return (
                        <button
                          key={draft.id}
                          onClick={() => setActiveDuplicateIndex(index)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                            index === activeDuplicateIndex
                              ? 'border-violet-500/35 bg-violet-500/15 text-violet-100'
                              : 'border-slate-700 bg-slate-950 text-slate-400'
                          }`}
                        >
                          <span
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleDuplicate(draft.id);
                            }}
                            className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                              checked ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-500 text-transparent'
                            }`}
                          >
                            <CheckCircle2 size={12} />
                          </span>
                          Pair {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-slate-800 bg-black/25 px-5 py-4">
                    <div className="text-sm text-slate-300">
                      Left side is the oldest draft that will remain active. Right side will merge into the left draft only if selected.
                    </div>
                    <button
                      onClick={() => toggleDuplicate(activeDuplicate.id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                        selectedDuplicateIds.has(activeDuplicate.id)
                          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300'
                      }`}
                    >
                      {selectedDuplicateIds.has(activeDuplicate.id) ? <CheckCircle2 size={14} /> : <Square size={14} />}
                      {selectedDuplicateIds.has(activeDuplicate.id) ? 'Selected To Merge' : 'Select This Pair'}
                    </button>
                  </div>

                  <div className="grid gap-6 2xl:grid-cols-2">
                    <PreviewPanel draft={primaryDraft} accent="border-emerald-500/25" label="Keep Left Draft" />
                    <PreviewPanel draft={activeDuplicate} accent="border-amber-500/25" label="Merge Right Draft" />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
                No duplicate comparisons available.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 px-7 py-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Merge Selection</div>
            <div className="mt-1 text-sm font-semibold text-white">
              {selectedCount} duplicate prompt{selectedCount === 1 ? '' : 's'} selected
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(Array.from(selectedDuplicateIds))}
              disabled={isProcessing || selectedCount === 0}
              className="inline-flex items-center gap-3 rounded-2xl bg-amber-600 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white shadow-2xl shadow-amber-900/30 transition-all hover:bg-amber-500 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
              Merge Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
