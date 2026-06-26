
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Wand2, Zap, Check, X, Loader2, Sparkles, AlertCircle, Settings2, Hash, ToggleLeft, ToggleRight, Sliders, Image, Compass, Clock, Lock, Upload, Ghost, Dices, ChevronDown, ShieldCheck, Ban, Film, Monitor, Smartphone } from 'lucide-react';
import { ItemWithCurrentRevision, Project } from '../../types';
import { useAiGeneration, STAGE_LABELS } from '../../hooks/useAiGeneration';
import { loadDynamicRegistry, ModelOption, SupportedEngine } from '../project/lab/ModelSelector/registry/index';
import { EngineFeatures, DynamicParamBlueprint } from '../../hooks/useEngineManagement';
import { LabSlider } from '../project/lab/LabSlider';
import { LabSamplingSettings } from '../project/lab/sidebar/LabSamplingSettings';
import { LabDimensionSelector } from '../project/lab/sidebar/LabDimensionSelector';
import { RATIO_CONFIG } from '../project/lab/LabSidebar';
import { getResolvedDimensions } from '../../services/pollinationsService';
import { api } from '../../services/api';
import { RefinementInputs } from './refinement/RefinementInputs';
import { DEFAULT_GOOGLE_IMAGE_MODEL, normalizeGoogleModelId } from '../../utils/googleModelIds';
import { ModelSelectorModal } from '../project/lab/ModelSelectorModal';

interface RefinementLabProps {
    item: ItemWithCurrentRevision;
    project: Project;
    onCommit: (base64: string, mimeType: string, prompt: string, engine: string, metadata: any) => Promise<void>;
}

const normalizeEngineFeatures = (raw: any, fallback: EngineFeatures): EngineFeatures => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const toBool = (value: any, defaultValue: boolean) => {
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
        return defaultValue;
    };

    return {
        showDimensions: toBool(source.showDimensions, fallback.showDimensions),
        showSeed: toBool(source.showSeed, fallback.showSeed),
        showNegativePrompt: toBool(source.showNegativePrompt, fallback.showNegativePrompt),
        showEnhancements: toBool(source.showEnhancements, fallback.showEnhancements),
        showNologo: toBool(source.showNologo, fallback.showNologo),
        showImageInput: toBool(source.showImageInput, fallback.showImageInput),
        showVideoRatio: toBool(source.showVideoRatio, fallback.showVideoRatio),
        showSampling: toBool(source.showSampling, fallback.showSampling ?? false),
        showGuidance: toBool(source.showGuidance, fallback.showGuidance ?? true)
    };
};

const parseJsonOrFallback = <T,>(raw: any, fallback: T): T => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    }
    return raw as T;
};

const deriveSupportedRatios = (modelData?: ModelOption, blueprint?: any): string[] => {
    if (Array.isArray(modelData?.ratios) && modelData!.ratios.length > 0) {
        return modelData!.ratios.filter((ratio) => Object.prototype.hasOwnProperty.call(RATIO_CONFIG, ratio));
    }

    const parsedConfig = parseJsonOrFallback<Record<string, any>>(blueprint?.configJson, {});
    const rawRatios = Array.isArray(parsedConfig?.supportedRatios) ? parsedConfig.supportedRatios : [];
    return rawRatios
        .map((ratio) => String(ratio || '').trim())
        .filter((ratio) => Object.prototype.hasOwnProperty.call(RATIO_CONFIG, ratio));
};

const clampRatioToRegistry = (requestedRatio: string, supportedRatios: string[], category: string): string => {
    const allowed = new Set([...(supportedRatios || []), 'custom']);
    if (requestedRatio && allowed.has(requestedRatio)) return requestedRatio;
    if (category === 'Motion') {
        if (supportedRatios.includes('16:9')) return '16:9';
        if (supportedRatios.includes('9:16')) return '9:16';
        return '16:9';
    }
    if (supportedRatios.includes('1:1')) return '1:1';
    return supportedRatios[0] || '1:1';
};

const createUndefinedModelOption = (engineId: string, category: 'Visual' | 'Motion'): ModelOption => ({
    id: engineId as SupportedEngine,
    label: `Undefined · ${engineId}`,
    desc: 'Original manifest engine is no longer available in Checkpoint Hub.',
    icon: AlertCircle,
    color: 'text-amber-400',
    limits: 'Legacy / unavailable',
    efficiency: 'History',
    provider: 'legacy',
    category,
    ratios: category === 'Motion' ? ['16:9', '9:16'] : ['3:4', '4:3', '1:1', '9:16', '16:9'],
    isCustom: false,
    isSystem: false,
    isTested: false
});

export const RefinementLab: React.FC<RefinementLabProps> = ({ item, project, onCommit }) => {
    const DEFAULT_ENGINE_FEATURES: EngineFeatures = {
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: true,
        showSampling: false,
        showGuidance: true,
        showImageInput: false,
        showVideoRatio: false
    };
    const currentRev = item.currentRevision;
    const [allModels, setAllModels] = useState<ModelOption[]>([]);
    const [isRegistryLoading, setIsRegistryLoading] = useState(true);
    const [features, setFeatures] = useState<EngineFeatures>(DEFAULT_ENGINE_FEATURES);

    const existingParams = useMemo(() => {
        if (!currentRev?.aiParameters) return null;
        try {
            const data = JSON.parse(currentRev.aiParameters);
            return data.advanced_params || data;
        } catch (e) { return null; }
    }, [currentRev]);

    const fallbackReferenceItemId = useMemo(() => {
        if (!existingParams) return null;
        if (typeof existingParams.referenceItemId === 'string' && existingParams.referenceItemId.trim()) {
            return existingParams.referenceItemId;
        }
        if (Array.isArray(existingParams.referenceItemIds) && existingParams.referenceItemIds.length > 0) {
            const first = existingParams.referenceItemIds[0];
            return typeof first === 'string' && first.trim() ? first : null;
        }
        return null;
    }, [existingParams]);

    const revisionDefaults = useMemo(() => ({
        prompt: currentRev?.prompt || '',
        model: normalizeGoogleModelId((currentRev?.engine as SupportedEngine) || (project.defaultEngine as SupportedEngine) || DEFAULT_GOOGLE_IMAGE_MODEL) as SupportedEngine,
        seed: existingParams?.seed || '',
        selectedRatio: existingParams?.ratio || '1:1',
        customWidth: existingParams?.resolvedWidth || existingParams?.width || 1024,
        customHeight: existingParams?.resolvedHeight || existingParams?.height || 1024,
        negativePrompt: existingParams?.negativePrompt || '',
        guidanceScale: existingParams?.guidance_scale || 7.5,
        samplingSteps: existingParams?.samplingSteps || 25,
        sampler: existingParams?.sampler || 'euler',
        scheduler: existingParams?.scheduler || 'simple',
        motionIntensity: existingParams?.motionIntensity || 50,
        duration: existingParams?.duration || 4,
        useSearch: existingParams?.useSearch ?? true,
        enhance: existingParams?.enhance ?? false,
        nologo: existingParams?.nologo ?? true,
        safe: existingParams?.safe ?? true,
        isPrivate: existingParams?.isPrivate ?? false,
        nofeed: existingParams?.nofeed ?? true,
        inputImage: existingParams?.inputImage || null,
        referenceItemId: fallbackReferenceItemId
    }), [currentRev, project.defaultEngine, existingParams, fallbackReferenceItemId]);

    const [prompt, setPrompt] = useState(revisionDefaults.prompt);
    const [model, setModel] = useState<SupportedEngine>(revisionDefaults.model);
    const [seed, setSeed] = useState(revisionDefaults.seed);
    const [selectedRatio, setSelectedRatio] = useState(revisionDefaults.selectedRatio);
    const [customWidth, setCustomWidth] = useState(revisionDefaults.customWidth);
    const [customHeight, setCustomHeight] = useState(revisionDefaults.customHeight);
    const [negativePrompt, setNegativePrompt] = useState(revisionDefaults.negativePrompt);
    const [guidanceScale, setGuidanceScale] = useState(revisionDefaults.guidanceScale);
    const [samplingSteps, setSamplingSteps] = useState(revisionDefaults.samplingSteps);
    const [sampler, setSampler] = useState(revisionDefaults.sampler);
    const [scheduler, setScheduler] = useState(revisionDefaults.scheduler);
    const [isAdvancedSampling, setIsAdvancedSampling] = useState(false);
    const [motionIntensity, setMotionIntensity] = useState(revisionDefaults.motionIntensity);
    const [duration, setDuration] = useState(revisionDefaults.duration);
    const [useSearch, setUseSearch] = useState(revisionDefaults.useSearch);
    const [enhance, setEnhance] = useState(revisionDefaults.enhance);
    const [nologo, setNologo] = useState(revisionDefaults.nologo);
    const [safe, setSafe] = useState(revisionDefaults.safe);
    const [isPrivate, setIsPrivate] = useState(revisionDefaults.isPrivate);
    const [nofeed, setNofeed] = useState(revisionDefaults.nofeed);
    const [inputImage, setInputImage] = useState<string | null>(revisionDefaults.inputImage);
    const [referenceItemId, setReferenceItemId] = useState<string | null>(revisionDefaults.referenceItemId);
    const [dynamicParams, setDynamicParams] = useState<Record<string, any>>({});
    const [uiSchema, setUiSchema] = useState<DynamicParamBlueprint[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const { generate, isGenerating, stage, result, error, reset } = useAiGeneration();
    const [isCommitting, setIsCommitting] = useState(false);
    const [commitError, setCommitError] = useState<string | null>(null);
    const [lastGeneratedSeed, setLastGeneratedSeed] = useState('');
    const [lastResolvedWidth, setLastResolvedWidth] = useState<number | null>(null);
    const [lastResolvedHeight, setLastResolvedHeight] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const targetCategory = currentRev?.mimeType?.startsWith('video/') ? 'Motion' : 'Visual';
    const compatibleModels = useMemo(
        () => allModels.filter((entry) => entry.category === targetCategory),
        [allModels, targetCategory]
    );
    const activeModelData = useMemo(() => compatibleModels.find(m => m.id === model), [compatibleModels, model]);
    const undefinedModelOption = useMemo(() => {
        if (!model) return null;
        if (compatibleModels.some((entry) => entry.id === model)) return null;
        return createUndefinedModelOption(model, targetCategory);
    }, [compatibleModels, model, targetCategory]);
    const selectableModels = useMemo(
        () => (undefinedModelOption ? [undefinedModelOption, ...compatibleModels] : compatibleModels),
        [undefinedModelOption, compatibleModels]
    );
    const selectedModelData = useMemo(
        () => selectableModels.find((entry) => entry.id === model) || null,
        [selectableModels, model]
    );
    const isUndefinedModel = !!undefinedModelOption && undefinedModelOption.id === model;
    const category = selectedModelData?.category || targetCategory;
    const hasSchemaGuidance = useMemo(() => uiSchema.some((p) => p.key === 'guidance_scale'), [uiSchema]);
    const hasSchemaVideoRatio = useMemo(() => uiSchema.some((p) => p.key === 'aspectRatio'), [uiSchema]);
    const hasSchemaDuration = useMemo(() => uiSchema.some((p) => p.key === 'duration'), [uiSchema]);
    const showVideoRatio = category === 'Motion' && features.showVideoRatio && !hasSchemaVideoRatio;
    const showDimensions = features.showDimensions && !(category === 'Motion' && showVideoRatio);
    const showImageInput = (category === 'Motion' || category === 'Visual') && features.showImageInput;
    const visibleUiSchema = useMemo(() => uiSchema.filter((p) => p.key !== 'image'), [uiSchema]);

    useEffect(() => {
        if (currentRev && !isOpen) {
            setPrompt(revisionDefaults.prompt);
            setModel(revisionDefaults.model);
            setSeed(revisionDefaults.seed);
            setSelectedRatio(revisionDefaults.selectedRatio);
            setCustomWidth(revisionDefaults.customWidth);
            setCustomHeight(revisionDefaults.customHeight);
            setNegativePrompt(revisionDefaults.negativePrompt);
            setGuidanceScale(revisionDefaults.guidanceScale);
            setSamplingSteps(revisionDefaults.samplingSteps);
            setSampler(revisionDefaults.sampler);
            setScheduler(revisionDefaults.scheduler);
            setMotionIntensity(revisionDefaults.motionIntensity);
            setDuration(revisionDefaults.duration);
            setUseSearch(revisionDefaults.useSearch);
            setEnhance(revisionDefaults.enhance);
            setNologo(revisionDefaults.nologo);
            setSafe(revisionDefaults.safe);
            setIsPrivate(revisionDefaults.isPrivate);
            setNofeed(revisionDefaults.nofeed);
            setInputImage(revisionDefaults.inputImage);
            setReferenceItemId(revisionDefaults.referenceItemId);
            setDynamicParams({});
            setUiSchema([]);
            setFeatures(DEFAULT_ENGINE_FEATURES);
            setShowAdvanced(false);
            setIsModelSelectorOpen(false);
            setCommitError(null);
        }
    }, [currentRev, isOpen, revisionDefaults]);

    useEffect(() => {
        if (!isOpen || inputImage || !fallbackReferenceItemId) return;
        let isCancelled = false;
        api.items.get(fallbackReferenceItemId)
            .then((referenceItem) => {
                if (isCancelled) return;
                const forgeReferenceUrl = referenceItem?.currentRevision?.fileUrl || null;
                if (forgeReferenceUrl) {
                    setInputImage(forgeReferenceUrl);
                    setReferenceItemId(fallbackReferenceItemId);
                }
            })
            .catch(() => {});
        return () => { isCancelled = true; };
    }, [isOpen, inputImage, fallbackReferenceItemId]);

    const refreshRegistry = useCallback(async () => {
        setIsRegistryLoading(true);
        try {
            const data = await loadDynamicRegistry();
            setAllModels(data);
            const compatible = data.filter((entry) => entry.category === targetCategory);
            const activeModel = compatible.find((entry) => entry.id === model);
            if (!activeModel && !model) {
                const fallback = compatible[0];
                if (fallback) setModel(fallback.id);
            }
        } finally {
            setIsRegistryLoading(false);
        }
    }, [targetCategory, model]);

    useEffect(() => {
        if (!isOpen) return;
        refreshRegistry();
        window.addEventListener('aimana-registry-updated', refreshRegistry);
        return () => window.removeEventListener('aimana-registry-updated', refreshRegistry);
    }, [isOpen, refreshRegistry]);

    const syncEngineLogic = useCallback(async () => {
        if (!model) return;
        const applyDefaultBlueprint = () => {
            setFeatures(DEFAULT_ENGINE_FEATURES);
            setUiSchema([]);
            setDynamicParams({});
        };
        try {
            const res = await fetch('/api/settings/registry', { headers: api.auth.getAuthHeaders() });
            if (res.ok) {
                const registryData = await res.json();
                const blueprint = registryData.find((e: any) => e.id === model);
                if (!blueprint) {
                    applyDefaultBlueprint();
                    return;
                }
                if (blueprint) {
                    const fallbackFeatures = {
                        ...DEFAULT_ENGINE_FEATURES,
                        showEnhancements: blueprint.provider === 'pollinations',
                        showNologo: blueprint.provider === 'pollinations'
                    };
                    const parsedFeatures = normalizeEngineFeatures(
                        parseJsonOrFallback<Record<string, any> | null>(blueprint.featuresJson, null),
                        fallbackFeatures
                    );
                    setFeatures(parsedFeatures);

                    const schema = Array.isArray(parseJsonOrFallback<any[]>(blueprint.uiConfigJson, []))
                        ? parseJsonOrFallback<DynamicParamBlueprint[]>(blueprint.uiConfigJson, [])
                        : [];
                    setUiSchema(schema);
                    setDynamicParams(prev => {
                        const next: Record<string, any> = {};
                        schema.forEach((p) => {
                            next[p.key] = existingParams?.[p.key] ?? prev[p.key] ?? p.default;
                        });
                        return next;
                    });

                    const schemaAspectRatio = schema.find((p) => p.key === 'aspectRatio');
                    if (schemaAspectRatio) {
                        const preferredRatio = String(existingParams?.aspectRatio || existingParams?.ratio || schemaAspectRatio.default || selectedRatio || '1:1');
                        setSelectedRatio(preferredRatio);
                    } else {
                        const supportedRatios = deriveSupportedRatios(selectedModelData || activeModelData || undefined, blueprint);
                        setSelectedRatio((prev: string) => clampRatioToRegistry(prev || revisionDefaults.selectedRatio, supportedRatios, blueprint.category || category));
                    }

                    const schemaDuration = schema.find((p) => p.key === 'duration');
                    if (schemaDuration) {
                        const nextDuration = Number(existingParams?.duration ?? schemaDuration.default ?? duration);
                        if (Number.isFinite(nextDuration)) setDuration(nextDuration);
                    }

                    const schemaImage = schema.find((p) => p.key === 'image');
                    if (schemaImage) {
                        const nextImage = existingParams?.image || existingParams?.inputImage || schemaImage.default || inputImage || null;
                        setInputImage(nextImage ? String(nextImage) : null);
                    } else if (!parsedFeatures.showImageInput) {
                        setInputImage(null);
                        setReferenceItemId(null);
                    }

                    if (!negativePrompt.trim() && blueprint.defaultNegativePrompt) {
                        setNegativePrompt(blueprint.defaultNegativePrompt);
                    }
                }
            }
        } catch (e) {
            applyDefaultBlueprint();
            console.error("Refinement Lab: Engine sync failed", e);
        }
    }, [model, existingParams, selectedModelData, activeModelData, revisionDefaults.selectedRatio, category, selectedRatio, duration, inputImage, negativePrompt]);

    useEffect(() => { syncEngineLogic(); }, [syncEngineLogic]);

    useEffect(() => {
        if (!showImageInput) {
            setInputImage(null);
            setReferenceItemId(null);
        }
    }, [showImageInput]);

    const buildExecutionDynamicParams = useCallback(() => {
        const params: Record<string, any> = { ...dynamicParams };

        if (!hasSchemaGuidance && category === 'Visual' && features.showGuidance) {
            params.guidance_scale = guidanceScale;
        }
        if (category === 'Visual' && features.showSampling) {
            params.samplingSteps = samplingSteps;
            params.sampler = sampler;
            params.scheduler = scheduler;
        }
        if (category === 'Motion') {
            params.motionIntensity = motionIntensity;
        }
        if (features.showEnhancements) {
            params.enhance = enhance;
            params.safe = safe;
            params.isPrivate = isPrivate;
            params.nofeed = nofeed;
        } else {
            delete params.enhance;
            delete params.safe;
            delete params.isPrivate;
            delete params.nofeed;
        }
        if (features.showNologo) {
            params.nologo = nologo;
        } else {
            delete params.nologo;
        }
        if (showImageInput) {
            if (inputImage) params.image = inputImage;
        } else {
            delete params.image;
        }
        if (hasSchemaVideoRatio) {
            params.aspectRatio = selectedRatio;
        }
        return params;
    }, [
        dynamicParams,
        hasSchemaGuidance,
        category,
        features.showGuidance,
        guidanceScale,
        features.showSampling,
        samplingSteps,
        sampler,
        scheduler,
        motionIntensity,
        features.showEnhancements,
        enhance,
        safe,
        isPrivate,
        nofeed,
        features.showNologo,
        nologo,
        showImageInput,
        inputImage,
        hasSchemaVideoRatio,
        selectedRatio
    ]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setInputImage(reader.result as string);
            setReferenceItemId(null);
        };
        reader.readAsDataURL(file);
    };

    const handleGenerate = () => {
        setCommitError(null);
        let finalSeed = seed;
        if (!finalSeed && features.showSeed) {
            finalSeed = Math.floor(Math.random() * 10000000).toString();
            setSeed(finalSeed);
        }
        setLastGeneratedSeed(finalSeed);
        const apiRatio = RATIO_CONFIG[selectedRatio]?.apiValue || RATIO_CONFIG['1:1'].apiValue;
        const { width, height } = getResolvedDimensions(
            apiRatio,
            selectedRatio === 'custom' ? customWidth : undefined,
            selectedRatio === 'custom' ? customHeight : undefined
        );
        setLastResolvedWidth(width);
        setLastResolvedHeight(height);
        const executionDynamicParams = buildExecutionDynamicParams();
        
        generate(prompt, model, selectedRatio, width, height, {
            negativePrompt: features.showNegativePrompt ? negativePrompt : '',
            seed: finalSeed, 
            duration, 
            useSearch, 
            ratio: selectedRatio,
            inputImage: showImageInput ? inputImage : null,
            referenceItemId: showImageInput ? referenceItemId : null,
            skipAutoSave: true,
            dynamicParams: executionDynamicParams,
        });
    };

    const handleCommit = async () => {
        if (!result) return;
        setIsCommitting(true);
        try {
            const modelData = allModels.find(m => m.id === model);
            const executionDynamicParams = buildExecutionDynamicParams();
            const metadata = {
                refinement: true, 
                parent_revision: currentRev?.id, 
                engine_label: modelData?.label || model,
                source: 'aesthetic_refinement',
                timestamp: new Date().toISOString(),
                advanced_params: {
                    ...executionDynamicParams, 
                    seed: lastGeneratedSeed || seed, 
                    negativePrompt: features.showNegativePrompt ? negativePrompt : '', 
                    duration, 
                    ratio: selectedRatio,
                    ui_ratio_label: RATIO_CONFIG[selectedRatio]?.label || selectedRatio,
                    resolvedWidth: lastResolvedWidth ?? customWidth,
                    resolvedHeight: lastResolvedHeight ?? customHeight,
                    useSearch, 
                    ...(showImageInput ? { inputImage, referenceItemId } : {}),
                    engine_id: model, 
                    iteration_source: 'neural_refinement'
                }
            };
            if ((result as any)?.pollenUsed) {
                (metadata as any).pollenUsed = (result as any).pollenUsed;
            }
            await onCommit(result.base64, result.mimeType, prompt, model, metadata);
            reset(); 
            setIsOpen(false);
            setCommitError(null);
        } catch (e: any) {
            setCommitError(e?.message || 'Revision commit failed.');
        } finally { setIsCommitting(false); }
    };

    if (!isOpen) {
        return (
            <button onClick={() => setIsOpen(true)} className="w-full py-4 px-6 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-between group transition-all">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600/20 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform"><Wand2 size={18} /></div>
                    <div className="text-left">
                        <p className="text-xs font-black text-indigo-300 uppercase tracking-widest">Neural Refinement</p>
                        <p className="text-[10px] text-slate-500 font-medium">Iterate this asset using Hub Registry</p>
                    </div>
                </div>
                <Zap size={14} className="text-indigo-500 opacity-50 group-hover:opacity-100 group-hover:rotate-12 transition-all" />
            </button>
        );
    }

    return (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in slide-in-from-top-2">
            <div className="p-4 border-b border-slate-800 bg-indigo-500/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Iteration Lab</span>
                </div>
                <button onClick={() => { setIsOpen(false); setCommitError(null); reset(); }} className="text-slate-500 hover:text-white transition-colors p-1"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4">
                <RefinementInputs 
                    prompt={prompt} onSetPrompt={setPrompt} model={model}
                    isGenerating={isGenerating}
                    isRegistryLoading={isRegistryLoading}
                    allModels={selectableModels}
                    isModelUnavailable={isUndefinedModel}
                    onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                    onGenerate={handleGenerate}
                />

                <div className="pt-1">
                    <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-indigo-400 transition-colors">
                        <Settings2 size={12} className={showAdvanced ? 'rotate-90 text-indigo-400' : ''} /> Refinement Controls
                    </button>
                    {showAdvanced && (
                        <div className="mt-3 space-y-8 p-6 bg-slate-950/50 border border-slate-800 rounded-3xl animate-in slide-in-from-top-2 overflow-y-auto max-h-[450px] custom-scrollbar shadow-inner">
                            
                            {features.showSeed && (
                                <div className="space-y-2">
                                    <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest px-1"><Hash size={12} className="text-indigo-400" /> Deterministic Seed</label>
                                    <div className="relative group">
                                        <input 
                                            type="text" 
                                            value={seed} 
                                            onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} 
                                            className="w-full bg-[#161616] border border-slate-800 rounded-xl py-3 pl-4 pr-24 text-sm text-indigo-400 font-mono outline-none focus:border-indigo-500/50 transition-all shadow-inner placeholder:text-slate-800" 
                                            placeholder="Inference: Randomized" 
                                        />
                                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                            {seed && (
                                                <button 
                                                    onClick={() => setSeed('')}
                                                    className="p-2 text-slate-600 hover:text-red-400 transition-colors bg-black/40 rounded-lg border border-white/5"
                                                    title="Clear Seed"
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => setSeed(Math.floor(Math.random() * 10000000).toString())}
                                                className="p-2 text-slate-600 hover:text-indigo-400 transition-colors bg-black/40 rounded-lg border border-white/5"
                                                title="Randomize Seed"
                                            >
                                                <Dices size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter px-1">Deterministic results require a fixed seed value.</p>
                                </div>
                            )}

                            {(showDimensions || showVideoRatio) && (
                                <div className="space-y-4">
                                    {showDimensions && (
                                        <LabDimensionSelector
                                            ratios={activeModelData?.ratios || ['1:1', '3:4', '4:3', 'custom']}
                                            selectedRatio={selectedRatio}
                                            onSetRatio={setSelectedRatio}
                                            customWidth={customWidth}
                                            setCustomWidth={setCustomWidth}
                                            customHeight={customHeight}
                                            setCustomHeight={setCustomHeight}
                                        />
                                    )}
                                    {showVideoRatio && (
                                        <div className="space-y-3 animate-in slide-in-from-top-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                                <Film size={12} className="text-blue-400" /> Video Topology
                                            </label>
                                            <div className="grid grid-cols-2 bg-[#161616] border border-slate-800 rounded-xl overflow-hidden p-1 gap-1">
                                                <button
                                                    onClick={() => setSelectedRatio('16:9')}
                                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${selectedRatio === '16:9' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                                >
                                                    <Monitor size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-tighter">Cinematic 16:9</span>
                                                </button>
                                                <button
                                                    onClick={() => setSelectedRatio('9:16')}
                                                    className={`flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all ${selectedRatio === '9:16' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                                >
                                                    <Smartphone size={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-tighter">Portrait 9:16</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {showImageInput && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                        <Image size={12} className="text-blue-400" /> Reference Image
                                    </label>
                                    <div
                                        onClick={() => !inputImage && fileInputRef.current?.click()}
                                        className={`relative group h-40 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden ${inputImage ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-800 bg-black/40 hover:border-blue-500/30 hover:bg-blue-500/5'}`}
                                    >
                                        {inputImage ? (
                                            <>
                                                <img src={inputImage} className="w-full h-full object-cover opacity-80" alt="Reference" />
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setInputImage(null); setReferenceItemId(null); }}
                                                        className="p-3 bg-red-600 text-white rounded-full shadow-2xl hover:bg-red-500 transition-all active:scale-95"
                                                    >
                                                        <X size={20} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center space-y-2">
                                                <div className="p-3 bg-slate-800 rounded-2xl text-slate-500 group-hover:text-blue-400 transition-colors mx-auto w-fit">
                                                    <Upload size={24} />
                                                </div>
                                                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Image-to-Video</p>
                                                <p className="text-[9px] text-slate-600 font-medium">Click to upload</p>
                                            </div>
                                        )}
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                    </div>
                                </div>
                            )}

                            {category === 'Motion' && !hasSchemaDuration && (
                                <div className="space-y-2">
                                    <LabSlider label="Clip Duration" value={duration} min={1} max={10} step={1} onChange={setDuration} icon={Clock} unit="s" />
                                </div>
                            )}

                            {features.showNegativePrompt && (
                                <div className="space-y-2">
                                    <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest px-1"><Ban size={12} className="text-red-500" /> Avoidance Context</label>
                                    <textarea 
                                        value={negativePrompt} 
                                        onChange={(e) => setNegativePrompt(e.target.value)} 
                                        className="w-full h-24 bg-[#161616] border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-300 outline-none resize-none focus:border-red-500/30 shadow-inner placeholder:text-slate-800 leading-relaxed" 
                                        placeholder="blur, text, low quality, watermark..." 
                                    />
                                </div>
                            )}

                            {features.showEnhancements && (
                                <div className="space-y-4">
                                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest px-1"><ShieldCheck size={12} className="text-cyan-400" /> Gateway Protocol</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => setEnhance(!enhance)} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${enhance ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}>
                                            <div className="flex items-center gap-2"><Wand2 size={14}/><span className="text-[9px] font-black uppercase">Enhance</span></div>
                                            {enhance ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                        <button onClick={() => setSafe(!safe)} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${safe ? 'bg-blue-600/10 border-blue-500/40 text-blue-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}>
                                            <div className="flex items-center gap-2"><ShieldCheck size={14}/><span className="text-[9px] font-black uppercase">Safe</span></div>
                                            {safe ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                        <button onClick={() => setIsPrivate(!isPrivate)} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${isPrivate ? 'bg-purple-600/10 border-purple-500/40 text-purple-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}>
                                            <div className="flex items-center gap-2"><Lock size={14}/><span className="text-[9px] font-black uppercase">Private</span></div>
                                            {isPrivate ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                        <button onClick={() => setNofeed(!nofeed)} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${nofeed ? 'bg-rose-600/10 border-rose-500/40 text-rose-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}>
                                            <div className="flex items-center gap-2"><Ghost size={14}/><span className="text-[9px] font-black uppercase">No Feed</span></div>
                                            {nofeed ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {features.showNologo && (
                                <div className="space-y-4">
                                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest px-1"><Image size={12} className="text-emerald-400" /> Output Guardrails</label>
                                    <button onClick={() => setNologo(!nologo)} className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all ${nologo ? 'bg-emerald-600/10 border-emerald-500/40 text-emerald-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}>
                                        <div className="flex items-center gap-2"><Image size={16} /><span className="text-[10px] font-black uppercase tracking-widest ml-1">Watermark Removal (No Logo)</span></div>
                                        {nologo ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                    </button>
                                </div>
                            )}

                            <div className="h-px bg-slate-800 -mx-6" />

                            <div className="space-y-6">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest px-1"><Sliders size={12} className="text-indigo-400" /> Neural Fine-Tuning</label>
                                
                                {category === 'Visual' && features.showGuidance && !features.showSampling && !hasSchemaGuidance && (
                                    <div className="p-1">
                                        <LabSlider label="Prompt Guidance" value={guidanceScale} min={1} max={30} step={0.5} onChange={setGuidanceScale} icon={Compass} />
                                    </div>
                                )}

                                {category === 'Visual' && features.showSampling && !hasSchemaGuidance && (
                                    <LabSamplingSettings 
                                        isAdvanced={isAdvancedSampling} onToggleAdvanced={setIsAdvancedSampling}
                                        sampler={sampler} onSetSampler={setSampler}
                                        scheduler={scheduler} onSetScheduler={setScheduler}
                                        steps={samplingSteps} onSetSteps={setSamplingSteps}
                                        guidance={guidanceScale} onSetGuidance={setGuidanceScale}
                                    />
                                )}

                                <div className="space-y-6">
                                    {visibleUiSchema.map(p => {
                                        const val = dynamicParams[p.key] ?? p.default;
                                        return (
                                            <div key={p.key} className="animate-in fade-in">
                                                {p.type === 'slider' && (
                                                    <LabSlider label={p.label} value={val} min={p.min || 0} max={p.max || 100} step={p.step} onChange={(v) => setDynamicParams(prev => ({...prev, [p.key]: v}))} icon={Sliders} />
                                                )}
                                                {p.type === 'toggle' && (
                                                    <button 
                                                        onClick={() => setDynamicParams(prev => ({ ...prev, [p.key]: !val }))}
                                                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${val ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-400' : 'bg-black/40 border-slate-800 text-slate-600'}`}
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{p.label}</span>
                                                        {val ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                    </button>
                                                )}
                                                {p.type === 'select' && (
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">{p.label}</label>
                                                        <div className="relative group">
                                                            <select 
                                                                value={val}
                                                                onChange={(e) => setDynamicParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                                                                className="w-full appearance-none bg-black/40 border border-slate-800 rounded-xl py-3 px-4 text-xs font-bold text-slate-300 outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                                            >
                                                                {p.options?.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 group-hover:text-indigo-400 transition-colors pointer-events-none" />
                                                        </div>
                                                    </div>
                                                )}
                                                {p.type === 'text' && (
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">{p.label}</label>
                                                        <input 
                                                            type="text"
                                                            value={val}
                                                            onChange={(e) => setDynamicParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                                                            className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-800"
                                                            placeholder="Parameter value..."
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {isGenerating && (
                    <div className="py-12 flex flex-col items-center justify-center gap-4 animate-in fade-in">
                        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] animate-pulse">{STAGE_LABELS[stage]}</p>
                    </div>
                )}

                {result && !isGenerating && (
                    <div className="space-y-4 animate-in zoom-in-[0.95] duration-500">
                        <div className="relative group rounded-3xl overflow-hidden border border-white/5 shadow-2xl bg-black aspect-square">
                            {result.mimeType.startsWith('video/') ? (
                                <video src={`data:${result.mimeType};base64,${result.base64}`} className="w-full h-full object-cover" autoPlay loop muted />
                            ) : (
                                <img src={`data:${result.mimeType};base64,${result.base64}`} className="w-full h-full object-contain" alt="Result" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={reset} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Discard</button>
                            <button onClick={handleCommit} disabled={isCommitting} className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95">
                                {isCommitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Commit Version
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-2xl flex items-start gap-3 text-red-400 animate-in shake">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <p className="text-[10px] font-medium leading-relaxed">{error.message}</p>
                    </div>
                )}

                {commitError && (
                    <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-2xl flex items-start gap-3 text-red-400 animate-in shake">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <p className="text-[10px] font-medium leading-relaxed">{commitError}</p>
                    </div>
                )}
            </div>

            {isModelSelectorOpen && (
                <ModelSelectorModal
                    isOpen={isModelSelectorOpen}
                    onClose={() => setIsModelSelectorOpen(false)}
                    currentModel={model}
                    onSelect={(id) => {
                        setModel(id);
                        setIsModelSelectorOpen(false);
                    }}
                    forcedCategory={targetCategory}
                />
            )}
        </div>
    );
};
