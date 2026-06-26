export const pImage = {
    id: 'pollinations-p-image',
    label: 'P-Image',
    description: 'Premium Pollinations image model for paid high-fidelity visual generation.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,high-fidelity,paid',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=p-image&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    isPaid: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: false,
        showGuidance: true,
        showImageInput: false
    }),
    uiConfigJson: JSON.stringify([
        {
            key: 'guidance_scale',
            label: 'Prompt Guidance (CFG)',
            type: 'slider',
            min: 1,
            max: 30,
            step: 0.5,
            default: 7.5,
            description: 'Prompt adherence strength'
        }
    ])
};
