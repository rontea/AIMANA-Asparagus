
export const gptImage = {
    id: 'pollinations-gpt-image',
    label: 'GPT Image',
    description: 'Aesthetic engine supporting transparency and specific quality tiers.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Stable',
    isProgrammable: 1,
    capabilities: 'image,transparent,quality',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=gptimage&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&quality={{quality}}&transparent={{transparent}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: true,
        showNologo: false
    }),
    uiConfigJson: JSON.stringify([
        { 
            key: 'quality', 
            label: 'Output Quality', 
            type: 'select', 
            default: 'medium', 
            options: [
                { label: 'Low', value: 'low' },
                { label: 'Medium', value: 'medium' },
                { label: 'High', value: 'high' },
                { label: 'HD', value: 'hd' }
            ]
        },
        { key: 'transparent', label: 'Alpha Channel', type: 'toggle', default: false, description: 'Transparent background' }
    ])
};
