import { Camera, Ghost, Video, Zap } from 'lucide-react';
import { ModelOption } from '../types';

export const nanobanana: ModelOption = {
    id: 'pollinations-nanobanana',
    label: 'nanoBanana',
    desc: 'Ultra-compressed neural weights for lightning-fast, stylized asset manifestation.',
    icon: Zap,
    color: 'text-yellow-400',
    limits: 'Burst Access',
    efficiency: 'Tier-Speed',
    provider: 'pollinations',
    category: 'Visual',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9']
};

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