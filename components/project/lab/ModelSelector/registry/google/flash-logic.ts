import { MessageSquare } from 'lucide-react';
import { ModelOption } from '../types';

export const flashLogic: ModelOption = {
    id: 'gemini-2.5-flash',
    label: 'Flash Logic',
    desc: 'Fast multimodal reasoning for drafting, summarization, and general-purpose Gemini workflows.',
    icon: MessageSquare,
    color: 'text-emerald-400',
    limits: '15 RPM | 1M TPM',
    efficiency: 'Tier-1',
    provider: 'google',
    category: 'Language',
    ratios: ['Chat/Text']
};
