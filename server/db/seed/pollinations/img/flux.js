export const fluxPrecision = {
    id: 'pollinations-flux',
    label: 'Flux',
    description: 'Core Pollinations image model for versatile visual generation and strong prompt adherence.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'FlaskConical',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,high-fidelity',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=flux&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&nologo={{nologo}}&private={{private}}&nofeed={{nofeed}}&guidance={{guidance_scale}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: true,
        showImageInput: false
    }),
    uiConfigJson: JSON.stringify([
        { 
            key: 'guidance_scale', 
            label: 'Prompt Strength', 
            type: 'slider', 
            min: 1, 
            max: 30, 
            step: 0.5, 
            default: 7.5, 
            description: 'Prompt adherence strength (CFG)' 
        }
    ])
};
