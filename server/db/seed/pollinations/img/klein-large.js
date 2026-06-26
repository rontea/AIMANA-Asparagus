export const kleinLarge = {
    id: 'pollinations-klein-large',
    label: 'Klein Large',
    description: 'Extended scale visual synthesis with enhanced structural depth, superior prompt fidelity, and balanced aesthetic distribution.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,high-fidelity,klein-large',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=klein-large&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
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
