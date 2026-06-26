
import React from 'react';
import { Info, Dices } from 'lucide-react';
import { LabSlider } from '../LabSlider';

interface LabSamplingSettingsProps {
    isAdvanced: boolean;
    onToggleAdvanced: (v: boolean) => void;
    sampler: string;
    onSetSampler: (s: string) => void;
    scheduler: string;
    onSetScheduler: (s: string) => void;
    steps: number;
    onSetSteps: (s: number) => void;
    guidance: number;
    onSetGuidance: (g: number) => void;
}

export const LabSamplingSettings: React.FC<LabSamplingSettingsProps> = ({
    isAdvanced, onToggleAdvanced, sampler, onSetSampler, scheduler, onSetScheduler, steps, onSetSteps, guidance, onSetGuidance
}) => {
    return (
        <div className="space-y-6">
            {/* Sampling Method Row */}
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sampling Method</label>
                        <Info size={10} className="text-slate-600" />
                    </div>
                    <div className="flex items-center gap-2">
                         <button 
                            onClick={() => onToggleAdvanced(!isAdvanced)}
                            className={`w-8 h-4 rounded-full relative transition-all ${isAdvanced ? 'bg-emerald-500' : 'bg-slate-700'}`}
                         >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isAdvanced ? 'right-0.5' : 'left-0.5'}`} />
                         </button>
                         <span className="text-[10px] font-bold text-slate-400">Advanced</span>
                         <Info size={10} className="text-slate-600" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Sampler</label>
                        <select 
                            value={sampler}
                            onChange={(e) => onSetSampler(e.target.value)}
                            className="w-full bg-[#1e1e1e] border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="euler">euler</option>
                            <option value="dpmpp_2m">dpmpp_2m</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Scheduler</label>
                        <select 
                            value={scheduler}
                            onChange={(e) => onSetScheduler(e.target.value)}
                            className="w-full bg-[#1e1e1e] border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="simple">simple</option>
                            <option value="karras">karras</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Steps & Guidance */}
            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                    <div className="flex items-center gap-1 px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sampling Steps</label>
                        <Info size={10} className="text-slate-600" />
                    </div>
                    <div className="flex items-center gap-3">
                        <input 
                            type="range" min={1} max={100} step={1} value={steps} 
                            onChange={(e) => onSetSteps(parseInt(e.target.value))}
                            className="flex-1 h-1 bg-slate-800 rounded-full appearance-none accent-indigo-500" 
                        />
                        <input 
                            type="number" value={steps} onChange={(e) => onSetSteps(parseInt(e.target.value))}
                            className="w-12 bg-[#1e1e1e] border border-slate-800 rounded px-1.5 py-1 text-[10px] font-bold text-slate-300 text-center" 
                        />
                    </div>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-1 px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Guidance Scale</label>
                        <Info size={10} className="text-slate-600" />
                    </div>
                    <div className="flex items-center gap-3">
                        <input 
                            type="range" min={1} max={30} step={0.1} value={guidance} 
                            onChange={(e) => onSetGuidance(parseFloat(e.target.value))}
                            className="flex-1 h-1 bg-slate-800 rounded-full appearance-none accent-indigo-500" 
                        />
                        <input 
                            type="number" value={guidance} step={0.1} onChange={(e) => onSetGuidance(parseFloat(e.target.value))}
                            className="w-12 bg-[#1e1e1e] border border-slate-800 rounded px-1.5 py-1 text-[10px] font-bold text-slate-300 text-center" 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
