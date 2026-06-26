import React from 'react';
import { Compass, Film, Monitor, Smartphone } from 'lucide-react';
import { LabDimensionSelector } from './LabDimensionSelector';
import { LabSamplingSettings } from './LabSamplingSettings';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';
import { LabSlider } from '../LabSlider';

interface SpatialConfigProps {
    activeModelData: any;
    selectedRatio: string;
    setSelectedRatio: (r: string) => void;
    customWidth: number;
    setCustomWidth: (w: number) => void;
    customHeight: number;
    setCustomHeight: (h: number) => void;
    isAdvancedSampling: boolean;
    setIsAdvancedSampling: (v: boolean) => void;
    sampler: string;
    setSampler: (s: string) => void;
    scheduler: string;
    setScheduler: (s: string) => void;
    samplingSteps: number;
    setSamplingSteps: (s: number) => void;
    guidanceScale: number;
    setGuidanceScale: (g: number) => void;
    features: EngineFeatures;
    paramSchema: any[];
}

export const SpatialConfig: React.FC<SpatialConfigProps> = (props) => {
    const hasSchemaGuidance = props.paramSchema?.some((p) => p.key === 'guidance_scale');
    const hasSchemaVideoRatio = props.paramSchema?.some((p) => p.key === 'aspectRatio');
    const isMotion = props.activeModelData.category === 'Motion';
    const showVideoRatio = props.features.showVideoRatio && !hasSchemaVideoRatio;
    const showDimensions = props.features.showDimensions && !(isMotion && showVideoRatio);

    return (
    <div className="space-y-10 animate-in fade-in duration-500">
        {showDimensions && (
            <LabDimensionSelector 
                ratios={props.activeModelData.ratios}
                selectedRatio={props.selectedRatio} 
                onSetRatio={props.setSelectedRatio} 
                customWidth={props.customWidth}
                setCustomWidth={props.setCustomWidth}
                customHeight={props.customHeight}
                setCustomHeight={props.setCustomHeight}
            />
        )}

        {/* Video Aspect Ratio Protocol */}
        {showVideoRatio && (
            <div className="space-y-3 animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                    <Film size={12} className="text-blue-400" /> Video Topology
                </label>
                <div className="grid grid-cols-2 bg-[#161616] border border-slate-800 rounded-xl overflow-hidden p-1 gap-1">
                    <button 
                        onClick={() => props.setSelectedRatio('16:9')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
                            props.selectedRatio === '16:9' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <Monitor size={14} />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Cinematic 16:9</span>
                    </button>
                    <button 
                        onClick={() => props.setSelectedRatio('9:16')}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${
                            props.selectedRatio === '9:16' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <Smartphone size={14} />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Portrait 9:16</span>
                    </button>
                </div>
                <p className="text-[8px] text-slate-600 font-bold uppercase tracking-tighter px-1">
                    Pollinations video topology supports 16:9 and 9:16 orientations.
                </p>
            </div>
        )}

        {/* 1. STANDALONE GUIDANCE - Shown if specifically enabled but full sampling is hidden */}
        {props.activeModelData.category === 'Visual' && props.features.showGuidance && !props.features.showSampling && !hasSchemaGuidance && (
            <div className="px-1 animate-in slide-in-from-top-2">
                <LabSlider 
                    label="Prompt Guidance (CFG)" 
                    value={props.guidanceScale} 
                    min={1} 
                    max={30} 
                    step={0.5} 
                    onChange={props.setGuidanceScale} 
                    icon={Compass} 
                    unit="" 
                />
                <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter mt-3 px-1">
                    Adherence Intensity: Higher values force stricter prompt alignment.
                </p>
            </div>
        )}

        {/* 2. FULL SAMPLING BLOCK - Includes guidance inside its UI */}
        {props.activeModelData.category === 'Visual' && props.features.showSampling && !hasSchemaGuidance && (
            <LabSamplingSettings 
                isAdvanced={props.isAdvancedSampling}
                onToggleAdvanced={props.setIsAdvancedSampling}
                sampler={props.sampler}
                onSetSampler={props.setSampler}
                scheduler={props.scheduler}
                onSetScheduler={props.setScheduler}
                steps={props.samplingSteps}
                onSetSteps={props.setSamplingSteps}
                guidance={props.guidanceScale}
                onSetGuidance={props.setGuidanceScale}
            />
        )}
    </div>
    );
};
