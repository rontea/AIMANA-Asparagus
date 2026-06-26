
import React from 'react';
import { BarChart3, Layers, ShieldCheck, ExternalLink, Sparkles, Zap, Cpu, Gauge, Flower2 } from 'lucide-react';
import { ModelOption } from './registry';
import { getModelCreditRates, getPrimaryModelCreditRate } from '../../../../utils/pollenCredits';
import { getGoogleApiRates, getPrimaryGoogleApiRate } from '../../../../utils/googleCredits';

interface MetricsSidebarProps {
    activeModel: ModelOption;
}

const getEfficiencyValue = (tier: string) => {
    switch(tier) {
        case 'Tier-Express': return '95%';
        case 'Tier-Stable': return '75%';
        case 'Tier-Elite': return '45%';
        case 'Tier-Video': return '25%';
        default: return '50%';
    }
};

const getEfficiencyLabel = (tier: string) => {
    if (tier?.includes('Express')) return 'Ultra Low Latency';
    if (tier?.includes('Stable')) return 'Balanced Priority';
    if (tier?.includes('Elite')) return 'Compute Intensive';
    if (tier?.includes('Video')) return 'Extended Inference';
    return 'Standard Protocol';
};

export const MetricsSidebar: React.FC<MetricsSidebarProps> = ({ activeModel }) => {
    const isGateway = activeModel.provider === 'pollinations' || activeModel.provider === 'Gateway';
    const isLanguage = activeModel.category === 'Language';
    const efficiencyPercent = getEfficiencyValue(activeModel.efficiency);
    const efficiencyLabel = getEfficiencyLabel(activeModel.efficiency);
    const modelDashboardUrl = activeModel.dashboardUrl || '';
    const ratioNotes = activeModel.ratioNotes || '';
    const creditRates = getModelCreditRates(activeModel);
    const primaryCreditRate = getPrimaryModelCreditRate(activeModel);
    const googleRates = getGoogleApiRates(activeModel);
    const primaryGoogleRate = getPrimaryGoogleApiRate(activeModel);
    const hasIntelligenceConfig = Boolean(
        (activeModel.limits && activeModel.limits.trim()) ||
        activeModel.ratios.length > 0 ||
        (ratioNotes && ratioNotes.trim()) ||
        (modelDashboardUrl && modelDashboardUrl.trim()) ||
        (!!activeModel.textContextLength) ||
        (Array.isArray(activeModel.textInputModalities) && activeModel.textInputModalities.length > 0) ||
        (Array.isArray(activeModel.textOutputModalities) && activeModel.textOutputModalities.length > 0)
    );

    return (
        <div className="w-full md:w-[440px] bg-slate-950/40 p-8 flex flex-col justify-between border-l border-slate-800/50 shrink-0 overflow-y-auto custom-scrollbar">
            <div className="space-y-8">
                <div>
                    <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <BarChart3 size={12} className="text-indigo-400" /> Model Intelligence
                        {!hasIntelligenceConfig && (
                            <span className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[8px] font-black uppercase tracking-widest">
                                Not Configured
                            </span>
                        )}
                    </h4>
                    
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-tighter flex items-center gap-1.5">
                                        <Gauge size={10} className="text-indigo-500" /> System Quota
                                    </span>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase">{activeModel.label}</p>
                                </div>
                                <span className={`text-[10px] font-mono font-bold ${isGateway ? 'text-cyan-400' : 'text-indigo-400'}`}>
                                    {activeModel.limits || '-'}
                                </span>
                            </div>
                            
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-slate-400 flex items-center gap-1.5">
                                        <Zap size={10} /> Efficiency: {efficiencyLabel}
                                    </span>
                                    <span className="text-white">{efficiencyPercent}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${isGateway ? 'bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'}`} 
                                        style={{ width: efficiencyPercent }}
                                    />
                                </div>
                            </div>
                        </div>

                        {isLanguage ? (
                            <div className="space-y-3 p-4 bg-slate-900/50 rounded-2xl border border-white/5 shadow-inner">
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Layers size={12} className="text-cyan-500" /> Text Capabilities
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {activeModel.textContextLength && (
                                        <span className="text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-300 px-2 py-1 rounded border border-cyan-500/30">
                                            Context: {activeModel.textContextLength.toLocaleString()}
                                        </span>
                                    )}
                                    {activeModel.textTools && (
                                        <span className="text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded border border-emerald-500/30">
                                            Tools Enabled
                                        </span>
                                    )}
                                    {activeModel.textReasoning && (
                                        <span className="text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30">
                                            Reasoning
                                        </span>
                                    )}
                                    {activeModel.textSpecialized && (
                                        <span className="text-[9px] font-mono font-bold bg-fuchsia-500/10 text-fuchsia-300 px-2 py-1 rounded border border-fuchsia-500/30">
                                            Specialized
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 gap-2 pt-1">
                                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Input Modalities</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(activeModel.textInputModalities || []).map((m) => (
                                            <span key={`in-${m}`} className="text-[9px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/5">
                                                {m}
                                            </span>
                                        ))}
                                        {(activeModel.textInputModalities || []).length === 0 && (
                                            <span className="text-[9px] font-mono bg-slate-900 text-slate-600 px-2 py-0.5 rounded border border-white/5">
                                                text
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Output Modalities</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(activeModel.textOutputModalities || []).map((m) => (
                                            <span key={`out-${m}`} className="text-[9px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/5">
                                                {m}
                                            </span>
                                        ))}
                                        {(activeModel.textOutputModalities || []).length === 0 && (
                                            <span className="text-[9px] font-mono bg-slate-900 text-slate-600 px-2 py-0.5 rounded border border-white/5">
                                                text
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 p-4 bg-slate-900/50 rounded-2xl border border-white/5 shadow-inner">
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Layers size={12} className="text-indigo-500" /> Supported Ratios
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {activeModel.ratios.map(r => (
                                        <span key={r} className="text-[9px] font-mono font-bold bg-slate-800 text-slate-400 px-2 py-1 rounded border border-white/5">
                                            {r}
                                        </span>
                                    ))}
                                    {activeModel.ratios.length === 0 && (
                                        <span className="text-[9px] font-mono font-bold bg-slate-900 text-slate-600 px-2 py-1 rounded border border-white/5">
                                            No ratios configured
                                        </span>
                                    )}
                                </div>
                                {ratioNotes && (
                                    <p className="text-[9px] text-slate-600 font-medium leading-relaxed italic border-t border-white/5 pt-2 mt-1">
                                        {ratioNotes}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="space-y-3 p-4 bg-slate-900/50 rounded-2xl border border-white/5 shadow-inner">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <Flower2 size={12} className="text-emerald-500" /> Pollen Credit
                            </div>
                            <div>
                                <div className="text-lg font-black text-white">
                                    {primaryCreditRate?.displayValue || 'Unavailable'}
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500 font-medium leading-relaxed">
                                    {primaryCreditRate?.detail || 'This model has no published Pollinations credit rate in the current registry.'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {creditRates.map((rate) => (
                                    <span
                                        key={rate.id}
                                        className="text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded border border-emerald-500/30"
                                    >
                                        {rate.label}: {rate.displayValue}
                                    </span>
                                ))}
                                {creditRates.length === 0 && (
                                    <span className="text-[9px] font-mono font-bold bg-slate-900 text-slate-600 px-2 py-1 rounded border border-white/5">
                                        Awaiting upstream pricing metadata
                                    </span>
                                )}
                            </div>
                        </div>

                        {activeModel.provider === 'google' && (
                        <div className="space-y-3 p-4 bg-slate-900/50 rounded-2xl border border-white/5 shadow-inner">
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <Cpu size={12} className="text-indigo-500" /> Google API Pricing
                            </div>
                            <div>
                                <div className="text-lg font-black text-white">
                                    {primaryGoogleRate?.displayValue || 'Unavailable'}
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500 font-medium leading-relaxed">
                                    {primaryGoogleRate?.detail || 'This model has no published Google paid-tier pricing metadata in the current registry.'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {googleRates.map((rate) => (
                                    <span
                                        key={rate.id}
                                        className="text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30"
                                    >
                                        {rate.label}: {rate.displayValue}
                                    </span>
                                ))}
                                {googleRates.length === 0 && (
                                    <span className="text-[9px] font-mono font-bold bg-slate-900 text-slate-600 px-2 py-1 rounded border border-white/5">
                                        Awaiting Google pricing metadata
                                    </span>
                                )}
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                <div className="p-5 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 text-indigo-400 font-black text-[10px] uppercase tracking-widest">
                        <ShieldCheck size={14} /> Neural Knowledge Center
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Monitor inference usage and view real-time latency analytics for this {activeModel.category} endpoint.
                    </p>
                    {modelDashboardUrl && (
                        <div className="space-y-2">
                            <a 
                                href={modelDashboardUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all active:scale-95 shadow-lg"
                            >
                                {activeModel.provider === 'google' ? 'Google AI Console' : 'Gateway Dashboard'} <ExternalLink size={10} />
                            </a>
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-6 mt-6 border-t border-slate-800 flex items-center gap-3 opacity-60">
                <Cpu size={14} className="text-indigo-500 shrink-0" />
                <p className="text-[9px] text-slate-600 font-bold uppercase leading-tight tracking-tight">
                    Pipeline synchronized with Hub Registry. Overrides are active for {activeModel.id}.
                </p>
            </div>
        </div>
    );
};
