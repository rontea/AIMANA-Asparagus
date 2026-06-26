import React from 'react';
import { EngineCard } from './EngineCard';
import { ModelOption } from '../project/lab/ModelSelectorModal';
import { Settings2, Cpu, ImageIcon, Type, Video, Volume2, BrainCircuit, Code2, Search, Layers, Sparkles, DollarSign } from 'lucide-react';
import { getPrimaryModelCreditRate } from '../../utils/pollenCredits';

interface RegistryGridProps {
    models: ModelOption[];
    customEngines: any[];
    onConfigure: (model: ModelOption) => void;
    viewType?: 'grid' | 'list';
}

const getTierLabel = (category: string) => {
    switch(category) {
        case 'Language': return 'Text to Text';
        case 'Visual': return 'Text to Image';
        case 'Motion': return 'Text to Video';
        case 'Audio': return 'Text to Speech';
        case 'Static': return 'Static Reference';
        default: return 'Neural Experiment';
    }
};

const getCapIcon = (id: string) => {
    switch(id) {
        case 'image': return <ImageIcon size={10} />;
        case 'text': return <Type size={10} />;
        case 'video': return <Video size={10} />;
        case 'audio': return <Volume2 size={10} />;
        case 'logic': return <BrainCircuit size={10} />;
        case 'code': return <Code2 size={10} />;
        case 'search': return <Search size={10} />;
        default: return null;
    }
};

const formatContextLength = (value?: number) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1)}K`;
    return `${num}`;
};

export const RegistryGrid: React.FC<RegistryGridProps> = ({ models, customEngines, onConfigure, viewType = 'grid' }) => {
    if (models.length === 0) {
        return (
            <div className="rounded-[2rem] border border-dashed border-slate-800/80 bg-slate-900/20 py-24 text-center animate-in fade-in">
                <div className="mx-auto mb-4 w-fit rounded-full border border-slate-800 bg-slate-950 p-6 text-slate-700">
                    <Search size={40} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-500">No matching checkpoints found</h3>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Try adjusting your filters or forge a new endpoint</p>
            </div>
        );
    }

    if (viewType === 'list') {
        return (
            <div className="overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#050b18] shadow-[0_24px_80px_rgba(2,6,23,0.28)] animate-in slide-in-from-top-2">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-[11px]">
                        <thead className="border-b border-slate-800/60 bg-slate-950/85 text-slate-500">
                        <tr>
                            <th className="px-6 py-4 font-black uppercase tracking-[0.24em]">Engine Identifier</th>
                            <th className="px-6 py-4 font-black uppercase tracking-[0.24em]">Infrastructure Tier</th>
                            <th className="px-6 py-4 font-black uppercase tracking-[0.24em]">Origin</th>
                            <th className="px-6 py-4 font-black uppercase tracking-[0.24em]">Capabilities</th>
                            <th className="px-6 py-4 font-black uppercase tracking-[0.24em]">Efficiency</th>
                            <th className="px-6 py-4 text-right font-black uppercase tracking-[0.24em]">Actions</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                        {models.map(model => {
                            const dbEngine = customEngines.find(c => c.id === model.id);
                            const caps = dbEngine?.capabilities ? dbEngine.capabilities.split(',').filter(Boolean) : [];
                            const isGoogle = model.provider === 'google';
                            const isSystem = !!model.isSystem;
                            const isTested = !!model.isTested;
                            const isPaid = !!model.isPaid;
                            const Icon = model.icon || Cpu;
                            const isLanguage = model.category === 'Language';
                            const contextLabel = formatContextLength(model.textContextLength);
                            const primaryCreditRate = getPrimaryModelCreditRate(model);

                            return (
                                <tr key={model.id} className="group transition-colors hover:bg-indigo-500/[0.06]">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className={`rounded-xl border p-2 ${isGoogle ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'}`}>
                                                    <Icon size={14} />
                                                </div>
                                                {isTested ? (
                                                    <div className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#050b18] bg-emerald-500 shadow-lg animate-pulse" title="Verified" />
                                                ) : (
                                                    <div className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#050b18] bg-rose-500 shadow-lg" title="Awaiting Test" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-black uppercase tracking-[0.14em] text-white">{model.label}</div>
                                                <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-600">{model.id}</div>
                                                {isLanguage && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {contextLabel && (
                                                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
                                                                Ctx {contextLabel}
                                                            </span>
                                                        )}
                                                        {model.textTools && (
                                                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                                                                Tools
                                                            </span>
                                                        )}
                                                        {model.textReasoning && (
                                                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-indigo-500/25 bg-indigo-500/10 text-indigo-300">
                                                                Reasoning
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                                            {getTierLabel(model.category)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {isSystem ? (
                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-300">
                                                <Layers size={12} className="fill-current" /> Native AIMANA
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                                                <Sparkles size={12} className="text-amber-400" /> Forged Checkpoint
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {caps.length > 0 ? caps.map((cap: string) => (
                                                <div key={cap} className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-1 text-slate-300" title={cap}>
                                                    {getCapIcon(cap)}
                                                </div>
                                            )) : <span className="text-slate-700 italic">None</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-300">
                                                {model.efficiency}
                                            </span>
                                            {isPaid && (
                                                <div className="flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.16em] text-amber-300" title="Paid Infrastructure Only">
                                                    <DollarSign size={8} />
                                                </div>
                                            )}
                                        </div>
                                        {primaryCreditRate && (
                                            <div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">
                                                {primaryCreditRate.displayValue}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => onConfigure(model)}
                                            className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-2 text-slate-400 transition-all hover:border-indigo-400/40 hover:bg-indigo-600 hover:text-white group-hover:shadow-[0_0_16px_rgba(79,70,229,0.22)]"
                                        >
                                            <Settings2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 animate-in fade-in zoom-in-[0.98] duration-300 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {models.map((model) => {
                const dbEngine = customEngines.find(c => c.id === model.id);
                const caps = dbEngine?.capabilities 
                    ? dbEngine.capabilities.split(',').filter(Boolean)
                    : [];
                    
                return (
                    <EngineCard 
                        key={model.id}
                        model={model}
                        isCustom={!!dbEngine?.isProgrammable}
                        capabilities={caps}
                        onConfigure={(e) => { e.stopPropagation(); onConfigure(model); }}
                    />
                );
            })}
        </div>
    );
};
