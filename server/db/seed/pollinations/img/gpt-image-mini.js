export const gptImageMini = {
    id: 'pollinations-gpt-image-mini',
    label: 'GPT Image 1 Mini',
    description: 'Compact visual logic engine for stylized, high-cadence creative assets.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Zap',
    efficiencyTier: 'Tier-Express',
    isProgrammable: 1,
    capabilities: 'image,fast,mini',
    isPaid: 0,
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=gptimage&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&quality={{quality}}&transparent={{transparent}}&guidance={{guidance_scale}}&image={{image}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: true,
        showNologo: false,
        showImageInput: true,
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
        },
        { 
            key: 'quality', 
            label: 'Engine Quality (gptimage)', 
            type: 'select', 
            default: 'low', 
            options: [
                { label: 'low', value: 'low' },
                { label: 'medium', value: 'medium' },
                { label: 'high', value: 'high' },
                { label: 'hd', value: 'hd' }
            ]
        },
        { key: 'transparent', label: 'Alpha Channel', type: 'toggle', default: false, description: 'Transparent background' }
    ])
};
