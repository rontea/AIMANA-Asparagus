export const seedance = {
    id: 'pollinations-seedance',
    label: 'Seedance',
    description: 'Seedance Lite - BytePlus video generation (better quality).',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Activity',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,motion,seedance',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model=seedance&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio={{audio}}&image={{image}}',
    requestHeaders: '{"Accept": "video/mp4"}',
    isSystem: 1,
    isPaid: 1,
    featuresJson: JSON.stringify({
        showDimensions: false,
        showSeed: true,
        showVideoRatio: true,
        showImageInput: true,
        showNegativePrompt: false,
        showEnhancements: false,
        showNologo: false
    }),
    uiConfigJson: JSON.stringify([
        { key: 'duration', label: 'Duration (s)', type: 'slider', min: 2, max: 10, step: 1, default: 4, description: 'Seedance supports 2-10 second clips.' },
        { key: 'aspectRatio', label: 'Video Aspect Ratio', type: 'select', default: '16:9', options: [{ label: 'Widescreen (16:9)', value: '16:9' }, { label: 'Portrait (9:16)', value: '9:16' }], description: 'Pollinations video supports 16:9 and 9:16.' },
        { key: 'audio', label: 'Generate Audio', type: 'toggle', default: false, description: 'Enable soundtrack (when available).' },
        { key: 'image', label: 'Reference Image URL(s)', type: 'text', default: '', description: 'Single URL or multiple URLs separated by | or ,. For video: first image is the start frame; second is end-frame interpolation (Veo only).' }
    ])
};
