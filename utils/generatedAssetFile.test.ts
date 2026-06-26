import { describe, expect, it } from 'vitest';
import { createGeneratedAssetFile } from './generatedAssetFile';

describe('generatedAssetFile', () => {
    it('preserves structured transcription payloads as json files when requested', () => {
        const file = createGeneratedAssetFile({
            base64: '',
            mimeType: 'application/json',
            text: '{"text":"Speaker 1: Hello"}'
        } as any, {
            baseName: 'Meeting Transcript',
            formatHint: 'json'
        });

        expect(file.name).toBe('meeting-transcript.json');
        expect(file.type).toBe('application/json');
    });
});
