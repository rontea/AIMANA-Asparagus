import React from 'react';
import { CheckCircle2, DollarSign, Flower2 } from 'lucide-react';
import { SupportedEngine } from './types';
import { ModelOption } from './registry';
import { getPrimaryModelCreditRate } from '../../../../utils/pollenCredits';

interface ModelCardProps {
    model: ModelOption;
    isActive: boolean;
    onSelect: (id: SupportedEngine) => void;
}

const hasGoogleFreeTier = (model: ModelOption) => {
    if (model.provider !== 'google') return false;

    const pricingSources = [model.textPricing, model.imagePricing, model.videoPricing];
    return pricingSources.some((pricing) => pricing && pricing.freeTier === true);
};

const getGoogleRecommendation = (model: ModelOption): string | null => {
    if (model.provider !== 'google') return null;
    if (model.category !== 'Language') return null;

    if (model.id === 'gemini-2.5-flash') return 'Best for chat';
    if (model.id === 'gemini-2.5-flash-lite') return 'Best for fast chat';
    if (model.id === 'gemini-2.5-pro') return 'Best for reasoning';
    return null;
};

const getProviderBadge = (provider: string) => {
    const normalized = String(provider || '').toLowerCase();
    if (normalized === 'pollinations') {
        return {
            label: 'Pollinations.AI',
            classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        };
    }
    if (normalized === 'nvidia') {
        return {
            label: 'NVIDIA NIM',
            classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        };
    }
    return {
        label: 'Google AI',
        classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    };
};

export const ModelCard: React.FC<ModelCardProps> = ({ model, isActive, onSelect }) => {
    const Icon = model.icon;
    const isGoogleFreeTier = hasGoogleFreeTier(model);
    const googleRecommendation = getGoogleRecommendation(model);
    const primaryCreditRate = getPrimaryModelCreditRate(model);
    const providerBadge = getProviderBadge(model.provider);
    
    return (
        <button 
            onClick={() => onSelect(model.id)}
            className={`p-5 rounded-[2rem] border text-left transition-all relative overflow-hidden group ${
                isActive 
                ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/20 shadow-[0_10px_30px_-10px_rgba(99,102,241,0.3)]' 
                : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/50'
            }`}
        >
            <div className="flex items-start gap-4 relative z-10">
                <div className={`p-3.5 rounded-2xl shrink-0 ${isActive ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'} transition-all`}>
                    <Icon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                            <div className={`text-sm font-black truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>{model.label}</div>
                        </div>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter shrink-0 ${providerBadge.classes}`}>
                            {providerBadge.label}
                        </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-snug font-medium line-clamp-2">{model.desc}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {primaryCreditRate && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-300">
                                <Flower2 size={10} />
                                {primaryCreditRate.displayValue}
                            </span>
                        )}
                        {isGoogleFreeTier && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-emerald-300">
                                Free Tier
                            </span>
                        )}
                        {model.isPaid && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-amber-300">
                                <DollarSign size={10} />
                                Paid Only
                            </span>
                        )}
                        {googleRecommendation && (
                            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-indigo-200">
                                {googleRecommendation}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                        <span className="text-[9px] font-black uppercase text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{model.efficiency}</span>
                        {isActive && <CheckCircle2 size={12} className="text-indigo-400 ml-auto" />}
                    </div>
                </div>
            </div>
        </button>
    );
};
