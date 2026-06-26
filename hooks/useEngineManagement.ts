import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export type TabID = 'meta' | 'logic' | 'ui' | 'advanced' | 'intelligence' | 'test';

export interface EngineFeatures {
    showDimensions: boolean;
    showSeed: boolean;
    showNegativePrompt: boolean;
    showEnhancements: boolean;
    showNologo: boolean; 
    showImageInput: boolean; 
    showVideoRatio: boolean; 
    showSampling?: boolean;
    showGuidance?: boolean;
}

export interface DynamicParamBlueprint {
    key: string;
    label: string;
    type: 'slider' | 'toggle' | 'text' | 'textarea' | 'select';
    min?: number;
    max?: number;
    step?: number;
    default: any;
    description: string;
    options?: { label: string; value: any }[];
}

const COMMON_TTS_VOICE_OPTIONS = [
    { label: 'Alloy', value: 'alloy' },
    { label: 'Echo', value: 'echo' },
    { label: 'Fable', value: 'fable' },
    { label: 'Onyx', value: 'onyx' },
    { label: 'Nova', value: 'nova' },
    { label: 'Shimmer', value: 'shimmer' },
    { label: 'Kore', value: 'Kore' },
    { label: 'Puck', value: 'Puck' },
    { label: 'Zephyr', value: 'Zephyr' },
    { label: 'Charon', value: 'Charon' }
];

/**
 * Inference Variable Library
 * Expanded to cover all query parameters defined in Pollinations API docs.
 */
export const PARAMETER_BLUEPRINTS: Record<string, DynamicParamBlueprint> = {
    guidance_scale: { 
        key: 'guidance_scale', 
        label: 'Prompt Guidance (CFG)', 
        type: 'slider', 
        min: 1, 
        max: 30, 
        step: 0.5, 
        default: 7.5, 
        description: 'How strictly the model follows the prompt' 
    },
    quality: { 
        key: 'quality', 
        label: 'Inference Steps', 
        type: 'slider', 
        min: 1, 
        max: 100, 
        step: 1, 
        default: 25, 
        description: 'Image quality level' 
    },
    quality_preset: { 
        key: 'quality', 
        label: 'Engine Quality (gptimage)', 
        type: 'select', 
        default: 'medium', 
        description: 'Image quality level',
        options: [
            { label: 'low', value: 'low' },
            { label: 'medium', value: 'medium' },
            { label: 'high', value: 'high' },
            { label: 'hd', value: 'hd' }
        ]
    },
    transparent: { 
        key: 'transparent', 
        label: 'Transparent Background (gptimage)', 
        type: 'toggle', 
        default: false, 
        description: 'Generate with transparent background (gptimage only)' 
    },
    duration: { 
        key: 'duration', 
        label: 'Clip Duration', 
        type: 'slider', 
        min: 1, 
        max: 10, 
        step: 1, 
        default: 4, 
        description: 'Video duration in seconds. Pollinations video API supports duration control for motion models.' 
    },
    veo_duration: { 
        key: 'duration', 
        label: 'VEO Specific Duration', 
        type: 'select', 
        default: 4, 
        description: 'Veo duration preset control (4, 6, or 8 seconds).',
        options: [
            { label: '4 Seconds', value: 4 },
            { label: '6 Seconds', value: 6 },
            { label: '8 Seconds', value: 8 }
        ]
    },
    audio: { 
        key: 'audio', 
        label: 'Neural Soundscape', 
        type: 'toggle', 
        default: false, 
        description: 'Enable soundtrack for video models that support an audio toggle.' 
    },
    image_reference: {
        key: 'image',
        label: 'Reference Image',
        type: 'text',
        default: '',
        description: 'Single URL or multiple URLs separated by | or , for image-to-image or image-to-video reference. Injects {{image}}.'
    },
    video_ratio: {
        key: 'aspectRatio',
        label: 'Video Aspect Ratio',
        type: 'select',
        default: '16:9',
        description: 'Switch between Cinematic (16:9) or Portrait (9:16). Injects {{aspectRatio}}.',
        options: [
            { label: 'Widescreen (16:9)', value: '16:9' },
            { label: 'Portrait (9:16)', value: '9:16' }
        ]
    },
    temperature: {
        key: 'temperature',
        label: 'Neural Entropy',
        type: 'slider',
        min: 0,
        max: 2,
        step: 0.1,
        default: 0.7,
        description: 'Creative variance / randomness'
    },
    max_tokens: {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'slider',
        min: 64,
        max: 8192,
        step: 64,
        default: 1024,
        description: 'Upper completion token bound for text generation.'
    },
    voice_name: {
        key: 'voiceName',
        label: 'Voice',
        type: 'select',
        default: 'alloy',
        description: 'Primary voice for speech synthesis. Injects {{voiceName}}.',
        options: COMMON_TTS_VOICE_OPTIONS
    },
    response_format: {
        key: 'response_format',
        label: 'Response Format',
        type: 'select',
        default: 'mp3',
        description: 'Output format for audio or transcript responses.',
        options: [
            { label: 'MP3', value: 'mp3' },
            { label: 'WAV', value: 'wav' },
            { label: 'OGG', value: 'ogg' },
            { label: 'AAC', value: 'aac' },
            { label: 'FLAC', value: 'flac' },
            { label: 'OPUS', value: 'opus' },
            { label: 'PCM', value: 'pcm' },
            { label: 'JSON', value: 'json' },
            { label: 'TEXT', value: 'text' },
            { label: 'SRT', value: 'srt' },
            { label: 'VTT', value: 'vtt' },
            { label: 'VERBOSE JSON', value: 'verbose_json' }
        ]
    },
    multi_speaker_enabled: {
        key: 'multiSpeakerEnabled',
        label: 'Two-Speaker Mode',
        type: 'toggle',
        default: false,
        description: 'Enable multi-speaker speech routing.'
    },
    speaker_one_name: {
        key: 'speakerOneName',
        label: 'Speaker One Name',
        type: 'text',
        default: 'Speaker A',
        description: 'Name label for the first speaker.'
    },
    speaker_one_voice: {
        key: 'speakerOneVoice',
        label: 'Speaker One Voice',
        type: 'select',
        default: 'alloy',
        description: 'Voice mapping for the first speaker.',
        options: COMMON_TTS_VOICE_OPTIONS
    },
    speaker_two_name: {
        key: 'speakerTwoName',
        label: 'Speaker Two Name',
        type: 'text',
        default: 'Speaker B',
        description: 'Name label for the second speaker.'
    },
    speaker_two_voice: {
        key: 'speakerTwoVoice',
        label: 'Speaker Two Voice',
        type: 'select',
        default: 'nova',
        description: 'Voice mapping for the second speaker.',
        options: COMMON_TTS_VOICE_OPTIONS
    },
    language_code: {
        key: 'languageCode',
        label: 'Language Code',
        type: 'text',
        default: '',
        description: 'Optional BCP-47 voice locale such as en-US or fil-PH.'
    },
    language_hint: {
        key: 'language',
        label: 'Transcript Language',
        type: 'text',
        default: '',
        description: 'Optional ISO language hint for transcription requests.'
    },
    tone: {
        key: 'tone',
        label: 'Tone',
        type: 'text',
        default: '',
        description: 'High-level delivery style guidance.'
    },
    pace: {
        key: 'pace',
        label: 'Pace',
        type: 'text',
        default: '',
        description: 'Narration pacing direction.'
    },
    accent: {
        key: 'accent',
        label: 'Accent',
        type: 'text',
        default: '',
        description: 'Accent direction for voice synthesis.'
    },
    audio_profile: {
        key: 'audioProfile',
        label: 'Audio Profile',
        type: 'textarea',
        default: '',
        description: 'Long-form character profile for voice behavior.'
    },
    scene_description: {
        key: 'sceneDescription',
        label: 'Scene',
        type: 'textarea',
        default: '',
        description: 'Long-form scene and ambience guidance.'
    },
    director_notes: {
        key: 'directorNotes',
        label: "Director's Notes",
        type: 'textarea',
        default: '',
        description: 'Long-form performance direction and emphasis.'
    },
    instrumental: {
        key: 'instrumental',
        label: 'Instrumental Only',
        type: 'toggle',
        default: false,
        description: 'Disable vocals for music generation when supported.'
    },
    custom_slider: { key: 'new_param', label: 'Custom Range', type: 'slider', min: 0, max: 100, step: 1, default: 50, description: 'Numerical variable' },
    custom_toggle: { key: 'new_toggle', label: 'Custom Switch', type: 'toggle', default: false, description: 'Boolean variable' },
    custom_text: { key: 'new_text', label: 'Custom Text', type: 'text', default: '', description: 'Short string variable' },
    custom_textarea: { key: 'new_textarea', label: 'Custom Paragraph', type: 'textarea', default: '', description: 'Long-form text variable' }
};

const COMMON_CUSTOM_BLUEPRINT_KEYS = ['custom_slider', 'custom_toggle', 'custom_text', 'custom_textarea'];

const CATEGORY_BLUEPRINT_KEYS: Record<string, string[]> = {
    Visual: [
        'guidance_scale',
        'quality',
        'quality_preset',
        'transparent',
        'image_reference',
        ...COMMON_CUSTOM_BLUEPRINT_KEYS
    ],
    Motion: [
        'duration',
        'veo_duration',
        'video_ratio',
        'audio',
        'image_reference',
        ...COMMON_CUSTOM_BLUEPRINT_KEYS
    ],
    Language: [
        'temperature',
        'max_tokens',
        ...COMMON_CUSTOM_BLUEPRINT_KEYS
    ],
    Audio: [
        'voice_name',
        'response_format',
        'multi_speaker_enabled',
        'speaker_one_name',
        'speaker_one_voice',
        'speaker_two_name',
        'speaker_two_voice',
        'language_code',
        'language_hint',
        'tone',
        'pace',
        'accent',
        'audio_profile',
        'scene_description',
        'director_notes',
        'duration',
        'instrumental',
        'temperature',
        ...COMMON_CUSTOM_BLUEPRINT_KEYS
    ],
    Static: [...COMMON_CUSTOM_BLUEPRINT_KEYS]
};

export const getBlueprintKeysForCategory = (category?: string): string[] => {
    const normalizedCategory = String(category || '').trim();
    const categoryKeys = normalizedCategory ? CATEGORY_BLUEPRINT_KEYS[normalizedCategory] : null;
    if (!Array.isArray(categoryKeys) || categoryKeys.length === 0) {
        return Object.keys(PARAMETER_BLUEPRINTS);
    }
    return categoryKeys.filter((key) => !!PARAMETER_BLUEPRINTS[key]);
};

const isPollinationsKleinModel = (form: Partial<EngineFormData> = {}) => {
    const provider = String(form.provider || '').toLowerCase();
    const identity = [
        form.id,
        form.upstreamId,
        form.requestUrl
    ].map(value => String(value || '').toLowerCase()).join(' ');

    return provider === 'pollinations'
        && (
            identity.includes('model=klein')
            || identity.includes('model=klein-large')
            || identity.includes('pollinations-klein')
            || identity.split(/\s+/).includes('klein')
            || identity.split(/\s+/).includes('klein-large')
        );
};

const ensureImageReferenceParam = (requestUrl = '') => {
    const raw = String(requestUrl || '');
    if (!raw || raw.includes('{{image}}')) return raw;
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}image={{image}}`;
};

const ensureImageReferenceSchema = (schema: any[] = []) => (
    schema.some((param: any) => param?.key === 'image')
        ? schema
        : [{ ...PARAMETER_BLUEPRINTS.image_reference }, ...schema]
);

export const useEngineManagement = (engine: any, isNew: boolean, onClose: () => void) => {
    const DEFAULT_VISUAL_TEST_PROMPT = 'A hyper-realistic robotic eye, 8k.';
    const DEFAULT_LANGUAGE_TEST_PROMPT = 'What model are you and describe on 3 bullet what you can do. Describe the image.';
    const DEFAULT_AUDIO_TEST_PROMPT = 'Hello, this is a short audio test.';
    const [activeTab, setActiveTab] = useState<TabID>('meta');
    const [uiSchema, setUiSchema] = useState<any[]>([]);
    const [features, setFeatures] = useState<EngineFeatures>({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: true,
        showImageInput: false,
        showVideoRatio: false,
        showSampling: false,
        showGuidance: true
    });

    const [formData, setFormData] = useState<EngineFormData>({
        id: '', label: '', description: '', provider: 'pollinations', category: 'Visual', 
        upstreamId: '', systemInstruction: '', efficiencyTier: 'Tier-Stable', 
        iconName: 'Cpu', isProgrammable: true, requestMethod: 'POST', 
        requestUrl: '', requestHeaders: '{}', requestBodyTemplate: '', responsePath: '',
        capabilities: [], isSystem: false, apiKey: '', limits: '', isTested: false,
        verifiedPrompt: '', verificationNotes: '', defaultNegativePrompt: '',
        verifiedResult: '', verifiedMimeType: '', verifiedParams: '', isPaid: false,
        supportedRatios: '', dashboardUrl: '', ratioNotes: '', configJson: '{}'
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [testPrompt, setTestPrompt] = useState(DEFAULT_VISUAL_TEST_PROMPT);
    const [testImage, setTestImage] = useState<string | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [testError, setTestError] = useState<string | null>(null);
    const [textSandboxImageInput, setTextSandboxImageInput] = useState<string>('');
    const [textSandboxAudioData, setTextSandboxAudioData] = useState<string>('');
    const [textSandboxAudioFormat, setTextSandboxAudioFormat] = useState<string>('mp3');
    const [textSandboxVideoInput, setTextSandboxVideoInput] = useState<string>('');

    useEffect(() => {
        if (isNew && formData.provider === 'pollinations' && uiSchema.length === 0) {
            setFormData(prev => ({
                ...prev,
                upstreamId: 'flux',
                requestMethod: 'GET',
                requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model={{upstreamId}}&width={{width}}&height={{height}}&seed={{seed}}&nologo={{nologo}}&enhance={{enhance}}&safe={{safe}}&private={{private}}&nofeed={{nofeed}}&quality={{quality}}&transparent={{transparent}}&negative_prompt={{negative_prompt}}&image={{image}}',
                requestHeaders: '{"Accept": "image/*"}',
                limits: 'Unlimited Priority'
            }));
            setFeatures({
                showDimensions: true,
                showSeed: true,
                showNegativePrompt: true,
                showEnhancements: true,
                showNologo: true,
                showImageInput: true,
                showVideoRatio: false,
                showSampling: false,
                showGuidance: true
            });
        }
    }, [formData.provider, isNew, uiSchema.length]);

    useEffect(() => {
        if (engine) {
            let parsedConfig: Record<string, any> = {};
            try {
                parsedConfig = engine.configJson ? JSON.parse(engine.configJson) : {};
            } catch (_e) {
                parsedConfig = {};
            }
            const nextFormData = {
                id: engine.id || '',
                label: engine.label || '',
                description: engine.description || '',
                provider: engine.provider || 'pollinations',
                category: engine.category || 'Visual',
                upstreamId: engine.upstreamId || '',
                systemInstruction: engine.systemInstruction || '',
                efficiencyTier: engine.efficiencyTier || 'Tier-Stable',
                iconName: engine.iconName || 'Cpu',
                isProgrammable: !!engine.isProgrammable,
                requestMethod: engine.requestMethod || 'POST',
                requestUrl: engine.requestUrl || '',
                requestHeaders: engine.requestHeaders || '{}',
                requestBodyTemplate: engine.requestBodyTemplate || '',
                responsePath: engine.responsePath || '',
                capabilities: typeof engine.capabilities === 'string' ? engine.capabilities.split(',').filter(Boolean) : (engine.capabilities || []),
                isSystem: !!engine.isSystem,
                apiKey: engine.apiKey || '',
                limits: engine.limits || '',
                isTested: !!engine.isTested,
                verifiedPrompt: engine.verifiedPrompt || '',
                verificationNotes: engine.verificationNotes || '',
                defaultNegativePrompt: engine.defaultNegativePrompt || '',
                verifiedResult: engine.verifiedResult || '',
                verifiedMimeType: engine.verifiedMimeType || '',
                verifiedParams: engine.verifiedParams || '',
                isPaid: !!engine.isPaid,
                supportedRatios: Array.isArray(parsedConfig.supportedRatios)
                    ? parsedConfig.supportedRatios.join(', ')
                    : '',
                dashboardUrl: typeof parsedConfig.dashboardUrl === 'string' ? parsedConfig.dashboardUrl : '',
                ratioNotes: typeof parsedConfig.ratioNotes === 'string' ? parsedConfig.ratioNotes : '',
                configJson: engine.configJson || '{}'
            };
            if (isPollinationsKleinModel(nextFormData)) {
                nextFormData.requestUrl = ensureImageReferenceParam(nextFormData.requestUrl);
            }
            setFormData(nextFormData);
            try {
                const parsedUiSchema = engine.uiConfigJson ? JSON.parse(engine.uiConfigJson) : [];
                const parsedFeatures = engine.featuresJson ? JSON.parse(engine.featuresJson) : {
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
                if (isPollinationsKleinModel(nextFormData)) {
                    setUiSchema(ensureImageReferenceSchema(Array.isArray(parsedUiSchema) ? parsedUiSchema : []));
                    setFeatures({ ...parsedFeatures, showImageInput: true });
                } else {
                    setUiSchema(parsedUiSchema);
                    setFeatures(parsedFeatures);
                }
            } catch (e) { setUiSchema([]); }
        }
    }, [engine]);

    useEffect(() => {
        if (!isPollinationsKleinModel(formData)) return;
        const needsUrl = !String(formData.requestUrl || '').includes('{{image}}');
        const needsFeature = !features.showImageInput;
        const needsSchema = !uiSchema.some((param: any) => param?.key === 'image');
        if (!needsUrl && !needsFeature && !needsSchema) return;

        if (needsFeature) setFeatures(prev => ({ ...prev, showImageInput: true }));
        if (needsSchema) setUiSchema(prev => ensureImageReferenceSchema(prev));
        if (needsUrl) {
            setFormData(prev => ({
                ...prev,
                requestUrl: ensureImageReferenceParam(prev.requestUrl)
            }));
        }
    }, [features.showImageInput, formData, uiSchema]);

    useEffect(() => {
        const current = String(testPrompt || '').trim();
        if (formData.category === 'Language') {
            if (!current || current === DEFAULT_VISUAL_TEST_PROMPT) {
                setTestPrompt(DEFAULT_LANGUAGE_TEST_PROMPT);
            }
            return;
        }
        if (formData.category === 'Audio') {
            if (!current || current === DEFAULT_LANGUAGE_TEST_PROMPT || current === DEFAULT_VISUAL_TEST_PROMPT) {
                setTestPrompt(DEFAULT_AUDIO_TEST_PROMPT);
            }
            return;
        }
        if (!current || current === DEFAULT_LANGUAGE_TEST_PROMPT) {
            setTestPrompt(DEFAULT_VISUAL_TEST_PROMPT);
        }
    }, [formData.category, testPrompt]);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        setShowSuccess(false);
        try {
            let baseConfig: Record<string, any> = {};
            try {
                baseConfig = formData.configJson ? JSON.parse(formData.configJson) : {};
            } catch (_e) {
                baseConfig = {};
            }
            const supportedRatios = formData.supportedRatios
                .split(',')
                .map((r) => r.trim())
                .filter(Boolean);
            const configPayload = {
                ...baseConfig,
                supportedRatios,
                dashboardUrl: formData.dashboardUrl?.trim() || '',
                ratioNotes: formData.ratioNotes?.trim() || ''
            };
            const payload = { 
                ...formData, 
                uiConfigJson: JSON.stringify(uiSchema), 
                featuresJson: JSON.stringify(features),
                configJson: JSON.stringify(configPayload),
                isProgrammable: formData.isProgrammable ? 1 : 0,
                capabilities: formData.capabilities.join(','),
                isSystem: formData.isSystem ? 1 : 0,
                isTested: formData.isTested ? 1 : 0,
                isPaid: formData.isPaid ? 1 : 0
            };
            const method = isNew ? 'POST' : 'PUT';
            const url = isNew ? '/api/settings/registry' : `/api/settings/registry/${engine.id}`;
            
            const res = await fetch(url, {
                method,
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Registry Update Failed" }));
                throw new Error(errData.error || `Error ${res.status}`);
            }
            
            // CRITICAL: Notify the system that the registry has changed
            window.dispatchEvent(new CustomEvent('aimana-registry-updated'));
            
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (e: any) { setError(e.message); }
        finally { setIsSaving(false); }
    };

    const runSandboxTest = async () => {
        setIsTesting(true);
        setTestResult(null);
        setTestError(null);
        
        const isLanguageSandbox = formData.category === 'Language';
        const isAudioSandbox = formData.category === 'Audio';
        const dynamicDefaults = uiSchema.reduce((acc, p) => ({ ...acc, [p.key]: p.default }), {});
        let supportedInputModalities: string[] = ['text'];
        try {
            const parsedCfg = formData.configJson ? JSON.parse(formData.configJson) : {};
            if (Array.isArray(parsedCfg.textInputModalities) && parsedCfg.textInputModalities.length > 0) {
                supportedInputModalities = parsedCfg.textInputModalities.map((m: any) => String(m || '').toLowerCase()).filter(Boolean);
            }
        } catch (_e) {}

        const testPayload = isLanguageSandbox
            ? {
                prompt: testPrompt,
                dynamicParams: dynamicDefaults,
                messages: [
                    ...(formData.systemInstruction
                        ? [{ role: 'system', content: String(formData.systemInstruction) }]
                        : []),
                    (() => {
                        const parts: any[] = [{ type: 'text', text: testPrompt || '' }];
                        if (textSandboxImageInput && supportedInputModalities.includes('image')) {
                            parts.push({ type: 'image_url', image_url: { url: textSandboxImageInput } });
                        }
                        if (textSandboxAudioData && supportedInputModalities.includes('audio')) {
                            parts.push({
                                type: 'input_audio',
                                input_audio: {
                                    data: textSandboxAudioData,
                                    format: textSandboxAudioFormat || 'mp3'
                                }
                            });
                        }
                        if (textSandboxVideoInput && supportedInputModalities.includes('video')) {
                            parts.push({ type: 'video_url', video_url: { url: textSandboxVideoInput } });
                        }
                        return {
                            role: 'user',
                            content: parts
                        };
                    })()
                ]
            }
            : isAudioSandbox
            ? {
                prompt: testPrompt,
                voiceName: dynamicDefaults.voiceName || dynamicDefaults.voice || 'alloy',
                audioData: supportedInputModalities.includes('audio') ? textSandboxAudioData : '',
                audioFormat: textSandboxAudioFormat || 'mp3',
                dynamicParams: dynamicDefaults
            }
            : {
                prompt: testPrompt,
                width: 1024,
                height: 1024,
                seed: Math.floor(Math.random() * 10000000), // Snapshot a random seed for reproduction
                image: testImage || undefined,
                dynamicParams: dynamicDefaults
            };

        try {
            const res = await fetch(isLanguageSandbox ? '/api/proxy/test-text' : '/api/proxy/test', {
                method: 'POST',
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    engine: { ...formData, uiConfigJson: JSON.stringify(uiSchema), featuresJson: JSON.stringify(features) },
                    payload: testPayload
                })
            });
            
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Inference Timeout");
            }

            if (isLanguageSandbox) {
                const payload = await res.json();
                setTestResult({
                    type: 'text-sandbox',
                    content: String(payload?.content || ''),
                    raw: payload?.raw || {},
                    diagnostics: payload?.diagnostics || {},
                    metadata: testPayload
                });
                return;
            }
            
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('image/') || contentType.includes('video/') || contentType.includes('audio/')) {
                const blob = await res.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                    reader.readAsDataURL(blob);
                });
                setTestResult({ 
                    type: 'binary', 
                    url: URL.createObjectURL(blob), 
                    base64, 
                    mimeType: contentType,
                    metadata: testPayload 
                });
            } else {
                setTestResult({ type: 'text', content: await res.text(), metadata: testPayload });
            }
        } catch (e: any) { setTestError(e.message); }
        finally { setIsTesting(false); }
    };

    const applyPollinationsStarter = (starterId: 'pollinations-image' | 'pollinations-video' | 'pollinations-chat' | 'pollinations-audio') => {
        if (starterId === 'pollinations-image') {
            setFormData(prev => ({
                ...prev,
                provider: 'pollinations',
                category: 'Visual',
                upstreamId: prev.upstreamId || 'flux',
                requestMethod: 'GET',
                requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model={{upstreamId}}&width={{width}}&height={{height}}&seed={{seed}}&nologo={{nologo}}&enhance={{enhance}}&safe={{safe}}&private={{private}}&nofeed={{nofeed}}&quality={{quality}}&transparent={{transparent}}&negative_prompt={{negative_prompt}}&image={{image}}',
                requestHeaders: '{"Accept":"image/*"}',
                requestBodyTemplate: '',
                responsePath: ''
            }));
            setFeatures({
                showDimensions: true,
                showSeed: true,
                showNegativePrompt: true,
                showEnhancements: true,
                showNologo: true,
                showImageInput: true,
                showVideoRatio: false,
                showSampling: false,
                showGuidance: true
            });
            setUiSchema([
                { ...PARAMETER_BLUEPRINTS.image_reference },
                { ...PARAMETER_BLUEPRINTS.quality_preset },
                { ...PARAMETER_BLUEPRINTS.transparent }
            ]);
            return;
        }

        if (starterId === 'pollinations-video') {
            setFormData(prev => ({
                ...prev,
                provider: 'pollinations',
                category: 'Motion',
                upstreamId: prev.upstreamId || 'veo',
                requestMethod: 'GET',
                requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model={{upstreamId}}&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}&image={{image}}',
                requestHeaders: '{"Accept":"video/*"}',
                requestBodyTemplate: '',
                responsePath: ''
            }));
            setFeatures({
                showDimensions: false,
                showSeed: true,
                showNegativePrompt: false,
                showEnhancements: false,
                showNologo: false,
                showImageInput: true,
                showVideoRatio: true,
                showSampling: false,
                showGuidance: false
            });
            setUiSchema([
                { ...PARAMETER_BLUEPRINTS.duration },
                { ...PARAMETER_BLUEPRINTS.video_ratio },
                { ...PARAMETER_BLUEPRINTS.audio },
                { ...PARAMETER_BLUEPRINTS.image_reference }
            ]);
            return;
        }

        if (starterId === 'pollinations-chat') {
            setFormData(prev => ({
                ...prev,
                provider: 'pollinations',
                category: 'Language',
                upstreamId: prev.upstreamId || 'openai',
                requestMethod: 'POST',
                requestUrl: 'https://gen.pollinations.ai/v1/chat/completions',
                requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
                requestBodyTemplate: '{"model":"{{upstreamId}}","messages":[{"role":"system","content":{{system_json}}},{"role":"user","content":{{prompt_json}}}],"temperature":{{temperature}},"max_tokens":{{max_tokens}},"stream":false}',
                responsePath: 'choices.0.message.content'
            }));
            setFeatures({
                showDimensions: false,
                showSeed: false,
                showNegativePrompt: false,
                showEnhancements: false,
                showNologo: false,
                showImageInput: false,
                showVideoRatio: false,
                showSampling: false,
                showGuidance: false
            });
            setUiSchema([
                { ...PARAMETER_BLUEPRINTS.temperature },
                { ...PARAMETER_BLUEPRINTS.max_tokens }
            ]);
            return;
        }

        setFormData(prev => ({
            ...prev,
            provider: 'pollinations',
            category: 'Audio',
            upstreamId: prev.upstreamId || 'tts-1',
            requestMethod: 'POST',
            requestUrl: 'https://gen.pollinations.ai/v1/audio/speech',
            requestHeaders: '{"Accept":"audio/mpeg","Content-Type":"application/json"}',
            requestBodyTemplate: '{"model":"{{upstreamId}}","input":{{prompt_json}},"voice":"{{voiceName}}","response_format":"mp3"}',
            responsePath: ''
        }));
        setFeatures({
            showDimensions: false,
            showSeed: false,
            showNegativePrompt: false,
            showEnhancements: false,
            showNologo: false,
            showImageInput: false,
            showVideoRatio: false,
            showSampling: false,
            showGuidance: false
        });
        setUiSchema([]);
    };

    const addParamFromBlueprint = (blueprintKey: string) => {
        const bp = PARAMETER_BLUEPRINTS[blueprintKey];
        if (!bp || uiSchema.some(p => p.key === bp.key && p.type === bp.type)) return;
        setUiSchema([...uiSchema, { ...bp }]);
    };

    const exportBlueprint = () => {
        const blueprint = {
            type: "AIMANA_BLUEPRINT",
            version: "1.3",
            timestamp: new Date().toISOString(),
            data: { formData, features, uiSchema }
        };
        const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `blueprint_${formData.id || 'unnamed'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importBlueprint = async (file: File) => {
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (json.type !== "AIMANA_BLUEPRINT") throw new Error("Invalid format");
            const { formData: f, features: feat, uiSchema: ui } = json.data;
            
            setFormData(prev => ({ 
                ...prev, 
                ...f, 
                id: isNew ? f.id : prev.id, 
                isSystem: prev.isSystem,
                apiKey: f.apiKey || prev.apiKey,
                isTested: f.isTested || false
            }));
            if (feat) setFeatures(feat);
            if (ui) setUiSchema(ui);
            return true;
        } catch (e) { 
            setError("Blueprint parsing failed."); 
            return false;
        }
    };

    return {
        activeTab, setActiveTab,
        formData, setFormData,
        features, toggleFeature: (key: keyof EngineFeatures) => setFeatures({ ...features, [key]: !features[key] }),
        uiSchema, addParamFromBlueprint, updateParam: (idx: number, updates: any) => {
            const n = [...uiSchema]; n[idx] = { ...n[idx], ...updates }; setUiSchema(n);
        }, removeParam: (idx: number) => setUiSchema(uiSchema.filter((_, i) => i !== idx)),
        replaceSchema: (newSchema: any[]) => setUiSchema(newSchema),
        isSaving, showSuccess, error,
        testPrompt, setTestPrompt, 
        testImage, setTestImage,
        textSandboxImageInput, setTextSandboxImageInput,
        textSandboxAudioData, setTextSandboxAudioData,
        textSandboxAudioFormat, setTextSandboxAudioFormat,
        textSandboxVideoInput, setTextSandboxVideoInput,
        runSandboxTest, isTesting, testResult, testError,
        handleSave, checkAndTest: () => { setActiveTab('test'); runSandboxTest(); },
        exportBlueprint, importBlueprint,
        applyPollinationsStarter
    };
};

export interface EngineFormData {
    id: string; label: string; description: string; provider: string; category: string;
    upstreamId: string; systemInstruction: string; efficiencyTier: string; iconName: string;
    isProgrammable: boolean; requestMethod: string; requestUrl: string; requestHeaders: string;
    requestBodyTemplate: string; responsePath: string; capabilities: string[]; isSystem: boolean;
    apiKey: string; limits: string; isTested: boolean; verifiedPrompt: string; verificationNotes: string;
    defaultNegativePrompt: string; verifiedResult: string; verifiedMimeType: string; verifiedParams: string;
    isPaid: boolean; supportedRatios: string; dashboardUrl: string; ratioNotes: string; configJson: string;
}
