import React from 'react';
import { Settings2, Sparkles, Activity, Cpu, ImageIcon, Type, Video, Volume2, Search, BrainCircuit, Code2, Layers, DollarSign, Flower2 } from 'lucide-react';
import { ModelOption } from '../project/lab/ModelSelectorModal';
import { getPrimaryModelCreditRate } from '../../utils/pollenCredits';

interface EngineCardProps {
    model: ModelOption;
    isCustom: boolean;
    capabilities: string[];
    onConfigure: (e: React.MouseEvent) => void;
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
        case 'image': return <ImageIcon size={10} className="text-amber-400" />;
        case 'text': return <Type size={10} className="text-emerald-400" />;
        case 'video': return <Video size={10} className="text-blue-400" />;
        case 'audio': return <Volume2 size={10} className="text-pink-400" />;
        case 'logic': return <BrainCircuit size={10} className="text-indigo-400" />;
        case 'code': return <Code2 size={10} className="text-slate-400" />;
        case 'search': return <Search size={10} className="text-cyan-400" />;
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

export const EngineCard: React.FC<EngineCardProps> = ({ model, isCustom, capabilities = [], onConfigure }) => {
    const isGoogle = model.provider === 'google';
    const isSystem = !!model.isSystem;
    const isTested = !!model.isTested;
    const isPaid = !!model.isPaid;
    const Icon = model.icon || Cpu;
    const isLanguage = model.category === 'Language';
    const contextLabel = formatContextLength(model.textContextLength);
    const primaryCreditRate = getPrimaryModelCreditRate(model);

    return (
        <div className={`group relative overflow-hidden rounded-[1.8rem] border p-5 shadow-[0_20px_50px_rgba(2,6,23,0.28)] transition-all ${isSystem ? 'border-indigo-500/20 bg-[#071120] hover:border-indigo-400/50' : 'border-slate-800/80 bg-slate-900/60 hover:border-cyan-400/30'}`}>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:36px_36px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl ${isGoogle ? 'bg-indigo-500/10' : 'bg-cyan-500/10'}`} />
            <div className="absolute top-0 right-0 p-2 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
                <Icon size={64} />
            </div>

            <div className="relative z-10 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`rounded-xl border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${
                        isSystem ? 'border-indigo-500/25 bg-indigo-500/10 text-indigo-300' : 'border-slate-700/80 bg-slate-950/70 text-slate-400'
                    }`}>
                        {getTierLabel(model.category)}
                    </div>
                    {isTested ? (
                        <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" title="Verified Performance" />
                    ) : (
                        <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" title="Awaiting Verification" />
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    {isPaid && (
                        <div className="flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.16em] text-amber-300" title="Paid Infrastructure Only">
                            <DollarSign size={8} /> PAID
                        </div>
                    )}
                    {isSystem ? (
                        <div className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.16em] text-white shadow-[0_0_16px_rgba(79,70,229,0.24)]" title="Native AIMANA Engine">
                            <Layers size={8} className="fill-current" /> Native
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.16em] text-slate-300" title="User Forged Checkpoint">
                            <Sparkles size={8} className="text-amber-400" /> Forged
                        </div>
                    )}
                </div>
            </div>

            <div className="relative z-10 flex items-start gap-4">
                <div className={`relative shrink-0 rounded-[1.2rem] border p-3.5 ${isGoogle ? 'border-indigo-400/20 bg-indigo-500/10 text-indigo-300' : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-300'}`}>
                    <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-black uppercase tracking-[0.18em] text-white">{model.label}</h3>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                        {isCustom ? 'Programmable registry endpoint' : 'Registry engine blueprint'}
                    </p>
                    
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {capabilities.length > 0 ? (
                            capabilities.map(cap => (
                                <div key={cap} className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-950/70 px-2 py-1" title={`Capability: ${cap}`}>
                                    {getCapIcon(cap)}
                                    <span className="text-[7px] font-black uppercase tracking-[0.16em] text-slate-300">{cap}</span>
                                </div>
                            ))
                        ) : (
                            <span className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">General Model</span>
                        )}
                    </div>

                    {primaryCreditRate && (
                        <div className="mt-3 inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-emerald-300">
                            <Flower2 size={10} />
                            {primaryCreditRate.displayValue}
                        </div>
                    )}

                    <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                        {model.desc}
                    </p>

                    {isLanguage && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
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
                            {model.textSpecialized && (
                                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300">
                                    Specialized
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="relative z-10 mt-5 flex items-center justify-between border-t border-slate-800/70 pt-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <Activity size={10} className="text-indigo-500/50" />
                        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">{model.efficiency}</span>
                    </div>
                    <div className="h-1 w-1 rounded-full bg-slate-700" />
                    <span className="text-[8px] uppercase text-slate-500">
                        {(model.id as string).replace('pollinations-', '').replace('gemini-', '')}
                    </span>
                </div>
                <button 
                    onClick={onConfigure}
                    className="rounded-2xl border border-slate-700/70 bg-slate-950/70 p-2.5 text-slate-300 transition-all hover:border-indigo-400/40 hover:bg-indigo-600 hover:text-white hover:shadow-[0_0_18px_rgba(79,70,229,0.24)]"
                    title="Configure Architecture"
                >
                    <Settings2 size={14} />
                </button>
            </div>
        </div>
    );
};
