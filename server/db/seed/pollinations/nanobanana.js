
export const nanobananaPro = {
    id: 'pollinations-nanobanana-pro',
    label: 'nanoBanana Pro',
    description: 'Optimized compressed weights for high-fidelity stylized manifestations.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Zap',
    efficiencyTier: 'Tier-Express',
    isProgrammable: 1,
    capabilities: 'image,fast,pro',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=nanobanana-pro&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: true,
        showNologo: false
    })
};
