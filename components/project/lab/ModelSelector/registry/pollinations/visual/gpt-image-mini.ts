import { Zap } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const gptImageMini: ModelOption = {
    id: 'pollinations-gpt-image-mini',
    label: 'GPT Image Mini',
    desc: 'Compact visual logic engine for stylized, high-cadence creative assets.',
    icon: Zap,
    color: 'text-blue-300',
    limits: 'Priority Tier',
    efficiency: 'Tier-Turbo',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};