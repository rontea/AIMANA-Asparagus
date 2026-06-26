export const GOOGLE_TTS_VOICE_OPTIONS = [
    { label: 'Zephyr - Bright', value: 'Zephyr' },
    { label: 'Puck - Upbeat', value: 'Puck' },
    { label: 'Charon - Informative', value: 'Charon' },
    { label: 'Kore - Firm', value: 'Kore' },
    { label: 'Fenrir - Excitable', value: 'Fenrir' },
    { label: 'Leda - Youthful', value: 'Leda' },
    { label: 'Orus - Firm', value: 'Orus' },
    { label: 'Aoede - Breezy', value: 'Aoede' },
    { label: 'Callirrhoe - Easy-going', value: 'Callirrhoe' },
    { label: 'Autonoe - Bright', value: 'Autonoe' },
    { label: 'Enceladus - Breathy', value: 'Enceladus' },
    { label: 'Iapetus - Clear', value: 'Iapetus' },
    { label: 'Umbriel - Easy-going', value: 'Umbriel' },
    { label: 'Algieba - Smooth', value: 'Algieba' },
    { label: 'Despina - Smooth', value: 'Despina' },
    { label: 'Erinome - Clear', value: 'Erinome' },
    { label: 'Algenib - Gravelly', value: 'Algenib' },
    { label: 'Rasalgethi - Informative', value: 'Rasalgethi' },
    { label: 'Laomedeia - Upbeat', value: 'Laomedeia' },
    { label: 'Achernar - Soft', value: 'Achernar' },
    { label: 'Alnilam - Firm', value: 'Alnilam' },
    { label: 'Schedar - Even', value: 'Schedar' },
    { label: 'Gacrux - Mature', value: 'Gacrux' },
    { label: 'Pulcherrima - Forward', value: 'Pulcherrima' },
    { label: 'Achird - Friendly', value: 'Achird' },
    { label: 'Zubenelgenubi - Casual', value: 'Zubenelgenubi' },
    { label: 'Vindemiatrix - Gentle', value: 'Vindemiatrix' },
    { label: 'Sadachbia - Lively', value: 'Sadachbia' },
    { label: 'Sadaltager - Knowledgeable', value: 'Sadaltager' },
    { label: 'Sulafat - Warm', value: 'Sulafat' }
];

export const GOOGLE_TTS_VOICES = GOOGLE_TTS_VOICE_OPTIONS.map((voice) => voice.value);
export const GOOGLE_TTS_DEFAULT_VOICE = 'Kore';
export const GOOGLE_TTS_SECONDARY_VOICE = 'Puck';

export const GOOGLE_TTS_FEATURES_JSON = JSON.stringify({
    showDimensions: false,
    showSeed: false,
    showNegativePrompt: false,
    showEnhancements: false,
    showNologo: false,
    showImageInput: false,
    showVideoRatio: false,
    showSampling: false,
    showGuidance: false
});

export const buildGoogleTtsUiSchema = ({
    defaultVoice = GOOGLE_TTS_DEFAULT_VOICE,
    secondaryVoice = GOOGLE_TTS_SECONDARY_VOICE
} = {}) => ([
    {
        key: 'voiceName',
        label: 'Primary Voice',
        type: 'select',
        default: defaultVoice,
        options: GOOGLE_TTS_VOICE_OPTIONS,
        description: 'Single-speaker voice selection for Gemini TTS.'
    },
    {
        key: 'multiSpeakerEnabled',
        label: 'Two-Speaker Mode',
        type: 'toggle',
        default: false,
        description: 'Use Gemini multi-speaker speechConfig with two named speakers.'
    },
    {
        key: 'speakerOneName',
        label: 'Speaker One Name',
        type: 'text',
        default: 'Speaker A',
        description: 'Must match the first speaker label used inside the transcript.'
    },
    {
        key: 'speakerOneVoice',
        label: 'Speaker One Voice',
        type: 'select',
        default: defaultVoice,
        options: GOOGLE_TTS_VOICE_OPTIONS,
        description: 'Voice assigned to the first speaker in two-speaker mode.'
    },
    {
        key: 'speakerTwoName',
        label: 'Speaker Two Name',
        type: 'text',
        default: 'Speaker B',
        description: 'Must match the second speaker label used inside the transcript.'
    },
    {
        key: 'speakerTwoVoice',
        label: 'Speaker Two Voice',
        type: 'select',
        default: secondaryVoice,
        options: GOOGLE_TTS_VOICE_OPTIONS,
        description: 'Voice assigned to the second speaker in two-speaker mode.'
    },
    {
        key: 'languageCode',
        label: 'Language Code',
        type: 'text',
        default: '',
        description: 'Optional BCP-47 code such as en-US or fil-PH. Leave blank for auto-detect.'
    },
    {
        key: 'tone',
        label: 'Tone',
        type: 'text',
        default: '',
        description: 'High-level tone direction such as warm, confident, playful, or calm.'
    },
    {
        key: 'pace',
        label: 'Pace',
        type: 'text',
        default: '',
        description: 'Narration pacing guidance such as measured, brisk, slow, or energetic.'
    },
    {
        key: 'accent',
        label: 'Accent',
        type: 'text',
        default: '',
        description: 'Optional accent guidance such as Manila English, British RP, or neutral US.'
    },
    {
        key: 'audioProfile',
        label: 'Audio Profile',
        type: 'textarea',
        default: '',
        description: 'Character identity, role, or voice archetype for the speaker.'
    },
    {
        key: 'sceneDescription',
        label: 'Scene',
        type: 'textarea',
        default: '',
        description: 'Stage the environment or emotional vibe to guide the performance.'
    },
    {
        key: 'directorNotes',
        label: "Director's Notes",
        type: 'textarea',
        default: '',
        description: 'Performance notes for style, pauses, articulation, or emphasis.'
    }
]);
