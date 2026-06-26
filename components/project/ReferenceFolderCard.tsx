import React from 'react';
import { Box, Layers, Folder, ChevronRight, Fingerprint, Eye, Sparkles, Package } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../types';

interface ReferenceFolderCardProps {
    parentTitle: string;
    parentId: string;
    parentThumbnail?: string;
    items: ItemWithCurrentRevision[];
    onClick: () => void;
}

export const ReferenceFolderCard: React.FC<ReferenceFolderCardProps> = ({
    parentTitle, parentId, parentThumbnail, items, onClick
}) => {
    const expandThumbnailUrl = (url: string): string => {
        const raw = String(url || '').trim();
        if (!raw) return '';
        // Google thumbnail links often default to small sizes (ex: =s220).
        // Request a larger preview variant for orchestration cards.
        return raw.replace(/=s\d+(-c)?/g, '=s1600');
    };

    const resolvePreviewUrl = (item: ItemWithCurrentRevision): string => {
        const rev = item.currentRevision;
        if (!rev) return '';
        if (rev.thumbnailLink) return expandThumbnailUrl(rev.thumbnailLink);
        if (rev.fileUrl) return expandThumbnailUrl(rev.fileUrl);
        try {
            if (rev.aiParameters) {
                const parsed = JSON.parse(rev.aiParameters);
                const adv = parsed?.advanced_params || parsed || {};
                if (typeof adv.parentItemThumbnail === 'string' && adv.parentItemThumbnail.trim()) {
                    return expandThumbnailUrl(adv.parentItemThumbnail);
                }
            }
        } catch (e) {}
        return '';
    };

    return (
        <div 
            onClick={onClick}
            className="group relative bg-[#111] border border-slate-700/50 rounded-[2.5rem] p-8 cursor-pointer transition-all hover:border-indigo-500/40 hover:-translate-y-2 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
        >
            {/* Background Neural Decal */}
            <div className="absolute -top-4 -right-4 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none rotate-12">
                <Package size={140} />
            </div>

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 rounded-xl border border-indigo-500/20 w-fit">
                            <Box size={14} className="text-indigo-400" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400">Manifest Container</span>
                        </div>
                        <h3 className="text-lg font-black text-white mt-3 truncate uppercase tracking-tight drop-shadow-2xl">
                            {parentTitle}
                        </h3>
                    </div>
                    <div className="p-4 bg-slate-800 rounded-[1.5rem] text-slate-500 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-all shadow-xl border border-white/5 group-hover:border-indigo-500/20">
                        <Folder size={24} />
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-8">
                    <Fingerprint size={12} className="text-indigo-500/50" />
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.15em] truncate">
                        Origin Sig: <span className="text-slate-300">NODE_{parentId.substring(0, 12)}</span>
                    </p>
                </div>

                {/* Unified Stack Preview */}
                <div className="grid grid-cols-2 gap-3 mb-8 relative">
                    {/* Master Node (Parent) */}
                    <div className="col-span-2 aspect-[16/9] rounded-[1.5rem] bg-black border border-white/10 overflow-hidden shadow-2xl relative group/parent-thumb ring-1 ring-white/5">
                        {parentThumbnail ? (
                            <img src={expandThumbnailUrl(parentThumbnail)} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-1000 group-hover:scale-105" alt="Main Item" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-800 gap-3 bg-slate-900/50">
                                <Box size={48} strokeWidth={1} />
                                <span className="text-[9px] font-black uppercase text-slate-700 tracking-[0.2em]">Root Binary Missing</span>
                            </div>
                        )}
                        <div className="absolute top-4 left-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center gap-2 border border-indigo-400/30">
                            <Sparkles size={10} className="fill-current" /> Master Node
                        </div>
                    </div>

                    {/* Artifact Nodes (Children) */}
                    {items.slice(0, 2).map((item, i) => (
                        <div key={item.id} className="aspect-square rounded-[1.2rem] bg-black border border-white/5 overflow-hidden shadow-inner relative group/item ring-1 ring-white/5">
                            {resolvePreviewUrl(item) ? (
                                <img src={resolvePreviewUrl(item)} className="w-full h-full object-cover opacity-40 group-hover/item:opacity-100 transition-all duration-700" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-800 bg-slate-900/30">
                                    <Layers size={20} />
                                </div>
                            )}
                            {i === 1 && items.length > 2 && (
                                <div className="absolute inset-0 bg-indigo-600/80 backdrop-blur-md flex items-center justify-center border border-indigo-400/50">
                                    <span className="text-xl font-black text-white">+{items.length - 1}</span>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {/* Interaction Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none">
                        <div className="bg-white text-black px-8 py-4 rounded-full flex items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.8)] scale-90 group-hover:scale-100 transition-transform ring-4 ring-white/20">
                             <Eye size={20} strokeWidth={3} />
                             <span className="text-xs font-black uppercase tracking-[0.2em]">Open Manifest</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                             {[...Array(Math.min(3, items.length + 1))].map((_, i) => (
                                 <div key={i} className="w-6 h-6 rounded-full border-2 border-[#111] bg-slate-800 flex items-center justify-center">
                                     <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.8)]" />
                                 </div>
                             ))}
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{items.length + 1} Linked Artifacts</span>
                    </div>
                    <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all border border-indigo-500/20 shadow-lg">
                        <ChevronRight size={20} />
                    </div>
                </div>
            </div>
        </div>
    );
};
