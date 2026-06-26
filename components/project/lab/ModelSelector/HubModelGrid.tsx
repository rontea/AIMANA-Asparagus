
import React, { useMemo } from 'react';
import { Search, Globe, Network, Shield, Sparkles } from 'lucide-react';
import { CategorySection } from './CategorySection';
import { ModelOption } from './registry';
import { SupportedEngine, ModelCategory } from './types';

interface HubModelGridProps {
    filteredModels: ModelOption[];
    currentModel: SupportedEngine;
    onSelect: (id: SupportedEngine) => void;
    onClearFilters: () => void;
    forcedCategory?: ModelCategory;
    forcedCategories?: ModelCategory[];
}

export const HubModelGrid: React.FC<HubModelGridProps> = ({
    filteredModels, currentModel, onSelect, onClearFilters, forcedCategory, forcedCategories
}) => {
    // Filter out 'Static' category models for the functional Lab selector
    const functionalModels = useMemo(() => {
        return filteredModels.filter(m => m.category !== 'Static');
    }, [filteredModels]);

    // Advanced Grouping Logic
    const groupedData = useMemo(() => {
        const groups: Record<string, Record<string, ModelOption[]>> = {};
        
        functionalModels.forEach(model => {
            const provider = model.provider;
            const category = model.category;
            
            if (!groups[provider]) groups[provider] = {};
            if (!groups[provider][category]) groups[provider][category] = [];
            
            groups[provider][category].push(model);
        });
        
        return groups;
    }, [functionalModels]);

    const providerPriority = ['google', 'pollinations', 'nvidia'];
    const categories: ModelCategory[] = (
        Array.isArray(forcedCategories) && forcedCategories.length > 0
            ? forcedCategories
            : forcedCategory
                ? [forcedCategory]
                : ['Language', 'Visual', 'Motion', 'Audio', 'Experimental']
    );

    if (functionalModels.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
                <div className="p-8 bg-slate-900/50 rounded-[3rem] text-slate-700 border border-slate-800 mb-6">
                    <Search size={64} strokeWidth={1} />
                </div>
                <h4 className="text-2xl font-black text-slate-300 uppercase tracking-tight">No Matching Engines</h4>
                <p className="text-slate-600 text-sm mt-3 max-w-xs mx-auto font-medium">Try broadening your search or switching between Global and Gateway views.</p>
                <button 
                    onClick={onClearFilters}
                    className="mt-8 text-indigo-400 hover:text-white text-xs font-black uppercase tracking-widest transition-all underline underline-offset-8"
                >
                    Reset Environment
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 md:p-10 space-y-20 overflow-y-auto custom-scrollbar">
            {providerPriority.map(providerKey => {
                const providerCategories = groupedData[providerKey];
                if (!providerCategories) return null;
                const isGoogle = providerKey === 'google';
                const isNvidia = providerKey === 'nvidia';
                
                // Check if provider has any models in the requested categories
                const hasModels = categories.some(cat => providerCategories[cat] && providerCategories[cat].length > 0);
                if (!hasModels) return null;

                return (
                    <div key={providerKey} className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Provider Branding Bar */}
                        <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-[#0a0a0a]/90 backdrop-blur-xl border-y border-slate-800/40 flex items-center justify-between rounded-xl shadow-2xl shadow-black/40">
                            <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-xl border ${isGoogle ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : isNvidia ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
                                    {isGoogle ? <Shield size={20} /> : isNvidia ? <Network size={20} /> : <Globe size={20} />}
                                </div>
                                <div>
                                    <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] flex items-center gap-3">
                                        {isGoogle ? 'Native Intelligence' : isNvidia ? 'NVIDIA NIM' : 'Gateway Architecture'}
                                        <Sparkles size={12} className={isGoogle ? 'text-indigo-500' : isNvidia ? 'text-emerald-500' : 'text-cyan-500'} />
                                    </h3>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1 opacity-60">
                                        {isGoogle ? 'Infrastructure Tier-Elite' : isNvidia ? 'Accelerated Inference Layer' : 'Model Orchestration Layer'}
                                    </p>
                                    {isGoogle && (
                                        <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                            Badges: Free Tier, Paid Only, Best for Chat
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modality Rendering */}
                        <div className="space-y-16">
                            {categories.map(cat => {
                                const models = providerCategories[cat];
                                if (!models || models.length === 0) return null;

                                return (
                                    <CategorySection 
                                        key={`${providerKey}-${cat}`}
                                        category={cat}
                                        models={models}
                                        currentModel={currentModel}
                                        onSelect={onSelect}
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
