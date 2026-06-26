import { Sparkles } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const gptImageHigh: ModelOption = {
    id: 'pollinations-gpt-image-1-5',
    label: 'GPT Image 1.5',
    desc: 'Enhanced spatial reasoning for complex multi-subject visual compositions.',
    icon: Sparkles,
    color: 'text-blue-400',
    limits: 'Enterprise Tier',
    efficiency: 'Tier-Advanced',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};