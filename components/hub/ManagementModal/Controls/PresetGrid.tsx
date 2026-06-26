import React from 'react';
import { Maximize2, Hash, Ban, Zap, CheckCircle2, EyeOff, ShieldCheck, Link2, Sliders, Compass, ImageIcon, Film } from 'lucide-react';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';

interface PresetGridProps {
    features: EngineFeatures;
    onToggleFeature: (key: keyof EngineFeatures) => void;
    category?: string;
}

export const PresetGrid: React.FC<PresetGridProps> = ({ features, onToggleFeature, category }) => {
    const isMotion = category === 'Motion';

    const featureConfigs = [
        { 
            key: 'showDimensions' as keyof EngineFeatures, 
            label: 'Aspect Ratio', 
            icon: Maximize2, 
            desc: 'Enables canvas dimension control in AI Creative settings. Injects {{width}}, {{height}}',
            mapping: 'Studio Link: Settings > Aspect Ratio'
        },
        { 
            key: 'showVideoRatio' as keyof EngineFeatures, 
            label: 'Video Aspect Ratio', 
            icon: Film, 
            desc: 'Cinematic (16:9) or Portrait (9:16) selector. Injects {{aspectRatio}}',
            mapping: 'Studio Link: Settings > Video Ratio',
            isMotionHighlight: isMotion
        },
        { 
            key: 'showSeed' as keyof EngineFeatures, 
            label: 'Neural Seed', 
            icon: Hash, 
            desc: 'Deterministic generation control. Injects {{seed}}',
            mapping: 'Studio Link: Settings > Seed'
        },
        { 
            key: 'showGuidance' as keyof EngineFeatures, 
            label: 'Neural Guidance', 
            icon: Compass, 
            desc: 'Prompt adherence (CFG) control. Injects {{guidance_scale}}',
            mapping: 'Studio Link: Settings > Guidance'
        },
        { 
            key: 'showSampling' as keyof EngineFeatures, 
            label: 'Sampling Method', 
            icon: Sliders, 
            desc: 'Enables Advanced Toggle, Sampler, Scheduler, Steps, and Guidance blocks.',
            mapping: 'Studio Link: Settings > Sampling'
        },
        { 
            key: 'showImageInput' as keyof EngineFeatures, 
            label: isMotion ? 'Video Image Reference' : 'Image Reference', 
            icon: ImageIcon, 
            desc: isMotion ? 'Enables image-to-video source frame input. Injects {{image}}' : 'Enables image-to-image source input. Injects {{image}}',
            mapping: 'Studio Link: Settings > Reference Image',
            isMotionHighlight: isMotion
        },
        { 
            key: 'showNegativePrompt' as keyof EngineFeatures, 
            label: 'Constraints', 
            icon: Ban, 
            desc: 'Adds Avoidance text block. Injects {{negative_prompt}}',
            mapping: 'Studio Link: Command Bar > Negative'
        },
        { 
            key: 'showNologo' as keyof EngineFeatures, 
            label: 'Visual Guard', 
            icon: EyeOff, 
            desc: 'Removes watermarks. Injects {{nologo}}',
            mapping: 'Studio Link: Advanced > No Logo'
        },
        { 
            key: 'showEnhancements' as keyof EngineFeatures, 
            label: 'Gateway Protocol', 
            icon: ShieldCheck, 
            desc: 'Adds Enhance, Safe, Private, Nofeed. Injects {{enhance}}, {{safe}}, {{private}}, {{nofeed}}',
            mapping: 'Studio Link: Advanced > Protocols'
        }
    ];

    return (
        <section className="space-y-6">
            <div>
                <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" /> Standard Neural Presets
                </h4>
                <p className="text-[10px] text-slate-500 font-medium mt-1">Enable pre-orchestrated UI blocks for common inference variables.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {featureConfigs.map(feature => (
                    <button 
                        key={feature.key}
                        type="button"
                        onClick={() => onToggleFeature(feature.key)}
                        className={`flex items-start gap-4 p-4 rounded-2xl border transition-all text-left group ${
                            features[feature.key] 
                            ? 'bg-indigo-600/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        } ${(feature as any).isMotionHighlight && !features[feature.key] ? 'ring-1 ring-blue-500/30' : ''}`}
                    >
                        <div className={`p-2.5 rounded-xl border transition-all ${features[feature.key] ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg' : 'bg-slate-950 text-slate-600 border-slate-800'}`}>
                            <feature.icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <div className={`text-xs font-black uppercase tracking-tight ${features[feature.key] ? 'text-white' : 'text-slate-400'}`}>{feature.label}</div>
                                {(feature as any).isMotionHighlight && <span className="bg-blue-500/10 text-blue-400 text-[7px] font-black px-1 rounded-sm uppercase tracking-tighter">Video</span>}
                            </div>
                            <p className="text-[9px] text-slate-500 font-medium mt-1 leading-relaxed">{feature.desc}</p>
                            <div className={`mt-2 flex items-center gap-1 text-[8px] font-black uppercase tracking-tighter transition-opacity ${features[feature.key] ? 'text-indigo-400 opacity-100' : 'text-slate-700 opacity-40 group-hover:opacity-60'}`}>
                                <Link2 size={10} /> {feature.mapping}
                            </div>
                        </div>
                        {features[feature.key] && (
                            <div className="text-indigo-400 animate-in zoom-in">
                                <CheckCircle2 size={14} />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </section>
    );
};
