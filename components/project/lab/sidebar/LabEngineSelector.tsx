
import React from 'react';
import { Zap, ExternalLink, Settings2, Activity } from 'lucide-react';
import { SupportedEngine, ModelOption } from '../ModelSelectorModal';

interface LabEngineSelectorProps {
    model: SupportedEngine;
    registry: ModelOption[];
    onOpenModal: () => void;
}

export const LabEngineSelector: React.FC<LabEngineSelectorProps> = ({ model, registry, onOpenModal }) => {
    // Resolve model data from dynamic registry with a safe fallback
    const activeModelData = registry.find(m => m.id === model) || {
        id: model,
        label: model,
        category: 'Visual',
        icon: Activity,
        color: 'text-indigo-400'
    } as any;
    
    const ActiveIcon = activeModelData.icon || Activity;

    return (
        <div className="p-6 space-y-4 border-b border-slate-800/50 shrink-0">
            <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                    <Zap size={12} className="text-indigo-500" /> Active Engine
                </label>
                <a href="https://aistudio.google.com/app/plan_and_billing" target="_blank" rel="noreferrer" className="text-[9px] font-black text-slate-600 hover:text-indigo-400 uppercase transition-colors">
                    Quota <ExternalLink size={8} className="inline ml-1" />
                </a>
            </div>
            
            <button 
                onClick={onOpenModal}
                className="w-full bg-[#161616] hover:bg-[#1e1e1e] border border-slate-800 rounded-2xl p-4 flex items-center justify-between group transition-all active:scale-[0.98] shadow-lg shadow-black/20"
            >
                <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl bg-indigo-500/10 ${activeModelData.color} group-hover:scale-110 transition-transform`}>
                        <ActiveIcon size={18} />
                    </div>
                    <div className="text-left">
                        <div className="text-sm font-bold text-white leading-none">{activeModelData.label}</div>
                        <div className="text-[10px] text-slate-500 font-medium mt-1">Modality: {activeModelData.category?.toUpperCase() || 'NEURAL'}</div>
                    </div>
                </div>
                <div className="p-1.5 bg-slate-800 rounded-lg text-slate-500 group-hover:text-white transition-colors">
                    <Settings2 size={14} />
                </div>
            </button>
        </div>
    );
};
