import type { ModelOption } from '../components/project/lab/ModelSelector/types';

type PricingRecord = Record<string, unknown>;

export interface GoogleUsageSnapshot {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
    trafficType?: string;
    modelVersion?: string;
}

export interface GoogleRateInfo {
    id: string;
    label: string;
    value: number;
    displayValue: string;
    detail?: string;
}

export interface ResolvedGoogleCharge {
    amountUsd: number | null;
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

const getGooglePricingRecord = (model?: Partial<ModelOption> | null): PricingRecord | null => {
    if (!model || model.provider !== 'google') return null;
    if (model.category === 'Visual' && model.imagePricing) return model.imagePricing;
    if (model.category === 'Motion' && model.videoPricing) return model.videoPricing;
    if (model.textPricing) return model.textPricing;
    return model.imagePricing || model.videoPricing || model.textPricing || null;
};

export const formatGoogleUsd = (value: unknown, maxDecimals = 6): string => {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return '$0';
    if (parsed === 0) return '$0';
    if (Math.abs(parsed) >= 1) return `$${trimTrailingZeroes(parsed.toFixed(Math.min(4, maxDecimals)))}`;
    return `$${trimTrailingZeroes(parsed.toFixed(maxDecimals))}`;
};

export const formatGoogleTokenCount = (value: unknown): string => {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return '0';
    if (parsed >= 1000000) return `${trimTrailingZeroes((parsed / 1000000).toFixed(2))}M`;
    if (parsed >= 1000) return `${trimTrailingZeroes((parsed / 1000).toFixed(1))}K`;
    return `${Math.round(parsed)}`;
};

export const normalizeGoogleUsage = (raw: any): GoogleUsageSnapshot | null => {
    if (!raw || typeof raw !== 'object') return null;

    const usage: GoogleUsageSnapshot = {};
    const promptTokenCount = toFiniteNumber(raw.promptTokenCount);
    const candidatesTokenCount = toFiniteNumber(raw.candidatesTokenCount);
    const totalTokenCount = toFiniteNumber(raw.totalTokenCount);
    const cachedContentTokenCount = toFiniteNumber(raw.cachedContentTokenCount);
    const thoughtsTokenCount = toFiniteNumber(raw.thoughtsTokenCount);

    if (promptTokenCount !== null) usage.promptTokenCount = promptTokenCount;
    if (candidatesTokenCount !== null) usage.candidatesTokenCount = candidatesTokenCount;
    if (totalTokenCount !== null) usage.totalTokenCount = totalTokenCount;
    if (cachedContentTokenCount !== null) usage.cachedContentTokenCount = cachedContentTokenCount;
    if (thoughtsTokenCount !== null) usage.thoughtsTokenCount = thoughtsTokenCount;
    if (typeof raw.trafficType === 'string' && raw.trafficType.trim()) usage.trafficType = raw.trafficType.trim();
    if (typeof raw.modelVersion === 'string' && raw.modelVersion.trim()) usage.modelVersion = raw.modelVersion.trim();

    return Object.keys(usage).length > 0 ? usage : null;
};

export const summarizeGoogleUsage = (usage?: GoogleUsageSnapshot | null): string | null => {
    if (!usage) return null;
    const parts: string[] = [];
    if (toFiniteNumber(usage.promptTokenCount) !== null) parts.push(`${formatGoogleTokenCount(usage.promptTokenCount)} in`);
    if (toFiniteNumber(usage.candidatesTokenCount) !== null) parts.push(`${formatGoogleTokenCount(usage.candidatesTokenCount)} out`);
    if (toFiniteNumber(usage.totalTokenCount) !== null) parts.push(`${formatGoogleTokenCount(usage.totalTokenCount)} total`);
    return parts.length > 0 ? parts.join(' | ') : null;
};

export const getGoogleApiRates = (model?: Partial<ModelOption> | null): GoogleRateInfo[] => {
    const pricing = getGooglePricingRecord(model);
    if (!pricing) return [];

    const rates: GoogleRateInfo[] = [];
    const promptTextUsdPer1M = toFiniteNumber(pricing.promptTextUsdPer1M);
    const completionTextUsdPer1M = toFiniteNumber(pricing.completionTextUsdPer1M);
    const completionAudioUsdPer1M = toFiniteNumber(pricing.completionAudioUsdPer1M);
    const completionImageUsdPerImage = toFiniteNumber(pricing.completionImageUsdPerImage);

    if (promptTextUsdPer1M !== null) {
        rates.push({
            id: 'promptTextUsdPer1M',
            label: 'Input',
            value: promptTextUsdPer1M,
            displayValue: `${formatGoogleUsd(promptTextUsdPer1M)} / 1M in tok`,
            detail: 'Paid-tier estimate from Google pricing docs.'
        });
    }

    if (completionTextUsdPer1M !== null) {
        rates.push({
            id: 'completionTextUsdPer1M',
            label: 'Output',
            value: completionTextUsdPer1M,
            displayValue: `${formatGoogleUsd(completionTextUsdPer1M)} / 1M out tok`,
            detail: 'Paid-tier estimate from Google pricing docs.'
        });
    }

    if (completionAudioUsdPer1M !== null) {
        rates.push({
            id: 'completionAudioUsdPer1M',
            label: 'Audio',
            value: completionAudioUsdPer1M,
            displayValue: `${formatGoogleUsd(completionAudioUsdPer1M)} / 1M audio tok`,
            detail: 'Paid-tier estimate from Google pricing docs.'
        });
    }

    if (completionImageUsdPerImage !== null) {
        rates.push({
            id: 'completionImageUsdPerImage',
            label: 'Image',
            value: completionImageUsdPerImage,
            displayValue: `${formatGoogleUsd(completionImageUsdPerImage)} / img`,
            detail: 'Paid-tier estimate from Google pricing docs.'
        });
    }

    return rates;
};

export const getPrimaryGoogleApiRate = (model?: Partial<ModelOption> | null): GoogleRateInfo | null => {
    const rates = getGoogleApiRates(model);
    if (rates.length === 0) return null;

    const preferredOrder = model?.category === 'Visual'
        ? ['completionImageUsdPerImage', 'promptTextUsdPer1M']
        : model?.category === 'Audio'
            ? ['completionAudioUsdPer1M', 'promptTextUsdPer1M']
            : ['completionTextUsdPer1M', 'promptTextUsdPer1M'];

    return rates.find((rate) => preferredOrder.includes(rate.id)) || rates[0] || null;
};

export const resolveGoogleApiCharge = (options: {
    model?: Partial<ModelOption> | null;
    usage?: GoogleUsageSnapshot | null;
    outputImageCount?: number;
}): ResolvedGoogleCharge => {
    const pricing = getGooglePricingRecord(options.model);
    const usage = normalizeGoogleUsage(options.usage);
    if (!pricing || !usage) {
        return { amountUsd: null, isEstimated: false };
    }

    const promptTextUsdPer1M = toFiniteNumber(pricing.promptTextUsdPer1M);
    const completionTextUsdPer1M = toFiniteNumber(pricing.completionTextUsdPer1M);
    const completionAudioUsdPer1M = toFiniteNumber(pricing.completionAudioUsdPer1M);
    const completionImageUsdPerImage = toFiniteNumber(pricing.completionImageUsdPerImage);

    let amountUsd = 0;
    let hasEstimate = false;

    if (promptTextUsdPer1M !== null && toFiniteNumber(usage.promptTokenCount) !== null) {
        amountUsd += promptTextUsdPer1M * ((usage.promptTokenCount || 0) / 1000000);
        hasEstimate = true;
    }

    if (options.model?.category === 'Audio' && completionAudioUsdPer1M !== null && toFiniteNumber(usage.candidatesTokenCount) !== null) {
        amountUsd += completionAudioUsdPer1M * ((usage.candidatesTokenCount || 0) / 1000000);
        hasEstimate = true;
    } else if (options.model?.category === 'Language' && completionTextUsdPer1M !== null && toFiniteNumber(usage.candidatesTokenCount) !== null) {
        amountUsd += completionTextUsdPer1M * ((usage.candidatesTokenCount || 0) / 1000000);
        hasEstimate = true;
    } else if (options.model?.category === 'Visual') {
        if (completionImageUsdPerImage !== null) {
            const imageCount = Math.max(1, Math.round(toFiniteNumber(options.outputImageCount) || 1));
            amountUsd += completionImageUsdPerImage * imageCount;
            hasEstimate = true;
        } else if (completionTextUsdPer1M !== null && toFiniteNumber(usage.candidatesTokenCount) !== null) {
            amountUsd += completionTextUsdPer1M * ((usage.candidatesTokenCount || 0) / 1000000);
            hasEstimate = true;
        }
    }

    if (!hasEstimate || amountUsd <= 0) {
        return { amountUsd: null, isEstimated: false };
    }

    return {
        amountUsd: Number(amountUsd.toFixed(6)),
        isEstimated: true
    };
};

export const extractGoogleUsage = (metadata?: any, archivedAiParameters?: string | null): GoogleUsageSnapshot | null => {
    const directCandidates = [
        metadata?.googleUsage,
        metadata?.advanced_params?.googleUsage,
        metadata?.dynamicParams?.googleUsage
    ];

    for (const value of directCandidates) {
        const normalized = normalizeGoogleUsage(value);
        if (normalized) return normalized;
    }

    if (!archivedAiParameters) return null;

    try {
        const parsed = JSON.parse(archivedAiParameters);
        const nestedCandidates = [
            parsed?.googleUsage,
            parsed?.advanced_params?.googleUsage,
            parsed?.dynamicParams?.googleUsage
        ];
        for (const value of nestedCandidates) {
            const normalized = normalizeGoogleUsage(value);
            if (normalized) return normalized;
        }
    } catch (_error) {
        return null;
    }

    return null;
};

export const extractGoogleEstimatedCostUsd = (metadata?: any, archivedAiParameters?: string | null): number | null => {
    const directCandidates = [
        metadata?.googleEstimatedCostUsd,
        metadata?.advanced_params?.googleEstimatedCostUsd,
        metadata?.dynamicParams?.googleEstimatedCostUsd
    ];

    for (const value of directCandidates) {
        const parsed = toFiniteNumber(value);
        if (parsed !== null) return parsed;
    }

    if (!archivedAiParameters) return null;

    try {
        const parsed = JSON.parse(archivedAiParameters);
        const nestedCandidates = [
            parsed?.googleEstimatedCostUsd,
            parsed?.advanced_params?.googleEstimatedCostUsd,
            parsed?.dynamicParams?.googleEstimatedCostUsd
        ];
        for (const value of nestedCandidates) {
            const numeric = toFiniteNumber(value);
            if (numeric !== null) return numeric;
        }
    } catch (_error) {
        return null;
    }

    return null;
};
