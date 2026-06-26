export const laboratorySandbox = {
    id: 'aimana-sandbox-v1',
    label: 'Laboratory Sandbox',
    description: 'Specialized testing endpoint for high-fidelity neural controls. Optimized for verifying Sampling bundles, VAE placeholders, and Persistent Negative Context.',
    provider: 'pollinations',
    category: 'Visual',
    iconName: 'FlaskConical',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,sampling,testing,constraints',
    requestMethod: 'GET',
    requestUrl: 'https://gen.pollinations.ai/image/{{prompt}}?model=flux&width={{width}}&height={{height}}&seed={{seed}}&enhance={{enhance}}&safe={{safe}}&negative_prompt={{negative_prompt}}&nologo={{nologo}}&guidance={{guidance_scale}}',
    requestHeaders: '{"Accept": "image/*"}',
    isSystem: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: true,
        showEnhancements: true,
        showNologo: true,
        showSampling: true,
        showGuidance: true,
        showImageInput: false
    }),
    defaultNegativePrompt: 'lowres, text, error, cropped, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck, username, watermark, signature',
    uiConfigJson: JSON.stringify([
        { 
            key: 'guidance_scale', 
            label: 'Neural Guidance (CFG)', 
            type: 'slider', 
            min: 1, 
            max: 30, 
            step: 0.5, 
            default: 7.5, 
            description: 'Prompt adherence strength' 
        }
    ])
};