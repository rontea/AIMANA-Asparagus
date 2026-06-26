import { GeminiImageModel } from '../../../../services/geminiService';

export type ModelCategory = 'Language' | 'Visual' | 'Motion' | 'Audio' | 'Static' | 'Experimental';

// Allow literal union for known engines + string for dynamically forged ones
export type SupportedEngine = 
    GeminiImageModel | 
    'gemini-2.5-flash' |
    'gemini-2.5-flash-lite' |
    'gemini-2.5-flash-preview-tts' |
    'pollinations-flux' | 
    'pollinations-flux-2-dev' |
    'pollinations-p-image' |
    'pollinations-p-image-edit' |
    'pollinations-klein' |
    'pollinations-klein-large' |
    'pollinations-grok-imagine' |
    'pollinations-grok-imagine-pro' |
    'pollinations-wan' |
    'pollinations-ltx-2' |
    'pollinations-grok-video' |
    'pollinations-gpt-image' |
    'pollinations-gpt-image-large' |
    'pollinations-imagen-4' |
    'pollinations-kontext' | 
    'pollinations-nanobanana' |
    'pollinations-nanobanana-2' |
    'pollinations-nanobanana-pro' |
    'pollinations-qwen-image' |
    'pollinations-seedream' |
    'pollinations-seedream5' |
    'pollinations-seedream-4-5-pro' |
    'pollinations-nova-canvas' |
    'pollinations-z-image' |
    'pollinations-veo' |
    'pollinations-seedance' |
    'pollinations-seedance-pro' |
    'pollinations-veo-3-1-fast' |
    'pollinations-seedance-lite' |
    string; 

export interface ModelOption {
    id: SupportedEngine;
    label: string;
    desc: string;
    icon: any;
    color: string;
    limits: string;
    efficiency: string;
    provider: 'google' | 'pollinations' | string;
    category: ModelCategory;
    ratios: string[];
    isCustom?: boolean;
    isSystem?: boolean;
    isTested?: boolean;
    isPaid?: boolean; // New flag for paid models
    dashboardUrl?: string;
    ratioNotes?: string;
    upstreamId?: string;
    imagePricing?: Record<string, any>;
    videoPricing?: Record<string, any>;
    textContextLength?: number;
    textTools?: boolean;
    textReasoning?: boolean;
    textPaidOnly?: boolean;
    textSpecialized?: boolean;
    textInputModalities?: string[];
    textOutputModalities?: string[];
    textAliases?: string[];
    textPricing?: Record<string, any>;
    textVoices?: string[];
    capabilities?: string[];
}
