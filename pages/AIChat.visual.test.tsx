import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIChat from './AIChat';
import { loadDynamicRegistry } from '../components/project/lab/ModelSelector/registry/index';
import { STORAGE_KEY } from '../components/chat/utils';

vi.mock('../components/project/lab/ModelSelector/registry/index', () => ({
    loadDynamicRegistry: vi.fn()
}));

vi.mock('../services/api', () => ({
    api: {
        auth: {
            getAuthHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' }))
        },
        chatMemory: {
            upsert: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined)
        }
    }
}));

vi.mock('../services/pollinationsService', () => ({
    ensureReferenceAsset: vi.fn().mockResolvedValue(null)
}));

const mockedLoadDynamicRegistry = vi.mocked(loadDynamicRegistry);

const renderAIChat = () => render(
    <MemoryRouter initialEntries={['/chat?from=generate']}>
        <Routes>
            <Route path="/chat" element={<AIChat />} />
        </Routes>
    </MemoryRouter>
);

const getRuntimeMarkup = () => {
    const runtime = document.querySelector('.chat-runtime') as HTMLElement | null;
    expect(runtime).not.toBeNull();
    const raw = runtime?.outerHTML || '';
    return raw
        .replace(/data-message-markdown-id="[^"]*"/g, 'data-message-markdown-id="<msg-id>"')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>');
};

const writeHydratedSession = (messages: any[]) => {
    const fixedNow = Date.parse('2026-03-07T04:00:00.000Z');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
        {
            id: 'visual-session-1',
            title: 'Visual Session',
            source: 'generate',
            projectId: '',
            modelId: 'pollinations-openai',
            systemPrompt: 'You are a concise and reliable assistant.',
            temperature: 0.7,
            maxTokens: 16384,
            useSearch: false,
            useReasoning: false,
            messages,
            createdAt: fixedNow,
            updatedAt: fixedNow
        }
    ]));
};

describe('AIChat visual regression states', () => {
    beforeEach(() => {
        const fixedNow = Date.parse('2026-03-07T04:00:00.000Z');
        localStorage.clear();
        if (!HTMLElement.prototype.scrollIntoView) {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                value: () => {}
            });
        }
        mockedLoadDynamicRegistry.mockResolvedValue([
            {
                id: 'pollinations-openai',
                label: 'Pollinations OpenAI',
                category: 'Language',
                provider: 'pollinations'
            } as any
        ]);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockResolvedValue(undefined)
            }
        });
        vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function toLocaleStringMock(this: Date) {
            return new Date(this.valueOf()).toISOString();
        });
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    });

    it('captures empty state', async () => {
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();
        expect(await screen.findByText('Start a chat')).toBeInTheDocument();
        expect(getRuntimeMarkup()).toMatchSnapshot();
    });

    it('captures sending state', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockImplementationOnce((_url: string, init?: any) => new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener('abort', () => {
                const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
                reject(abortError);
            });
        }));
        vi.stubGlobal('fetch', fetchMock);
        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Capture sending state');
        await user.click(screen.getByTitle('Send'));
        expect(await screen.findByText('Generating response...')).toBeInTheDocument();
        expect(getRuntimeMarkup()).toMatchSnapshot();

        await user.click(screen.getByRole('button', { name: /^stop$/i }));
    });

    it('captures stopped state', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockImplementationOnce((_url: string, init?: any) => new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener('abort', () => {
                const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
                reject(abortError);
            });
        }));
        vi.stubGlobal('fetch', fetchMock);
        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Capture stopped state');
        await user.click(screen.getByTitle('Send'));
        await user.click(screen.getByRole('button', { name: /^stop$/i }));
        expect(await screen.findByText('Generation stopped.')).toBeInTheDocument();
        expect(getRuntimeMarkup()).toMatchSnapshot();
    });

    it('captures error state', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockRejectedValueOnce(new Error('Visual test error'));
        vi.stubGlobal('fetch', fetchMock);
        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Capture error state');
        await user.click(screen.getByTitle('Send'));
        expect(await screen.findAllByText('Visual test error')).toHaveLength(2);
        expect(getRuntimeMarkup()).toMatchSnapshot();
    });

    it('captures state with media attachments', async () => {
        vi.stubGlobal('fetch', vi.fn());
        writeHydratedSession([
            {
                id: 'user-media-1',
                role: 'user',
                content: 'Here are media attachments',
                status: 'done',
                imageInputs: [
                    {
                        id: 'img-1',
                        name: 'cat.png',
                        url: 'data:image/png;base64,ZmFrZQ==',
                        mimeType: 'image/png'
                    }
                ],
                audioInputs: [
                    {
                        id: 'audio-1',
                        name: 'voice.mp3',
                        data: 'YXVkaW8=',
                        format: 'mp3',
                        mimeType: 'audio/mpeg'
                    }
                ]
            },
            {
                id: 'assistant-media-1',
                role: 'assistant',
                content: 'Got the attachments.',
                status: 'done',
                modelId: 'pollinations-openai'
            }
        ]);

        renderAIChat();
        expect(await screen.findByText('Here are media attachments')).toBeInTheDocument();
        expect(getRuntimeMarkup()).toMatchSnapshot();
    });

    it('captures state with session panel open', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        writeHydratedSession([
            {
                id: 'assistant-1',
                role: 'assistant',
                content: 'Session panel visual snapshot.',
                status: 'done',
                modelId: 'pollinations-openai'
            }
        ]);

        renderAIChat();
        await user.click(screen.getByTitle('Show sessions'));
        expect(await screen.findByText('Recent Sessions')).toBeInTheDocument();
        expect(getRuntimeMarkup()).toMatchSnapshot();
    });

    it('captures fullscreen state', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        await user.click(screen.getByLabelText('More actions'));
        const menu = await screen.findByRole('menu', { name: /more chat actions/i });
        await user.click(within(menu).getByRole('menuitem', { name: /^fullscreen$/i }));
        await waitFor(() => {
            const fullscreenSection = document.querySelector('section.fixed') as HTMLElement | null;
            expect(fullscreenSection).not.toBeNull();
        });
        expect(getRuntimeMarkup()).toMatchSnapshot();
    });
});
