import { describe, expect, it } from 'vitest';
import { isMusicAudioModel, isSpeechSynthesisModel, isTranscriptionAudioModel } from './audioModelUtils';

describe('audioModelUtils', () => {
    it('accepts speech synthesis models for TTS-only pickers', () => {
        expect(isSpeechSynthesisModel({
            id: 'pollinations-elevenlabs',
            label: 'ElevenLabs v3 TTS',
            desc: 'Expressive voices',
            textInputModalities: ['text'],
            textOutputModalities: ['audio']
        })).toBe(true);
    });

    it('rejects music generation models from TTS-only pickers', () => {
        const model = {
            id: 'pollinations-suno',
            label: 'Suno v5 (api.airforce)',
            desc: 'Music generation model',
            textInputModalities: ['text'],
            textOutputModalities: ['audio']
        };

        expect(isMusicAudioModel(model)).toBe(true);
        expect(isSpeechSynthesisModel(model)).toBe(false);
    });

    it('detects ACE-Step as a music generation model', () => {
        const model = {
            id: 'pollinations-acestep',
            label: 'ACE-Step',
            desc: 'Text to audio',
            textInputModalities: ['text'],
            textOutputModalities: ['audio']
        };

        expect(isMusicAudioModel(model)).toBe(true);
        expect(isSpeechSynthesisModel(model)).toBe(false);
    });

    it('rejects transcription models from TTS-only pickers', () => {
        const model = {
            id: 'pollinations-whisper',
            label: 'Whisper Large V3',
            desc: 'Speech to text transcription',
            textInputModalities: ['audio'],
            textOutputModalities: ['text']
        };

        expect(isTranscriptionAudioModel(model)).toBe(true);
        expect(isSpeechSynthesisModel(model)).toBe(false);
    });

    it('detects transcription models from label markers when modality metadata is missing', () => {
        expect(isTranscriptionAudioModel({
            id: 'pollinations-scribe',
            label: 'ElevenLabs Scribe v2',
            desc: 'Fast audio transcription'
        })).toBe(true);
    });

    it('detects whisper-1 aliases as transcription models', () => {
        expect(isTranscriptionAudioModel({
            id: 'pollinations-whisper-1',
            label: 'Whisper 1',
            upstreamId: 'whisper-1'
        })).toBe(true);
    });

    it('falls back to capabilities when modality metadata is unavailable', () => {
        expect(isSpeechSynthesisModel({
            id: 'custom-tts',
            label: 'Custom Voice',
            desc: 'Narration engine',
            capabilities: ['text', 'audio']
        })).toBe(true);
    });
});
