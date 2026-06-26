import React from 'react';
import { CheckCircle2, Crown, GitMerge, Image as ImageIcon, Loader2, Video, X } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../types';

interface BulkMergeModalProps {
    isOpen: boolean;
    items: ItemWithCurrentRevision[];
    mainItemId: string;
    onSelectMain: (itemId: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    isProcessing?: boolean;
}

const resolvePreviewUrl = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return '';
    return rev.thumbnailLink || rev.fileUrl || '';
};

const resolveTitle = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return item.id;
    return rev.title?.trim() || rev.originalFilename || item.id;
};

const isVideoItem = (item: ItemWithCurrentRevision) => {
    const mimeType = String(item.currentRevision?.mimeType || '').toLowerCase();
    return mimeType.startsWith('video/');
};

export const BulkMergeModal: React.FC<BulkMergeModalProps> = ({
    isOpen,
    items,
    mainItemId,
    onSelectMain,
    onClose,
    onConfirm,
    isProcessing = false
}) => {
    if (!isOpen) return null;

    const mergeCount = Math.max(0, items.length - 1);

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-[2.5rem] shadow-[0_30px_80px_-16px_rgba(0,0,0,0.8)] p-8 space-y-6 max-h-[92vh] overflow-hidden flex flex-col">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                            <GitMerge size={22} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">Merge Selected Media</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Select a Main Image. Other selected items will be added to its revision history and archived.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={isProcessing} className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-all disabled:opacity-50">
                        <X size={20} />
                    </button>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-black/40 px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Selection</p>
                        <p className="text-sm font-semibold text-white mt-1">
                            {items.length} item{items.length === 1 ? '' : 's'} selected • {mergeCount} item{mergeCount === 1 ? '' : 's'} will merge into the main item
                        </p>
                    </div>
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                        Select Main Image
                    </div>
                </div>

                <div className="overflow-y-auto pr-1 custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-1">
                        {items.map((item) => {
                            const rev = item.currentRevision;
                            const isMain = item.id === mainItemId;
                            const previewUrl = resolvePreviewUrl(item);
                            const isVideo = isVideoItem(item);
                            const mimeLabel = isVideo ? 'Video' : 'Image';

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onSelectMain(item.id)}
                                    disabled={isProcessing}
                                    className={`text-left rounded-2xl border p-3 transition-all ${isMain ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'} disabled:opacity-70`}
                                >
                                    <div className="aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800 relative">
                                        {previewUrl ? (
                                            isVideo ? (
                                                <video
                                                    src={previewUrl}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    playsInline
                                                    preload="metadata"
                                                />
                                            ) : (
                                                <img src={previewUrl} alt={resolveTitle(item)} className="w-full h-full object-cover" />
                                            )
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                {isVideo ? <Video size={20} /> : <ImageIcon size={20} />}
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 border border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
                                            {isVideo ? <Video size={10} /> : <ImageIcon size={10} />}
                                            {mimeLabel}
                                        </div>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <p className="text-sm font-semibold text-white line-clamp-2">{resolveTitle(item)}</p>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] text-slate-500 font-mono truncate">{item.id}</p>
                                            {isMain ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 inline-flex items-center gap-1.5">
                                                    <Crown size={12} />
                                                    Main
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    Revision
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex gap-4 pt-2">
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isProcessing || !mainItemId || items.length < 2}
                        className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-900/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Confirm Merge
                    </button>
                </div>
            </div>
        </div>
    );
};

