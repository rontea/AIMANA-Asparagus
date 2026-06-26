import {
    GOOGLE_TTS_FEATURES_JSON,
    GOOGLE_TTS_VOICES,
    buildGoogleTtsUiSchema
} from '../utils/googleTts.js';

const GOOGLE_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GOOGLE_MODELS_DOCS_URL = 'https://ai.google.dev/gemini-api/docs/models';
const GOOGLE_PRICING_DOCS_URL = 'https://ai.google.dev/gemini-api/docs/pricing';
const GOOGLE_IMAGE_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

const LANGUAGE_FEATURES_JSON = JSON.stringify({
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

const AUDIO_FEATURES_JSON = GOOGLE_TTS_FEATURES_JSON;

const VISUAL_FEATURES_JSON = JSON.stringify({
    showDimensions: true,
    showSeed: true,
    showNegativePrompt: false,
    showEnhancements: false,
    showNologo: false,
    showImageInput: false,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: false
});

const GOOGLE_MODEL_CATALOG = {
    'gemini-2.5-flash': {
        label: 'Gemini 2.5 Flash',
        category: 'Language',
        iconName: 'BrainCircuit',
        efficiencyTier: 'Tier-Stable',
        capabilities: ['text', 'logic', 'analysis'],
        isPaid: 0,
        featuresJson: LANGUAGE_FEATURES_JSON,
        config: {
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Stable Gemini text model with 1M token context and optional Search grounding.',
            textReasoning: true,
            textTools: true,
            textSpecialized: false,
            textInputModalities: ['text', 'image', 'audio', 'video', 'pdf'],
            textOutputModalities: ['text'],
            textPricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: true,
                currency: 'usd',
                estimateMode: 'paid-tier',
                promptTextUsdPer1M: 0.3,
                promptAudioUsdPer1M: 1.0,
                completionTextUsdPer1M: 2.5
            }
        }
    },
    'gemini-2.5-flash-lite': {
        label: 'Gemini 2.5 Flash-Lite',
        category: 'Language',
        iconName: 'Zap',
        efficiencyTier: 'Tier-Express',
        capabilities: ['text', 'logic'],
        isPaid: 0,
        featuresJson: LANGUAGE_FEATURES_JSON,
        config: {
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Low-cost Gemini text model optimized for throughput and free-tier-friendly usage.',
            textReasoning: true,
            textTools: true,
            textSpecialized: false,
            textInputModalities: ['text', 'image', 'audio', 'video', 'pdf'],
            textOutputModalities: ['text'],
            textPricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: true,
                currency: 'usd',
                estimateMode: 'paid-tier',
                promptTextUsdPer1M: 0.1,
                promptAudioUsdPer1M: 0.3,
                completionTextUsdPer1M: 0.4
            }
        }
    },
    'gemini-2.5-pro': {
        label: 'Gemini 2.5 Pro',
        category: 'Language',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        capabilities: ['text', 'logic', 'analysis', 'code'],
        isPaid: 0,
        featuresJson: LANGUAGE_FEATURES_JSON,
        config: {
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Advanced Gemini reasoning and coding model with 1M token context.',
            textReasoning: true,
            textTools: true,
            textSpecialized: true,
            textInputModalities: ['text', 'image', 'audio', 'video', 'pdf'],
            textOutputModalities: ['text'],
            textPricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: true,
                currency: 'usd',
                estimateMode: 'paid-tier',
                promptTextUsdPer1M: 1.25,
                completionTextUsdPer1M: 10.0
            }
        }
    },
    'gemini-2.5-flash-preview-tts': {
        label: 'Gemini 2.5 Flash TTS Preview',
        category: 'Audio',
        iconName: 'Volume2',
        efficiencyTier: 'Tier-Stable',
        capabilities: ['audio', 'text'],
        isPaid: 0,
        featuresJson: AUDIO_FEATURES_JSON,
        config: {
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Fast Gemini TTS preview model with single-speaker and two-speaker speech controls.',
            textInputModalities: ['text'],
            textOutputModalities: ['audio'],
            textVoices: GOOGLE_TTS_VOICES,
            textToSpeechControllable: true,
            textToSpeechModes: ['single-speaker', 'two-speaker'],
            textPricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: true,
                currency: 'usd',
                estimateMode: 'paid-tier',
                promptTextUsdPer1M: 0.5,
                completionAudioUsdPer1M: 10.0
            }
        }
    },
    'gemini-2.5-pro-preview-tts': {
        label: 'Gemini 2.5 Pro TTS Preview',
        category: 'Audio',
        iconName: 'Crown',
        efficiencyTier: 'Tier-Elite',
        capabilities: ['audio', 'text'],
        isPaid: 1,
        featuresJson: AUDIO_FEATURES_JSON,
        config: {
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Higher-fidelity Gemini TTS preview model with single-speaker and two-speaker speech controls.',
            textInputModalities: ['text'],
            textOutputModalities: ['audio'],
            textVoices: GOOGLE_TTS_VOICES,
            textToSpeechControllable: true,
            textToSpeechModes: ['single-speaker', 'two-speaker'],
            textPricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: false,
                currency: 'usd',
                estimateMode: 'paid-tier',
                promptTextUsdPer1M: 1.0,
                completionAudioUsdPer1M: 20.0
            }
        }
    },
    'gemini-2.5-flash-image': {
        label: 'Gemini 2.5 Flash Image',
        category: 'Visual',
        iconName: 'Image',
        efficiencyTier: 'Tier-Stable',
        capabilities: ['image'],
        isPaid: 1,
        featuresJson: VISUAL_FEATURES_JSON,
        config: {
            supportedRatios: GOOGLE_IMAGE_RATIO_OPTIONS,
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Google native image generation model. Billing-enabled API key required.',
            imagePricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: false,
                currency: 'usd',
                estimateMode: 'paid-tier',
                promptTextUsdPer1M: 0.3,
                completionImageUsdPerImage: 0.039,
                completionImageUsdPer1M: 30.0
            }
        }
    },
    'gemini-3.1-flash-image-preview': {
        label: 'Gemini 3.1 Flash Image Preview',
        category: 'Visual',
        iconName: 'Sparkles',
        efficiencyTier: 'Tier-Elite',
        capabilities: ['image', 'search'],
        isPaid: 1,
        featuresJson: VISUAL_FEATURES_JSON,
        config: {
            supportedRatios: GOOGLE_IMAGE_RATIO_OPTIONS,
            dashboardUrl: GOOGLE_MODELS_DOCS_URL,
            ratioNotes: 'Google image preview model with Search grounding support. Billing-enabled API key required.',
            imagePricing: {
                docsUrl: GOOGLE_PRICING_DOCS_URL,
                freeTier: false
            }
        }
    }
};

const formatTokenLimit = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(numeric % 1000000 === 0 ? 0 : 1)}M`;
    if (numeric >= 1000) return `${Math.round(numeric / 1000)}K`;
    return `${numeric}`;
};

const buildLimitsLabel = (model) => {
    const inputLabel = formatTokenLimit(model?.inputTokenLimit);
    const outputLabel = formatTokenLimit(model?.outputTokenLimit);
    if (inputLabel && outputLabel) return `${inputLabel} in | ${outputLabel} out`;
    if (inputLabel) return `${inputLabel} input`;
    if (outputLabel) return `${outputLabel} output`;
    return '';
};

const buildGoogleModelConfig = (catalogEntry, remoteModel) => {
    const baseConfig = catalogEntry.config || {};
    return JSON.stringify({
        ...baseConfig,
        googleModelName: remoteModel.name,
        googleDisplayName: remoteModel.displayName || catalogEntry.label,
        googleDescription: remoteModel.description || '',
        googleSupportedGenerationMethods: Array.isArray(remoteModel.supportedGenerationMethods)
            ? remoteModel.supportedGenerationMethods
            : [],
        textContextLength: Number.isFinite(remoteModel.inputTokenLimit) ? Number(remoteModel.inputTokenLimit) : undefined,
        outputTokenLimit: Number.isFinite(remoteModel.outputTokenLimit) ? Number(remoteModel.outputTokenLimit) : undefined,
        temperature: Number.isFinite(remoteModel.temperature) ? Number(remoteModel.temperature) : undefined,
        topP: Number.isFinite(remoteModel.topP) ? Number(remoteModel.topP) : undefined,
        topK: Number.isFinite(remoteModel.topK) ? Number(remoteModel.topK) : undefined,
        googleSyncedAt: Date.now()
    });
};

export const fetchAllGoogleModels = async (apiKey) => {
    const trimmedKey = String(apiKey || '').trim();
    if (!trimmedKey) {
        throw new Error('Google Gemini API key is not configured on the server.');
    }

    const models = [];
    let pageToken = '';

    do {
        const url = new URL(GOOGLE_MODELS_ENDPOINT);
        url.searchParams.set('key', trimmedKey);
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(20000)
        });

        if (!res.ok) {
            let message = `Google models.list failed (${res.status})`;
            try {
                const payload = await res.json();
                if (payload?.error?.message) message = payload.error.message;
            } catch (_e) {}
            throw new Error(message);
        }

        const payload = await res.json();
        if (Array.isArray(payload?.models)) {
            models.push(...payload.models);
        }
        pageToken = typeof payload?.nextPageToken === 'string' ? payload.nextPageToken : '';
    } while (pageToken);

    return models;
};

export const buildGoogleRegistryEntries = (remoteModels = []) => {
    const byId = new Map(
        remoteModels.map((model) => [
            String(model?.name || '').replace(/^models\//, '').trim(),
            model
        ])
    );

    return Object.entries(GOOGLE_MODEL_CATALOG)
        .map(([id, catalogEntry]) => {
            const remoteModel = byId.get(id);
            if (!remoteModel) return null;

            return {
                id,
                label: remoteModel.displayName || catalogEntry.label,
                description: String(remoteModel.description || catalogEntry.label || '').trim(),
                provider: 'google',
                category: catalogEntry.category,
                upstreamId: id,
                systemInstruction: '',
                iconName: catalogEntry.iconName,
                efficiencyTier: catalogEntry.efficiencyTier,
                configJson: buildGoogleModelConfig(catalogEntry, remoteModel),
                uiConfigJson: catalogEntry.category === 'Audio'
                    ? JSON.stringify(buildGoogleTtsUiSchema())
                    : null,
                featuresJson: catalogEntry.featuresJson,
                isProgrammable: 0,
                requestMethod: null,
                requestUrl: null,
                requestHeaders: null,
                requestBodyTemplate: null,
                responsePath: null,
                capabilities: catalogEntry.capabilities.join(','),
                isSystem: 1,
                apiKey: null,
                limits: buildLimitsLabel(remoteModel),
                isPaid: catalogEntry.isPaid
            };
        })
        .filter(Boolean);
};

export const syncGoogleRegistryModels = async ({ dbGet, dbRun, apiKey }) => {
    const remoteModels = await fetchAllGoogleModels(apiKey);
    const entries = buildGoogleRegistryEntries(remoteModels);
    const syncedIds = entries.map((entry) => entry.id);
    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
        const existing = await dbGet(`SELECT id, isSystem FROM custom_engines WHERE id = ?`, [entry.id]);
        if (existing && !existing.isSystem) {
            continue;
        }

        if (existing) {
            await dbRun(
                `UPDATE custom_engines SET
                    label=?,
                    description=?,
                    provider='google',
                    category=?,
                    upstreamId=?,
                    systemInstruction='',
                    iconName=?,
                    efficiencyTier=?,
                    configJson=?,
                    uiConfigJson=?,
                    featuresJson=?,
                    isProgrammable=0,
                    requestMethod=?,
                    requestUrl=?,
                    requestHeaders=?,
                    requestBodyTemplate=?,
                    responsePath=?,
                    capabilities=?,
                    isSystem=1,
                    apiKey=NULL,
                    limits=?,
                    isPaid=?
                  WHERE id=?`,
                [
                    entry.label,
                    entry.description,
                    entry.category,
                    entry.upstreamId,
                    entry.iconName,
                    entry.efficiencyTier,
                    entry.configJson,
                    entry.uiConfigJson,
                    entry.featuresJson,
                    entry.requestMethod,
                    entry.requestUrl,
                    entry.requestHeaders,
                    entry.requestBodyTemplate,
                    entry.responsePath,
                    entry.capabilities,
                    entry.limits,
                    entry.isPaid,
                    entry.id
                ]
            );
            updated += 1;
        } else {
            await dbRun(
                `INSERT INTO custom_engines (
                    id, label, description, provider, category, upstreamId, systemInstruction,
                    iconName, efficiencyTier, configJson, uiConfigJson, featuresJson,
                    isProgrammable, requestMethod, requestUrl, requestHeaders, requestBodyTemplate, responsePath,
                    capabilities, isSystem, apiKey, limits, isTested, defaultNegativePrompt, isPaid
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    entry.id,
                    entry.label,
                    entry.description,
                    'google',
                    entry.category,
                    entry.upstreamId,
                    '',
                    entry.iconName,
                    entry.efficiencyTier,
                    entry.configJson,
                    entry.uiConfigJson,
                    entry.featuresJson,
                    0,
                    entry.requestMethod,
                    entry.requestUrl,
                    entry.requestHeaders,
                    entry.requestBodyTemplate,
                    entry.responsePath,
                    entry.capabilities,
                    1,
                    null,
                    entry.limits,
                    0,
                    null,
                    entry.isPaid
                ]
            );
            inserted += 1;
        }
    }

    if (syncedIds.length > 0) {
        const placeholders = syncedIds.map(() => '?').join(',');
        await dbRun(
            `DELETE FROM custom_engines
             WHERE provider = 'google'
               AND isSystem = 1
               AND id NOT IN (${placeholders})`,
            syncedIds
        );
    }

    return {
        source: GOOGLE_MODELS_ENDPOINT,
        totalRemote: remoteModels.length,
        totalSynced: entries.length,
        inserted,
        updated,
        skipped: Math.max(0, remoteModels.length - entries.length),
        syncedIds
    };
};
