import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PromptAssistantPanel from './PromptAssistantPanel';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
    api: {
        auth: {
            getUser: vi.fn()
        },
        promptAssistant: {
            chat: vi.fn(),
            index: vi.fn()
        },
        settings: {
            appendPromptManagerDrafts: vi.fn()
        }
    }
}));

const mockedGetUser = vi.mocked(api.auth.getUser);
const mockedAssistantChat = vi.mocked(api.promptAssistant.chat);
const mockedAssistantIndex = vi.mocked(api.promptAssistant.index);
const mockedAppendDrafts = vi.mocked(api.settings.appendPromptManagerDrafts);

const baseResponse = {
    success: true,
    intent: 'idea_search' as const,
    answer: 'Use the portrait prompt as the creative anchor.',
    draft: null,
    sources: [
        {
            id: 'chunk-1',
            sourceType: 'prompts',
            sourceId: 'prompt-1',
            sourceRoute: '/prompt-manager',
            title: 'Portrait Prompt',
            snippet: 'Create a cinematic portrait.',
            score: 0.91
        }
    ],
    matchCount: 1,
    noSource: false,
    usage: null
};

const renderPanel = (initialQuery = 'portrait ideas') => render(
    <MemoryRouter initialEntries={['/assistant']}>
        <Routes>
            <Route path="/assistant" element={<PromptAssistantPanel initialQuery={initialQuery} contextLabel="Test context" />} />
            <Route path="/prompt-manager" element={<div>Prompt Manager Route</div>} />
        </Routes>
    </MemoryRouter>
);

describe('PromptAssistantPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (!HTMLElement.prototype.scrollIntoView) {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                value: () => {}
            });
        }
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockResolvedValue(undefined)
            }
        });
        window.sessionStorage.clear();
        window.localStorage.clear();
        mockedGetUser.mockReturnValue({ id: 'user-1', role: 'user' } as any);
        mockedAssistantChat.mockResolvedValue(baseResponse as any);
        mockedAssistantIndex.mockResolvedValue({
            success: true,
            recordsScanned: 2,
            chunksCreated: 1,
            chunksUpdated: 2,
            chunksDeleted: 0,
            failures: 0
        } as any);
        mockedAppendDrafts.mockResolvedValue({ success: true, count: 1 } as any);
    });

    it('renders citations from a grounded assistant response', async () => {
        const user = userEvent.setup();
        renderPanel();

        await user.click(screen.getByRole('button', { name: /^ask$/i }));

        expect(await screen.findByText('Use the portrait prompt as the creative anchor.')).toBeInTheDocument();
        expect(screen.getByText('Sources')).toBeInTheDocument();
        expect(screen.getByText('Portrait Prompt')).toBeInTheDocument();
        expect(screen.getByText('Create a cinematic portrait.')).toBeInTheDocument();
        const composer = screen.getByPlaceholderText(/Ask for ideas/i).closest('form')?.parentElement;
        expect(composer).toHaveClass('sticky', 'bottom-0');
        expect(mockedAssistantChat).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'portrait ideas',
                intent: 'idea_search'
            }),
            expect.objectContaining({
                signal: expect.any(AbortSignal)
            })
        );
    });

    it('shows loading, error, and no-source states', async () => {
        const user = userEvent.setup();
        let resolveChat: (value: any) => void = () => {};
        mockedAssistantChat.mockReturnValueOnce(new Promise((resolve) => {
            resolveChat = resolve;
        }) as any);

        renderPanel('missing context');
        await user.click(screen.getByRole('button', { name: /^ask$/i }));
        expect(screen.getByText(/Searching indexed context/i)).toBeInTheDocument();

        resolveChat({
            ...baseResponse,
            answer: 'I could not find matching context.',
            sources: [],
            matchCount: 0,
            noSource: true
        });
        expect(await screen.findByText('No reliable indexed source was found for this request.')).toBeInTheDocument();

        mockedAssistantChat.mockRejectedValueOnce(new Error('RAG unavailable'));
        await user.type(screen.getByPlaceholderText(/Ask for ideas/i), 'try again');
        await user.click(screen.getByRole('button', { name: /^ask$/i }));
        expect(await screen.findByText('RAG unavailable')).toBeInTheDocument();
    });

    it('supports draft copy, refine, and save actions', async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        });
        mockedAssistantChat.mockResolvedValueOnce({
            ...baseResponse,
            intent: 'prompt_draft',
            answer: 'Draft created.',
            draft: {
                title: 'Neon Portrait',
                prompt: 'Create a neon portrait in rain.',
                tags: ['neon', 'portrait'],
                variables: 'subject, city',
                sources: 'Portrait Prompt'
            }
        } as any);

        renderPanel('make a prompt');
        await user.click(screen.getByRole('button', { name: /draft prompt/i }));
        await user.click(screen.getByRole('button', { name: /^ask$/i }));

        expect(await screen.findByText('Generated Draft')).toBeInTheDocument();
        await user.click(screen.getAllByRole('button', { name: /copy/i })[0]);
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Create a neon portrait in rain.'));

        await user.click(screen.getByRole('button', { name: /refine/i }));
        expect((screen.getByPlaceholderText(/Ask for ideas/i) as HTMLTextAreaElement).value).toContain('Refine this generated prompt');

        await user.click(screen.getByRole('button', { name: /save/i }));
        await waitFor(() => expect(mockedAppendDrafts).toHaveBeenCalledTimes(1));
        const savedDraft = mockedAppendDrafts.mock.calls[0][0][0];
        expect(savedDraft.title).toBe('Neon Portrait');
        expect(savedDraft.prompt).toBe('Create a neon portrait in rain.');
        expect(savedDraft.tags).toBe('neon, portrait');
        expect(await screen.findByText('Draft saved to Prompt Manager staging.')).toBeInTheDocument();
    });

    it('shows admin re-index controls only for admins', async () => {
        const user = userEvent.setup();
        const nonAdminRender = renderPanel();
        expect(screen.queryByRole('button', { name: /re-index/i })).not.toBeInTheDocument();

        nonAdminRender.unmount();
        mockedGetUser.mockReturnValue({ id: 'admin-root', role: 'admin' } as any);
        renderPanel();
        await user.click(screen.getByRole('button', { name: /re-index/i }));
        const dialog = await screen.findByRole('dialog', { name: /re-index workspace/i });
        await user.click(within(dialog).getByRole('button', { name: /^yes$/i }));
        expect(mockedAssistantIndex).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/Index refreshed/i)).toBeInTheDocument();
    });

    it('can cancel re-index from the confirmation dialog', async () => {
        const user = userEvent.setup();
        mockedGetUser.mockReturnValue({ id: 'admin-root', role: 'admin' } as any);
        renderPanel();

        await user.click(screen.getByRole('button', { name: /re-index/i }));
        const dialog = await screen.findByRole('dialog', { name: /re-index workspace/i });
        expect(within(dialog).getByText(/are you sure you want to refresh/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole('button', { name: /^no$/i }));
        expect(mockedAssistantIndex).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: /re-index workspace/i })).not.toBeInTheDocument();
    });

    it('asks for confirmation before deleting a session', async () => {
        const user = userEvent.setup();
        renderPanel();

        await user.click(screen.getByRole('button', { name: /^sessions$/i }));
        await user.click(await screen.findByRole('button', { name: /^delete session$/i }));

        const dialog = await screen.findByRole('dialog', { name: /delete session/i });
        expect(within(dialog).getByText(/are you sure you want to delete this session/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole('button', { name: /^no$/i }));
        expect(screen.queryByRole('dialog', { name: /delete session/i })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^delete session$/i }));
        const confirmDialog = await screen.findByRole('dialog', { name: /delete session/i });
        await user.click(within(confirmDialog).getByRole('button', { name: /^yes$/i }));

        expect(screen.queryByRole('dialog', { name: /delete session/i })).not.toBeInTheDocument();
    });

    it('previews related sources before opening the workspace source in a new tab', async () => {
        const user = userEvent.setup();
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
        renderPanel();

        await user.click(screen.getByRole('button', { name: /^ask$/i }));
        await user.click(await screen.findByText('Portrait Prompt'));

        const dialog = await screen.findByRole('dialog', { name: 'Portrait Prompt' });
        expect(dialog).toHaveClass('fixed');
        expect(within(dialog).getByText('Create a cinematic portrait.')).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: /open source/i }));

        expect(openSpy).toHaveBeenCalledWith(
            expect.stringContaining('/prompt-manager'),
            '_blank',
            'noopener,noreferrer'
        );
    });

    it('restores turns from the browser session and can clear them', async () => {
        const user = userEvent.setup();
        const firstRender = renderPanel();

        await user.click(screen.getByRole('button', { name: /^ask$/i }));
        expect(await screen.findByText('Use the portrait prompt as the creative anchor.')).toBeInTheDocument();

        firstRender.unmount();
        renderPanel('');

        expect(await screen.findByText('Use the portrait prompt as the creative anchor.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /clear session/i }));
        const cancelDialog = await screen.findByRole('dialog', { name: /clear session/i });
        await user.click(within(cancelDialog).getByRole('button', { name: /^no$/i }));
        expect(screen.getByText('Use the portrait prompt as the creative anchor.')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /clear session/i }));
        const confirmDialog = await screen.findByRole('dialog', { name: /clear session/i });
        await user.click(within(confirmDialog).getByRole('button', { name: /^yes$/i }));

        expect(screen.queryByText('Use the portrait prompt as the creative anchor.')).not.toBeInTheDocument();
        expect(screen.getByText('Prompt Assistant session cleared.')).toBeInTheDocument();
    });

    it('asks for confirmation before creating a new session', async () => {
        const user = userEvent.setup();
        renderPanel();

        await user.click(screen.getByRole('button', { name: /new session/i }));

        const dialog = await screen.findByRole('dialog', { name: /create new session/i });
        expect(within(dialog).getByText(/are you sure you want to create a new session/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole('button', { name: /^no$/i }));
        expect(screen.queryByRole('dialog', { name: /create new session/i })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /new session/i }));
        const confirmDialog = await screen.findByRole('dialog', { name: /create new session/i });
        await user.click(within(confirmDialog).getByRole('button', { name: /^yes$/i }));

        expect(await screen.findByText('New Prompt Assistant session created.')).toBeInTheDocument();
    });
});
