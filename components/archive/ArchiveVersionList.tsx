
import React from 'react';
import { History, CheckSquare, Square, RefreshCw, Trash2, FileIcon, Clock } from 'lucide-react';
import { Revision } from '../../types';

interface ArchiveVersionListProps {
    revisions: Revision[];
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleAll: () => void;
}

export const ArchiveVersionList: React.FC<ArchiveVersionListProps> = ({
    revisions, selectedIds, onToggleSelection, onRestore, onDelete, onToggleAll
}) => {
    return (
        <section className="space-y-6">
          <div className="flex justify-between items-center px-1">
              <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                  <History size={20} className="text-rose-400"/> Deleted Versions
              </h2>
              {revisions.length > 0 && (
                  <button 
                    onClick={onToggleAll}
                    className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${selectedIds.size > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                      {selectedIds.size === revisions.length ? <CheckSquare size={14} /> : <Square size={14} />}
                      {selectedIds.size === revisions.length ? 'Deselect All' : 'Select All'}
                  </button>
              )}
          </div>
          {revisions.length === 0 ? (
              <div className="py-20 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
                  No historical versions in bin.
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {revisions.map(rev => (
                      <div 
                        key={rev.id} 
                        onClick={() => onToggleSelection(rev.id)} 
                        className={`bg-slate-900/40 border p-4 rounded-[1.5rem] flex items-center justify-between gap-4 transition-all group cursor-pointer ${selectedIds.has(rev.id) ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}`}
                      >
                          <div className="flex items-center gap-4 min-w-0">
                              <div className="w-16 h-16 bg-black rounded-xl border border-white/5 overflow-hidden shrink-0 relative shadow-2xl">
                                  <img src={rev.fileUrl || (rev.storage === 'google-drive' ? rev.thumbnailLink : '')} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
                                  <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[7px] font-black uppercase px-1 rounded shadow-lg">v{rev.versionNumber}</div>
                              </div>
                              <div className="min-w-0">
                                  <h4 className="text-xs font-black text-white uppercase truncate tracking-tight">{rev.title}</h4>
                                  <p className="text-[9px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Item: {rev.itemId.substring(0,8)}</p>
                                  <div className="flex items-center gap-2 mt-1.5 opacity-60">
                                      <span className="text-[8px] font-black text-indigo-400 uppercase">{(rev.size / 1024).toFixed(0)} KB</span>
                                      <div className="w-1 h-1 rounded-full bg-slate-800" />
                                      <span className="text-[8px] font-black text-slate-500 uppercase">{rev.mimeType.split('/')[1]}</span>
                                  </div>
                              </div>
                          </div>
                          <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                              <button onClick={() => onRestore(rev.id)} className="p-2 bg-slate-800 hover:bg-emerald-600 text-slate-400 hover:text-white rounded-lg transition-all" title="Restore to History"><RefreshCw size={12} /></button>
                              <button onClick={() => onDelete(rev.id)} className="p-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg transition-all" title="Purge Snapshot"><Trash2 size={12} /></button>
                          </div>
                      </div>
                  ))}
              </div>
          )}
      </section>
    );
};
