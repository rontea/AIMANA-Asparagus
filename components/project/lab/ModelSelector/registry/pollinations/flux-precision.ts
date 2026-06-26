import { FlaskConical } from 'lucide-react';
import { ModelOption } from '../types';

export const fluxPrecision: ModelOption = {
    id: 'pollinations-flux',
    label: 'Flux Precision',
    desc: 'Unmatched prompt adherence and hyper-realistic architectural and character detail.',
    icon: FlaskConical,
    color: 'text-cyan-400',
    limits: 'Unlimited | Priority',
    efficiency: 'Tier-Elite',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};