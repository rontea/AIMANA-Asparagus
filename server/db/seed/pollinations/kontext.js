
export const fluxKontext = {
    id: 'pollinations-kontext',
    label: 'FLUX Kontext',
    description: 'Advanced contextual synthesis for complex scene interpretation.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'BrainCircuit',
    efficiencyTier: 'Tier-Advanced',
    isProgrammable: 1,
    capabilities: 'image,contextual',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=kontext&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: false
    })
};
