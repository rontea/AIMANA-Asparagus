export const grokVideo = {
    id: 'pollinations-grok-video',
    label: 'Grok Video',
    description: 'xAI video generation via api.airforce.',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Video',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,motion,grok',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model=grok-video&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}&image={{image}}',
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
            description: 'Duration control for Grok Video via Pollinations.'
        },
        { key: 'aspectRatio', label: 'Video Aspect Ratio', type: 'select', default: '16:9', options: [{ label: 'Widescreen (16:9)', value: '16:9' }, { label: 'Portrait (9:16)', value: '9:16' }], description: 'Pollinations video supports 16:9 and 9:16.' },
        { key: 'audio', label: 'Generate Audio', type: 'toggle', default: false, description: 'Enable soundtrack (when available).' },
        { key: 'image', label: 'Reference Image URL(s)', type: 'text', default: '', description: 'Single URL or multiple URLs separated by | or ,.' }
    ])
};
