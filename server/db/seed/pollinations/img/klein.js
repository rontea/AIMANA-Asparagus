export const kleinPrecision = {
    id: 'pollinations-klein',
    label: 'Klein',
    description: 'Next-generation visual synthesis with extreme prompt adherence, structural clarity, and advanced aesthetic balancing.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,high-fidelity,klein',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=klein&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: false,
        showImageInput: true,
        showGuidance: false
    }),
    uiConfigJson: JSON.stringify([])
};
