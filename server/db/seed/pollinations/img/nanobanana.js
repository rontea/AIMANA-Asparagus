export const nanobanana = {
    id: 'pollinations-nanobanana',
    label: 'NanoBanana',
    description: 'Ultra-compressed neural weights for lightning-fast, stylized asset manifestation.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Zap',
    efficiencyTier: 'Tier-Express',
    isProgrammable: 1,
    capabilities: 'image,fast',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=nanobanana&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}&image={{image}}',
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
