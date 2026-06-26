import { Rocket } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const fluxSchnell: ModelOption = {
    id: 'pollinations-flux-schnell',
    label: 'Flux Schnell',
    desc: 'Lightning-fast Flux synthesis optimized for high-speed creative workflows.',
    icon: Rocket,
    color: 'text-orange-400',
    limits: 'Unlimited | High Speed',
    efficiency: 'Tier-Turbo',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};