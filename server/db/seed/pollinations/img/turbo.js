export const turboInstant = {
    id: 'pollinations-turbo',
    label: 'Turbo Instant',
    description: 'High-speed visual synthesis optimized for rapid prototyping and brainstorming.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Wind',
    efficiencyTier: 'Tier-Express',
    isProgrammable: 1,
    capabilities: 'image,fast',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=turbo&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&guidance={{guidance_scale}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: true,
        showNologo: false,
        showGuidance: true
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