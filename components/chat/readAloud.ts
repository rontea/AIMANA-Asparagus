import { ChatMessage } from './types';

export const READ_ALOUD_MAX_CHARS = 3000;
const READ_ALOUD_TRUNCATED_NOTE = 'Long response truncated for read-aloud.';

const SECTION_MARKER_REGEX = /(^|\n)\s*(?:#+\s*)?(?:\*\*|__)?(Final Answer|Reasoning Summary)(?:\*\*|__)?\s*:?\s*/gi;

export interface ReadAloudExtractionResult {
    text: string;
    truncated: boolean;
}

export const splitReasoningSummary = (content: string) => {
    const raw = String(content || '');
    if (!raw.trim()) return { answer: '', summary: '' };
    const markers = Array.from(raw.matchAll(SECTION_MARKER_REGEX)).map((match) => {
        const full = String(match[0] || '');
        const leading = String(match[1] || '');
        const label = String(match[2] || '').trim().toLowerCase();
        const markerIndex = typeof match.index === 'number' ? match.index + leading.length : -1;
        return {
            label,
            start: markerIndex,
            contentStart: markerIndex + full.length - leading.length
        };
    }).filter((marker) => marker.start >= 0);

    if (markers.length === 0) return { answer: raw.trim(), summary: '' };

    let answer = '';
    let summary = '';

    markers.forEach((marker, index) => {
        const nextStart = index + 1 < markers.length ? markers[index + 1].start : raw.length;
        const sectionContent = raw.slice(marker.contentStart, nextStart).trim();
        if (!sectionContent) return;
        if (marker.label === 'final answer') {
            answer = sectionContent;
            return;
        }
        if (marker.label === 'reasoning summary') {
            summary = sectionContent;
        }
    });

    if (!answer) {
        const firstMarker = markers[0];
        const leadingContent = raw.slice(0, firstMarker.start).trim();
        if (leadingContent) {
            answer = leadingContent;
        } else if (summary) {
            answer = raw
                .replace(SECTION_MARKER_REGEX, '\n')
                .trim();
        }
    }

    return { answer: answer.trim(), summary: summary.trim() };
};

const stripFencedCodeBlocks = (markdown: string) => (
    markdown.replace(/```[\s\S]*?```/g, '\nCode block omitted.\n')
);

const stripInlineCode = (markdown: string) => (
    markdown.replace(/`([^`]+)`/g, '$1')
);

const stripMarkdownLinks = (markdown: string) => (
    markdown
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
);

const stripCitationTokens = (text: string) => (
    text
        .replace(/\\\[(\d{1,3})\\\]/g, '')
        .replace(/\[(\d{1,3})\](?!\()/g, '')
);

const stripMarkdownDecoration = (markdown: string) => (
    markdown
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
);

const stripHtmlTags = (text: string) => text.replace(/<[^>]+>/g, '');

const unescapeMarkdownPunctuation = (text: string) => text.replace(/\\([\\`*_[\]()#+\-.!])/g, '$1');

const normalizeWhitespace = (text: string) => {
    const normalizedLines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim())
        .filter(Boolean);
    return normalizedLines.join('\n').trim();
};

const truncateForReadAloud = (text: string, maxChars = READ_ALOUD_MAX_CHARS): ReadAloudExtractionResult => {
    if (!text || text.length <= maxChars) return { text, truncated: false };
    const truncated = text.slice(0, Math.max(0, maxChars)).trim();
    const nextText = truncated
        ? `${truncated}\n${READ_ALOUD_TRUNCATED_NOTE}`
        : READ_ALOUD_TRUNCATED_NOTE;
    return { text: nextText, truncated: true };
};

export const markdownToReadAloudText = (markdown: string): string => {
    const raw = String(markdown || '');
    if (!raw.trim()) return '';
    const withoutCode = stripFencedCodeBlocks(raw);
    const withoutInlineCode = stripInlineCode(withoutCode);
    const withoutLinks = stripMarkdownLinks(withoutInlineCode);
    const withoutCitations = stripCitationTokens(withoutLinks);
    const withoutDecoration = stripMarkdownDecoration(withoutCitations);
    const withoutHtml = stripHtmlTags(withoutDecoration);
    const unescaped = unescapeMarkdownPunctuation(withoutHtml);
    return normalizeWhitespace(unescaped);
};

export const getReadAloudTextForMessage = (
    message: ChatMessage,
    {
        includeReasoningSummary = false,
        maxChars = READ_ALOUD_MAX_CHARS
    }: { includeReasoningSummary?: boolean; maxChars?: number } = {}
): ReadAloudExtractionResult => {
    if (!message || message.role !== 'assistant' || message.status !== 'done') {
        return { text: '', truncated: false };
    }
    const { answer, summary } = splitReasoningSummary(String(message.content || ''));
    const answerText = markdownToReadAloudText(answer);
    const summaryText = includeReasoningSummary ? markdownToReadAloudText(summary) : '';
    const combined = [answerText, summaryText].filter(Boolean).join('\n\n').trim();
    if (!combined) return { text: '', truncated: false };
    return truncateForReadAloud(combined, maxChars);
};
