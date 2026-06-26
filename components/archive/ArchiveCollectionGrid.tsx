import React from 'react';
import { CheckCircle, CheckSquare, Clock, Folder, RefreshCw, Square, Trash2 } from 'lucide-react';
import { Project, ProjectCollection } from '../../types';

interface ArchiveCollectionGridProps {
    collections: ProjectCollection[];
    projectMap: Record<string, Project>;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleAll: () => void;
}

export const ArchiveCollectionGrid: React.FC<ArchiveCollectionGridProps> = ({
    collections,
    projectMap,
    selectedIds,
    onToggleSelection,
    onRestore,
    onDelete,
    onToggleAll
}) => {
    return (
        <section className="space-y-6">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <Folder size={20} className="text-amber-300" /> Archived Item Collections
                </h2>
                {collections.length > 0 && (
                    <button
                        onClick={onToggleAll}
                        className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${selectedIds.size === collections.length ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        {selectedIds.size === collections.length ? <CheckSquare size={14} /> : <Square size={14} />}
                        {selectedIds.size === collections.length ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>
            {collections.length === 0 ? (
                <div className="p-12 border border-slate-800 border-dashed rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
                    No item collections in bin.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {collections.map((collection) => (
                        <div
                            key={collection.id}
                            onClick={() => onToggleSelection(collection.id)}
                            className={`bg-slate-800 border rounded-[2rem] p-6 flex flex-col group relative overflow-hidden cursor-pointer transition-all ${selectedIds.has(collection.id) ? 'border-indigo-500 ring-4 ring-indigo-500/20' : 'border-slate-700 hover:border-slate-600 shadow-xl'}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="min-w-0">
                                    <h3 className="font-black text-white uppercase tracking-tight truncate pr-6 text-lg" title={collection.name}>{collection.name}</h3>
                                    <p className="text-[9px] text-amber-300 font-black uppercase tracking-widest mt-1">
                                        {collection.itemCount} item{collection.itemCount === 1 ? '' : 's'} in collection
                                    </p>
                                </div>
                                <div className={`p-1 rounded-lg border transition-all ${selectedIds.has(collection.id) ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900/60 border-slate-600 text-transparent group-hover:border-indigo-400'}`}>
                                    <CheckCircle size={16} />
                                </div>
                            </div>
                            <p className="text-sm text-slate-400 mb-6 line-clamp-2 italic leading-relaxed">
                                Workspace: {projectMap[collection.projectId]?.name || 'Unknown Project'}
                            </p>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Clock size={12} />
                                    Deleted {new Date(collection.updatedAt).toLocaleDateString()}
                                </span>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => onRestore(collection.id)} className="p-2 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition-all" title="Restore">
                                        <RefreshCw size={14} />
                                    </button>
                                    <button onClick={() => onDelete(collection.id)} className="p-2 bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded-xl transition-all" title="Delete Forever">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
