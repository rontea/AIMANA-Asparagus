export const wanVideo = {
    id: 'pollinations-wan',
    label: 'Wan 2.6',
    description: 'Alibaba text/image-to-video with audio (2-15s, up to 1080P) via DashScope.',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Video',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,cinematic,motion,wan',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model=wan&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&image={{image}}',
    requestHeaders: '{"Accept": "video/mp4"}',
    isSystem: 1,
    isPaid: 1,
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
            default: 6, 
            options: [
                { label: '2 Seconds', value: 2 },
                { label: '4 Seconds', value: 4 },
                { label: '6 Seconds', value: 6 },
                { label: '8 Seconds', value: 8 },
                { label: '10 Seconds', value: 10 },
                { label: '12 Seconds', value: 12 },
                { label: '15 Seconds', value: 15 }
            ],
            description: 'Wan supports approximately 2-15 second clips.'
        },
        { key: 'aspectRatio', label: 'Video Aspect Ratio', type: 'select', default: '16:9', options: [{ label: 'Widescreen (16:9)', value: '16:9' }, { label: 'Portrait (9:16)', value: '9:16' }], description: 'Pollinations video supports 16:9 and 9:16.' },
        { key: 'image', label: 'Reference Image URL(s)', type: 'text', default: '', description: 'Single URL or multiple URLs separated by | or ,.' }
    ])
};
