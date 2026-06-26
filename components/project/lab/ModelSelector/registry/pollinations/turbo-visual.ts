import { Wind } from 'lucide-react';
import { ModelOption } from '../types';

export const turboVisual: ModelOption = {
    id: 'pollinations-turbo',
    label: 'Turbo Visual',
    desc: 'Sub-second visual synthesis. Perfect for rapid exploration and iterative sketching.',
    icon: Wind,
    color: 'text-rose-400',
    limits: 'Unlimited | Express',
    efficiency: 'Tier-Express',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};