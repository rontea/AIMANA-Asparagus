
import React from 'react';
import { X, Sparkles, Info, Lock, Search, Filter, Layers, Zap } from 'lucide-react';

interface LoraSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SAMPLE_LORAS = [
    { id: 'lora-1', label: 'Cinematic Cinematic V2', desc: 'Adds deep contrast and cinematic film grain to standard models.', category: 'Visual', provider: 'Community' },
    { id: 'lora-2', label: 'Papercut Art Style', desc: 'Transform any prompt into a 3D layered papercraft aesthetic.', category: 'Style', provider: 'Community' },
    { id: 'lora-3', label: '80s Retro Synthwave', desc: 'Neon aesthetics, grid floors, and chromatic aberration effects.', category: 'Visual', provider: 'Community' },
    { id: 'lora-4', label: 'Hyper-Realistic Fur', desc: 'Specialized weighting for animal textures and fiber density.', category: 'Material', provider: 'Enterprise' },
];

export const LoraSelectorModal: React.FC<LoraSelectorModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-[#0a0a0a] border border-slate-800/80 w-[90vw] h-[85vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 ring-1 ring-white/10 flex flex-col">
                
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400 border border-amber-500/20">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-white tracking-tight uppercase">Checkpoint LoRA</h3>
                            <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-widest">Low-Rank Adaptation Registry</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-white p-2.5 rounded-full hover:bg-slate-800 transition-all active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Toolbar Mockup */}
                <div className="px-8 py-5 bg-slate-900/10 border-b border-slate-800/50 flex flex-col md:flex-row items-center gap-6 shrink-0 opacity-40 grayscale">
                    <div className="relative flex-1 group w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                        <input 
                            disabled
                            type="text" 
                            placeholder="Filter LoRA library..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-sm outline-none"
                        />
                    </div>
                    <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 w-full md:w-auto">
                        <button disabled className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-800 text-slate-500">Global</button>
                        <button disabled className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700">Favorites</button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col items-center justify-center relative">
                    {/* Placeholder Grid */}
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-20 pointer-events-none mb-12">
                        {SAMPLE_LORAS.map(lora => (
                            <div key={lora.id} className="p-6 rounded-[2rem] border border-slate-800 bg-slate-900/30 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800" />
                                    <div className="text-[8px] font-black px-2 py-1 rounded bg-slate-800 text-slate-600 uppercase">{lora.provider}</div>
                                </div>
                                <div>
                                    <div className="text-sm font-black text-slate-400 uppercase">{lora.label}</div>
                                    <div className="text-[10px] text-slate-600 mt-1">{lora.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Future Update Alert */}
                    <div className="absolute inset-0 flex items-center justify-center p-8 bg-[#0a0a0a]/40 backdrop-blur-[2px]">
                        <div className="bg-slate-900 border border-amber-500/30 p-10 rounded-[3rem] shadow-2xl max-w-xl text-center space-y-6">
                            <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center mx-auto text-amber-500 border border-amber-500/20">
                                <Lock size={40} />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-2xl font-black text-white uppercase tracking-tight">Future Expansion</h4>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    LoRA (Low-Rank Adaptation) weights allow you to apply specific styles, characters, or concepts to base models. 
                                    <br/><br/>
                                    This module is currently staged for a future update awaiting API orchestration support for customized fine-tuning pipelines.
                                </p>
                            </div>
                            <div className="pt-4 flex flex-col items-center gap-4">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-950 rounded-full border border-slate-800">
                                    <Zap size={14} className="text-amber-500" />
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
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-900/30 border-t border-slate-800 flex items-center gap-4 shrink-0">
                    <div className="p-2 bg-slate-800 rounded-lg text-slate-500">
                        <Info size={14} />
                    </div>
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tight">
                        LoRA weights are specific to model architectures (e.g., FLUX.1 vs SDXL). The registry will automatically filter compatibility once active.
                    </p>
                </div>
            </div>
        </div>
    );
};
