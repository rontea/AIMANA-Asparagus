import React from 'react';
import { Download, Loader2, X, FolderPlus, Trash2, GitMerge, FolderInput } from 'lucide-react';

interface BulkActionBarProps {
    selectedCount: number;
    isZipping: boolean;
    isMerging?: boolean;
    canBulkMerge?: boolean;
    canDownload?: boolean;
    canMoveToCollection?: boolean;
    showDownload?: boolean;
    showMoveToCollection?: boolean;
    showMerge?: boolean;
    onCancel: () => void;
    onBulkArchive: () => void;
    onBulkDownload?: () => void;
    onBulkMove: () => void;
    onBulkMoveToCollection?: () => void;
    onBulkMerge?: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
    selectedCount,
    isZipping,
    isMerging = false,
    canBulkMerge = false,
    canDownload = true,
    canMoveToCollection = true,
    showDownload = true,
    showMoveToCollection = true,
    showMerge = true,
    onCancel,
    onBulkArchive,
    onBulkDownload,
    onBulkMove,
    onBulkMoveToCollection,
    onBulkMerge
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-2xl p-4 flex items-center gap-8 animate-in slide-in-from-bottom-8 z-[100] ring-4 ring-indigo-500/10">
            <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bulk Actions</span>
                <span className="text-sm font-medium text-white">{selectedCount} Selected</span>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={onCancel} 
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2"
                >
                    <X size={16} /> Cancel
                </button>
                <button 
                    onClick={onBulkMove} 
                    className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-indigo-500/30 transition-colors"
                >
                    <FolderPlus size={16} /> Move
                </button>
                {showMoveToCollection && onBulkMoveToCollection && (
                    <button
                        onClick={onBulkMoveToCollection}
                        disabled={!canMoveToCollection}
                        title={canMoveToCollection ? 'Move selected items into a collection' : 'Move to collection is only available for item selections'}
                        className="bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-violet-500/30 transition-colors disabled:opacity-50"
                    >
                        <FolderInput size={16} /> To Collection
                    </button>
                )}
                {showMerge && onBulkMerge && (
                    <button
                        onClick={onBulkMerge}
                        disabled={!canBulkMerge || isMerging}
                        className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-cyan-500/30 transition-colors disabled:opacity-50"
                        title={canBulkMerge ? 'Merge selected image/video items' : 'Merge is available for 2+ selected image/video items only'}
                    >
                        {isMerging ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />}
                        Merge
                    </button>
                )}
                <button 
                    onClick={onBulkArchive} 
                    className="bg-rose-600/20 hover:bg-rose-600/40 text-rose-500 px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-rose-500/30 transition-colors"
                >
                    <Trash2 size={16} /> Delete
                </button>
                {showDownload && onBulkDownload && (
                    <button 
                        onClick={onBulkDownload} 
                        disabled={isZipping || !canDownload} 
                        title={canDownload ? 'Export selected items as ZIP' : 'ZIP export is only available for item selections'}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-all disabled:opacity-50"
                    >
                        {isZipping ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
                        Export ZIP
                    </button>
                )}
            </div>
        </div>
    );
};
