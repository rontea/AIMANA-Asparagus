export const pImageEdit = {
    id: 'pollinations-p-image-edit',
    label: 'P-Image Edit',
    description: 'Premium Pollinations image editing model for paid reference-guided image generation.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Wand2',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,image-edit,detailed,paid',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=p-image-edit&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}&image={{image}}',
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
        }
    ])
};
