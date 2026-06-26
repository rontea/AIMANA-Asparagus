import { Video } from 'lucide-react';
// Fix relative import
import { ModelOption } from '../../types';

export const seedanceLite: ModelOption = {
    id: 'pollinations-seedance-lite',
    label: 'SeeDance Lite',
    desc: 'Fast video rendering for rapid cinematic sketching and motion prototyping.',
    icon: Video,
    color: 'text-orange-300',
    limits: 'Fast Tier',
    efficiency: 'Tier-Turbo-Video',
    provider: 'pollinations',
    category: 'Motion',
    ratios: ['16:9', '9:16']
};