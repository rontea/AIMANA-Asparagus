export const grokImagine = {
    id: 'pollinations-grok-imagine',
    label: 'Grok Imagine',
    description: 'Pollinations image model tuned for bold concept rendering and fast imaginative visual ideation.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Experimental',
    isProgrammable: 1,
    capabilities: 'image,creative,conceptual,grok-imagine',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=grok-imagine&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: false,
        showImageInput: false,
        showGuidance: false
    }),
    uiConfigJson: JSON.stringify([])
};
