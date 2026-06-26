import { BrainCircuit } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const fluxKontext: ModelOption = {
    id: 'pollinations-flux-kontext',
    label: 'FLUX.1 Kontext',
    desc: 'Deep contextual understanding for complex visual scenes and multi-layered prompts.',
    icon: BrainCircuit,
    color: 'text-purple-400',
    limits: 'Unlimited | High Precision',
    efficiency: 'Tier-Advanced',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};