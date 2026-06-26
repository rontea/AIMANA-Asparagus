
export const seedance = {
    id: 'pollinations-seedance',
    label: 'SeeDance Pro',
    description: 'Advanced temporal synthesis for Image-to-Video and Text-to-Video.',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Activity',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,interpolation',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=seedance-pro&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&image={{image}}',
    requestHeaders: '{"Accept": "video/mp4"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showImageInput: true,
        showNegativePrompt: false,
        showEnhancements: false,
        showNologo: false
    }),
    uiConfigJson: JSON.stringify([
        { key: 'duration', label: 'Duration (s)', type: 'slider', min: 2, max: 10, step: 1, default: 5 }
    ])
};
