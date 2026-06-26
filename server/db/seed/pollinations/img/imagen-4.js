export const imagen4 = {
    id: 'pollinations-imagen-4',
    label: 'Imagen 4',
    description: 'Advanced visual synthesis with strong compositional balance, photorealism, and polished production-grade detail.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,photorealistic,imagen',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=imagen&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&nologo={{nologo}}&negative_prompt={{negative_prompt}}&guidance={{guidance_scale}}',
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
            label: 'Prompt Guidance (CFG)', 
            type: 'slider', 
            min: 1, 
            max: 30, 
            step: 0.5, 
            default: 7.5, 
            description: 'Strength of prompt adherence. Adjust for creative freedom vs strict following.' 
        }
    ])
};
