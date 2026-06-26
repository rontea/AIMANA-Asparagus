export const grokImaginePro = {
    id: 'pollinations-grok-imagine-pro',
    label: 'Grok Imagine Pro',
    description: 'Paid Aurora tier Grok image model for premium creative rendering.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Crown',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,creative,high-fidelity,paid,grok-imagine-pro',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=grok-imagine-pro&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    isPaid: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: false,
        showGuidance: false,
        showImageInput: false
    }),
    uiConfigJson: JSON.stringify([])
};
