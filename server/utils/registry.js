export const toPublicRegistryRow = (row) => ({
    ...(() => {
        let parsedConfig = {};
        try {
            parsedConfig = row.configJson ? JSON.parse(row.configJson) : {};
        } catch (_e) {
            parsedConfig = {};
        }
        return {
            supportedRatios: Array.isArray(parsedConfig.supportedRatios) ? parsedConfig.supportedRatios : undefined,
            dashboardUrl: typeof parsedConfig.dashboardUrl === 'string' ? parsedConfig.dashboardUrl : undefined,
            ratioNotes: typeof parsedConfig.ratioNotes === 'string' ? parsedConfig.ratioNotes : undefined,
            imagePricing: parsedConfig.imagePricing && typeof parsedConfig.imagePricing === 'object' ? parsedConfig.imagePricing : undefined,
            videoPricing: parsedConfig.videoPricing && typeof parsedConfig.videoPricing === 'object' ? parsedConfig.videoPricing : undefined,
            textContextLength: Number.isFinite(parsedConfig.textContextLength) ? Number(parsedConfig.textContextLength) : undefined,
            textTools: typeof parsedConfig.textTools === 'boolean' ? parsedConfig.textTools : undefined,
            textReasoning: typeof parsedConfig.textReasoning === 'boolean' ? parsedConfig.textReasoning : undefined,
            textPaidOnly: typeof parsedConfig.textPaidOnly === 'boolean' ? parsedConfig.textPaidOnly : undefined,
            textSpecialized: typeof parsedConfig.textSpecialized === 'boolean' ? parsedConfig.textSpecialized : undefined,
            textInputModalities: Array.isArray(parsedConfig.textInputModalities) ? parsedConfig.textInputModalities : undefined,
            textOutputModalities: Array.isArray(parsedConfig.textOutputModalities) ? parsedConfig.textOutputModalities : undefined,
            textAliases: Array.isArray(parsedConfig.textAliases) ? parsedConfig.textAliases : undefined,
            textPricing: parsedConfig.textPricing && typeof parsedConfig.textPricing === 'object' ? parsedConfig.textPricing : undefined,
            textVoices: Array.isArray(parsedConfig.textVoices) ? parsedConfig.textVoices : undefined
        };
    })(),
    id: row.id,
    label: row.label,
    description: row.description,
    provider: row.provider,
    category: row.category,
    upstreamId: row.upstreamId,
    iconName: row.iconName,
    efficiencyTier: row.efficiencyTier,
    uiConfigJson: row.uiConfigJson,
    featuresJson: row.featuresJson,
    capabilities: row.capabilities,
    isSystem: row.isSystem,
    limits: row.limits,
    isTested: row.isTested,
    defaultNegativePrompt: row.defaultNegativePrompt,
    verifiedPrompt: row.verifiedPrompt,
    verificationNotes: row.verificationNotes,
    verifiedMimeType: row.verifiedMimeType,
    verifiedParams: row.verifiedParams,
    isPaid: row.isPaid,
    isProgrammable: row.isProgrammable
});
