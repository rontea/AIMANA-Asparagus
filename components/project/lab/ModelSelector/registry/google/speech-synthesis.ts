import { Volume2 } from 'lucide-react';
import { ModelOption } from '../types';

export const speechSynthesis: ModelOption = {
    id: 'gemini-2.5-flash-preview-tts',
    label: 'Speech Synthesis',
    desc: 'High-fidelity text-to-speech engine using specialized neural voice patterns.',
    icon: Volume2,
    color: 'text-pink-400',
    limits: 'Standard Quota',
    efficiency: 'Tier-1',
    provider: 'google',
    category: 'Audio',
    ratios: ['Audio/PCM']
};