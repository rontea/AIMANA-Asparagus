import React from 'react';
import { Trash2, Loader2, X } from 'lucide-react';

interface DashboardBulkBarProps {
    count: number;
    isProcessing: boolean;
    onCancel: () => void;
    onBulkAction: () => void;
}

export const DashboardBulkBar: React.FC<DashboardBulkBarProps> = ({
    count, isProcessing, onCancel, onBulkAction
}) => {
    if (count === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-2xl p-4 flex items-center gap-8 animate-in slide-in-from-bottom-8 z-[100] ring-4 ring-indigo-500/10">
            <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Project Actions</span>
                <span className="text-sm font-medium text-white">{count} Selected</span>
            </div>
            <div className="flex gap-3">
                <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                    <X size={16}/> Cancel
                </button>
                <button 
                    onClick={onBulkAction} 
                    disabled={isProcessing} 
                    className="bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-all border border-rose-500/20"
                >
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Move To Recycle Bin
                </button>
            </div>
        </div>
    );
};
