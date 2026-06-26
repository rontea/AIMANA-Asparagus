
import React from 'react';
import { CheckCircle2, XCircle, Square, Loader2 } from 'lucide-react';
import { normalizeBulkErrorMessage, truncateBulkErrorMessage } from './bulkErrorMessage';

interface TaskStatusProps {
    status: 'pending' | 'generating' | 'success' | 'error';
    progress: number;
    error?: string;
    onCancel?: (id: string) => void;
    taskId: string;
}

export const TaskStatus: React.FC<TaskStatusProps> = ({ status, progress, error, onCancel, taskId }) => {
    if (status === 'success') {
        return (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 w-fit">
                <CheckCircle2 size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Persisted</span>
            </div>
        );
    }

    if (status === 'error') {
        const previewError = error ? truncateBulkErrorMessage(error, 140) : '';
        return (
            <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-900/20 w-fit">
                    <XCircle size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Failed</span>
                </div>
                {error && <p className="block min-w-0 max-w-full truncate text-[8px] text-red-500/60 font-medium italic" title={normalizeBulkErrorMessage(error)}>Exception: {previewError}</p>}
            </div>
        );
    }

    if (status === 'generating') {
        return (
            <div className="flex flex-col items-center lg:items-start gap-1.5 group/gen relative w-full">
                <div className="flex items-center justify-between w-full">
                    <span className="text-indigo-400 text-[9px] font-black uppercase animate-pulse group-hover/gen:opacity-0 transition-opacity flex items-center gap-2">
                        <Loader2 size={10} className="animate-spin" /> In-Situ...
                    </span>
                    <span className="text-[10px] font-black font-mono text-indigo-500 group-hover/gen:opacity-0 transition-opacity">{progress}%</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden group-hover/gen:opacity-0 transition-opacity shadow-inner">
                    <div className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                {onCancel && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onCancel(taskId); }}
                        className="absolute inset-0 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-red-500 opacity-0 group-hover/gen:opacity-100 transition-all bg-red-500/10 rounded-lg border border-red-500/30"
                    >
                        <Square size={10} className="fill-current" /> Terminate
                    </button>
                )}
            </div>
        );
    }

    return (
        <span className="text-slate-600 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-800" /> Staged in Queue
        </span>
    );
};
