
import React from 'react';
import { Info, Lock, Plus, Trash2, Layers, Cpu, Sparkles, Wand2, MessageSquarePlus, Flower2 } from 'lucide-react';
import { SupportedEngine, ModelOption } from '../ModelSelectorModal';
import { getPrimaryModelCreditRate } from '../../../../utils/pollenCredits';

interface LabModelManagerProps {
    model: SupportedEngine;
    registry: ModelOption[];
    onOpenModal: () => void;
    onOpenLoraModal: () => void;
    onOpenEmbeddingModal: () => void;
    onOpenControlNetModal: () => void;
    onAddTriggerWord: (word: string) => void;
    vae: string;
    onSetVae: (v: string) => void;
}

export const LabModelManager: React.FC<LabModelManagerProps> = ({ 
    model, registry, onOpenModal, onOpenLoraModal, onOpenEmbeddingModal, onOpenControlNetModal, onAddTriggerWord, vae, onSetVae 
}) => {
    const activeModelData = registry.find(m => m.id === model) || {
        label: String(model),
        provider: 'system'
    } as any;
    const activeModelRate = getPrimaryModelCreditRate(activeModelData);

    return (
        <section className="space-y-4">
            <h4 className="text-sm font-black text-white uppercase tracking-widest px-1">Models</h4>
            
            <div className="space-y-2">
                {/* Base Model Card */}
                <div className="bg-[#1e1e1e] border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                        <span>checkpoint</span>
                        <Info size={10} className="opacity-50" />
                    </div>
                    <button 
                        onClick={onOpenModal}
                        className="w-full bg-[#121212] border border-slate-800 hover:border-indigo-500/50 rounded-lg p-3 flex items-center justify-between group transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center overflow-hidden">
                                <Cpu size={20} className="text-slate-500" />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-bold text-white leading-tight">{activeModelData.label} - fp8</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {activeModelRate ? (
                                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                                            <Flower2 size={10} />
                                            {activeModelRate.displayValue}
                                        </span>
                                    ) : (
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                            Pricing unavailable
                                        </span>
                                    )}
                                    <Info size={10} className="text-slate-500" />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-600 font-bold text-[10px]">&gt;</span>
                            <Lock size={12} className="text-slate-700" />
                        </div>
                    </button>
                </div>

                {/* LoRA Placeholder Card */}
                <div className="bg-[#1e1e1e] border border-slate-800 rounded-xl p-3 space-y-3">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                        <span>LoRA</span>
                        <Info size={10} className="opacity-50" />
                    </div>
                    <div className="space-y-2">
                        <button 
                            onClick={onOpenLoraModal}
                            className="w-full bg-[#121212] border border-slate-800 hover:border-amber-500/50 rounded-lg p-3 flex items-center gap-3 group transition-all text-left"
                        >
                            <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                <Sparkles size={20} className="text-amber-500/50 group-hover:text-amber-400 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-1">
                                    <p className="text-[10px] font-bold text-white leading-tight truncate">Future Update</p>
                                    <div className="flex items-center gap-1 text-slate-600 group-hover:text-slate-400">
                                        <Info size={10} />
                                        <Trash2 size={10} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full w-1/2 bg-amber-500/50" />
                                    </div>
                                    <div className="bg-slate-800 rounded px-2 py-0.5 text-[10px] font-bold text-white flex items-center gap-2">
                                        1 <span className="opacity-40">|</span> <span>- +</span>
                                    </div>
                                </div>
                            </div>
                        </button>
                        
                        <button 
                            disabled
                            className="w-full py-1.5 bg-slate-800 text-slate-500 border border-slate-700 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
                            title="Trigger words are disabled until LoRA support is active"
                        >
                            <MessageSquarePlus size={12} /> Add Trigger Words (Locked)
                        </button>
                    </div>
                </div>

                {/* Add Actions */}
                <div className="bg-[#1e1e1e] border border-slate-800 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between px-1">
                         <span className="text-[10px] font-black text-white uppercase tracking-tight">Conditioning Controls</span>
                         <div className="flex items-center gap-2 text-indigo-400">
                            <span className="text-[10px] font-bold uppercase tracking-widest">Update All</span>
                            <Wand2 size={12} className="opacity-50" />
                         </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={onOpenLoraModal} className="py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold border border-slate-700 transition-colors">Add LoRA</button>
                        <button onClick={onOpenEmbeddingModal} className="py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold border border-slate-700 transition-colors">Add Embedding</button>
                    </div>
                    <button onClick={onOpenControlNetModal} className="w-full py-2 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2">
                        Add ControlNet <Info size={10} className="opacity-50" />
                    </button>
                </div>

                {/* VAE Selector - Currently Grayed Out */}
                <div className="space-y-1.5 px-1 pt-1 opacity-40">
                    <div className="flex items-center gap-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">VAE (Beta)</label>
                        <Lock size={10} className="text-slate-600" />
                    </div>
                    <select 
                        disabled
                        value={vae}
                        onChange={(e) => onSetVae(e.target.value)}
                        className="w-full bg-[#2a2a2a] border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-500 cursor-not-allowed outline-none appearance-none"
                    >
                        <option value="ae.sft">ae.sft</option>
                        <option value="vae-v2">vae-ft-mse-840000</option>
                    </select>
                </div>
            </div>
        </section>
    );
};
