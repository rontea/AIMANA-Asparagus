export const ltx2Video = {
    id: 'pollinations-ltx-2',
    label: 'LTX-2',
    description: 'Fast text/image-to-video generation with audio on Modal.',
    provider: 'pollinations',
    category: 'Motion',
    iconName: 'Video',
    efficiencyTier: 'Tier-Video',
    isProgrammable: 1,
    capabilities: 'video,motion,ltx,audio,image',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/video/{{prompt}}?model=ltx-2&seed={{seed}}&duration={{duration}}&aspectRatio={{aspectRatio}}&audio=true&image={{image}}',
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
        { key: 'duration', label: 'Duration (s)', type: 'slider', min: 1, max: 10, step: 1, default: 4, description: 'LTX-2 supports up to about 10 seconds.' },
        { key: 'aspectRatio', label: 'Video Aspect Ratio', type: 'select', default: '16:9', options: [{ label: 'Widescreen (16:9)', value: '16:9' }, { label: 'Portrait (9:16)', value: '9:16' }], description: 'Pollinations video supports 16:9 and 9:16.' }
    ])
};
