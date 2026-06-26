import { Layers } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const zImage: ModelOption = {
    id: 'pollinations-z-image',
    label: 'Z-Image',
    desc: 'Elite quality visual synthesis with deep tonal range and structural integrity.',
    icon: Layers,
    color: 'text-indigo-400',
    limits: 'Priority Tier',
    efficiency: 'Tier-Stable',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};