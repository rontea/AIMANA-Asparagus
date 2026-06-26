import { describe, expect, it } from 'vitest';
import {
    buildTranscriptComparisonSegments,
    buildFallbackTranscriptEdits,
    buildTranscriptQaRedlineEdits,
    buildTranscriptSummaryExcerpt,
    extractTranscriptionManifestDetails,
    parseTranscriptQaReport
} from './transcriptionManifest';

describe('transcriptionManifest', () => {
    it('extracts saved transcript summary and source audio details', () => {
        const aiParameters = JSON.stringify({
            advanced_params: {
                isTranscription: true,
                sourceFileName: 'meeting-audio.wav',
                referenceItemId: 'audio-item-1',
                referenceItemIds: ['audio-item-2'],
                transcriptionPostProcess: {
                    summaryText: '- Overview\n\n- Action items',
                    summaryModelId: 'pollinations-openai',
                    qaReport: 'Looks accurate.',
                    qaModelId: 'pollinations-openai-audio'
                }
            }
        });

        expect(extractTranscriptionManifestDetails({ aiParameters })).toEqual({
            isTranscription: true,
            summaryText: '- Overview\n\n- Action items',
            summaryModelId: 'pollinations-openai',
            qaReport: 'Looks accurate.',
            qaModelId: 'pollinations-openai-audio',
            transcriptHistoryText: '',
            sourceFileName: 'meeting-audio.wav',
            sourceAudioDataUrl: '',
            transcriptionHint: '',
            referenceItemId: 'audio-item-1',
            referenceItemIds: ['audio-item-2', 'audio-item-1'],
            postProcessStatus: 'complete',
            summaryEnabled: false,
            qaEnabled: false,
            summaryError: '',
            qaError: ''
        });
    });

    it('extracts embedded source audio data url when present', () => {
        const aiParameters = JSON.stringify({
            advanced_params: {
                sourceFileName: 'take-1.webm',
                audioData: 'data:audio/webm;base64,AAAA'
            }
        });

        expect(extractTranscriptionManifestDetails({ aiParameters }).sourceAudioDataUrl).toBe('data:audio/webm;base64,AAAA');
    });

    it('prefers persisted complete post-process status over stale pending metadata', () => {
        const details = extractTranscriptionManifestDetails({
            metadata: {
                advanced_params: {
                    transcriptionPostProcess: {
                        status: 'pending'
                    }
                }
            },
            aiParameters: JSON.stringify({
                advanced_params: {
                    transcriptionPostProcess: {
                        status: 'complete',
                        summaryText: 'Saved summary',
                        qaReport: 'Saved QA'
                    }
                }
            })
        });

        expect(details.postProcessStatus).toBe('complete');
        expect(details.summaryText).toBe('Saved summary');
        expect(details.qaReport).toBe('Saved QA');
    });

    it('resolves stale pending status when required saved post-process artifacts are present', () => {
        const details = extractTranscriptionManifestDetails({
            aiParameters: JSON.stringify({
                advanced_params: {
                    transcriptionPostProcess: {
                        status: 'pending',
                        summaryEnabled: true,
                        qaEnabled: false,
                        summaryText: 'Summary ready'
                    }
                }
            })
        });

        expect(details.postProcessStatus).toBe('complete');
        expect(details.summaryText).toBe('Summary ready');
    });

    it('falls back to transcript text when summary is unavailable', () => {
        expect(
            buildTranscriptSummaryExcerpt('', 'This is a transcript line that should become the fallback preview.', 42)
        ).toBe('This is a transcript line that should b...');
    });

    it('parses qa report edits for redline rendering', () => {
        const details = parseTranscriptQaReport(`VERDICT:
Needs correction

CONFIDENCE:
82

ACCURATE SEGMENTS:
- Intro line is accurate.

ISSUES:
- Product name was misheard.

EDITS:
1. FROM: open eight
TO: OpenAI
2. FROM: chat g p t
TO: ChatGPT

CORRECTED TRANSCRIPT:
We used OpenAI and ChatGPT during the demo.

CHANGE NOTES:
- Brand names corrected.
`, 'We used open eight and chat g p t during the demo.');

        expect(details.verdict).toBe('Needs correction');
        expect(details.confidence).toBe('82');
        expect(details.edits).toEqual([
            { from: 'open eight', to: 'OpenAI' },
            { from: 'chat g p t', to: 'ChatGPT' }
        ]);
        expect(details.correctedTranscript).toBe('We used OpenAI and ChatGPT during the demo.');
        expect(details.hasCorrections).toBe(true);
    });

    it('builds fallback redline edit when corrected transcript differs', () => {
        expect(
            buildFallbackTranscriptEdits(
                'Original transcript text here.',
                'Corrected transcript text here.'
            )
        ).toEqual([
            {
                from: 'Original',
                to: 'Corrected'
            }
        ]);
    });

    it('prefers granular fallback edits when the QA report returns a whole-transcript replacement', () => {
        expect(
            buildTranscriptQaRedlineEdits(
                'We used open eight and chat g p t during the demo.',
                'We used OpenAI and ChatGPT during the demo.',
                [
                    {
                        from: 'We used open eight and chat g p t during the demo.',
                        to: 'We used OpenAI and ChatGPT during the demo.'
                    }
                ]
            )
        ).toEqual([
            {
                from: 'open eight',
                to: 'OpenAI'
            },
            {
                from: 'chat g p t',
                to: 'ChatGPT'
            }
        ]);
    });

    it('builds side-by-side comparison segments with highlighted changed spans', () => {
        const comparison = buildTranscriptComparisonSegments(
            'We used open eight and chat g p t during the demo.',
            'We used OpenAI and ChatGPT during the demo.'
        );

        expect(comparison.hasChanges).toBe(true);
        expect(comparison.original.some((segment) => segment.changed && segment.text.includes('open eight'))).toBe(true);
        expect(comparison.corrected.some((segment) => segment.changed && segment.text.includes('OpenAI'))).toBe(true);
    });
});
