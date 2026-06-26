
import React, { useMemo } from 'react';
import { Loader2, Zap, Cpu, Activity, Settings2 } from 'lucide-react';
import { SupportedEngine, ModelOption } from '../../project/lab/ModelSelector/registry/index';

interface RefinementInputsProps {
    prompt: string;
    onSetPrompt: (v: string) => void;
    model: SupportedEngine;
    isGenerating: boolean;
    isRegistryLoading: boolean;
    allModels: ModelOption[];
    isModelUnavailable?: boolean;
    onOpenModelSelector: () => void;
    onGenerate: () => void;
}

export const RefinementInputs: React.FC<RefinementInputsProps> = ({
    prompt, onSetPrompt, model, isGenerating, isRegistryLoading, allModels, isModelUnavailable = false, onOpenModelSelector, onGenerate
}) => {
    const activeModel = useMemo(() => {
        return allModels.find((entry) => entry.id === model) || null;
    }, [allModels, model]);

    const ActiveIcon = activeModel?.icon || Activity;

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">Evolutionary Prompt</label>
                <textarea 
                    value={prompt}
                    onChange={(e) => onSetPrompt(e.target.value)}
                    placeholder="Refine the visual concepts..."
                    className="w-full min-h-[80px] bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none resize-none placeholder:text-slate-700"
                />
            </div>

            <div className="space-y-2">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">Synthesis Engine</label>
                <button
                    type="button"
                    onClick={onOpenModelSelector}
                    disabled={isRegistryLoading || allModels.length === 0}
                    className="w-full bg-slate-950 hover:bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between group transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="flex items-center gap-3 text-left min-w-0">
                        <div className={`p-2.5 rounded-xl bg-indigo-500/10 ${activeModel?.color || 'text-indigo-400'} group-hover:scale-110 transition-transform`}>
                            {isRegistryLoading ? <Loader2 size={16} className="animate-spin" /> : <ActiveIcon size={16} />}
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">
                                {isRegistryLoading
                                    ? 'Synchronizing Registry...'
                                    : activeModel?.label || 'Open Checkpoint Hub'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium mt-1 flex items-center gap-2">
                                <Cpu size={11} />
                                {activeModel?.category ? `Modality: ${activeModel.category.toUpperCase()}` : 'Select compatible model'}
                            </div>
                        </div>
                    </div>
                    <div className="p-2 bg-slate-800 rounded-xl text-slate-500 group-hover:text-white transition-colors shrink-0">
                        <Settings2 size={14} />
                    </div>
                </button>
                {isModelUnavailable && (
                    <p className="px-1 text-[9px] font-bold uppercase tracking-widest text-amber-400">
                        Original engine is no longer available in Checkpoint Hub. History is preserved, but choose a current model before iterating.
                    </p>
                )}
            </div>

            <div className="flex justify-end">
                <button 
                    onClick={onGenerate}
                    disabled={isGenerating || !prompt.trim() || isRegistryLoading || allModels.length === 0 || isModelUnavailable}
                    className="h-9 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-50 disabled:grayscale transition-all flex items-center gap-2"
                >
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    Iterate
                </button>
            </div>
        </div>
    );
};
