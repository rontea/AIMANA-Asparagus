/**
 * SeaDream 4.5 (AirForce) - Forged Engine Blueprint
 * Specialized for hyper-realistic atmospheric and material synthesis.
 */

export const seedream45 = {
    id: 'airforce-seedream-4-5',
    label: 'SeaDream 4.5 (AF)',
    description: 'High-performance visual synthesis engine specialized in atmospheric realism and complex lighting. Provisioned via the AirForce neural gateway.',
    provider: 'AirForce',
    category: 'Visual',
    iconName: 'Sparkles',
    efficiencyTier: 'Tier-Elite',
    isProgrammable: 1,
    capabilities: 'image,detailed,photorealistic,seadream',
    requestMethod: 'GET',
    requestUrl: 'https://api.airforce/image/generate?model=seedream&prompt={{prompt}}&size={{width}}x{{height}}&seed={{seed}}',
    requestHeaders: '{"Authorization": "Bearer {{api_key}}", "Accept": "image/png"}',
    isSystem: 0,
    isTested: 1,
    featuresJson: JSON.stringify({
        showDimensions: true,
        showSeed: true,
        showNegativePrompt: false,
        showEnhancements: false,
        showNologo: false,
        showImageInput: false,
        showGuidance: false,
        showSampling: false
    })
};