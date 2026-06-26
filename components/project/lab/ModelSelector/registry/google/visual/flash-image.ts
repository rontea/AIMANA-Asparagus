import { Zap } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const flashImage: ModelOption = {
    id: 'gemini-2.5-flash-image',
    label: 'Flash Image',
    desc: 'Optimized for high-speed visual iteration. Balanced quality for rapid prototyping.',
    icon: Zap,
    color: 'text-amber-400',
    limits: '15 RPM | 1M TPM',
    efficiency: 'Tier-1',
    provider: 'google',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};