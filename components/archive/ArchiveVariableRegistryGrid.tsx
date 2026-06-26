import React from 'react';
import { CheckSquare, Database, RefreshCw, Square, Trash2 } from 'lucide-react';
import type { ArchivedRegistryVariable } from '../../utils/variableRegistryStorage';

interface ArchiveVariableRegistryGridProps {
  entries: ArchivedRegistryVariable[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleAll: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ArchiveVariableRegistryGrid: React.FC<ArchiveVariableRegistryGridProps> = ({
  entries,
  selectedIds,
  onToggleSelection,
  onToggleAll,
  onRestore,
  onDelete
}) => (
  <section className="space-y-6">
    <div className="flex justify-between items-center px-1">
      <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
        <Database size={20} className="text-cyan-300" /> Archived Registry Variables
      </h2>
      {entries.length > 0 && (
        <button
          onClick={onToggleAll}
          className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${selectedIds.size > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
        >
          {selectedIds.size === entries.length ? <CheckSquare size={14} /> : <Square size={14} />}
          {selectedIds.size === entries.length ? 'Deselect All' : 'Select All'}
        </button>
      )}
    </div>

    {entries.length === 0 ? (
      <div className="p-12 border border-slate-800 border-dashed rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
        No registry variables in bin.
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {entries.map((entry) => (
          <article
            key={entry.id}
            onClick={() => onToggleSelection(entry.id)}
            className={`rounded-[1.6rem] border bg-slate-900/40 p-5 cursor-pointer transition-all ${selectedIds.has(entry.id) ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-700'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-black text-white" title={entry.variable.key || 'Untitled Variable'}>
                  {entry.variable.key || 'Untitled Variable'}
                </h3>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                  {entry.source === 'vault' ? `Vault${entry.collectionName ? ` / ${entry.collectionName}` : ''}` : 'Active Registry'}
                </div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                  Deleted {new Date(entry.deletedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelection(entry.id);
                }}
                className={`shrink-0 rounded-lg border p-1.5 transition-all ${selectedIds.has(entry.id) ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/60 border-slate-700 text-transparent hover:border-indigo-400'}`}
                title="Select variable"
              >
                <CheckSquare size={14} />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onRestore(entry.id);
                }}
                className="shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
                title="Restore variable"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={12} />
                  Restore
                </span>
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(entry.id);
                }}
                className="shrink-0 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-200 transition-colors hover:bg-rose-500/20"
                title="Delete forever"
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 size={12} />
                  Delete Forever
                </span>
              </button>
            </div>

            <p className="mt-4 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {entry.variable.value || 'No value available.'}
            </p>
          </article>
        ))}
      </div>
    )}
  </section>
);
