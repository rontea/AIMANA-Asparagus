const TRANSCRIPTION_POST_PROCESS_KEY = 'transcriptionPostProcess';

const parseObject = (value: unknown): Record<string, any> => (
    value && typeof value === 'object' ? value as Record<string, any> : {}
);

const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeBoolean = (value: unknown) => value === true;

export type TranscriptionPostProcessStatus = 'idle' | 'pending' | 'running' | 'complete' | 'error';

const getPostProcessStatusPriority = (status: TranscriptionPostProcessStatus) => {
    switch (status) {
        case 'error':
            return 4;
        case 'complete':
            return 3;
        case 'running':
            return 2;
        case 'pending':
            return 1;
        default:
            return 0;
    }
};

export const normalizeTranscriptionPostProcessStatus = (value: unknown): TranscriptionPostProcessStatus => {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized === 'pending' || normalized === 'running' || normalized === 'complete' || normalized === 'error') {
        return normalized;
    }
    return 'idle';
};

export interface TranscriptionManifestDetails {
    isTranscription: boolean;
    summaryText: string;
    summaryModelId: string;
    qaReport: string;
    qaModelId: string;
    transcriptHistoryText: string;
    sourceFileName: string;
    sourceAudioDataUrl: string;
    transcriptionHint: string;
    referenceItemId: string;
    referenceItemIds: string[];
    postProcessStatus: TranscriptionPostProcessStatus;
    summaryEnabled: boolean;
    qaEnabled: boolean;
    summaryError: string;
    qaError: string;
}

export interface TranscriptQaEdit {
    from: string;
    to: string;
}

export interface TranscriptDiffSegment {
    text: string;
    changed: boolean;
}

export interface TranscriptComparisonSegments {
    original: TranscriptDiffSegment[];
    corrected: TranscriptDiffSegment[];
    hasChanges: boolean;
}

export interface TranscriptQaDetails {
    verdict: string;
    confidence: string;
    accurateSegments: string[];
    issues: string[];
    edits: TranscriptQaEdit[];
    correctedTranscript: string;
    changeNotes: string[];
    hasCorrections: boolean;
}

export const extractTranscriptionManifestDetails = ({
    metadata,
    aiParameters
}: {
    metadata?: unknown;
    aiParameters?: string | null;
}): TranscriptionManifestDetails => {
    const candidates: Record<string, any>[] = [];

    if (metadata && typeof metadata === 'object') {
        candidates.push(metadata as Record<string, any>);
    }

    const rawAiParameters = normalizeText(aiParameters);
    if (rawAiParameters) {
        try {
            candidates.push(parseObject(JSON.parse(rawAiParameters)));
        } catch (_error) {}
    }

    let summaryText = '';
    let summaryModelId = '';
    let qaReport = '';
    let qaModelId = '';
    let transcriptHistoryText = '';
    let sourceFileName = '';
    let sourceAudioDataUrl = '';
    let transcriptionHint = '';
    let referenceItemId = '';
    const referenceItemIds = new Set<string>();
    let isTranscription = false;
    let postProcessStatus: TranscriptionPostProcessStatus = 'idle';
    let summaryEnabled = false;
    let qaEnabled = false;
    let summaryError = '';
    let qaError = '';

    for (const root of candidates) {
        const advanced = parseObject(root.advanced_params);
        const post = parseObject(advanced[TRANSCRIPTION_POST_PROCESS_KEY] ?? root[TRANSCRIPTION_POST_PROCESS_KEY]);

        summaryText = summaryText
            || normalizeText(post.summaryText || post.summary || advanced.transcriptSummary || root.transcriptSummary);
        summaryModelId = summaryModelId
            || normalizeText(post.summaryModelId || advanced.transcriptSummaryModelId || root.transcriptSummaryModelId);
        qaReport = qaReport
            || normalizeText(post.qaReport || advanced.transcriptQaReport || root.transcriptQaReport);
        qaModelId = qaModelId
            || normalizeText(post.qaModelId || advanced.transcriptQaModelId || root.transcriptQaModelId);
        transcriptHistoryText = transcriptHistoryText
            || normalizeText(post.promotedFromTranscript || advanced.promotedFromTranscript || root.promotedFromTranscript);
        sourceFileName = sourceFileName
            || normalizeText(advanced.sourceFileName || root.sourceFileName);
        sourceAudioDataUrl = sourceAudioDataUrl
            || normalizeText(advanced.audioData || root.audioData);
        transcriptionHint = transcriptionHint
            || normalizeText(advanced.transcriptionHint || root.transcriptionHint);
        referenceItemId = referenceItemId
            || normalizeText(advanced.referenceItemId || root.referenceItemId);
        const candidateStatus = normalizeTranscriptionPostProcessStatus(
            post.status || advanced.transcriptPostProcessStatus || root.transcriptPostProcessStatus
        );
        if (getPostProcessStatusPriority(candidateStatus) >= getPostProcessStatusPriority(postProcessStatus)) {
            postProcessStatus = candidateStatus;
        }
        summaryEnabled = summaryEnabled
            || normalizeBoolean(post.summaryEnabled)
            || normalizeBoolean(advanced.transcriptSummaryEnabled)
            || normalizeBoolean(root.transcriptSummaryEnabled);
        qaEnabled = qaEnabled
            || normalizeBoolean(post.qaEnabled)
            || normalizeBoolean(advanced.transcriptQaCheckerEnabled)
            || normalizeBoolean(root.transcriptQaCheckerEnabled);
        summaryError = summaryError || normalizeText(post.summaryError);
        qaError = qaError || normalizeText(post.qaError);

        const rawReferenceIds = [
            ...(Array.isArray(advanced.referenceItemIds) ? advanced.referenceItemIds : []),
            ...(Array.isArray(root.referenceItemIds) ? root.referenceItemIds : [])
        ];
        rawReferenceIds
            .map((value) => normalizeText(value))
            .filter(Boolean)
            .forEach((value) => referenceItemIds.add(value));

        if (
            advanced.isTranscription === true
            || root.isTranscription === true
            || normalizeText(advanced.transcriptionHint).length > 0
            || normalizeText(root.transcriptionHint).length > 0
            || normalizeText(post.summaryText || post.summary).length > 0
        ) {
            isTranscription = true;
        }
    }

    if (referenceItemId) {
        referenceItemIds.add(referenceItemId);
    }

    const hasSavedPostArtifacts = Boolean(summaryText || qaReport);
    const summarySatisfied = !summaryEnabled || Boolean(summaryText);
    const qaSatisfied = !qaEnabled || Boolean(qaReport);
    if (
        (postProcessStatus === 'pending' || postProcessStatus === 'running')
        && hasSavedPostArtifacts
        && summarySatisfied
        && qaSatisfied
    ) {
        postProcessStatus = 'complete';
    }

    if (postProcessStatus === 'idle' && (summaryText || qaReport)) {
        postProcessStatus = 'complete';
    }

    return {
        isTranscription,
        summaryText,
        summaryModelId,
        qaReport,
        qaModelId,
        transcriptHistoryText,
        sourceFileName,
        sourceAudioDataUrl,
        transcriptionHint,
        referenceItemId,
        referenceItemIds: Array.from(referenceItemIds),
        postProcessStatus,
        summaryEnabled,
        qaEnabled,
        summaryError,
        qaError
    };
};

export const isTranscriptPostProcessPending = (details?: Partial<TranscriptionManifestDetails> | null) => {
    if (!details?.isTranscription) return false;
    return details.postProcessStatus === 'pending' || details.postProcessStatus === 'running';
};

export const buildTranscriptSummaryExcerpt = (
    summaryText: string,
    transcriptText: string,
    maxLength = 220
) => {
    const source = normalizeText(summaryText || transcriptText).replace(/\s+/g, ' ');
    if (!source) return '';
    if (source.length <= maxLength) return source;
    return `${source.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const extractNamedSection = (report: string, title: string) => {
    const source = normalizeText(report);
    if (!source) return '';

    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
        `(?:^|\\n)${escapedTitle}:\\s*\\n?([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:\\s*(?:\\n|$)|$)`,
        'i'
    );
    const match = regex.exec(source);
    return normalizeText(match?.[1] || '');
};

const splitSectionLines = (section: string) => (
    normalizeText(section)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-*\u2022]\s*/, '').trim())
);

const normalizeComparableTranscript = (value: string) => (
    normalizeText(value).replace(/\s+/g, ' ')
);

const normalizeComparableToken = (value: string) => (
    value.replace(/\s+/g, ' ').trim()
);

const tokenizeTranscriptForDiff = (value: string) => (
    normalizeText(value).match(/\S+\s*/g) ?? []
);

const normalizeTranscriptEdit = (edit: TranscriptQaEdit): TranscriptQaEdit | null => {
    const from = normalizeText(edit.from);
    const to = normalizeText(edit.to);
    if (!from && !to) return null;
    if (normalizeComparableTranscript(from) === normalizeComparableTranscript(to)) return null;
    return { from, to };
};

const buildGranularTranscriptDiffEdits = (originalTranscript: string, correctedTranscript: string): TranscriptQaEdit[] => {
    const originalTokens = tokenizeTranscriptForDiff(originalTranscript);
    const correctedTokens = tokenizeTranscriptForDiff(correctedTranscript);

    if (originalTokens.length === 0 || correctedTokens.length === 0) return [];

    let prefixLength = 0;
    while (
        prefixLength < originalTokens.length
        && prefixLength < correctedTokens.length
        && normalizeComparableToken(originalTokens[prefixLength]) === normalizeComparableToken(correctedTokens[prefixLength])
    ) {
        prefixLength += 1;
    }

    let originalSuffixIndex = originalTokens.length - 1;
    let correctedSuffixIndex = correctedTokens.length - 1;
    while (
        originalSuffixIndex >= prefixLength
        && correctedSuffixIndex >= prefixLength
        && normalizeComparableToken(originalTokens[originalSuffixIndex]) === normalizeComparableToken(correctedTokens[correctedSuffixIndex])
    ) {
        originalSuffixIndex -= 1;
        correctedSuffixIndex -= 1;
    }

    const originalMiddle = originalTokens.slice(prefixLength, originalSuffixIndex + 1);
    const correctedMiddle = correctedTokens.slice(prefixLength, correctedSuffixIndex + 1);
    if (originalMiddle.length === 0 && correctedMiddle.length === 0) return [];

    const matrixCellCount = (originalMiddle.length + 1) * (correctedMiddle.length + 1);
    if (matrixCellCount > 250_000) {
        return [
            {
                from: normalizeText(originalMiddle.join('')),
                to: normalizeText(correctedMiddle.join(''))
            }
        ].map((edit) => normalizeTranscriptEdit(edit)).filter((edit): edit is TranscriptQaEdit => Boolean(edit));
    }

    const lcsMatrix = Array.from(
        { length: originalMiddle.length + 1 },
        () => new Uint32Array(correctedMiddle.length + 1)
    );

    for (let i = originalMiddle.length - 1; i >= 0; i -= 1) {
        for (let j = correctedMiddle.length - 1; j >= 0; j -= 1) {
            lcsMatrix[i][j] = normalizeComparableToken(originalMiddle[i]) === normalizeComparableToken(correctedMiddle[j])
                ? lcsMatrix[i + 1][j + 1] + 1
                : Math.max(lcsMatrix[i + 1][j], lcsMatrix[i][j + 1]);
        }
    }

    const edits: TranscriptQaEdit[] = [];
    let pendingFrom = '';
    let pendingTo = '';
    let i = 0;
    let j = 0;
    const flushPending = () => {
        const normalized = normalizeTranscriptEdit({ from: pendingFrom, to: pendingTo });
        if (normalized) edits.push(normalized);
        pendingFrom = '';
        pendingTo = '';
    };

    while (i < originalMiddle.length && j < correctedMiddle.length) {
        if (normalizeComparableToken(originalMiddle[i]) === normalizeComparableToken(correctedMiddle[j])) {
            flushPending();
            i += 1;
            j += 1;
            continue;
        }

        if (lcsMatrix[i + 1][j] >= lcsMatrix[i][j + 1]) {
            pendingFrom += originalMiddle[i];
            i += 1;
        } else {
            pendingTo += correctedMiddle[j];
            j += 1;
        }
    }

    while (i < originalMiddle.length) {
        pendingFrom += originalMiddle[i];
        i += 1;
    }

    while (j < correctedMiddle.length) {
        pendingTo += correctedMiddle[j];
        j += 1;
    }

    flushPending();
    return edits;
};

const appendDiffSegment = (segments: TranscriptDiffSegment[], text: string, changed: boolean) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.changed === changed) {
        last.text += text;
        return;
    }
    segments.push({ text, changed });
};

export const buildTranscriptComparisonSegments = (
    originalTranscript: string,
    correctedTranscript: string
): TranscriptComparisonSegments => {
    const originalTokens = tokenizeTranscriptForDiff(originalTranscript);
    const correctedTokens = tokenizeTranscriptForDiff(correctedTranscript);
    const originalNormalized = normalizeComparableTranscript(originalTranscript);
    const correctedNormalized = normalizeComparableTranscript(correctedTranscript);

    if (!originalNormalized && !correctedNormalized) {
        return { original: [], corrected: [], hasChanges: false };
    }

    if (!originalNormalized || !correctedNormalized || originalNormalized === correctedNormalized) {
        return {
            original: originalTranscript ? [{ text: originalTranscript, changed: false }] : [],
            corrected: correctedTranscript ? [{ text: correctedTranscript, changed: false }] : [],
            hasChanges: false
        };
    }

    if (originalTokens.length === 0 || correctedTokens.length === 0) {
        return {
            original: originalTranscript ? [{ text: originalTranscript, changed: true }] : [],
            corrected: correctedTranscript ? [{ text: correctedTranscript, changed: true }] : [],
            hasChanges: true
        };
    }

    let prefixLength = 0;
    while (
        prefixLength < originalTokens.length
        && prefixLength < correctedTokens.length
        && normalizeComparableToken(originalTokens[prefixLength]) === normalizeComparableToken(correctedTokens[prefixLength])
    ) {
        prefixLength += 1;
    }

    let originalSuffixIndex = originalTokens.length - 1;
    let correctedSuffixIndex = correctedTokens.length - 1;
    while (
        originalSuffixIndex >= prefixLength
        && correctedSuffixIndex >= prefixLength
        && normalizeComparableToken(originalTokens[originalSuffixIndex]) === normalizeComparableToken(correctedTokens[correctedSuffixIndex])
    ) {
        originalSuffixIndex -= 1;
        correctedSuffixIndex -= 1;
    }

    const originalSegments: TranscriptDiffSegment[] = [];
    const correctedSegments: TranscriptDiffSegment[] = [];

    appendDiffSegment(originalSegments, originalTokens.slice(0, prefixLength).join(''), false);
    appendDiffSegment(correctedSegments, correctedTokens.slice(0, prefixLength).join(''), false);

    const originalMiddle = originalTokens.slice(prefixLength, originalSuffixIndex + 1);
    const correctedMiddle = correctedTokens.slice(prefixLength, correctedSuffixIndex + 1);
    const matrixCellCount = (originalMiddle.length + 1) * (correctedMiddle.length + 1);

    if (matrixCellCount > 250_000) {
        appendDiffSegment(originalSegments, originalMiddle.join(''), true);
        appendDiffSegment(correctedSegments, correctedMiddle.join(''), true);
    } else {
        const lcsMatrix = Array.from(
            { length: originalMiddle.length + 1 },
            () => new Uint32Array(correctedMiddle.length + 1)
        );

        for (let i = originalMiddle.length - 1; i >= 0; i -= 1) {
            for (let j = correctedMiddle.length - 1; j >= 0; j -= 1) {
                lcsMatrix[i][j] = normalizeComparableToken(originalMiddle[i]) === normalizeComparableToken(correctedMiddle[j])
                    ? lcsMatrix[i + 1][j + 1] + 1
                    : Math.max(lcsMatrix[i + 1][j], lcsMatrix[i][j + 1]);
            }
        }

        let pendingOriginal = '';
        let pendingCorrected = '';
        const flushPending = () => {
            appendDiffSegment(originalSegments, pendingOriginal, true);
            appendDiffSegment(correctedSegments, pendingCorrected, true);
            pendingOriginal = '';
            pendingCorrected = '';
        };

        let i = 0;
        let j = 0;
        while (i < originalMiddle.length && j < correctedMiddle.length) {
            if (normalizeComparableToken(originalMiddle[i]) === normalizeComparableToken(correctedMiddle[j])) {
                flushPending();
                appendDiffSegment(originalSegments, originalMiddle[i], false);
                appendDiffSegment(correctedSegments, correctedMiddle[j], false);
                i += 1;
                j += 1;
                continue;
            }

            if (lcsMatrix[i + 1][j] >= lcsMatrix[i][j + 1]) {
                pendingOriginal += originalMiddle[i];
                i += 1;
            } else {
                pendingCorrected += correctedMiddle[j];
                j += 1;
            }
        }

        while (i < originalMiddle.length) {
            pendingOriginal += originalMiddle[i];
            i += 1;
        }

        while (j < correctedMiddle.length) {
            pendingCorrected += correctedMiddle[j];
            j += 1;
        }

        flushPending();
    }

    appendDiffSegment(originalSegments, originalTokens.slice(originalSuffixIndex + 1).join(''), false);
    appendDiffSegment(correctedSegments, correctedTokens.slice(correctedSuffixIndex + 1).join(''), false);

    const hasChanges = originalSegments.some((segment) => segment.changed) || correctedSegments.some((segment) => segment.changed);
    return {
        original: originalSegments,
        corrected: correctedSegments,
        hasChanges
    };
};

export const parseTranscriptQaReport = (qaReport: string, transcriptText = ''): TranscriptQaDetails => {
    const report = normalizeText(qaReport);
    const verdict = extractNamedSection(report, 'VERDICT');
    const confidence = extractNamedSection(report, 'CONFIDENCE');
    const accurateSegments = splitSectionLines(extractNamedSection(report, 'ACCURATE SEGMENTS'));
    const issues = splitSectionLines(extractNamedSection(report, 'ISSUES'));
    const editsSection = extractNamedSection(report, 'EDITS');
    const correctedTranscript = extractNamedSection(report, 'CORRECTED TRANSCRIPT');
    const changeNotes = splitSectionLines(extractNamedSection(report, 'CHANGE NOTES'));

    const edits: TranscriptQaEdit[] = [];
    const editRegex = /(?:^|\n)(?:\d+\.\s*)?FROM:\s*([\s\S]*?)\n\s*TO:\s*([\s\S]*?)(?=\n(?:\d+\.\s*)?FROM:|\n[A-Z][A-Z ]+:\s*(?:\n|$)|$)/gi;
    let match: RegExpExecArray | null = null;
    while ((match = editRegex.exec(editsSection)) !== null) {
        const from = normalizeText(match[1]);
        const to = normalizeText(match[2]);
        if (!from && !to) continue;
        edits.push({ from, to });
    }

    const correctedComparable = normalizeComparableTranscript(correctedTranscript);
    const originalComparable = normalizeComparableTranscript(transcriptText);
    const hasCorrections = edits.some((edit) => normalizeComparableTranscript(edit.from) !== normalizeComparableTranscript(edit.to))
        || (!!correctedComparable && !!originalComparable && correctedComparable !== originalComparable);

    return {
        verdict,
        confidence,
        accurateSegments,
        issues,
        edits,
        correctedTranscript,
        changeNotes,
        hasCorrections
    };
};

export const buildFallbackTranscriptEdits = (originalTranscript: string, correctedTranscript: string): TranscriptQaEdit[] => {
    const original = normalizeComparableTranscript(originalTranscript);
    const corrected = normalizeComparableTranscript(correctedTranscript);
    if (!original || !corrected || original === corrected) return [];
    return buildGranularTranscriptDiffEdits(originalTranscript, correctedTranscript);
};

export const buildTranscriptQaRedlineEdits = (
    originalTranscript: string,
    correctedTranscript: string,
    edits: TranscriptQaEdit[] = []
): TranscriptQaEdit[] => {
    const normalizedEdits = edits
        .map((edit) => normalizeTranscriptEdit(edit))
        .filter((edit): edit is TranscriptQaEdit => Boolean(edit));
    const fallbackEdits = buildFallbackTranscriptEdits(originalTranscript, correctedTranscript);

    if (fallbackEdits.length === 0) return normalizedEdits;
    if (normalizedEdits.length === 0) return fallbackEdits;

    const normalizedOriginal = normalizeComparableTranscript(originalTranscript);
    const normalizedCorrected = normalizeComparableTranscript(correctedTranscript);
    const editSpanSize = (items: TranscriptQaEdit[]) => items.reduce((total, edit) => total + edit.from.length + edit.to.length, 0);
    const looksLikeWholeTranscriptEdit = normalizedEdits.some((edit) => (
        normalizeComparableTranscript(edit.from) === normalizedOriginal
        || normalizeComparableTranscript(edit.to) === normalizedCorrected
    ));

    if (looksLikeWholeTranscriptEdit || editSpanSize(normalizedEdits) > editSpanSize(fallbackEdits) * 2) {
        return fallbackEdits;
    }

    return normalizedEdits;
};
