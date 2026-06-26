export const seedanceLite = {
    id: 'pollinations-seedance-lite',
    label: 'Seedance Lite (Legacy)',
    description: 'Legacy Seedance profile retained for backward compatibility.',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Video',
    efficiencyTier: 'Tier-Stable',
    isProgrammable: 1,
    capabilities: 'video,motion,fast',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model=seedance&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}&image={{image}}',
    requestHeaders: '{"Accept": "video/mp4"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: false,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: false,
        showNologo: false,
        showImageInput: true,
        showVideoRatio: true
    }),
    uiConfigJson: JSON.stringify([
        { 
            key: 'duration', 
            label: 'Temporal Depth (Duration)', 
            type: 'select', 
            default: 4, 
            options: [
                { label: '1 Second', value: 1 },
                { label: '2 Seconds', value: 2 },
                { label: '4 Seconds', value: 4 },
                { label: '6 Seconds', value: 6 },
                { label: '8 Seconds', value: 8 },
                { label: '10 Seconds', value: 10 }
            ],
            description: 'The length of the synthesized motion sequence in seconds.'
        },
        { key: 'audio', label: 'Generate Audio', type: 'toggle', default: false, description: 'Enable soundtrack (when available).' },
        { key: 'image', label: 'Reference Frames', type: 'text', default: '', description: 'Comma separated URLs: frame[0]=start, frame[1]=end' }
    ])
};
