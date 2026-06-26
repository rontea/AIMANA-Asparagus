import React from 'react';
import { Activity, Clock, Globe, ShieldCheck, Info } from 'lucide-react';
import { LabSlider } from '../LabSlider';
import { LabSeedInput } from './LabSeedInput';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';
import { DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL } from '../../../../utils/googleModelIds';

interface TemporalConfigProps {
    category: string;
    features: EngineFeatures;
    paramSchema: any[];
    motionIntensity: number;
    setMotionIntensity: (v: number) => void;
    duration: number;
    setDuration: (v: number) => void;
    seed: string;
    setSeed: (v: string) => void;
    useSearch: boolean;
    setUseSearch: (v: boolean) => void;
    model: string;
    hideSeed?: boolean;
}

export const TemporalConfig: React.FC<TemporalConfigProps> = (props) => {
    const isProSynthesis = props.model === DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL;
    const hasSchemaDuration = props.paramSchema?.some((p) => p.key === 'duration');

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {props.category === 'Motion' && !hasSchemaDuration && (
                <div className="p-5 bg-blue-500/5 border border-blue-500/10 rounded-2xl space-y-6 shadow-inner">
                    <div className="relative">
                        <LabSlider label="Clip Duration" value={props.duration} min={1} max={10} step={1} onChange={props.setDuration} icon={Clock} unit="s" />
                        <span className="absolute right-0 top-0 cursor-help" title="Video duration in seconds. Common range is 1-10; some models (e.g. Wan) support up to 15, and Veo uses 4/6/8 presets.">
                            <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                        </span>
                    </div>
                </div>
            )}

            {isProSynthesis && (
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Neural Protocols</label>
                    <button 
                        onClick={() => props.setUseSearch(!props.useSearch)} 
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all shadow-lg group relative overflow-hidden ${
                            props.useSearch 
                            ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-400' 
                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}
                        title="Enable Google Search grounding to improve concept accuracy"
                    >
                        <div className="flex items-center gap-3 relative z-10">
                            <div className={`p-2 rounded-xl border transition-all ${props.useSearch ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-800 border-slate-700'}`}>
                                <Globe size={14} className={props.useSearch ? 'animate-spin-slow' : ''} />
                            </div>
                            <div className="text-left">
                                <span className="text-[10px] font-black uppercase tracking-widest block">Search Grounding</span>
                                <p className="text-[8px] font-medium opacity-60">Verified Real-World Concepts</p>
                            </div>
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${props.useSearch ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${props.useSearch ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                    </button>
                    <p className="text-[9px] text-slate-600 italic px-2">Grounding utilizes real-time indices to improve synthesis accuracy for specific events or persons.</p>
                </div>
            )}

            {props.features.showSeed && !props.hideSeed && (
                <LabSeedInput seed={props.seed} onSetSeed={props.setSeed} />
            )}
        </div>
    );
};
