import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MessageMarkdown from './MessageMarkdown';

describe('MessageMarkdown', () => {
    it('renders markdown emphasis and lists', () => {
        render(<MessageMarkdown content={'**Bold**\n\n- first\n- second'} />);

        expect(screen.getByText('Bold').tagName).toBe('STRONG');
        expect(screen.getByText('first').tagName).toBe('LI');
        expect(screen.getByText('second').tagName).toBe('LI');
    });

    it('turns raw project routes into new-tab workspace links', () => {
        render(<MessageMarkdown content={'Open /project/73757c31-ca52-46f1-ac71-1d53a61ef671.'} />);

        const link = screen.getByRole('link', { name: '/project/73757c31-ca52-46f1-ac71-1d53a61ef671' });
        expect(link).toHaveAttribute('href', 'http://localhost:3000/#/project/73757c31-ca52-46f1-ac71-1d53a61ef671');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    it('rewrites markdown project links to the hash-router workspace URL', () => {
        render(<MessageMarkdown content={'[Project](/project/project-1?itemId=item-1)'} />);

        expect(screen.getByRole('link', { name: 'Project' }))
            .toHaveAttribute('href', 'http://localhost:3000/#/project/project-1?itemId=item-1');
    });

    it('renders code block with language label and supports copy', async () => {
        const user = userEvent.setup();
        const onCopyStatus = vi.fn();
        render(<MessageMarkdown content={'```js\nconsole.log("ok");\n```'} onCopyStatus={onCopyStatus} />);

        expect(screen.getByText('js')).toBeInTheDocument();
        expect(screen.getByText('console.log("ok");')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Copy code' }));
        expect(onCopyStatus).toHaveBeenCalled();
    });

    it('keeps unclosed streamed code fences renderable during streaming', () => {
        render(<MessageMarkdown content={'```js\nconsole.log("partial");'} isStreaming />);

        expect(screen.getByText('js')).toBeInTheDocument();
        expect(screen.getByText('console.log("partial");')).toBeInTheDocument();
    });

    it('shows code-block jump controls for long responses with multiple large code blocks', async () => {
        const user = userEvent.setup();
        if (!HTMLElement.prototype.scrollIntoView) {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                value: () => {}
            });
        }
        const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
        const longText = 'A'.repeat(920);
        const blockOne = Array.from({ length: 14 }, (_, i) => `const a${i} = ${i};`).join('\n');
        const blockTwo = Array.from({ length: 13 }, (_, i) => `const b${i} = ${i};`).join('\n');
        const content = `${longText}\n\n\`\`\`ts\n${blockOne}\n\`\`\`\n\nmiddle\n\n\`\`\`js\n${blockTwo}\n\`\`\``;

        render(<MessageMarkdown content={content} />);

        expect(screen.getByRole('button', { name: 'Previous code block' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next code block' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Next code block' }));
        expect(scrollSpy).toHaveBeenCalled();
        scrollSpy.mockRestore();
    });
});
