const DEFAULT_TRANSCRIPT_BASE_NAME = 'transcript';

export type TranscriptDownloadFormat = 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';

export interface TranscriptSegment {
    id: number;
    start: number;
    end: number;
    text: string;
    speaker?: string;
    isSynthetic?: boolean;
}

export interface TranscriptInspectionData {
    parsed: Record<string, any> | null;
    transcriptText: string;
    segments: TranscriptSegment[];
    hasNativeSegments: boolean;
    usedSyntheticTiming: boolean;
}

interface TranscriptDownloadBuildOptions {
    rawTranscript: string;
    title?: string;
    sourceFileName?: string;
    modelId?: string;
    createdAt?: number | null;
    durationSeconds?: number | null;
    summaryText?: string;
    qaReport?: string;
}

export interface TranscriptDownloadArtifact {
    filename: string;
    mimeType: string;
    content: string;
    usedSyntheticTiming: boolean;
}

const parseObject = (value: unknown): Record<string, any> => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const normalizeText = (value: unknown) => String(value || '').trim();

const sanitizeBaseName = (value?: string) => {
    const trimmed = normalizeText(value);
    if (!trimmed) return DEFAULT_TRANSCRIPT_BASE_NAME;
    return trimmed
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || DEFAULT_TRANSCRIPT_BASE_NAME;
};

const getWordCount = (value: string) => (
    normalizeText(value)
        .split(/\s+/)
        .filter(Boolean)
        .length
);

const estimateTranscriptDurationSeconds = (text: string, fallback?: number | null) => {
    if (Number.isFinite(fallback) && Number(fallback) > 0) return Number(fallback);
    const words = getWordCount(text);
    if (words <= 0) return 4;
    return Math.max(4, Math.round((words / 155) * 60));
};

const tryParseTranscriptJson = (rawTranscript: string) => {
    const trimmed = normalizeText(rawTranscript);
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    try {
        return parseObject(JSON.parse(trimmed));
    } catch {
        return null;
    }
};

const normalizeSegmentText = (segment: Record<string, any>) => (
    normalizeText(segment.text || segment.transcript || segment.content)
);

const normalizeSpeakerLabel = (value: unknown) => {
    const trimmed = normalizeText(value);
    if (!trimmed) return '';
    if (/^\d+$/.test(trimmed)) return `Speaker ${trimmed}`;
    const normalized = trimmed.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const speakerMatch = normalized.match(/^(speaker|spk)\s*([0-9]+)$/i);
    if (speakerMatch) return `Speaker ${speakerMatch[2]}`;
    return trimmed;
};

const extractInlineSpeaker = (text: string) => {
    const trimmed = normalizeText(text);
    if (!trimmed) return { speaker: '', text: '' };
    const match = trimmed.match(/^(speaker(?:\s+[\w.-]+)?|spk\.?\s*[\w.-]+)\s*:\s+(.+)$/i);
    if (!match) return { speaker: '', text: trimmed };
    return {
        speaker: normalizeSpeakerLabel(match[1]),
        text: normalizeText(match[2])
    };
};

const normalizeSegmentSpeaker = (segment: Record<string, any>, fallbackText: string) => {
    const directSpeaker = normalizeSpeakerLabel(
        segment.speaker
        ?? segment.speakerName
        ?? segment.speaker_name
        ?? segment.speakerLabel
        ?? segment.speaker_label
        ?? segment.speakerId
        ?? segment.speaker_id
    );
    if (directSpeaker) return {
        speaker: directSpeaker,
        text: fallbackText
    };
    return extractInlineSpeaker(fallbackText);
};

const normalizeSegmentTime = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : null;
};

const resolveRawTimedSegments = (parsed: Record<string, any> | null): any[] => {
    if (!parsed) return [];
    const candidates = [
        parsed.segments,
        parsed.utterances,
        parsed.cues,
        parsed.chunks,
        parsed.sentences,
        parsed.results?.segments,
        parsed.results?.utterances
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
};

interface NormalizedSegmentDraft {
    id: number;
    start: number;
    end: number | null;
    text: string;
    speaker?: string;
}

const materializeDraftSegments = (drafts: NormalizedSegmentDraft[]): TranscriptSegment[] => {
    if (drafts.length === 0) return [];
    const sorted = drafts
        .filter((draft) => Number.isFinite(draft.start) && draft.start >= 0 && draft.text)
        .sort((a, b) => a.start - b.start);
    if (sorted.length === 0) return [];

    return sorted
        .map((draft, index) => {
            const nextStartRaw = index < sorted.length - 1 ? sorted[index + 1].start : null;
            const nextStart = Number.isFinite(nextStartRaw) && (nextStartRaw || 0) > draft.start
                ? Number(nextStartRaw)
                : null;
            const resolvedEnd = Number.isFinite(draft.end) && (draft.end || 0) > draft.start
                ? Number(draft.end)
                : nextStart !== null
                    ? nextStart
                    : draft.start + 1.5;
            return {
                id: draft.id,
                start: Number(draft.start.toFixed(3)),
                end: Number(Math.max(resolvedEnd, draft.start + 0.05).toFixed(3)),
                text: draft.text,
                speaker: draft.speaker
            };
        })
        .filter((segment) => segment.end > segment.start);
};

const extractWordSegments = (parsed: Record<string, any> | null): TranscriptSegment[] => {
    const rawWords = Array.isArray(parsed?.words)
        ? parsed?.words
        : Array.isArray(parsed?.word_timestamps)
            ? parsed?.word_timestamps
            : Array.isArray(parsed?.results?.words)
                ? parsed?.results?.words
                : [];
    if (!Array.isArray(rawWords) || rawWords.length === 0) return [];

    const normalizedWords = rawWords
        .map((entry) => {
            const item = parseObject(entry);
            const text = normalizeText(item.word ?? item.text ?? item.token ?? item.content);
            const start = normalizeSegmentTime(item.start ?? item.startTime ?? item.begin ?? item.from);
            const end = normalizeSegmentTime(item.end ?? item.endTime ?? item.to ?? item.stop);
            const duration = normalizeSegmentTime(item.duration ?? item.length);
            if (!text || start === null) return null;
            const resolvedEnd = end !== null
                ? end
                : (duration !== null ? start + duration : null);
            const speaker = normalizeSpeakerLabel(
                item.speaker
                ?? item.speakerName
                ?? item.speaker_name
                ?? item.speakerLabel
                ?? item.speaker_label
                ?? item.speakerId
                ?? item.speaker_id
            ) || undefined;
            return {
                text,
                start,
                end: resolvedEnd,
                speaker
            };
        })
        .filter(Boolean) as Array<{ text: string; start: number; end: number | null; speaker?: string }>;

    if (normalizedWords.length === 0) return [];

    const sortedWords = normalizedWords.sort((a, b) => a.start - b.start);
    const drafts: NormalizedSegmentDraft[] = [];
    const MAX_WORDS_PER_SEGMENT = 16;
    const MAX_DURATION_SECONDS = 8;
    const GAP_BREAK_SECONDS = 0.8;
    let current: {
        start: number;
        end: number;
        text: string;
        words: number;
        speaker?: string;
    } | null = null;
    let draftId = 0;

    const flush = () => {
        if (!current) return;
        drafts.push({
            id: draftId++,
            start: current.start,
            end: current.end,
            text: normalizeText(current.text),
            speaker: current.speaker
        });
        current = null;
    };

    const appendWord = (base: string, nextWord: string) => {
        if (!base) return nextWord;
        if (/^[,.;:!?)]/.test(nextWord)) return `${base}${nextWord}`;
        if (nextWord.startsWith("'")) return `${base}${nextWord}`;
        if (base.endsWith('(')) return `${base}${nextWord}`;
        return `${base} ${nextWord}`;
    };

    for (const word of sortedWords) {
        const wordEnd = Number.isFinite(word.end) && (word.end || 0) > word.start
            ? Number(word.end)
            : word.start + 0.3;
        if (!current) {
            current = {
                start: word.start,
                end: wordEnd,
                text: word.text,
                words: 1,
                speaker: word.speaker
            };
            continue;
        }

        const gap = word.start - current.end;
        const speakerChanged = Boolean(word.speaker && current.speaker && word.speaker !== current.speaker);
        const endedSentence = /[.!?]["')\]]*$/.test(current.text);
        const segmentTooLong = (wordEnd - current.start) > MAX_DURATION_SECONDS || current.words >= MAX_WORDS_PER_SEGMENT;
        const shouldSplit = speakerChanged
            || gap > GAP_BREAK_SECONDS
            || segmentTooLong
            || (endedSentence && current.words >= 6);

        if (shouldSplit) {
            flush();
            current = {
                start: word.start,
                end: wordEnd,
                text: word.text,
                words: 1,
                speaker: word.speaker
            };
            continue;
        }

        current.text = appendWord(current.text, word.text);
        current.end = Math.max(current.end, wordEnd);
        current.words += 1;
    }
    flush();
    return materializeDraftSegments(drafts);
};

const extractNativeSegments = (parsed: Record<string, any> | null): TranscriptSegment[] => {
    const rawSegments = resolveRawTimedSegments(parsed);
    const drafts = rawSegments
        .map((segment, index) => {
            const item = parseObject(segment);
            const normalizedContent = normalizeSegmentSpeaker(item, normalizeSegmentText(item));
            const text = normalizedContent.text;
            const start = normalizeSegmentTime(item.start ?? item.startTime ?? item.seek ?? item.begin ?? item.from ?? item.t0);
            const end = normalizeSegmentTime(item.end ?? item.endTime ?? item.stop ?? item.to ?? item.t1);
            const duration = normalizeSegmentTime(item.duration ?? item.length);
            const resolvedEnd = end !== null
                ? end
                : (duration !== null && start !== null ? start + duration : null);
            if (!text || start === null) return null;
            return {
                id: Number.isFinite(Number(item.id)) ? Number(item.id) : index,
                start,
                end: resolvedEnd,
                text,
                speaker: normalizedContent.speaker || undefined
            };
        })
        .filter(Boolean) as NormalizedSegmentDraft[];

    const normalized = materializeDraftSegments(drafts);
    if (normalized.length > 0) return normalized;

    return extractWordSegments(parsed);
};

const splitTranscriptIntoCueBlocks = (text: string) => {
    const paragraphs = normalizeText(text)
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

    if (paragraphs.length > 1) return paragraphs;

    const sentences = normalizeText(text)
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

    if (sentences.length <= 1) return normalizeText(text) ? [normalizeText(text)] : [];

    const blocks: string[] = [];
    let currentBlock = '';
    let currentWords = 0;

    for (const sentence of sentences) {
        const sentenceWords = getWordCount(sentence);
        const nextWords = currentWords + sentenceWords;
        if (currentBlock && nextWords > 18) {
            blocks.push(currentBlock.trim());
            currentBlock = sentence;
            currentWords = sentenceWords;
            continue;
        }
        currentBlock = currentBlock ? `${currentBlock} ${sentence}` : sentence;
        currentWords = nextWords;
    }

    if (currentBlock) blocks.push(currentBlock.trim());
    return blocks;
};

const buildSyntheticSegments = (text: string, durationSeconds?: number | null): TranscriptSegment[] => {
    const blocks = splitTranscriptIntoCueBlocks(text);
    if (blocks.length === 0) return [];

    const totalDuration = estimateTranscriptDurationSeconds(text, durationSeconds);
    const totalWeight = blocks.reduce((sum, block) => sum + Math.max(1, getWordCount(block)), 0);
    let cursor = 0;

    return blocks.map((block, index) => {
        const weight = Math.max(1, getWordCount(block));
        const rawDuration = (weight / totalWeight) * totalDuration;
        const minimumDuration = 1.5;
        const allocatedDuration = index === blocks.length - 1
            ? Math.max(minimumDuration, totalDuration - cursor)
            : Math.max(minimumDuration, rawDuration);
        const end = index === blocks.length - 1
            ? Math.max(cursor + minimumDuration, totalDuration)
            : Math.min(totalDuration, cursor + allocatedDuration);
        const normalizedContent = extractInlineSpeaker(block);

        const segment: TranscriptSegment = {
            id: index,
            start: Number(cursor.toFixed(3)),
            end: Number(Math.max(end, cursor + minimumDuration).toFixed(3)),
            text: normalizedContent.text || block,
            speaker: normalizedContent.speaker || undefined,
            isSynthetic: true
        };
        cursor = segment.end;
        return segment;
    });
};

const formatTimestamp = (seconds: number, separator: ',' | '.') => {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const wholeSeconds = Math.floor(safe);
    const milliseconds = Math.round((safe - wholeSeconds) * 1000);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const secs = wholeSeconds % 60;

    return [
        String(hours).padStart(2, '0'),
        String(minutes).padStart(2, '0'),
        String(secs).padStart(2, '0')
    ].join(':') + `${separator}${String(milliseconds).padStart(3, '0')}`;
};

export const formatTranscriptClockTime = (seconds?: number | null) => {
    if (!Number.isFinite(seconds) || seconds === null || seconds === undefined) return '--:--:--';
    const safe = Math.max(0, Math.floor(Number(seconds)));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return [
        String(hours).padStart(2, '0'),
        String(minutes).padStart(2, '0'),
        String(secs).padStart(2, '0')
    ].join(':');
};

export const buildTranscriptInspectionData = (
    rawTranscript: string,
    options: Pick<TranscriptDownloadBuildOptions, 'durationSeconds'> = {}
): TranscriptInspectionData => {
    const parsed = tryParseTranscriptJson(rawTranscript);
    const transcriptText = resolvePlainTranscriptText(rawTranscript, parsed);
    const nativeSegments = extractNativeSegments(parsed);
    const syntheticSegments = nativeSegments.length === 0
        ? buildSyntheticSegments(transcriptText, options.durationSeconds)
        : [];

    return {
        parsed,
        transcriptText,
        segments: nativeSegments.length > 0 ? nativeSegments : syntheticSegments,
        hasNativeSegments: nativeSegments.length > 0,
        usedSyntheticTiming: nativeSegments.length === 0 && syntheticSegments.length > 0
    };
};

const buildSrtContent = (segments: TranscriptSegment[]) => (
    segments.map((segment, index) => (
        `${index + 1}\n${formatTimestamp(segment.start, ',')} --> ${formatTimestamp(segment.end, ',')}\n${segment.text}`
    )).join('\n\n')
);

const buildVttContent = (segments: TranscriptSegment[]) => (
    `WEBVTT\n\n${segments.map((segment) => (
        `${formatTimestamp(segment.start, '.')} --> ${formatTimestamp(segment.end, '.')}\n${segment.text}`
    )).join('\n\n')}`
);

const getSuggestedDownloadName = (title: string, format: TranscriptDownloadFormat) => {
    const baseName = sanitizeBaseName(title);
    if (format === 'json' || format === 'verbose_json') return `${baseName}.json`;
    if (format === 'srt') return `${baseName}.srt`;
    if (format === 'vtt') return `${baseName}.vtt`;
    return `${baseName}.txt`;
};

const resolvePlainTranscriptText = (rawTranscript: string, parsed: Record<string, any> | null) => {
    const parsedText = normalizeText(parsed?.text);
    return parsedText || normalizeText(rawTranscript);
};

export const buildTranscriptDownloadArtifact = (
    format: TranscriptDownloadFormat,
    options: TranscriptDownloadBuildOptions
): TranscriptDownloadArtifact => {
    const inspectionData = buildTranscriptInspectionData(options.rawTranscript, {
        durationSeconds: options.durationSeconds
    });
    const parsed = inspectionData.parsed;
    const transcriptText = inspectionData.transcriptText;
    const segments = inspectionData.segments;
    const usedSyntheticTiming = inspectionData.usedSyntheticTiming && (format === 'srt' || format === 'vtt' || format === 'verbose_json');

    if (format === 'text') {
        return {
            filename: getSuggestedDownloadName(options.title || options.sourceFileName || DEFAULT_TRANSCRIPT_BASE_NAME, format),
            mimeType: 'text/plain;charset=utf-8',
            content: transcriptText,
            usedSyntheticTiming: false
        };
    }

    if (format === 'json') {
        const payload = parsed && Object.keys(parsed).length > 0
            ? parsed
            : { text: transcriptText };
        return {
            filename: getSuggestedDownloadName(options.title || options.sourceFileName || DEFAULT_TRANSCRIPT_BASE_NAME, format),
            mimeType: 'application/json;charset=utf-8',
            content: JSON.stringify(payload, null, 2),
            usedSyntheticTiming: false
        };
    }

    if (format === 'srt') {
        return {
            filename: getSuggestedDownloadName(options.title || options.sourceFileName || DEFAULT_TRANSCRIPT_BASE_NAME, format),
            mimeType: 'application/x-subrip;charset=utf-8',
            content: buildSrtContent(segments),
            usedSyntheticTiming
        };
    }

    if (format === 'vtt') {
        return {
            filename: getSuggestedDownloadName(options.title || options.sourceFileName || DEFAULT_TRANSCRIPT_BASE_NAME, format),
            mimeType: 'text/vtt;charset=utf-8',
            content: buildVttContent(segments),
            usedSyntheticTiming
        };
    }

    const verbosePayload = {
        ...parsed,
        text: transcriptText,
        response_format: 'verbose_json',
        source_file_name: normalizeText(options.sourceFileName) || null,
        model: normalizeText(options.modelId) || null,
        created_at: Number.isFinite(options.createdAt) && Number(options.createdAt) > 0
            ? new Date(Number(options.createdAt)).toISOString()
            : null,
        summary_text: normalizeText(options.summaryText) || null,
        qa_report: normalizeText(options.qaReport) || null,
        synthetic_timestamps: usedSyntheticTiming,
        segments: segments.map((segment) => ({
            id: segment.id,
            seek: segment.start,
            start: segment.start,
            end: segment.end,
            text: segment.text
        }))
    };

    return {
        filename: getSuggestedDownloadName(options.title || options.sourceFileName || DEFAULT_TRANSCRIPT_BASE_NAME, format),
        mimeType: 'application/json;charset=utf-8',
        content: JSON.stringify(verbosePayload, null, 2),
        usedSyntheticTiming
    };
};
