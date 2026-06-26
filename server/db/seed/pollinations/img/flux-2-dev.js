export const flux2Dev = {
    id: 'pollinations-flux-2-dev',
    label: 'FLUX.2 Dev (AirForce)',
    description: 'Next-generation high-fidelity visual reasoning engine from api.airforce. Extreme prompt adherence and detail resolution for professional architectural and character workflows.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,high-fidelity,dev',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=flux-2-dev&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&nologo={{nologo}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: true,
        showImageInput: false,
        showGuidance: true,
        showSampling: false
    }),
    defaultNegativePrompt: 'blur, low quality, distorted, extra limbs, watermark, text, signature',
    uiConfigJson: JSON.stringify([
        { 
            key: 'guidance_scale', 
            label: 'Neural Guidance (CFG)', 
            type: 'slider', 
            min: 1, 
            max: 30, 
            step: 0.5, 
            default: 7.5, 
            description: 'Prompt adherence strength. Higher values force stricter alignment with input text.' 
        }
    ])
};