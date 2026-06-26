import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronDown, Sparkles, Image, Compass, Clock, Volume2, ListFilter, Thermometer, Sliders, Video, Film, Mic, Type, FileText } from 'lucide-react';
import { PARAMETER_BLUEPRINTS, EngineFeatures, getBlueprintKeysForCategory } from '../../../../hooks/useEngineManagement';

interface LibraryPopoverProps {
    uiSchema: any[];
    onAddParam: (key: string) => void;
    category?: string;
    features: EngineFeatures;
}

const BLUEPRINT_METADATA: Record<string, { icon: any; color: string; isMotion?: boolean }> = {
    quality: { icon: Sparkles, color: 'text-amber-400' },
    quality_preset: { icon: ListFilter, color: 'text-amber-500' },
    guidance_scale: { icon: Compass, color: 'text-amber-500' },
    duration: { icon: Clock, color: 'text-blue-400', isMotion: true },
    audio: { icon: Volume2, color: 'text-pink-400', isMotion: true },
    transparent: { icon: Image, color: 'text-cyan-400' },
    temperature: { icon: Thermometer, color: 'text-emerald-400' },
    image_reference: { icon: Image, color: 'text-blue-400' },
    video_ratio: { icon: Film, color: 'text-blue-400', isMotion: true },
    voice_name: { icon: Mic, color: 'text-pink-400' },
    response_format: { icon: ListFilter, color: 'text-pink-400' },
    multi_speaker_enabled: { icon: Volume2, color: 'text-pink-400' },
    speaker_one_name: { icon: Type, color: 'text-pink-300' },
    speaker_one_voice: { icon: Mic, color: 'text-pink-300' },
    speaker_two_name: { icon: Type, color: 'text-pink-300' },
    speaker_two_voice: { icon: Mic, color: 'text-pink-300' },
    language_code: { icon: Type, color: 'text-cyan-400' },
    language_hint: { icon: Type, color: 'text-cyan-400' },
    tone: { icon: Sparkles, color: 'text-emerald-400' },
    pace: { icon: Clock, color: 'text-emerald-400' },
    accent: { icon: Type, color: 'text-emerald-400' },
    audio_profile: { icon: FileText, color: 'text-pink-400' },
    scene_description: { icon: FileText, color: 'text-pink-400' },
    director_notes: { icon: FileText, color: 'text-pink-400' },
    instrumental: { icon: Volume2, color: 'text-pink-400' },
    custom_slider: { icon: Sliders, color: 'text-slate-400' },
    custom_toggle: { icon: Plus, color: 'text-slate-400' },
    custom_text: { icon: Type, color: 'text-slate-400' },
    custom_textarea: { icon: FileText, color: 'text-slate-400' }
};

export const LibraryPopover: React.FC<LibraryPopoverProps> = ({ uiSchema, onAddParam, category, features }) => {
    const [showLibrary, setShowLibrary] = useState(false);
    const libraryRef = useRef<HTMLDivElement>(null);
    const isMotionEngine = category === 'Motion';
    const categoryBlueprintKeys = getBlueprintKeysForCategory(category);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (libraryRef.current && !libraryRef.current.contains(event.target as Node)) {
                setShowLibrary(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isPresetManaged = (key: string) => {
        if (key === 'guidance_scale') return !!features.showGuidance || !!features.showSampling;
        if (key === 'image_reference') return !!features.showImageInput;
        if (key === 'video_ratio') return !!features.showVideoRatio;
        return false;
    };

    return (
        <div className="relative" ref={libraryRef}>
            <button 
                type="button"
                onClick={() => setShowLibrary(!showLibrary)} 
                className="w-full md:w-auto flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
            >
                <Plus size={16} /> Add Logic Variable <ChevronDown size={14} className={`transition-transform ${showLibrary ? 'rotate-180' : ''}`} />
            </button>

            {showLibrary && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-[50] py-1 overflow-hidden animate-in slide-in-from-top-2">
                    <div className="px-4 py-2 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50 mb-1">
                        Neural Variable Catalog ({category || 'All'})
                    </div>
                    <div className="p-2 grid grid-cols-1 gap-1 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {categoryBlueprintKeys.map((key) => {
                            const bp = PARAMETER_BLUEPRINTS[key];
                            if (!bp) return null;
                            const meta = BLUEPRINT_METADATA[key] || BLUEPRINT_METADATA.custom_slider;
                            const alreadyAdded = uiSchema.some(p => p.key === bp.key);
                            const presetManaged = isPresetManaged(key);
                            const shouldHighlight = meta.isMotion && isMotionEngine;

                            return (
                                <button 
                                    key={key} 
                                    type="button"
                                    onClick={() => { onAddParam(key); setShowLibrary(false); }}
                                    disabled={alreadyAdded || presetManaged}
                                    className={`flex items-center gap-3 w-full p-2.5 rounded-lg transition-all text-left ${(alreadyAdded || presetManaged) ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-700 text-slate-300'} ${shouldHighlight && !alreadyAdded && !presetManaged ? 'ring-1 ring-blue-500/30' : ''}`}
                                >
                                    <div className={`p-1.5 rounded-md bg-slate-950 border border-slate-700 ${meta.color}`}>
                                        <meta.icon size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className="text-[10px] font-bold uppercase tracking-tight truncate">{bp.label}</div>
                                            {meta.isMotion && <span className="bg-blue-500/20 text-blue-400 text-[6px] px-1 rounded-sm font-black uppercase">Video</span>}
                                        </div>
                                        <div className="text-[8px] font-mono text-slate-500">{"{{"}{bp.key}{"}}"}</div>
                                    </div>
                                    {alreadyAdded && <span className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">Mapped</span>}
                                    {!alreadyAdded && presetManaged && <span className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">Preset</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
