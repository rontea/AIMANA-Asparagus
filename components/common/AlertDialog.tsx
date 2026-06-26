import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type AlertDialogTone = 'danger' | 'info';

interface AlertDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel?: string;
    tone?: AlertDialogTone;
    onClose: () => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
    isOpen,
    title,
    description,
    actionLabel = 'OK',
    tone = 'info',
    onClose
}) => {
    if (!isOpen) return null;

    const isDanger = tone === 'danger';
    const accentText = isDanger ? 'text-rose-400' : 'text-indigo-400';
    const accentBg = isDanger ? 'bg-rose-500/10 border-rose-500/20' : 'bg-indigo-500/10 border-indigo-500/20';
    const actionBtn = isDanger
        ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30'
        : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40';

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[2.5rem] shadow-[0_30px_80px_-16px_rgba(0,0,0,0.8)] p-8 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${accentBg} ${accentText}`}>
                            {isDanger ? <AlertCircle size={22} /> : <CheckCircle2 size={22} />}
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">{title}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex gap-4 pt-2">
                    <button
                        onClick={onClose}
                        className={`flex-1 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl transition-all ${actionBtn}`}
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
