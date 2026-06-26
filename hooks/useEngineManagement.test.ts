import { describe, expect, it } from 'vitest';
import { getBlueprintKeysForCategory, PARAMETER_BLUEPRINTS } from './useEngineManagement';

describe('getBlueprintKeysForCategory', () => {
    it('returns audio-specific controls plus shared custom controls for Audio category', () => {
        const keys = getBlueprintKeysForCategory('Audio');

        const requiredAudioBlueprints = [
            'voice_name',
            'response_format',
            'multi_speaker_enabled',
            'speaker_one_name',
            'speaker_one_voice',
            'speaker_two_name',
            'speaker_two_voice',
            'language_code',
            'tone',
            'pace',
            'accent',
            'audio_profile',
            'scene_description',
            'director_notes',
            'instrumental'
        ];

        requiredAudioBlueprints.forEach((key) => {
            expect(keys).toContain(key);
        });

        expect(keys).toContain('custom_slider');
        expect(keys).toContain('custom_toggle');
        expect(keys).toContain('custom_text');
        expect(keys).toContain('custom_textarea');
        expect(keys).not.toContain('guidance_scale');
        expect(keys).not.toContain('quality_preset');
    });

    it('falls back to full catalog when category is unknown', () => {
        const keys = getBlueprintKeysForCategory('UnknownCategory');
        const allBlueprintKeys = Object.keys(PARAMETER_BLUEPRINTS);

        expect(keys).toHaveLength(allBlueprintKeys.length);
        expect(keys).toEqual(allBlueprintKeys);
    });
});
