import { Video } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const veo: ModelOption = {
    id: 'pollinations-veo',
    label: 'Veo Motion',
    desc: 'Advanced cinematic text-to-video generation with realistic physics and camera control.',
    icon: Video,
    color: 'text-blue-400',
    limits: 'High Latency',
    efficiency: 'Tier-Video',
    provider: 'pollinations',
    category: 'Motion',
    ratios: ['16:9', '9:16']
};