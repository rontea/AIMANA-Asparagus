
import React from 'react';
import { FileText, Clock, Cpu, Info, FolderPlus, Trash2, Wand2 } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../../types';

interface ManifestListViewProps {
    history: ItemWithCurrentRevision[];
    onInspect: (item: ItemWithCurrentRevision) => void;
    onDelete: (id: string) => void;
    onMove: (item: ItemWithCurrentRevision) => void;
    onRemix?: (item: ItemWithCurrentRevision) => void;
}

export const ManifestListView: React.FC<ManifestListViewProps> = ({ history, onInspect, onDelete, onMove, onRemix }) => (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2rem] overflow-hidden shadow-2xl animate-in slide-in-from-bottom-2">
        <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/80">
                <tr>
                    <th className="px-6 py-5 w-20">Preview</th>
                    <th className="px-6 py-5">Inference Context (Prompt)</th>
                    <th className="px-6 py-5 w-40">Temporal Sig</th>
                    <th className="px-6 py-5 w-48">Neural Node</th>
                    <th className="px-6 py-5 w-40 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
                {history.map((item) => (
                    <tr key={item.id} className="hover:bg-indigo-600/5 transition-colors group">
                        <td className="px-6 py-4">
                            <div className="w-12 h-12 rounded-lg bg-black border border-slate-700 overflow-hidden shadow-inner cursor-pointer" onClick={() => onInspect(item)}>
                                <img src={item.currentRevision?.fileUrl || ''} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="Thumb" />
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <FileText size={10} className="text-indigo-500/50" />
                                    <span className="text-white font-bold text-xs truncate max-w-md line-clamp-1">"{item.currentRevision?.prompt}"</span>
                                </div>
                                <span className="text-[9px] text-slate-500 font-medium italic opacity-60">ID: {item.id.substring(0, 8)}...</span>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-slate-400 font-bold font-mono text-[10px]">
                                <Clock size={12} className="text-slate-600" />
                                {new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                                <Cpu size={12} className="text-indigo-400/70" />
                                <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-[9px] font-black uppercase text-slate-400 tracking-tighter">
                                    {item.currentRevision?.engine || 'Unknown Engine'}
                                </span>
                            </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                                {onRemix && item.currentRevision?.aiParameters && (
                                    <button 
                                        onClick={() => onRemix(item)}
                                        className="p-2 text-amber-500 hover:text-white hover:bg-amber-600 rounded-lg transition-all"
                                        title="Remix"
                                    >
                                        <Wand2 size={16} />
                                    </button>
                                )}
                                <button 
                                    onClick={() => onInspect(item)}
                                    className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                                    title="Inspect"
                                >
                                    <Info size={16} />
                                </button>
                                <button 
                                    onClick={() => onMove(item)}
                                    className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-600 rounded-lg transition-all"
                                    title="Migrate"
                                >
                                    <FolderPlus size={16} />
                                </button>
                                <button 
                                    onClick={() => onDelete(item.id)}
                                    className="p-2 text-red-500/70 hover:text-white hover:bg-red-600 rounded-lg transition-all"
                                    title="Purge"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
