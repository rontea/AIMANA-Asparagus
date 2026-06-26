import React, { useState } from 'react';
import { X, ShieldAlert, FileText, RotateCcw, Trash2, Check, AlertTriangle, Cpu, Terminal, Save, Loader2 } from 'lucide-react';
import { BulkTask } from '../../pages/BulkStudio';
import { normalizeBulkErrorMessage } from './bulkErrorMessage';

interface FailureDetailModalProps {
    task: BulkTask;
    onClose: () => void;
    onUpdate: (prompt: string) => void;
    onRestore: () => void;
    onRemove: () => void;
}

export const FailureDetailModal: React.FC<FailureDetailModalProps> = ({ task, onClose, onUpdate, onRestore, onRemove }) => {
    const [editValue, setEditValue] = useState(task.prompt);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const normalizedError = normalizeBulkErrorMessage(
        task.error,
        'Execution timeout or upstream network failure. The model failed to manifest binary data for the requested prompt.'
    );

    const handleSave = async () => {
        setIsSaving(true);
        // Simulate a tiny delay for visual feedback
        await new Promise(r => setTimeout(r, 400));
        onUpdate(editValue);
        setIsSaving(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-[#0c0c0c] border border-rose-900/30 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col ring-1 ring-rose-500/10 animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-800 bg-rose-500/5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-400 border border-rose-500/20">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Neural Exception Detail</h3>
                            <p className="text-[10px] text-rose-500/70 font-black uppercase tracking-widest mt-1">
                                Task: {task.id.toUpperCase()}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-white p-2.5 rounded-full hover:bg-slate-800 transition-all active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* Diagnostic Log */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                            <Terminal size={12} className="text-rose-500" /> Error Logic Terminal
                        </label>
                        <div className="bg-black border border-rose-900/30 rounded-2xl p-5 shadow-inner">
                            <div className="flex items-start gap-3">
                                <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                <div className="min-w-0 space-y-2">
                                    <p className="max-w-full break-words text-xs font-mono text-rose-400 leading-relaxed font-medium">
                                        {normalizedError}
                                    </p>
                                    <div className="flex items-center gap-3 pt-2 opacity-60">
                                        <span className="text-[9px] font-black text-rose-600 uppercase">Status: 502/Blocked</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-800" />
                                        <span className="text-[9px] font-black text-rose-600 uppercase">Origin: Inference Gateway</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Editable Prompt */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <FileText size={12} className="text-indigo-400" /> Evolution Manifest (Prompt)
                            </label>
                            {showSuccess && (
                                <span className="text-[9px] font-black text-emerald-400 uppercase animate-in fade-in flex items-center gap-1">
                                    <Check size={10} /> Context Updated
                                </span>
                            )}
                        </div>
                        <div className="relative group">
                            <textarea 
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full h-40 bg-black border border-slate-800 rounded-[1.5rem] p-5 text-sm md:text-base text-slate-200 font-medium italic leading-relaxed outline-none focus:border-indigo-500/50 focus:bg-slate-900/30 transition-all resize-none shadow-inner"
                                placeholder="Refine your synthesis context..."
                            />
                            <div className="absolute bottom-4 right-4 flex gap-2">
                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || editValue === task.prompt}
                                    className={`p-2.5 rounded-xl border transition-all shadow-lg ${
                                        editValue !== task.prompt 
                                        ? 'bg-indigo-600 border-indigo-400 text-white animate-pulse' 
                                        : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed'
                                    }`}
                                    title="Commit refinement to manifest"
                                >
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                </button>
                            </div>
                        </div>
                        <p className="text-[9px] text-slate-600 italic px-2">
                            Adjust keywords to avoid safety filters or reduce concept density if the previous attempt timed out.
                        </p>
                    </div>

                    {/* Metadata Read-only */}
                    <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-slate-900 rounded-xl text-slate-500 border border-slate-800">
                                <Cpu size={16} />
                            </div>
                            <div>
                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Synthesis Engine</span>
                                <p className="text-xs font-bold text-slate-400 uppercase">{task.modelLabel}</p>
                            </div>
                        </div>
                        <div className="text-right">
                             <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Protocol</span>
                             <p className="text-xs font-mono font-bold text-slate-500">Tier: Elite</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-slate-800 bg-slate-900/30 flex flex-col sm:flex-row justify-between gap-4 shrink-0">
                    <button 
                        onClick={onRemove}
                        className="px-6 py-3 bg-red-900/10 hover:bg-red-600 border border-red-500/20 text-red-500 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                    >
                        <Trash2 size={14} /> Purge Manifest
                    </button>
                    <div className="flex gap-3">
                        <button 
                            onClick={onClose} 
                            className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-2xl transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={onRestore}
                            className="px-10 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                            <RotateCcw size={16} /> Re-Queue manifest
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
