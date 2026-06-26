import React from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';

interface ItemArchiveConfirmModalProps {
    isOpen: boolean;
    itemTitle?: string;
    onCancel: () => void;
    onConfirm: () => void;
    isProcessing?: boolean;
}

export const ItemArchiveConfirmModal: React.FC<ItemArchiveConfirmModalProps> = ({
    isOpen,
    itemTitle,
    onCancel,
    onConfirm,
    isProcessing = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[2.5rem] shadow-[0_30px_80px_-16px_rgba(0,0,0,0.8)] p-8 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-400 border border-rose-500/20">
                            <AlertTriangle size={22} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">Move To Recycle Bin</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">
                                This asset will be hidden from active views and moved to the recycle bin.
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-all">
                        <X size={20} />
                    </button>
                </div>

                {itemTitle && (
                    <div className="rounded-2xl border border-slate-800 bg-black/40 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Selected Asset</p>
                        <p className="text-sm font-semibold text-white mt-1 line-clamp-2">{itemTitle}</p>
                    </div>
                )}

                <div className="flex gap-4 pt-2">
                    <button
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="flex-[2] bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-rose-900/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Move To Bin
                    </button>
                </div>
            </div>
        </div>
    );
};
