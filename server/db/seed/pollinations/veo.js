
export const veoVideo = {
    id: 'pollinations-veo',
    label: 'Veo Cinematic',
    description: 'Native text-to-video engine for high-fidelity motion sequences.',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Video',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,audio,cinematic',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=veo&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}',
    requestHeaders: '{"Accept": "video/mp4"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: false,
        showNologo: false
    }),
    uiConfigJson: JSON.stringify([
        { 
            key: 'duration', 
            label: 'Clip Duration', 
            type: 'select', 
            default: 4, 
            options: [
                { label: '4 Seconds', value: 4 },
                { label: '6 Seconds', value: 6 },
                { label: '8 Seconds', value: 8 }
            ]
        },
        { key: 'audio', label: 'Generate Audio', type: 'toggle', default: false, description: 'Neural soundscape' }
    ])
};
