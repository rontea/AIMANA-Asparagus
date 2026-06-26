import { describe, expect, it } from 'vitest';
import { buildTranscriptDownloadArtifact, buildTranscriptInspectionData, formatTranscriptClockTime } from './transcriptExport';

describe('transcriptExport', () => {
    it('builds plain text and json transcript downloads from saved text', () => {
        const textArtifact = buildTranscriptDownloadArtifact('text', {
            rawTranscript: 'Hello world from transcript export.',
            title: 'My Transcript'
        });
        const jsonArtifact = buildTranscriptDownloadArtifact('json', {
            rawTranscript: 'Hello world from transcript export.',
            title: 'My Transcript'
        });

        expect(textArtifact.filename).toBe('my-transcript.txt');
        expect(textArtifact.content).toBe('Hello world from transcript export.');
        expect(JSON.parse(jsonArtifact.content)).toEqual({
            text: 'Hello world from transcript export.'
        });
    });

    it('builds srt and vtt downloads with approximate timing when no segments are saved', () => {
        const srtArtifact = buildTranscriptDownloadArtifact('srt', {
            rawTranscript: 'First sentence. Second sentence.',
            title: 'Approx Transcript'
        });
        const vttArtifact = buildTranscriptDownloadArtifact('vtt', {
            rawTranscript: 'First sentence. Second sentence.',
            title: 'Approx Transcript'
        });

        expect(srtArtifact.filename).toBe('approx-transcript.srt');
        expect(srtArtifact.usedSyntheticTiming).toBe(true);
        expect(srtArtifact.content).toContain('1\n00:00:00,000 -->');
        expect(vttArtifact.filename).toBe('approx-transcript.vtt');
        expect(vttArtifact.content.startsWith('WEBVTT')).toBe(true);
        expect(vttArtifact.usedSyntheticTiming).toBe(true);
    });

    it('uses native segments from json transcript payload for verbose json and subtitle exports', () => {
        const rawTranscript = JSON.stringify({
            text: 'Hello there. General Kenobi.',
            segments: [
                { id: 0, start: 0, end: 1.2, text: 'Hello there.' },
                { id: 1, start: 1.2, end: 2.9, text: 'General Kenobi.' }
            ]
        });

        const verboseArtifact = buildTranscriptDownloadArtifact('verbose_json', {
            rawTranscript,
            title: 'Segmented Transcript',
            modelId: 'whisper-large-v3',
            sourceFileName: 'hello.wav'
        });
        const srtArtifact = buildTranscriptDownloadArtifact('srt', {
            rawTranscript,
            title: 'Segmented Transcript'
        });

        const verbosePayload = JSON.parse(verboseArtifact.content);

        expect(verboseArtifact.usedSyntheticTiming).toBe(false);
        expect(verbosePayload.synthetic_timestamps).toBe(false);
        expect(verbosePayload.segments).toHaveLength(2);
        expect(verbosePayload.segments[0]).toMatchObject({
            start: 0,
            end: 1.2,
            text: 'Hello there.'
        });
        expect(srtArtifact.usedSyntheticTiming).toBe(false);
        expect(srtArtifact.content).toContain('00:00:01,200 --> 00:00:02,900');
    });

    it('builds inspection segments with native timing and speaker labels when available', () => {
        const inspection = buildTranscriptInspectionData(JSON.stringify({
            text: 'Speaker 1: This is a test. Speaker 2: Copy that.',
            segments: [
                { id: 0, start: 1, end: 3.4, speaker: 1, text: 'This is a test.' },
                { id: 1, start: 3.4, end: 5.9, speaker_label: 'Speaker 2', text: 'Copy that.' }
            ]
        }));

        expect(inspection.hasNativeSegments).toBe(true);
        expect(inspection.usedSyntheticTiming).toBe(false);
        expect(inspection.segments).toEqual([
            { id: 0, start: 1, end: 3.4, speaker: 'Speaker 1', text: 'This is a test.' },
            { id: 1, start: 3.4, end: 5.9, speaker: 'Speaker 2', text: 'Copy that.' }
        ]);
        expect(formatTranscriptClockTime(3.4)).toBe('00:00:03');
    });

    it('falls back to synthetic inspection segments for plain transcripts', () => {
        const inspection = buildTranscriptInspectionData('Speaker 1: Opening line.\n\nSecond paragraph.', {
            durationSeconds: 8
        });

        expect(inspection.hasNativeSegments).toBe(false);
        expect(inspection.usedSyntheticTiming).toBe(true);
        expect(inspection.segments).toHaveLength(2);
        expect(inspection.segments[0]).toMatchObject({
            speaker: 'Speaker 1',
            text: 'Opening line.',
            isSynthetic: true
        });
    });

    it('builds inspection segments from utterance arrays when segments are absent', () => {
        const inspection = buildTranscriptInspectionData(JSON.stringify({
            text: 'Opening line. Follow up.',
            utterances: [
                { start: 0, text: 'Opening line.' },
                { start: 2.4, text: 'Follow up.' }
            ]
        }));

        expect(inspection.hasNativeSegments).toBe(true);
        expect(inspection.usedSyntheticTiming).toBe(false);
        expect(inspection.segments).toHaveLength(2);
        expect(inspection.segments[0]).toMatchObject({
            start: 0,
            end: 2.4,
            text: 'Opening line.'
        });
    });

    it('builds inspection segments from word timestamps when segments are absent', () => {
        const inspection = buildTranscriptInspectionData(JSON.stringify({
            text: 'Most fun I had was working with Sophie.',
            words: [
                { word: 'Most', start: 0, end: 0.3 },
                { word: 'fun', start: 0.32, end: 0.58 },
                { word: 'I', start: 0.6, end: 0.68 },
                { word: 'had', start: 0.7, end: 0.9 },
                { word: 'was', start: 0.92, end: 1.12 },
                { word: 'working', start: 1.14, end: 1.5 },
                { word: 'with', start: 1.52, end: 1.72 },
                { word: 'Sophie.', start: 1.74, end: 2.2 }
            ]
        }));

        expect(inspection.hasNativeSegments).toBe(true);
        expect(inspection.usedSyntheticTiming).toBe(false);
        expect(inspection.segments.length).toBeGreaterThan(0);
        expect(inspection.segments[0]?.start).toBe(0);
        expect(inspection.segments[0]?.text).toContain('Most fun I had was working with Sophie.');
    });

    it('normalizes ElevenLabs-style speaker ids from word timestamps', () => {
        const inspection = buildTranscriptInspectionData(JSON.stringify({
            text: 'Hello there. General Kenobi.',
            words: [
                { word: 'Hello', start: 0, end: 0.4, speaker_id: 'speaker_1' },
                { word: 'there.', start: 0.42, end: 0.8, speaker_id: 'speaker_1' },
                { word: 'General', start: 1.1, end: 1.5, speaker_id: 'speaker_2' },
                { word: 'Kenobi.', start: 1.52, end: 2.1, speaker_id: 'speaker_2' }
            ]
        }));

        expect(inspection.hasNativeSegments).toBe(true);
        expect(inspection.usedSyntheticTiming).toBe(false);
        expect(inspection.segments).toEqual([
            { id: 0, start: 0, end: 0.8, speaker: 'Speaker 1', text: 'Hello there.' },
            { id: 1, start: 1.1, end: 2.1, speaker: 'Speaker 2', text: 'General Kenobi.' }
        ]);
    });
});
