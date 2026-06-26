
import React from 'react';
import { Clock, Trash2, FolderPlus, Info, Wand2 } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../../types';

interface ManifestGridViewProps {
    history: ItemWithCurrentRevision[];
    onInspect: (item: ItemWithCurrentRevision) => void;
    onDelete: (id: string) => void;
    onMove: (item: ItemWithCurrentRevision) => void;
    onRemix?: (item: ItemWithCurrentRevision) => void;
}

export const ManifestGridView: React.FC<ManifestGridViewProps> = ({ history, onInspect, onDelete, onMove, onRemix }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 md:gap-8">
        {history.map((item) => (
            <div key={item.id} className="group relative bg-slate-900/20 border border-slate-800/50 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden aspect-[4/5] sm:aspect-square transition-all hover:border-indigo-500/40 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-900/20">
                <img 
                    onClick={() => onInspect(item)}
                    src={item.currentRevision?.fileUrl || ''} 
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-700 scale-110 group-hover:scale-100 cursor-pointer" 
                    alt="Artifact"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-5 md:p-6 pointer-events-none">
                    <div className="translate-y-0 sm:translate-y-4 sm:group-hover:translate-y-0 transition-transform duration-500">
                        <p className="text-[11px] md:text-xs text-white font-bold line-clamp-2 mb-3 md:mb-4 drop-shadow-xl leading-relaxed">
                            "{item.currentRevision?.prompt}"
                        </p>
                        <div className="flex items-center justify-between pointer-events-auto">
                            <div className="flex items-center gap-2 text-slate-400 text-[8px] md:text-[9px] font-black uppercase tracking-tighter">
                                <Clock size={12} className="text-indigo-500/70" /> 
                                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="flex gap-1.5 md:gap-2">
                                <button 
                                    onClick={() => onDelete(item.id)}
                                    className="p-2 md:p-2.5 bg-red-900/40 hover:bg-red-600 text-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 shadow-lg"
                                    title="Purge Entry"
                                >
                                    <Trash2 size={14} className="md:w-4 md:h-4" />
                                </button>
                                {onRemix && item.currentRevision?.aiParameters && (
                                    <button 
                                        onClick={() => onRemix(item)}
                                        className="p-2 md:p-2.5 bg-amber-600/40 hover:bg-amber-600 text-amber-400 hover:text-white rounded-xl transition-all border border-amber-500/20 shadow-lg"
                                        title="Remix Generation"
                                    >
                                        <Wand2 size={14} className="md:w-4 md:h-4" />
                                    </button>
                                )}
                                <button 
                                    onClick={() => onMove(item)}
                                    className="p-2 md:p-2.5 bg-indigo-600/40 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl transition-all border border-indigo-500/20 shadow-lg"
                                    title="Migrate to Project"
                                >
                                    <FolderPlus size={14} className="md:w-4 md:h-4" />
                                </button>
                                <button 
                                    onClick={() => onInspect(item)}
                                    className="p-2 md:p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700/50 shadow-lg"
                                    title="Inspect Manifest"
                                >
                                    <Info size={14} className="md:w-4 md:h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ))}
    </div>
);
