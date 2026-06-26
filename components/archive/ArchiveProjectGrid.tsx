
import React from 'react';
import { Folder, CheckSquare, Square, Clock, RefreshCw, Trash2, CheckCircle } from 'lucide-react';
import { Project } from '../../types';

interface ArchiveProjectGridProps {
    title?: string;
    emptyText?: string;
    projects: Project[];
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleAll: () => void;
}

export const ArchiveProjectGrid: React.FC<ArchiveProjectGridProps> = ({
    title = 'Archived Projects',
    emptyText = 'No projects in bin.',
    projects, selectedIds, onToggleSelection, onRestore, onDelete, onToggleAll
}) => {
    return (
        <section className="space-y-6">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <Folder size={20} className="text-indigo-400"/> {title}
                </h2>
                {projects.length > 0 && (
                    <button 
                        onClick={onToggleAll}
                        className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${selectedIds.size > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        {selectedIds.size === projects.length ? <CheckSquare size={14} /> : <Square size={14} />}
                        {selectedIds.size === projects.length ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>
            
            {projects.length === 0 ? (
                <div className="p-12 border border-slate-800 border-dashed rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
                    {emptyText}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map(p => (
                        <div 
                            key={p.id} 
                            onClick={() => onToggleSelection(p.id)} 
                            className={`bg-slate-800 border rounded-[2rem] p-6 flex flex-col group relative overflow-hidden cursor-pointer transition-all ${selectedIds.has(p.id) ? 'border-indigo-500 ring-4 ring-indigo-500/20' : 'border-slate-700 hover:border-slate-600 shadow-xl'}`}
                        >
                            <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ backgroundColor: p.color || '#475569' }}></div>
                            <div className="flex justify-between items-start mb-4 pl-4">
                                <div className="min-w-0">
                                    <h3 className="font-black text-white uppercase tracking-tight truncate pr-6 text-lg" title={p.name}>{p.name}</h3>
                                    <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest mt-1">Workspace ID: {p.id.substring(0,8)}</p>
                                </div>
                                <div className={`p-1 rounded-lg border transition-all ${selectedIds.has(p.id) ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900/60 border-slate-600 text-transparent group-hover:border-indigo-400'}`}>
                                    <CheckCircle size={16} />
                                </div>
                            </div>
                            <p className="text-sm text-slate-400 mb-6 pl-4 line-clamp-2 italic leading-relaxed">{p.description || "No description provided."}</p>
                            <div className="flex items-center justify-between pl-4 pt-4 border-t border-slate-700/50">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Clock size={12}/> Deleted {new Date(p.updatedAt).toLocaleDateString()}</span>
                                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => onRestore(p.id)} className="p-2 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition-all" title="Restore"><RefreshCw size={14} /></button>
                                    <button onClick={() => onDelete(p.id)} className="p-2 bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded-xl transition-all" title="Delete Forever"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
