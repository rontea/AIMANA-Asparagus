import { Activity } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const sdxlTurbo: ModelOption = {
    id: 'pollinations-sdxl-turbo',
    label: 'SDXL Turbo',
    desc: 'Next-generation SDXL weights optimized for single-step synthesis.',
    icon: Activity,
    color: 'text-amber-500',
    limits: 'Unlimited | Express',
    efficiency: 'Tier-Fast',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};