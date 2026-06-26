export const qwenImage = {
    id: 'pollinations-qwen-image',
    label: 'Qwen Image',
    description: 'Qwen Image Plus via Pollinations for text-to-image and reference-guided edits.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Advanced',
    isProgrammable: 1,
    capabilities: 'image,creative,image-edit',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=qwen-image&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&image={{image}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: false,
        showGuidance: false,
        showImageInput: true
    }),
    uiConfigJson: JSON.stringify([])
};
