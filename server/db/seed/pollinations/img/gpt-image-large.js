export const gptImageLarge = {
    id: 'pollinations-gpt-image-large',
    label: 'GPT Image Large',
    description: 'Paid large GPT Image variant with quality tiers, transparency, and image editing support.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,quality,transparent,paid,image-edit',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=gptimage-large&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&quality={{quality}}&transparent={{transparent}}&guidance={{guidance_scale}}&image={{image}}',
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
        showImageInput: true
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
        },
        {
            key: 'quality',
            label: 'Output Quality',
            type: 'select',
            default: 'high',
            options: [
                { label: 'Low', value: 'low' },
                { label: 'Medium', value: 'medium' },
                { label: 'High', value: 'high' },
                { label: 'HD', value: 'hd' }
            ]
        },
        { key: 'transparent', label: 'Transparent Background', type: 'toggle', default: false, description: 'Transparent background' }
    ])
};
