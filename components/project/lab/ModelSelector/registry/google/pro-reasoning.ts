import { Type } from 'lucide-react';
import { ModelOption } from '../types';

export const proReasoning: ModelOption = {
    id: 'gemini-2.5-flash-lite',
    label: 'Flash Lite',
    desc: 'Low-latency Gemini text generation for lightweight reasoning, chat, and utility tasks.',
    icon: Type,
    color: 'text-indigo-400',
    limits: '2 RPM | 32K TPM',
    efficiency: 'Tier-Max',
    provider: 'google',
    category: 'Language',
    ratios: ['Chat/Text']
};
