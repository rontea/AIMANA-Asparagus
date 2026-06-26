
import React from 'react';
import { X, Box, Info, Lock, Search, Zap } from 'lucide-react';

interface EmbeddingSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const EmbeddingSelectorModal: React.FC<EmbeddingSelectorModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-[#0a0a0a] border border-slate-800/80 w-[90vw] h-[85vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 ring-1 ring-white/10 flex flex-col">
                
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                            <Box size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tight uppercase">Textual Inversion</h3>
                            <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-widest">Embedding & concept Registry</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-white p-2.5 rounded-full hover:bg-slate-800 transition-all active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col items-center justify-center relative">
                    <div className="bg-slate-900 border border-emerald-500/30 p-10 rounded-[3rem] shadow-2xl max-w-xl text-center space-y-6">
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center mx-auto text-emerald-500 border border-emerald-500/20">
                            <Lock size={40} />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-2xl font-black text-white uppercase tracking-tight">Future Expansion</h4>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Textual Inversion Embeddings allow you to define new concepts or styles with single trigger words.
                                <br/><br/>
                                Concepts trained on specific identities or stylistic datasets are being indexed for the v1.5 infrastructure update.
                            </p>
                        </div>
                        <div className="pt-4 flex flex-col items-center gap-4">
                            <div className="flex items-center gap-2 px-4 py-2 bg-slate-950 rounded-full border border-slate-800">
                                <Zap size={14} className="text-emerald-500" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Version: v1.5 Stable</span>
                            </div>
                            <button 
                                onClick={onClose}
                                className="px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-indigo-950/20"
                            >
                                Return to Laboratory
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-900/30 border-t border-slate-800 flex items-center gap-4 shrink-0">
                    <div className="p-2 bg-slate-800 rounded-lg text-slate-500">
                        <Info size={14} />
                    </div>
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        Embeddings are light-weight concept files (.pt or .bin) that hook directly into the CLIP encoder. Compatibility depends on the base model version.
                    </p>
                </div>
            </div>
        </div>
    );
};
