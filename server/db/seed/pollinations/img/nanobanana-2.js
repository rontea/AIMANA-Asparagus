export const nanobanana2 = {
    id: 'pollinations-nanobanana-2',
    label: 'NanoBanana 2',
    description: 'Second-generation paid NanoBanana image model with faster guided image generation and edit support.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Zap',
    efficiencyTier: 'Tier-Advanced',
    isProgrammable: 1,
    capabilities: 'image,fast,paid,image-edit',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=nanobanana-2&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}&image={{image}}',
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
