export const gptImage15 = {
    id: 'pollinations-gpt-image-1-5',
    label: 'GPT Image 1.5',
    description: 'Enhanced aesthetic engine supporting high-fidelity quality tiers and alpha transparency.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Stable',
    isProgrammable: 1,
    capabilities: 'image,transparent,quality',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=gptimage&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&quality={{quality}}&transparent={{transparent}}&guidance={{guidance_scale}}&image={{image}}',
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
