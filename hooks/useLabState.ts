
import { useState, useEffect, useRef, useCallback } from 'react';
import { SupportedEngine } from '../components/project/lab/ModelSelector/types';
import { api } from '../services/api';
import { EngineFeatures } from './useEngineManagement';
import { DEFAULT_GOOGLE_IMAGE_MODEL, normalizeGoogleModelId } from '../utils/googleModelIds';

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export interface DynamicParam {
    key: string;
    label: string;
    type: 'slider' | 'toggle' | 'text' | 'textarea' | 'select';
    min?: number;
    max?: number;
    step?: number;
    default: any;
    options?: { label: string, value: any }[];
    description?: string;
}

const STORAGE_KEY = 'aimana_lab_cache';
const DEFAULT_ENGINE_FEATURES: EngineFeatures = {
    showDimensions: true,
    showSeed: true,
    showNegativePrompt: true,
    showEnhancements: true,
    showNologo: true,
    showImageInput: false,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: true
};

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

const ensureScribeTranscriptionSchema = (schema: DynamicParam[], engine: any): DynamicParam[] => {
    const normalizedUpstreamId = String(engine?.upstreamId || engine?.id || '').trim().toLowerCase();
    const isScribeModel = normalizedUpstreamId === 'scribe' || normalizedUpstreamId === 'scribe_v2';
    const isAudioCategory = String(engine?.category || '').trim().toLowerCase() === 'audio';
    if (!isScribeModel || !isAudioCategory) return schema;

    const next = Array.isArray(schema) ? [...schema] : [];
    const existingKeys = new Set(next.map((param) => String(param?.key || '').trim()));

    if (!existingKeys.has('diarize')) {
        next.push({
            key: 'diarize',
            label: 'Speaker Diarization',
            type: 'toggle',
            default: false,
            description: 'Detect and label who is speaking. Structured formats work best for preserving speaker metadata.'
        });
    }
    if (!existingKeys.has('num_speakers')) {
        next.push({
            key: 'num_speakers',
            label: 'Max Speakers',
            type: 'text',
            default: '',
            description: 'Optional maximum speaker count between 1 and 32. Leave empty for automatic detection.'
        });
    }
    if (!existingKeys.has('diarization_threshold')) {
        next.push({
            key: 'diarization_threshold',
            label: 'Diarization Threshold',
            type: 'text',
            default: '',
            description: 'Optional 0.10 to 0.40 tuning value. Leave empty for the model default. Only used when Max Speakers is empty.'
        });
    }

    return next;
};

interface LabState {
    model: SupportedEngine;
    setModel: (m: SupportedEngine) => void;
    prompt: string;
    setPrompt: (p: string) => void;
    title: string;
    setTitle: (t: string) => void;
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
    
    // Professional Sampling Params
    samplingSteps: number;
    setSamplingSteps: (s: number) => void;
    guidanceScale: number;
    setGuidanceScale: (g: number) => void;
    sampler: string;
    setSampler: (s: string) => void;
    scheduler: string;
    setScheduler: (s: string) => void;
    vae: string;
    setVae: (v: string) => void;
    clipEncoder: string;
    setClipEncoder: (c: string) => void;
    isAdvancedSampling: boolean;
    setIsAdvancedSampling: (v: boolean) => void;

    motionIntensity: number;
    setMotionIntensity: (i: number) => void;
    duration: number;
    setDuration: (d: number) => void;
    audio: boolean;
    setAudio: (a: boolean) => void;
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
    isPrivate: boolean;
    setIsPrivate: (v: boolean) => void;
    nofeed: boolean;
    setNofeed: (v: boolean) => void;
    dynamicParams: Record<string, any>;
    setDynamicParam: (key: string, value: any) => void;
    paramSchema: DynamicParam[];
    features: EngineFeatures;
    chatHistory: ChatMessage[];
    setChatHistory: (h: ChatMessage[]) => void;
}

export const useLabState = (initialModel?: SupportedEngine): LabState => {
    const getCached = () => {
        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            return cached ? JSON.parse(cached) : {};
        } catch (e) {
            return {};
        }
    };

    const cacheRef = useRef<any>(getCached());
    const cache = cacheRef.current;

    const [model, setModelState] = useState<SupportedEngine>(
        normalizeGoogleModelId(initialModel || cache.model || DEFAULT_GOOGLE_IMAGE_MODEL) as SupportedEngine
    );
    const [prompt, setPrompt] = useState(cache.prompt || '');
    const [title, setTitle] = useState(cache.title || '');
    const [selectedRatio, setSelectedRatio] = useState<string>(cache.selectedRatio || "1:1");
    const [customWidth, setCustomWidth] = useState(cache.customWidth || 1024);
    const [customHeight, setCustomHeight] = useState(cache.customHeight || 1024);
    
    const [negativePrompt, setNegativePrompt] = useState(cache.negativePrompt || '');
    const [seed, setSeed] = useState(cache.seed || '');

    const [samplingSteps, setSamplingSteps] = useState(cache.samplingSteps || 25);
    const [guidanceScale, setGuidanceScale] = useState(cache.guidanceScale || 3.5);
    const [sampler, setSampler] = useState(cache.sampler || 'euler');
    const [scheduler, setScheduler] = useState(cache.scheduler || 'simple');
    const [vae, setVae] = useState(cache.vae || 'ae.sft');
    const [clipEncoder, setClipEncoder] = useState(cache.clipEncoder || '');
    const [isAdvancedSampling, setIsAdvancedSampling] = useState(cache.isAdvancedSampling || false);
    
    const [motionIntensity, setMotionIntensity] = useState(cache.motionIntensity || 50);
    const [duration, setDuration] = useState(cache.duration || 4);
    const [audio, setAudio] = useState(cache.audio || false);
    const [inputImage, setInputImage] = useState<string | null>(cache.inputImage || null);
    const [referenceItemId, setReferenceItemId] = useState<string | null>(cache.referenceItemId || null);
    const [temperature, setTemperature] = useState(cache.temperature || 0.7);
    const [useSearch, setUseSearch] = useState(cache.useSearch ?? true);
    const [selectedVoice, setSelectedVoice] = useState(cache.selectedVoice || 'Kore');
    const [enhance, setEnhance] = useState(cache.enhance || false);
    const [nologo, setNologo] = useState(cache.nologo ?? true);
    const [safe, setSafe] = useState(cache.safe ?? true);
    const [isPrivate, setIsPrivate] = useState(cache.isPrivate || false);
    const [nofeed, setNofeed] = useState(cache.nofeed ?? true);

    const [dynamicParams, setDynamicParams] = useState<Record<string, any>>(cache.dynamicParams || {});
    const [paramSchema, setParamSchema] = useState<DynamicParam[]>([]);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>(cache.chatHistory || []);
    
    const [features, setFeatures] = useState<EngineFeatures>({
        ...DEFAULT_ENGINE_FEATURES
    });

    const initialLoadDone = useRef(false);
    const remoteLoadedRef = useRef(false);
    const setModel = (nextModel: SupportedEngine) => {
        setModelState(normalizeGoogleModelId(nextModel) as SupportedEngine);
    };

    const applyCachedState = useCallback((nextCache: any) => {
        if (!nextCache || typeof nextCache !== 'object') return;
        if (nextCache.model) setModelState(normalizeGoogleModelId(nextCache.model) as SupportedEngine);
        if (typeof nextCache.prompt === 'string') setPrompt(nextCache.prompt);
        if (typeof nextCache.title === 'string') setTitle(nextCache.title);
        if (typeof nextCache.selectedRatio === 'string') setSelectedRatio(nextCache.selectedRatio);
        if (Number.isFinite(nextCache.customWidth)) setCustomWidth(Number(nextCache.customWidth));
        if (Number.isFinite(nextCache.customHeight)) setCustomHeight(Number(nextCache.customHeight));
        if (typeof nextCache.negativePrompt === 'string') setNegativePrompt(nextCache.negativePrompt);
        if (typeof nextCache.seed === 'string') setSeed(nextCache.seed);
        if (Number.isFinite(nextCache.samplingSteps)) setSamplingSteps(Number(nextCache.samplingSteps));
        if (Number.isFinite(nextCache.guidanceScale)) setGuidanceScale(Number(nextCache.guidanceScale));
        if (typeof nextCache.sampler === 'string') setSampler(nextCache.sampler);
        if (typeof nextCache.scheduler === 'string') setScheduler(nextCache.scheduler);
        if (typeof nextCache.vae === 'string') setVae(nextCache.vae);
        if (typeof nextCache.clipEncoder === 'string') setClipEncoder(nextCache.clipEncoder);
        if (typeof nextCache.isAdvancedSampling === 'boolean') setIsAdvancedSampling(nextCache.isAdvancedSampling);
        if (Number.isFinite(nextCache.motionIntensity)) setMotionIntensity(Number(nextCache.motionIntensity));
        if (Number.isFinite(nextCache.duration)) setDuration(Number(nextCache.duration));
        if (typeof nextCache.audio === 'boolean') setAudio(nextCache.audio);
        if (typeof nextCache.inputImage === 'string' || nextCache.inputImage === null) setInputImage(nextCache.inputImage ?? null);
        if (typeof nextCache.referenceItemId === 'string' || nextCache.referenceItemId === null) setReferenceItemId(nextCache.referenceItemId ?? null);
        if (Number.isFinite(nextCache.temperature)) setTemperature(Number(nextCache.temperature));
        if (typeof nextCache.useSearch === 'boolean') setUseSearch(nextCache.useSearch);
        if (typeof nextCache.selectedVoice === 'string') setSelectedVoice(nextCache.selectedVoice);
        if (typeof nextCache.enhance === 'boolean') setEnhance(nextCache.enhance);
        if (typeof nextCache.nologo === 'boolean') setNologo(nextCache.nologo);
        if (typeof nextCache.safe === 'boolean') setSafe(nextCache.safe);
        if (typeof nextCache.isPrivate === 'boolean') setIsPrivate(nextCache.isPrivate);
        if (typeof nextCache.nofeed === 'boolean') setNofeed(nextCache.nofeed);
        if (nextCache.dynamicParams && typeof nextCache.dynamicParams === 'object') setDynamicParams(nextCache.dynamicParams);
        if (Array.isArray(nextCache.chatHistory)) setChatHistory(nextCache.chatHistory);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const syncFromDatabase = async () => {
            try {
                const remote = await api.settings.getLabWorkspaceState();
                const remoteState = remote?.state && typeof remote.state === 'object' ? remote.state : null;
                const localState = cache && typeof cache === 'object' ? cache : null;
                if (!remoteState && localState && Object.keys(localState).length > 0) {
                    await api.settings.replaceLabWorkspaceState(localState);
                    if (!cancelled) applyCachedState(localState);
                } else if (remoteState && !cancelled) {
                    applyCachedState(remoteState);
                }
            } catch {
                // local cache remains the fallback
            } finally {
                remoteLoadedRef.current = true;
            }
        };
        void syncFromDatabase();
        return () => {
            cancelled = true;
        };
    }, [applyCachedState, cache]);

    useEffect(() => {
        const settingsToCache = {
            model, prompt, title, selectedRatio, customWidth, customHeight,
            negativePrompt, seed, samplingSteps, guidanceScale, sampler,
            scheduler, vae, clipEncoder, isAdvancedSampling, motionIntensity,
            duration, audio, inputImage, referenceItemId, temperature, useSearch, selectedVoice,
            enhance, nologo, safe, isPrivate, nofeed, dynamicParams, chatHistory
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToCache));
        if (!remoteLoadedRef.current) return;
        const timer = window.setTimeout(() => {
            void api.settings.replaceLabWorkspaceState(settingsToCache).catch(() => {
                // local cache remains the fallback
            });
        }, 500);
        return () => window.clearTimeout(timer);
    }, [
        model, prompt, title, selectedRatio, customWidth, customHeight,
        negativePrompt, seed, samplingSteps, guidanceScale, sampler,
        scheduler, vae, clipEncoder, isAdvancedSampling, motionIntensity,
        duration, audio, inputImage, referenceItemId, temperature, useSearch, selectedVoice,
        enhance, nologo, safe, isPrivate, nofeed, dynamicParams, chatHistory
    ]);

    const loadEngineBlueprint = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/registry', { headers: api.auth.getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                const engine = data.find((e: any) => e.id === model);
                
                if (engine) {
                    if (!negativePrompt.trim() && engine.defaultNegativePrompt) {
                        setNegativePrompt(engine.defaultNegativePrompt);
                    }
                    
                    initialLoadDone.current = true;

                    const pollinationsDefaults: EngineFeatures = {
                        ...DEFAULT_ENGINE_FEATURES,
                        showEnhancements: engine.provider === 'pollinations',
                        showNologo: engine.provider === 'pollinations'
                    };
                    const parsedFeatures = (() => {
                        if (!engine.featuresJson) return null;
                        try {
                            return typeof engine.featuresJson === 'string'
                                ? JSON.parse(engine.featuresJson)
                                : engine.featuresJson;
                        } catch (e) {
                            return null;
                        }
                    })();
                    setFeatures(normalizeEngineFeatures(parsedFeatures, pollinationsDefaults));

                    if (engine.uiConfigJson) {
                        const rawSchema = (typeof engine.uiConfigJson === 'string'
                            ? JSON.parse(engine.uiConfigJson)
                            : engine.uiConfigJson) as DynamicParam[];
                        const schema = ensureScribeTranscriptionSchema(rawSchema, engine);
                        setParamSchema(schema);
                        
                        setDynamicParams(prev => {
                            const next = { ...prev };
                            schema.forEach(p => {
                                const options = Array.isArray(p.options) ? p.options : [];
                                const hasValidOption = options.some((option) => String(option.value) === String(next[p.key]));
                                if (next[p.key] === undefined) {
                                    next[p.key] = p.default;
                                } else if (p.type === 'select' && options.length > 0 && !hasValidOption) {
                                    next[p.key] = p.default;
                                }
                            });
                            return next;
                        });

                        const voiceParam = schema.find((p) => p.key === 'voiceName');
                        const schemaVoices = voiceParam?.options?.map((o) => String(o.value)) || [];
                        const engineVoices = Array.isArray(engine.textVoices) ? engine.textVoices.map((v: any) => String(v)) : [];
                        const mergedVoices = schemaVoices.length > 0 ? schemaVoices : engineVoices;
                        if (mergedVoices.length > 0) {
                            const fallbackVoice = voiceParam?.default || mergedVoices[0];
                            const currentVoice = String(selectedVoice || '');
                            if (!mergedVoices.includes(currentVoice)) {
                                setSelectedVoice(fallbackVoice);
                            }
                            setDynamicParams(prev => {
                                const next = { ...prev };
                                const existingVoice = String(next.voiceName || '');
                                if (!mergedVoices.includes(existingVoice)) next.voiceName = fallbackVoice;
                                return next;
                            });
                        }
                    } else {
                        setParamSchema([]);
                        setDynamicParams({});
                    }
                }
            }
        } catch (e) { console.warn("Failed to synchronize engine blueprint", e); }
    }, [model, negativePrompt, selectedVoice]);

    useEffect(() => {
        initialLoadDone.current = false;
        loadEngineBlueprint();
        window.addEventListener('aimana-registry-updated', loadEngineBlueprint);
        return () => window.removeEventListener('aimana-registry-updated', loadEngineBlueprint);
    }, [model, loadEngineBlueprint]);

    useEffect(() => {
        if (!features.showImageInput) {
            setInputImage(null);
            setReferenceItemId(null);
        }
    }, [features.showImageInput]);

    useEffect(() => {
        if (!initialLoadDone.current) return;
        const userRole = api.auth.getUser()?.role;
        if (userRole !== 'admin') return;
        
        const timer = setTimeout(async () => {
            try {
                await fetch(`/api/settings/registry/${model}/status`, {
                    method: 'PATCH',
                    headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ defaultNegativePrompt: negativePrompt })
                });
            } catch (e) {
                console.warn("[SYNC_ERROR] Could not persist negative prompt back to Hub.");
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [negativePrompt, model]);

    const setDynamicParam = (key: string, value: any) => {
        setDynamicParams(prev => ({ ...prev, [key]: value }));
        if (key === 'duration') setDuration(value);
        if (key === 'audio') setAudio(value);
        if (key === 'image') setInputImage(value ? String(value) : null);
        if (key === 'aspectRatio' && typeof value === 'string') setSelectedRatio(value);
        if (key === 'voiceName' && typeof value === 'string') setSelectedVoice(value);
    };

    return {
        model, setModel,
        prompt, setPrompt,
        title, setTitle,
        selectedRatio, setSelectedRatio,
        customWidth, setCustomWidth,
        customHeight, setCustomHeight,
        negativePrompt, setNegativePrompt,
        seed, setSeed,
        samplingSteps, setSamplingSteps,
        guidanceScale, setGuidanceScale,
        sampler, setSampler,
        scheduler, setScheduler,
        vae, setVae,
        clipEncoder, setClipEncoder,
        isAdvancedSampling, setIsAdvancedSampling,
        motionIntensity, setMotionIntensity,
        duration, setDuration,
        audio, setAudio,
        inputImage, setInputImage,
        referenceItemId, setReferenceItemId,
        temperature, setTemperature,
        useSearch, setUseSearch,
        selectedVoice, setSelectedVoice,
        enhance, setEnhance,
        nologo, setNologo,
        safe, setSafe,
        isPrivate, setIsPrivate,
        nofeed, setNofeed,
        dynamicParams, setDynamicParam,
        paramSchema,
        features,
        chatHistory, setChatHistory
    };
};
