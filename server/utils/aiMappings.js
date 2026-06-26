/**
 * AIMANA Neural Mapping Registry
 * Translates application engine IDs to upstream provider model tags.
 * Aligned with gen.pollinations.ai identifiers.
 */

export const POLLINATIONS_MAP = {
    'kontext': 'kontext',
    'flux-kontext': 'kontext',
    'flux-schnell': 'flux',
    'flux-realism': 'flux',
    'flux': 'flux',
    'flux-2-dev': 'flux-2-dev',
    'p-image': 'p-image',
    'p-image-edit': 'p-image-edit',
    'imagen-4': 'imagen',
    'klein': 'klein',
    'klein-large': 'klein-large',
    'sdxl-turbo': 'turbo',
    'turbo': 'turbo',
    'nanobanana': 'nanobanana',
    'nanobanana-2': 'nanobanana-2',
    'nanobanana-pro': 'nanobanana-pro',
    'gpt-image-mini': 'gptimage',
    'z-image': 'zimage',
    'gpt-image-1-5': 'gptimage',
    'gpt-image-large': 'gptimage-large',
    'seedream': 'seedream',
    'seedream5': 'seedream5',
    'seedream-4-0-pro': 'seedream-pro',
    'seedream-4-5-pro': 'seedream-pro',
    'qwen-image': 'qwen-image',
    'grok-imagine': 'grok-imagine',
    'grok-imagine-pro': 'grok-imagine-pro',
    'nova-canvas': 'nova-canvas',
    'seedance': 'seedance',
    'seedance-pro': 'seedance-pro',
    'veo': 'veo',
    'veo-3-1-fast': 'veo',
    'seedance-lite': 'seedance',
    'wan': 'wan',
    'ltx-2': 'ltx-2',
    'grok-video': 'grok-video'
};

/**
 * Returns the correct upstream model name for a given internal engine ID.
 * @param {string} internalId 
 * @returns {string}
 */
export const getUpstreamModel = (internalId) => {
    const cleanId = (internalId || '').toLowerCase().replace('pollinations-', '');
    return POLLINATIONS_MAP[cleanId] || 'flux';
};
