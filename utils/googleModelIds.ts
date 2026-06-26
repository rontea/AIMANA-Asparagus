export const DEFAULT_GOOGLE_TEXT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GOOGLE_LITE_TEXT_MODEL = 'gemini-2.5-flash-lite';
export const DEFAULT_GOOGLE_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL = 'gemini-3.1-flash-image-preview';
export const DEFAULT_GOOGLE_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

export const LEGACY_GOOGLE_MODEL_ID_MAP: Record<string, string> = {
    'gemini-3-flash-preview': DEFAULT_GOOGLE_TEXT_MODEL,
    'gemini-3-pro-preview': DEFAULT_GOOGLE_LITE_TEXT_MODEL,
    'gemini-flash-latest': DEFAULT_GOOGLE_TEXT_MODEL,
    'gemini-flash-lite-latest': DEFAULT_GOOGLE_LITE_TEXT_MODEL,
    'gemini-3-pro-image-preview': DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL
};

export const normalizeGoogleModelId = (modelId?: string | null): string => {
    const trimmed = typeof modelId === 'string' ? modelId.trim() : '';
    if (!trimmed) return '';
    return LEGACY_GOOGLE_MODEL_ID_MAP[trimmed] || trimmed;
};

export const normalizeGoogleModelIds = (modelIds: Array<string | null | undefined> = []): string[] => {
    const deduped = new Set<string>();
    for (const modelId of modelIds) {
        const normalized = normalizeGoogleModelId(modelId);
        if (normalized) deduped.add(normalized);
    }
    return Array.from(deduped);
};

export const isPaidGoogleModelId = (modelId?: string | null): boolean => {
    const normalized = normalizeGoogleModelId(modelId);
    return normalized === DEFAULT_GOOGLE_IMAGE_MODEL || normalized === DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL;
};

export const supportsGoogleSearchGrounding = (modelId?: string | null): boolean => {
    return normalizeGoogleModelId(modelId) === DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL;
};
