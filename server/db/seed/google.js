
import {
    GOOGLE_TTS_FEATURES_JSON,
    buildGoogleTtsUiSchema
} from '../../utils/googleTts.js';

export const googleBlueprints = [
    {
        id: 'gemini-2.5-flash',
        label: 'Flash Logic',
        description: 'Fast multimodal reasoning for summarization, drafting, and day-to-day Gemini work.',
        provider: 'google',
        category: 'Language',
        iconName: 'BrainCircuit',
        efficiencyTier: 'Tier-1',
        isProgrammable: 0,
        capabilities: 'text,logic,analysis',
        isSystem: 1
    },
    {
        id: 'gemini-2.5-flash-lite',
        label: 'Flash Lite',
        description: 'Low-latency Gemini text generation for lightweight reasoning and utility tasks.',
        provider: 'google',
        category: 'Language',
        iconName: 'Type',
        efficiencyTier: 'Tier-1',
        isProgrammable: 0,
        capabilities: 'text,logic',
        isSystem: 1
    },
    {
        id: 'gemini-2.5-flash-image',
        label: 'Flash Image',
        description: 'High-speed visual iteration for Gemini image generation. Billing-enabled API key required.',
        provider: 'google',
        category: 'Visual',
        iconName: 'Zap',
        efficiencyTier: 'Tier-1',
        isProgrammable: 0,
        capabilities: 'image',
        isSystem: 1,
        isPaid: 1
    },
    {
        id: 'gemini-3.1-flash-image-preview',
        label: 'Pro Synthesis',
        description: 'Advanced visual realism with optional Search Grounding. Billing-enabled API key required.',
        provider: 'google',
        category: 'Visual',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Max',
        isProgrammable: 0,
        capabilities: 'image,search',
        isSystem: 1,
        isPaid: 1
    },
    {
        id: 'gemini-2.5-flash-preview-tts',
        label: 'Speech Synthesis',
        description: 'Controllable Gemini text-to-speech with single-speaker and two-speaker output.',
        provider: 'google',
        category: 'Audio',
        iconName: 'Volume2',
        efficiencyTier: 'Tier-1',
        isProgrammable: 0,
        capabilities: 'audio,text',
        isSystem: 1,
        featuresJson: GOOGLE_TTS_FEATURES_JSON,
        uiConfigJson: JSON.stringify(buildGoogleTtsUiSchema())
    },
    {
        id: 'gemini-2.5-pro',
        label: 'Pro Reasoning',
        description: 'Advanced Gemini reasoning and coding model with large context handling.',
        provider: 'google',
        category: 'Language',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Max',
        isProgrammable: 0,
        capabilities: 'text,logic,analysis,code',
        isSystem: 1
    },
    {
        id: 'gemini-2.5-pro-preview-tts',
        label: 'Speech Synthesis Pro',
        description: 'Higher-fidelity Gemini text-to-speech preview with controllable two-speaker output.',
        provider: 'google',
        category: 'Audio',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Max',
        isProgrammable: 0,
        capabilities: 'audio,text',
        isSystem: 1,
        isPaid: 1,
        featuresJson: GOOGLE_TTS_FEATURES_JSON,
        uiConfigJson: JSON.stringify(buildGoogleTtsUiSchema())
    }
];
