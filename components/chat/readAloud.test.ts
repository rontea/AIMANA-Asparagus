import { describe, expect, it } from 'vitest';
import { getReadAloudTextForMessage, markdownToReadAloudText, READ_ALOUD_MAX_CHARS, splitReasoningSummary } from './readAloud';
import { ChatMessage } from './types';

const assistantMessage = (content: string, status: ChatMessage['status'] = 'done'): ChatMessage => ({
    id: 'm1',
    role: 'assistant',
    content,
    status
});

describe('readAloud text extraction', () => {
    it('converts markdown content into readable plain text and removes citation tokens', () => {
        const text = markdownToReadAloudText('# Title\n\n- first\n- second [1]\n\nParagraph with [2].');
        expect(text).toContain('Title');
        expect(text).toContain('first');
        expect(text).toContain('second');
        expect(text).toContain('Paragraph with.');
        expect(text).not.toContain('[1]');
        expect(text).not.toContain('[2]');
    });

    it('replaces fenced code blocks with a short omission note', () => {
        const text = markdownToReadAloudText('Before\n```ts\nconst x = 1;\n```\nAfter');
        expect(text).toContain('Before');
        expect(text).toContain('Code block omitted.');
        expect(text).toContain('After');
        expect(text).not.toContain('const x = 1;');
    });

    it('includes reasoning summary only when explicitly requested', () => {
        const message = assistantMessage(
            'Final Answer: Main result.\n\n## Reasoning Summary: Hidden analysis details.'
        );
        const withoutSummary = getReadAloudTextForMessage(message, { includeReasoningSummary: false });
        const withSummary = getReadAloudTextForMessage(message, { includeReasoningSummary: true });

        expect(withoutSummary.text).toContain('Main result.');
        expect(withoutSummary.text).not.toContain('Hidden analysis details.');
        expect(withSummary.text).toContain('Main result.');
        expect(withSummary.text).toContain('Hidden analysis details.');
    });

    it('separates final answer even when reasoning summary appears first', () => {
        const parsed = splitReasoningSummary(
            '## Reasoning Summary\n- Checked constraints\n- Chose the safest path\n\n## Final Answer\nThe assistant can help with planning, drafting, and analysis.'
        );

        expect(parsed.answer).toBe('The assistant can help with planning, drafting, and analysis.');
        expect(parsed.summary).toContain('Checked constraints');
    });

    it('keeps plain responses untouched when no reasoning sections exist', () => {
        const parsed = splitReasoningSummary('Here is the direct answer without any special sections.');

        expect(parsed.answer).toBe('Here is the direct answer without any special sections.');
        expect(parsed.summary).toBe('');
    });

    it('preserves a richer structured reasoning overview under the reasoning summary section', () => {
        const parsed = splitReasoningSummary(
            [
                'Final Answer: We can provide a fuller visible reasoning overview without exposing hidden chain-of-thought.',
                '',
                '## Reasoning Summary',
                '- Approach: Summarize the solution path at a high level.',
                '- What I checked: UI behavior, parser behavior, and prompt format.',
                '- Key assumptions: The model follows the requested section headings.',
                '- Tradeoffs: More detail, but still concise.',
                '- Conclusion: Users get a clearer explanation of how the answer was formed.'
            ].join('\n')
        );

        expect(parsed.answer).toContain('fuller visible reasoning overview');
        expect(parsed.summary).toContain('Approach:');
        expect(parsed.summary).toContain('What I checked:');
        expect(parsed.summary).toContain('Tradeoffs:');
        expect(parsed.summary).toContain('Conclusion:');
    });

    it('returns empty text for non-done assistant messages', () => {
        const loading = getReadAloudTextForMessage(assistantMessage('Pending output', 'loading'));
        const stopped = getReadAloudTextForMessage(assistantMessage('Generation stopped', 'stopped'));
        const error = getReadAloudTextForMessage(assistantMessage('Error output', 'error'));

        expect(loading.text).toBe('');
        expect(stopped.text).toBe('');
        expect(error.text).toBe('');
    });

    it('truncates very long responses and appends a truncation note', () => {
        const longContent = `Result ${'x'.repeat(READ_ALOUD_MAX_CHARS + 120)}`;
        const extracted = getReadAloudTextForMessage(assistantMessage(longContent));

        expect(extracted.truncated).toBe(true);
        expect(extracted.text.length).toBeGreaterThan(READ_ALOUD_MAX_CHARS);
        expect(extracted.text).toContain('Long response truncated for read-aloud.');
    });
});

