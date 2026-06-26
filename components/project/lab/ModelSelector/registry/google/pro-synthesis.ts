import { Crown } from 'lucide-react';
import { ModelOption } from '../types';

export const proSynthesis: ModelOption = {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Pro Synthesis',
    desc: 'Advanced visual realism with optional Google Search Grounding for accurate real-world concepts.',
    icon: Crown,
    color: 'text-indigo-400',
    limits: '2 RPM | 32K TPM',
    efficiency: 'Tier-Max',
    provider: 'google',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};
