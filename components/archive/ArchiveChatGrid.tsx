import React from 'react';
import { MessageSquare, Clock, RefreshCw, Trash2 } from 'lucide-react';
import { ChatItem } from '../../types/chatItems';
import { Project } from '../../types';

interface ArchiveChatGridProps {
    items: ChatItem[];
    projectMap: Record<string, Project>;
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
}

export const ArchiveChatGrid: React.FC<ArchiveChatGridProps> = ({ items, projectMap, onRestore, onDelete }) => {
    return (
        <section className="space-y-6">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <MessageSquare size={20} className="text-indigo-400" /> Archived Chat Captures
                </h2>
            </div>
            {items.length === 0 ? (
                <div className="p-12 border border-slate-800 border-dashed rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
                    No chat captures in bin.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className="bg-slate-800 border border-slate-700 rounded-[2rem] p-6 flex flex-col gap-4 shadow-xl"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        <MessageSquare size={12} className="text-indigo-400" />
                                        Chat Capture
                                    </div>
                                    <h3 className="mt-2 text-lg font-black text-white truncate" title={item.title || 'Chat Capture'}>
                                        {item.title || 'Chat Capture'}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">
                                        {item.modelId || 'unknown model'} • {item.messageCount} messages
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onRestore(item.id)}
                                        className="p-2 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition-all"
                                        title="Restore"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id)}
                                        className="p-2 bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white rounded-xl transition-all"
                                        title="Delete Forever"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-700/50 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                <span className="flex items-center gap-1.5">
                                    <Clock size={12} /> Deleted {new Date(item.updatedAt).toLocaleDateString()}
                                </span>
                                <span className="truncate max-w-[50%]" title={projectMap[item.projectId]?.name || 'Workspace'}>
                                    Workspace: {projectMap[item.projectId]?.name || '...'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
