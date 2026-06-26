import React from 'react';
import { X, FileText, Clipboard } from 'lucide-react';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface GenerationDataModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: string;
    onDataChange?: (val: string) => void;
    readOnly?: boolean;
}

export const GenerationDataModal: React.FC<GenerationDataModalProps> = ({ 
    isOpen, onClose, data, onDataChange, readOnly = false 
}) => {
    const { alert, alertDialog } = useModalDialogs();
    if (!isOpen) return null;

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(data);
        await alert({
            title: 'Copied',
            description: 'Parameters copied to clipboard!'
        });
    };

    return (
        <div 
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-slate-900 border border-white/10 w-full max-w-4xl h-[85vh] rounded-3xl shadow-[0_0_120px_rgba(0,0,0,1)] flex flex-col animate-in zoom-in-95 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-800/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">
                                Neural Manifest Source
                            </h3>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Raw Saved JSON Snapshot</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-white p-2.5 hover:bg-slate-800 rounded-full transition-all active:scale-90"
                    >
                        <X size={24}/>
                    </button>
                </div>
                <div className="p-6 flex-1 flex flex-col bg-black/60 overflow-hidden">
                    <textarea 
                        value={data} 
                        onChange={(e) => onDataChange?.(e.target.value)}
                        readOnly={readOnly}
                        spellCheck={false}
                        className="flex-1 bg-black border border-slate-800 rounded-2xl p-6 font-mono text-[11px] text-indigo-300 resize-none outline-none focus:border-indigo-500/50 shadow-inner custom-scrollbar" 
                        placeholder="Raw AI engine data..."
                    />
                </div>
                <div className="p-6 border-t border-slate-800 flex justify-between items-center bg-slate-900/50 shrink-0">
                    <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest max-w-xs leading-relaxed italic">
                        Captured prompt, controls, references, and run metadata saved for this artifact.
                    </p>
                    <div className="flex gap-3">
                        <button 
                            type="button" 
                            onClick={handleCopy} 
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all active:scale-95"
                        >
                            <Clipboard size={14} /> Copy to Clipboard
                        </button>
                        <button 
                            onClick={onClose} 
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 border border-indigo-400/20"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>

            {alertDialog}
        </div>
    );
};
