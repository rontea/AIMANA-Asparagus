import type { ModelOption } from '../components/project/lab/ModelSelector/types';

type PricingRecord = Record<string, unknown>;

export interface ModelCreditRate {
    id: string;
    label: string;
    value: number;
    displayValue: string;
    detail?: string;
}

export interface ResolvedPollenCharge {
    amount: number | null;
    isEstimated: boolean;
}

const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const trimTrailingZeroes = (value: string) => value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');

export const formatPollenAmount = (value: unknown, maxDecimals = 6): string => {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return String(value || '');
    if (parsed === 0) return '0';
    if (Math.abs(parsed) >= 1) return trimTrailingZeroes(parsed.toFixed(Math.min(4, maxDecimals)));
    const rounded = trimTrailingZeroes(parsed.toFixed(maxDecimals));
    if (rounded === '0') return `<0.${'0'.repeat(Math.max(0, maxDecimals - 1))}1`;
    return rounded;
};

const getPricingRecord = (model?: Partial<ModelOption> | null): PricingRecord | null => {
    if (!model) return null;
    const pricing = model.category === 'Visual' && model.imagePricing
        ? model.imagePricing
        : model.category === 'Motion' && model.videoPricing
            ? model.videoPricing
            : (model.textPricing || model.imagePricing || model.videoPricing || null);
    if (!pricing || typeof pricing !== 'object') return null;
    const currency = typeof pricing.currency === 'string' ? pricing.currency.toLowerCase() : '';
    if (currency && currency !== 'pollen') return null;
    if (!currency && model.provider && model.provider !== 'pollinations' && model.provider !== 'Gateway') return null;
    return pricing;
};

const getAudioRate = (pricing: PricingRecord | null): { value: number; unit: 'seconds' | 'tokens' } | null => {
    if (!pricing) return null;

    const perSecond = toFiniteNumber(pricing.completionAudioSeconds) ?? toFiniteNumber(pricing.promptAudioSeconds);
    if (perSecond !== null) {
        return { value: perSecond, unit: 'seconds' };
    }

    const perToken = toFiniteNumber(pricing.completionAudioTokens);
    if (perToken !== null) {
        return { value: perToken, unit: 'tokens' };
    }

    return null;
};

const estimateTokenCount = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
};

export const estimateSpeechDurationSeconds = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text) return 0;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const baseSeconds = (wordCount / 150) * 60;
    const punctuationPauses = (text.match(/[.!?;:]/g) || []).length * 0.3;
    const commaPauses = (text.match(/[,]/g) || []).length * 0.15;
    const newlinePauses = (text.match(/\n+/g) || []).length * 0.6;
    return Math.max(1, Math.round(baseSeconds + punctuationPauses + commaPauses + newlinePauses));
};

export const getModelCreditRates = (model?: Partial<ModelOption> | null): ModelCreditRate[] => {
    const pricing = getPricingRecord(model);
    if (!pricing) return [];

    const rates: ModelCreditRate[] = [];
    const imageRate = toFiniteNumber(pricing.completionImageTokens);
    const videoSecondRate = toFiniteNumber(pricing.completionVideoSeconds);
    const videoTokenRate = toFiniteNumber(pricing.completionVideoTokens);
    const audioRate = getAudioRate(pricing);
    const promptAudioTokenRate = toFiniteNumber(pricing.promptAudioTokens);
    const promptTextRate = toFiniteNumber(pricing.promptTextTokens);
    const completionTextRate = toFiniteNumber(pricing.completionTextTokens);

    if (imageRate !== null) {
        rates.push({
            id: 'completionImageTokens',
            label: 'Image',
            value: imageRate,
            displayValue: `${formatPollenAmount(imageRate)} / img`,
            detail: `${formatPollenAmount(imageRate)} pollen per generation`
        });
    }

    if (videoSecondRate !== null) {
        rates.push({
            id: 'completionVideoSeconds',
            label: 'Video',
            value: videoSecondRate,
            displayValue: `${formatPollenAmount(videoSecondRate * 3600)} / hour`,
            detail: `${formatPollenAmount(videoSecondRate)} / sec`
        });
    }

    if (videoTokenRate !== null) {
        rates.push({
            id: 'completionVideoTokens',
            label: 'Video',
            value: videoTokenRate,
            displayValue: `${formatPollenAmount(videoTokenRate * 1000)} / 1K video tok`,
            detail: `${formatPollenAmount(videoTokenRate)} / video tok`
        });
    }

    if (audioRate !== null) {
        rates.push({
            id: 'completionAudioSeconds',
            label: 'Audio',
            value: audioRate.value,
            displayValue: audioRate.unit === 'seconds'
                ? `${formatPollenAmount(audioRate.value * 60)} / min`
                : `${formatPollenAmount(audioRate.value * 1000)} / 1K audio tok`,
            detail: audioRate.unit === 'seconds'
                ? `${formatPollenAmount(audioRate.value)} / sec`
                : `${formatPollenAmount(audioRate.value)} / audio tok`
        });
    }

    if (promptTextRate !== null) {
        rates.push({
            id: 'promptTextTokens',
            label: 'Input',
            value: promptTextRate,
            displayValue: `${formatPollenAmount(promptTextRate * 1000)} / 1K in tok`
        });
    }

    if (promptAudioTokenRate !== null) {
        rates.push({
            id: 'promptAudioTokens',
            label: 'Audio In',
            value: promptAudioTokenRate,
            displayValue: `${formatPollenAmount(promptAudioTokenRate * 1000)} / 1K audio in tok`
        });
    }

    if (completionTextRate !== null) {
        rates.push({
            id: 'completionTextTokens',
            label: 'Output',
            value: completionTextRate,
            displayValue: `${formatPollenAmount(completionTextRate * 1000)} / 1K out tok`
        });
    }

    return rates;
};

export const getPrimaryModelCreditRate = (model?: Partial<ModelOption> | null): ModelCreditRate | null => {
    const rates = getModelCreditRates(model);
    if (rates.length === 0) return null;

    const preferredOrder = model?.category === 'Visual'
        ? ['completionImageTokens']
        : model?.category === 'Motion'
            ? ['completionVideoSeconds', 'completionVideoTokens']
            : model?.category === 'Audio'
                ? ['completionAudioSeconds']
                : ['completionTextTokens', 'promptTextTokens', 'promptAudioTokens'];

    return rates.find((rate) => preferredOrder.includes(rate.id)) || rates[0] || null;
};

export const resolvePollenCharge = (options: {
    model?: Partial<ModelOption> | null;
    pollenUsed?: unknown;
    promptText?: unknown;
    completionText?: unknown;
    durationSeconds?: unknown;
}): ResolvedPollenCharge => {
    const explicit = toFiniteNumber(options.pollenUsed);
    if (explicit !== null && explicit > 0) {
        return {
            amount: explicit,
            isEstimated: false
        };
    }

    const pricing = getPricingRecord(options.model);
    if (!pricing) {
        return {
            amount: null,
            isEstimated: false
        };
    }

    const imageRate = toFiniteNumber(pricing.completionImageTokens);
    const videoSecondRate = toFiniteNumber(pricing.completionVideoSeconds);
    const audioRate = getAudioRate(pricing);
    const promptTextRate = toFiniteNumber(pricing.promptTextTokens);
    const completionTextRate = toFiniteNumber(pricing.completionTextTokens);
    const parsedDuration = toFiniteNumber(options.durationSeconds);
    const normalizedDuration = parsedDuration !== null && parsedDuration > 0
        ? parsedDuration
        : estimateSpeechDurationSeconds(options.promptText);

    let amount = 0;
    let hasEstimate = false;

    if (imageRate !== null) {
        amount += imageRate;
        hasEstimate = true;
    }

    if (videoSecondRate !== null && normalizedDuration > 0) {
        amount += videoSecondRate * normalizedDuration;
        hasEstimate = true;
    }

    if (audioRate !== null) {
        if (audioRate.unit === 'seconds' && normalizedDuration > 0) {
            amount += audioRate.value * normalizedDuration;
            hasEstimate = true;
        } else if (audioRate.unit === 'tokens') {
            const audioTokens = estimateTokenCount(options.completionText ?? options.promptText);
            if (audioTokens > 0) {
                amount += audioRate.value * audioTokens;
                hasEstimate = true;
            }
        }
    }

    if (promptTextRate !== null) {
        const promptTokens = estimateTokenCount(options.promptText);
        if (promptTokens > 0) {
            amount += promptTextRate * promptTokens;
            hasEstimate = true;
        }
    }

    if (completionTextRate !== null) {
        const completionTokens = estimateTokenCount(options.completionText);
        if (completionTokens > 0) {
            amount += completionTextRate * completionTokens;
            hasEstimate = true;
        }
    }

    if (!hasEstimate || amount <= 0) {
        return {
            amount: null,
            isEstimated: false
        };
    }

    return {
        amount: Number(amount.toFixed(6)),
        isEstimated: true
    };
};

export const extractPollenUsed = (metadata?: any, archivedAiParameters?: string | null): string | null => {
    const directCandidates = [
        metadata?.pollenUsed,
        metadata?.advanced_params?.pollenUsed,
        metadata?.dynamicParams?.pollenUsed
    ];

    for (const value of directCandidates) {
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }

    if (!archivedAiParameters) return null;

    try {
        const parsed = JSON.parse(archivedAiParameters);
        const nestedCandidates = [
            parsed?.pollenUsed,
            parsed?.advanced_params?.pollenUsed,
            parsed?.dynamicParams?.pollenUsed
        ];
        for (const value of nestedCandidates) {
            if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
        }
    } catch (_error) {
        return null;
    }

    return null;
};
