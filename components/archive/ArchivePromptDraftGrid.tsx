import React from 'react';
import { CheckSquare, Clock, FileText, RefreshCw, Square, Trash2 } from 'lucide-react';
import type { PromptDraft } from '../prompt-manager/types';

interface ArchivePromptDraftGridProps {
  drafts: PromptDraft[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleAll: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ArchivePromptDraftGrid: React.FC<ArchivePromptDraftGridProps> = ({
  drafts,
  selectedIds,
  onToggleSelection,
  onToggleAll,
  onRestore,
  onDelete
}) => (
  <section className="space-y-6">
    <div className="flex justify-between items-center px-1">
      <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
        <FileText size={20} className="text-violet-300" /> Archived Prompt Drafts
      </h2>
      {drafts.length > 0 && (
        <button
          onClick={onToggleAll}
          className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${selectedIds.size > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
        >
          {selectedIds.size === drafts.length ? <CheckSquare size={14} /> : <Square size={14} />}
          {selectedIds.size === drafts.length ? 'Deselect All' : 'Select All'}
        </button>
      )}
    </div>

    {drafts.length === 0 ? (
      <div className="p-12 border border-slate-800 border-dashed rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
        No prompt drafts in bin.
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {drafts.map((draft) => (
          <article
            key={draft.id}
            onClick={() => onToggleSelection(draft.id)}
            className={`rounded-[1.6rem] border bg-slate-900/40 p-5 cursor-pointer transition-all ${selectedIds.has(draft.id) ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-700'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-black text-white" title={draft.title}>
                  {draft.title || 'Untitled Prompt'}
                </h3>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-violet-300">
                  Prompt Draft
                </div>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelection(draft.id);
                }}
                className={`shrink-0 rounded-lg border p-1.5 transition-all ${selectedIds.has(draft.id) ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/60 border-slate-700 text-transparent hover:border-indigo-400'}`}
                title="Select draft"
              >
                <CheckSquare size={14} />
              </button>
            </div>

            <p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {draft.prompt || 'No prompt text available.'}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-slate-800/70 pt-4">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Clock size={12} />
                Deleted {new Date(draft.updatedAt || draft.createdAt).toLocaleDateString()}
              </span>
              <div
                className="flex gap-2"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={() => onRestore(draft.id)}
                  className="p-2 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition-all"
                  title="Restore"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => onDelete(draft.id)}
                  className="p-2 bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded-xl transition-all"
                  title="Delete Forever"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
);
