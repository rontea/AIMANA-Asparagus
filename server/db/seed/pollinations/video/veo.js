export const veoVideo = {
    id: 'pollinations-veo',
    label: 'Veo 3.1 Fast',
    description: "Google's video generation model (preview).",
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Video',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,audio,cinematic',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model=veo&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}&image={{image}}',
    requestHeaders: '{"Accept": "video/mp4"}',
    isSystem: 1,
    isPaid: 1,
    featuresJson: JSON.stringify({
        showDimensions: false,
        showSeed: true,
        showImageInput: true,
        showVideoRatio: true,
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
            ],
            description: 'Veo supports 4, 6, or 8 second presets.'
        },
        { key: 'aspectRatio', label: 'Video Aspect Ratio', type: 'select', default: '16:9', options: [{ label: 'Widescreen (16:9)', value: '16:9' }, { label: 'Portrait (9:16)', value: '9:16' }], description: 'Pollinations video supports 16:9 and 9:16.' },
        { key: 'audio', label: 'Generate Audio', type: 'toggle', default: false, description: 'Enable soundtrack (when available).' },
        { key: 'image', label: 'Reference Image URL(s)', type: 'text', default: '', description: 'Single URL or multiple URLs separated by | or ,. For Veo interpolation, provide two URLs (start and end frame).' }
    ])
};
