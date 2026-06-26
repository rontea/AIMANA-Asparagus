const LANGUAGE_FEATURES_JSON = JSON.stringify({
    showDimensions: false,
    showSeed: false,
    showNegativePrompt: false,
    showEnhancements: false,
    showNologo: false,
    showImageInput: true,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: false
});

const buildLanguageUiSchema = () => JSON.stringify([
    {
        key: 'temperature',
        label: 'Temperature',
        type: 'slider',
        min: 0,
        max: 2,
        step: 0.1,
        default: 1,
        description: 'Controls response creativity and variability.'
    },
    {
        key: 'top_p',
        label: 'Top P',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.95,
        description: 'Controls nucleus sampling breadth.'
    },
    {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'slider',
        min: 64,
        max: 8192,
        step: 64,
        default: 1024,
        description: 'Upper bound for response length.'
    }
]);

export const nvidiaBlueprints = [
    {
        id: 'nvidia-minimax-m3',
        label: 'MiniMax-M3',
        description: 'NVIDIA NIM-hosted MiniMax multimodal language model for text, image, and video prompts.',
        provider: 'nvidia',
        category: 'Language',
        upstreamId: 'minimaxai/minimax-m3',
        iconName: 'Network',
        efficiencyTier: 'Tier-NIM',
        isProgrammable: 1,
        capabilities: 'text,image,video,multimodal',
        requestMethod: 'POST',
        requestUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
        requestBodyTemplate: '{"model":"{{upstreamId}}","messages":[{"role":"system","content":{{system_json}}},{"role":"user","content":{{prompt_json}}}],"temperature":{{temperature}},"top_p":{{top_p}},"max_tokens":{{max_tokens}},"stream":false}',
        responsePath: 'choices.0.message.content',
        isSystem: 1,
        isPaid: 1,
        limits: 'Requires NVIDIA_API_KEY. MiniMax-M3 on NVIDIA NIM is listed for evaluation/non-commercial use by NVIDIA.',
        featuresJson: LANGUAGE_FEATURES_JSON,
        uiConfigJson: buildLanguageUiSchema(),
        configJson: JSON.stringify({
            dashboardUrl: 'https://docs.api.nvidia.com/nim/reference/minimaxai-minimax-m3',
            textContextLength: 1000000,
            textTools: false,
            textReasoning: false,
            textPaidOnly: true,
            textInputModalities: ['text', 'image', 'video'],
            textOutputModalities: ['text'],
            textAliases: ['minimaxai/minimax-m3', 'minimax-m3'],
            textPricing: {
                source: 'nvidia-nim',
                freeTier: false
            }
        })
    }
];
