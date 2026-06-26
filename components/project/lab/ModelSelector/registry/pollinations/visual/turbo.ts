import { Wind } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const turbo: ModelOption = {
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