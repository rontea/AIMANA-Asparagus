export const fluxKontext = {
    id: 'pollinations-kontext',
    label: 'FLUX.1 Kontext',
    description: 'Paid FLUX.1 Kontext image model for complex multi-subject visual compositions and reference-guided generation.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'BrainCircuit',
    efficiencyTier: 'Tier-Advanced',
    isProgrammable: 1,
    capabilities: 'image,contextual',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=kontext&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}&image={{image}}',
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
