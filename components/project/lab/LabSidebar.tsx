import React, { useRef, useState } from 'react';
import { Activity, Key, ShieldCheck, Image as ImageIconLucide, Upload, X, Info, Zap, Loader2, FolderOpen } from 'lucide-react';
import { SupportedEngine, ModelCategory, ModelOption } from './ModelSelectorModal';
import { LabAudioSettings } from './sidebar/LabAudioSettings';
import { LabLanguageSettings } from './sidebar/LabLanguageSettings';
import { LabAdvancedSettings } from './sidebar/LabAdvancedSettings';
import { LabMode } from './GenerateImageModal';
import { DynamicParam } from '../../../hooks/useLabState';
import { EngineFeatures } from '../../../hooks/useEngineManagement';
// Add missing api import
import { api } from '../../../services/api';

// Refactored Block Imports
import { NeuralConfig } from './sidebar/NeuralConfig';
import { SpatialConfig } from './sidebar/SpatialConfig';
import { TemporalConfig } from './sidebar/TemporalConfig';
import { ConstraintConfig } from './sidebar/ConstraintConfig';
import { ArtifactSelectorModal } from '../../../extensions/image-editor/components/ArtifactSelectorModal';
import { isPaidGoogleModelId } from '../../../utils/googleModelIds';

export type UIAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | 'custom';

export const RATIO_CONFIG: Record<string, { label: string; apiValue: any }> = {
    "1:1": { label: "Square", apiValue: "1:1" },
    "3:4": { label: "Portrait", apiValue: "3:4" },
    "4:3": { label: "Landscape", apiValue: "4:3" },
    "9:16": { label: "Cinematic", apiValue: "9:16" },
    "16:9": { label: "Widescreen", apiValue: "16:9" },
    "custom": { label: "Custom", apiValue: "custom" }
};

interface LabSidebarProps {
    model: SupportedEngine;
    setModel: (m: SupportedEngine) => void;
    mode?: LabMode;
    hasApiKey: boolean;
    onSelectKey: () => void;
    registry: ModelOption[];
    selectedRatio: string;
    setSelectedRatio: (r: string) => void;
    customWidth: number;
    setCustomWidth: (w: number) => void;
    customHeight: number;
    setCustomHeight: (h: number) => void;
    negativePrompt: string;
    setNegativePrompt: (p: string) => void;
    seed: string;
    setSeed: (s: string) => void;
    samplingSteps: number;
    setSamplingSteps: (s: number) => void;
    guidanceScale: number;
    setGuidanceScale: (g: number) => void;
    sampler: string;
    setSampler: (s: string) => void;
    scheduler: string;
    setScheduler: (s: string) => void;
    vae: string;
    onSetVae: (v: string) => void;
    clipEncoder: string;
    setClipEncoder: (c: string) => void;
    isAdvancedSampling: boolean;
    setIsAdvancedSampling: (v: boolean) => void;
    motionIntensity: number;
    setMotionIntensity: (i: number) => void;
    duration: number;
    setDuration: (d: number) => void;
    inputImage: string | null;
    setInputImage: (img: string | null) => void;
    referenceItemId: string | null;
    setReferenceItemId: (id: string | null) => void;
    temperature: number;
    setTemperature: (t: number) => void;
    useSearch: boolean;
    setUseSearch: (u: boolean) => void;
    selectedVoice: string;
    setSelectedVoice: (v: string) => void;
    enhance: boolean;
    setEnhance: (v: boolean) => void;
    nologo: boolean;
    setNologo: (v: boolean) => void;
    safe: boolean;
    setSafe: (v: boolean) => void;
    audio: boolean;
    setAudio: (a: boolean) => void;
    isPrivate: boolean;
    setIsPrivate: (v: boolean) => void;
    nofeed: boolean;
    setNofeed: (v: boolean) => void;
    dynamicParams: Record<string, any>;
    setDynamicParam: (key: string, value: any) => void;
    paramSchema: DynamicParam[];
    features: EngineFeatures;
    onOpenModelSelector: () => void;
    onOpenLoraSelector: () => void;
    onOpenEmbeddingSelector: () => void;
    onOpenControlNetSelector: () => void;
    onAddTriggerWord: (word: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    prompt: string;
}

export const LabSidebar: React.FC<LabSidebarProps> = (props) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isReferenceSelectorOpen, setIsReferenceSelectorOpen] = useState(false);
    const isAudioMode = props.mode === 'audio';
    
    const activeModelData = props.registry.find(m => m.id === props.model) || { 
        id: props.model, 
        label: String(props.model), 
        category: 'Visual', 
        icon: Activity, 
        color: 'text-indigo-400',
        ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
    } as any;
    const category = activeModelData.category;
    const showImageReferenceInput =
        (category === 'Motion' || category === 'Visual') &&
        props.features.showImageInput;
    const imageReferenceLabel = category === 'Motion' ? 'Image-to-Video' : 'Image-to-Image';

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                props.setInputImage(reader.result as string);
                props.setReferenceItemId(null);
            };
            reader.readAsDataURL(file);
        }
        if (e.target) {
            e.target.value = '';
        }
    };

    const handleReferenceAssetSelect = async (itemIds: string[]) => {
        const selectedId = itemIds[0];
        if (!selectedId) return;
        try {
            const item = await api.items.get(selectedId);
            const fileUrl = item?.currentRevision?.fileUrl || item?.currentRevision?.thumbnailLink || null;
            if (!fileUrl) return;
            props.setInputImage(fileUrl);
            props.setReferenceItemId(selectedId);
            setIsReferenceSelectorOpen(false);
        } catch (e) {
            console.error('Failed to attach reference asset', e);
        }
    };

    return (
        <>
        <div className="h-full w-full md:w-[400px] border-b md:border-b-0 md:border-r border-slate-800/50 flex flex-col bg-[#0c0c0c] relative shrink-0 z-20 overflow-hidden">
            {!isAudioMode && (
                <div className="p-4 border-b border-slate-800/50 flex items-center gap-2 bg-slate-900/10">
                    <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.25em]">Inference Console v1.4</h3>
                </div>
            )}
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-10 pb-20">
                {/* 1. NEURAL CORE CONFIG */}
                {!isAudioMode && (
                    <NeuralConfig 
                        model={props.model}
                        registry={props.registry}
                        onOpenModal={props.onOpenModelSelector}
                        onOpenLoraModal={props.onOpenLoraSelector}
                        onOpenEmbeddingModal={props.onOpenEmbeddingSelector}
                        onOpenControlNetModal={props.onOpenControlNetSelector}
                        onAddTriggerWord={props.onAddTriggerWord}
                        vae={props.vae}
                        onSetVae={props.onSetVae}
                    />
                )}

                {/* 1.5 GLOBAL CONSTRAINTS */}
                {!isAudioMode && (
                    <ConstraintConfig 
                        negativePrompt={props.negativePrompt} 
                        onSetNegativePrompt={props.setNegativePrompt} 
                        show={props.features.showNegativePrompt}
                    />
                )}

                <div className="h-px bg-slate-800/50 -mx-5" />

                {/* 2. STUDIO SETTINGS */}
                {!isAudioMode && (
                    <section className="space-y-8">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest px-1">Studio Config</h4>
                    
                    {showImageReferenceInput && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3 px-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                    <ImageIconLucide size={12} className="text-blue-400" /> Reference Image
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsReferenceSelectorOpen(true)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 hover:text-white"
                                >
                                    <FolderOpen size={12} />
                                    From Projects
                                </button>
                            </div>
                            <div 
                                onClick={() => !props.inputImage && fileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    const el = e.currentTarget as HTMLElement;
                                    el.classList.add('border-indigo-500', 'bg-indigo-500/10');
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    const el = e.currentTarget as HTMLElement;
                                    el.classList.remove('border-indigo-500', 'bg-indigo-500/10');
                                }}
                                onDrop={async (e) => {
                                    e.preventDefault();
                                    const el = e.currentTarget as HTMLElement;
                                    el.classList.remove('border-indigo-500', 'bg-indigo-500/10');
                                    const internalId = e.dataTransfer.getData('application/x-aimana-asset');
                                    if (internalId) {
                                        // api is now correctly imported
                                        const item = await api.items.get(internalId);
                                        if (item?.currentRevision?.fileUrl) {
                                            props.setInputImage(item.currentRevision.fileUrl);
                                            props.setReferenceItemId(internalId);
                                            return;
                                        }
                                    }
                                    const files = e.dataTransfer.files;
                                    if (files?.[0]) handleImageUpload({ target: { files } } as any);
                                }}
                                className={`relative group h-40 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden ${
                                    props.inputImage ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-800 bg-black/40 hover:border-blue-500/30 hover:bg-blue-500/5'
                                }`}
                            >
                                {props.inputImage ? (
                                    <>
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_55%)]" />
                                        <img src={props.inputImage} className="w-full h-full object-contain p-3 opacity-95" alt="Reference" />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 py-3">
                                            <div className="flex items-end justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/90">
                                                        {imageReferenceLabel}
                                                    </p>
                                                    <p className="mt-1 text-[9px] text-slate-300">
                                                        {props.referenceItemId ? 'Attached from project assets' : 'Attached from upload or drag and drop'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setIsReferenceSelectorOpen(true);
                                                        }}
                                                        className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-200 hover:bg-cyan-500/25"
                                                    >
                                                        Change
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); props.setInputImage(null); props.setReferenceItemId(null); }}
                                                        className="p-2.5 bg-red-600 text-white rounded-xl shadow-2xl hover:bg-red-500 transition-all active:scale-95"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center space-y-2">
                                        <div className="p-3 bg-slate-800 rounded-2xl text-slate-500 group-hover:text-blue-400 transition-colors mx-auto w-fit">
                                            <Upload size={24} />
                                        </div>
                                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{imageReferenceLabel}</p>
                                        <p className="text-[9px] text-slate-600 font-medium">Click to upload, drag and drop, or attach from projects</p>
                                        <div className="pt-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsReferenceSelectorOpen(true);
                                                }}
                                                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 hover:text-white"
                                            >
                                                <FolderOpen size={12} />
                                                Browse Projects
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </div>
                        </div>
                    )}

                    {/* 3. SPATIAL & RESOLUTION */}
                    {(props.features.showDimensions || props.features.showVideoRatio) && (category === 'Visual' || category === 'Motion') && (
                        <SpatialConfig {...props} activeModelData={activeModelData} paramSchema={props.paramSchema} />
                    )}

                    {/* 4. TEMPORAL & DYNAMIC LOGIC */}
                    <TemporalConfig 
                        category={category}
                        features={props.features}
                        paramSchema={props.paramSchema}
                        motionIntensity={props.motionIntensity}
                        setMotionIntensity={props.setMotionIntensity}
                        duration={props.duration}
                        setDuration={props.setDuration}
                        seed={props.seed}
                        setSeed={props.setSeed}
                        useSearch={props.useSearch}
                        setUseSearch={props.setUseSearch}
                        model={props.model}
                        hideSeed={isAudioMode}
                    />

                    {/* 5. ADVANCED & GATEWAY PROTOCOLS */}
                    <LabAdvancedSettings 
                        model={props.model}
                        seed={props.seed}
                        onSetSeed={props.setSeed}
                        negativePrompt={props.negativePrompt}
                        onSetNegativePrompt={props.setNegativePrompt}
                        category={category}
                        enhance={props.enhance}
                        setEnhance={props.setEnhance}
                        nologo={props.nologo}
                        setNologo={props.setNologo}
                        safe={props.safe}
                        setSafe={props.setSafe}
                        audio={props.audio}
                        setAudio={props.setAudio}
                        isPrivate={props.isPrivate}
                        setIsPrivate={props.setIsPrivate}
                        nofeed={props.nofeed}
                        setNofeed={props.setNofeed}
                        isPollinations={String(props.model).startsWith('pollinations-')}
                        dynamicParams={props.dynamicParams}
                        onSetDynamicParam={props.setDynamicParam}
                        paramSchema={props.paramSchema}
                        features={props.features}
                    />

                    {/* MODALITY SPECIFICS */}
                    {category === 'Audio' && !isAudioMode && (
                        <LabAudioSettings selectedVoice={props.selectedVoice} onSetVoice={props.setSelectedVoice} />
                    )}

                    {category === 'Language' && (
                        <LabLanguageSettings temperature={props.temperature} onSetTemperature={props.setTemperature} />
                    )}

                    {/* API PROTECTION OVERLAY */}
                    {isPaidGoogleModelId(props.model) && !props.hasApiKey && (
                        <div className="p-5 bg-amber-900/20 border border-amber-500/20 rounded-2xl space-y-3 shadow-xl shadow-amber-950/20">
                            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
                                <ShieldCheck size={14} /> Authorization Required
                            </div>
                            <p className="text-[10px] text-amber-200/80 leading-relaxed">Google image generation requires a billing-enabled Gemini API key and is not available on free tier.</p>
                            <button onClick={props.onSelectKey} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95">
                                <Key size={12} /> Select API Key
                            </button>
                        </div>
                    )}
                    </section>
                )}
            </div>
        </div>
        <ArtifactSelectorModal
            isOpen={isReferenceSelectorOpen}
            onClose={() => setIsReferenceSelectorOpen(false)}
            onSelect={handleReferenceAssetSelect}
            ingestContext="reference"
            allowMultiple={false}
        />
        </>
    );
};
