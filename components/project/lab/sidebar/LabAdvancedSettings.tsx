import React from 'react';
import { ToggleLeft, ToggleRight, Wand2, Image, ShieldCheck, Lock, Volume2, Ghost, Sliders, ListFilter, ChevronDown, Info } from 'lucide-react';
import { ModelCategory } from '../ModelSelectorModal';
import { DynamicParam } from '../../../../hooks/useLabState';
import { SupportedEngine } from '../ModelSelector/types';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';
import { LabSlider } from '../LabSlider';

interface LabAdvancedSettingsProps {
    model: SupportedEngine;
    seed: string;
    onSetSeed: (s: string) => void;
    negativePrompt: string;
    onSetNegativePrompt: (p: string) => void;
    category: ModelCategory;
    enhance: boolean;
    setEnhance: (v: boolean) => void;
    nologo: boolean;
    setNologo: (v: boolean) => void;
    safe: boolean;
    setSafe: (v: boolean) => void;
    audio: boolean;
    setAudio: (v: boolean) => void;
    isPrivate: boolean;
    setIsPrivate: (v: boolean) => void;
    nofeed: boolean;
    setNofeed: (v: boolean) => void;
    isPollinations: boolean;
    dynamicParams: Record<string, any>;
    onSetDynamicParam: (key: string, value: any) => void;
    paramSchema: DynamicParam[];
    features: EngineFeatures;
}

export const LabAdvancedSettings: React.FC<LabAdvancedSettingsProps> = ({ 
    enhance, setEnhance, nologo, setNologo, safe, setSafe, audio, setAudio, 
    isPrivate, setIsPrivate, nofeed, setNofeed, category,
    paramSchema, dynamicParams, onSetDynamicParam, features
}) => {
    const hasSchemaAudio = paramSchema.some((p) => p.key === 'audio');
    const visibleParamSchema = paramSchema.filter((p) => p.key !== 'image');
    const gatewayTooltip = `Gateway Protocol Settings:
• Enhance: Let AI improve your prompt for better results
• Safe: Enable safety content filters
• Private: Generate in private mode (hidden from public galleries)
• No Feed: Prevent model training on your output`;

    return (
        <div className="space-y-10">
            {/* 1. GATEWAY PROTOCOLS (Native Presets) */}
            {features.showEnhancements && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={12} className="text-cyan-400" /> Gateway Protocol
                            <span className="cursor-help" title={gatewayTooltip}>
                                <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                            </span>
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setEnhance(!enhance)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${enhance ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`} title="Let AI improve your prompt for better results">
                            <div className="flex items-center gap-2"><Wand2 size={14} /><span className="text-[9px] font-black uppercase">Enhance</span></div>
                            {enhance ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => setSafe(!safe)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${safe ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`} title="Enable safety content filters">
                            <div className="flex items-center gap-2"><ShieldCheck size={14} /><span className="text-[9px] font-black uppercase">Safe</span></div>
                            {safe ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => setIsPrivate(!isPrivate)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isPrivate ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`} title="Generate in private mode (hidden from public galleries)">
                            <div className="flex items-center gap-2"><Lock size={14} /><span className="text-[9px] font-black uppercase">Private</span></div>
                            {isPrivate ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => setNofeed(!nofeed)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${nofeed ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`} title="Prevent model training on your output">
                            <div className="flex items-center gap-2"><Ghost size={14} /><span className="text-[9px] font-black uppercase">No Feed</span></div>
                            {nofeed ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                    </div>
                </div>
            )}

            {/* 2. CUSTOM NEURAL VARIABLES (Forged in Hub) */}
            {visibleParamSchema.length > 0 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Sliders size={12} className="text-indigo-400" /> Neural Fine-Tuning
                        </label>
                    </div>
                    
                    <div className="space-y-6 p-5 bg-slate-900/40 border border-slate-800 rounded-3xl">
                        {visibleParamSchema.map((param) => {
                            const currentValue = dynamicParams[param.key] ?? param.default;

                            return (
                                <div key={param.key} className="space-y-3 relative group">
                                    {param.description && (
                                        <div className="absolute -top-1 right-0">
                                            <span className="cursor-help" title={param.description}>
                                                <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                                            </span>
                                        </div>
                                    )}

                                    {param.type === 'slider' && (
                                        <LabSlider 
                                            label={param.label} 
                                            value={currentValue} 
                                            min={param.min || 0} 
                                            max={param.max || 100} 
                                            step={param.step} 
                                            onChange={(val) => onSetDynamicParam(param.key, val)} 
                                            icon={Sliders} 
                                        />
                                    )}

                                    {param.type === 'toggle' && (
                                        <button 
                                            onClick={() => onSetDynamicParam(param.key, !currentValue)}
                                            className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all ${currentValue ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-400' : 'bg-black/40 border-slate-800 text-slate-500'}`}
                                            title={param.description}
                                        >
                                            <span className="text-[10px] font-black uppercase tracking-widest">{param.label}</span>
                                            {currentValue ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                    )}

                                    {param.type === 'select' && (
                                        <div className="space-y-1.5" title={param.description}>
                                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                                <ListFilter size={10} /> {param.label}
                                            </label>
                                            <div className="relative group/sel">
                                                <select 
                                                    value={currentValue}
                                                    onChange={(e) => onSetDynamicParam(param.key, e.target.value)}
                                                    className="w-full appearance-none bg-black/40 border border-slate-800 rounded-xl py-3 px-4 text-[11px] font-bold text-slate-300 outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                                >
                                                    {param.options?.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none group-hover/sel:text-indigo-400 transition-colors" />
                                            </div>
                                        </div>
                                    )}

                                    {param.type === 'text' && (
                                        <div className="space-y-1.5" title={param.description}>
                                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">
                                                {param.label}
                                            </label>
                                            <input 
                                                type="text"
                                                value={currentValue}
                                                onChange={(e) => onSetDynamicParam(param.key, e.target.value)}
                                                className="w-full bg-black/40 border border-slate-800 rounded-xl py-3 px-4 text-[11px] text-white outline-none focus:ring-1 focus:ring-indigo-500/50"
                                                placeholder="Parameter value..."
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 3. VISUAL GUARDS */}
            {features.showNologo && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Image size={12} className="text-emerald-400" /> Output Guardrails
                        </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {features.showNologo && (
                            <button onClick={() => setNologo(!nologo)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${nologo ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`} title="Remove watermarks from generated assets (if supported)">
                                <div className="flex items-center gap-2"><Image size={14} /><span className="text-[9px] font-black uppercase">No Logo</span></div>
                                {nologo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
