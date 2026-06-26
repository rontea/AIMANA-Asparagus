export const openaiChat = {
    id: 'pollinations-openai',
    label: 'OpenAI GPT-5 Mini',
    description: 'Fast and balanced general-purpose chat model via Pollinations.',
    provider: 'pollinations',
    category: 'Language',
    iconName: 'Type',
    efficiencyTier: 'Tier-Stable',
    isProgrammable: 1,
    capabilities: 'text,search',
    requestMethod: 'POST',
    requestUrl: 'https://gen.pollinations.ai/v1/chat/completions',
    requestHeaders: '{"Accept":"application/json","Content-Type":"application/json"}',
    requestBodyTemplate: '{"model":"openai","messages":[{"role":"system","content":{{system_json}}},{"role":"user","content":{{prompt_json}}}],"temperature":{{temperature}},"max_tokens":{{max_tokens}},"stream":false}',
    responsePath: 'choices.0.message.content',
    isSystem: 1,
    isPaid: 0,
    featuresJson: JSON.stringify({
        showDimensions: false,
        showSeed: false,
        showNegativePrompt: false,
        showEnhancements: false,
        showNologo: false,
        showImageInput: false,
        showVideoRatio: false,
        showSampling: false,
        showGuidance: false
    }),
    uiConfigJson: JSON.stringify([
        {
            key: 'temperature',
            label: 'Temperature',
            type: 'slider',
            min: 0,
            max: 2,
            step: 0.1,
            default: 0.7,
            description: 'Controls response creativity and variability.'
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
    ])
};
