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
        settings: {
            get: vi.fn().mockResolvedValue({
                defaultReadAloudVoiceURI: '',
                defaultReadAloudVoiceName: ''
            })
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

const makeJsonResponse = (payload: any, ok = true) => ({
    ok,
    headers: {
        get: (key: string) => (key.toLowerCase() === 'content-type' ? 'application/json' : null)
    },
    json: async () => payload
});

const makeSseResponse = (chunks: string[]) => {
    const encoder = new TextEncoder();
    let index = 0;
    return {
        ok: true,
        headers: {
            get: (key: string) => (key.toLowerCase() === 'content-type' ? 'text/event-stream' : null)
        },
        body: {
            getReader: () => ({
                read: async () => {
                    if (index >= chunks.length) return { done: true, value: undefined };
                    const value = encoder.encode(chunks[index]);
                    index += 1;
                    return { done: false, value };
                }
            })
        },
        json: async () => ({})
    };
};

const makeVoice = (name: string, voiceURI: string, lang = 'en-US', isDefault = false) => ({
    name,
    voiceURI,
    lang,
    default: isDefault
} as SpeechSynthesisVoice);

const installSpeechSynthesisMock = (voices: SpeechSynthesisVoice[] = []) => {
    const originalUtterance = (globalThis as any).SpeechSynthesisUtterance;
    const originalSpeechSynthesis = (window as any).speechSynthesis;
    let lastUtterance: any = null;
    let currentVoices = voices;
    const voicesChangedListeners = new Set<() => void>();

    class SpeechSynthesisUtteranceMock {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        volume = 1;
        voice: SpeechSynthesisVoice | null = null;
        onstart: (() => void) | null = null;
        onpause: (() => void) | null = null;
        onresume: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event?: any) => void) | null = null;

        constructor(text: string) {
            this.text = text;
        }
    }

    const synth = {
        speak: vi.fn((utterance: any) => {
            lastUtterance = utterance;
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn(() => currentVoices),
        addEventListener: vi.fn((eventName: string, listener: () => void) => {
            if (eventName !== 'voiceschanged') return;
            voicesChangedListeners.add(listener);
        }),
        removeEventListener: vi.fn((eventName: string, listener: () => void) => {
            if (eventName !== 'voiceschanged') return;
            voicesChangedListeners.delete(listener);
        })
    };

    (globalThis as any).SpeechSynthesisUtterance = SpeechSynthesisUtteranceMock as any;
    (window as any).speechSynthesis = synth;

    return {
        synth,
        getLastUtterance: () => lastUtterance,
        setVoices: (nextVoices: SpeechSynthesisVoice[]) => {
            currentVoices = nextVoices;
            voicesChangedListeners.forEach((listener) => listener());
        },
        restore: () => {
            (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
            (window as any).speechSynthesis = originalSpeechSynthesis;
        }
    };
};

const renderAIChat = () => render(
    <MemoryRouter initialEntries={['/chat?from=generate']}>
        <Routes>
            <Route path="/chat" element={<AIChat />} />
        </Routes>
    </MemoryRouter>
);

const renderAIChatWithGenerateRoute = () => render(
    <MemoryRouter initialEntries={['/chat?from=generate']}>
        <Routes>
            <Route path="/chat" element={<AIChat />} />
            <Route path="/generate" element={<div>Generate Page</div>} />
        </Routes>
    </MemoryRouter>
);

describe('AIChat formatted-response regressions', () => {
    beforeEach(() => {
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
    });

    it('shows image upload controls only for models with image input modality', async () => {
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-vision',
                label: 'Vision Model',
                category: 'Language',
                provider: 'pollinations',
                textInputModalities: ['text', 'image']
            } as any
        ]);
        vi.stubGlobal('fetch', vi.fn());

        renderAIChat();

        expect(await screen.findByRole('button', { name: /add image/i })).toBeInTheDocument();
    });

    it('uses the currently selected model id in chat requests after switching models', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai',
                label: 'Model A',
                category: 'Language',
                provider: 'pollinations'
            } as any,
            {
                id: 'pollinations-kimi',
                label: 'Model B',
                category: 'Language',
                provider: 'pollinations'
            } as any
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'ok', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const modelSelect = await screen.findByRole('combobox', { name: /chat model/i });
        await user.selectOptions(modelSelect, 'pollinations-kimi');
        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Use model B{enter}');

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(init?.body || '{}'));
        expect(payload?.model).toBe('pollinations-kimi');
    });

    it('creates new sessions and sends the same prompt across models using the selected model id each time', async () => {
        const user = userEvent.setup();
        const models = [
            {
                id: 'pollinations-openai',
                label: 'OpenAI',
                category: 'Language',
                provider: 'pollinations'
            },
            {
                id: 'pollinations-kimi',
                label: 'Kimi',
                category: 'Language',
                provider: 'pollinations'
            },
            {
                id: 'pollinations-mistral',
                label: 'Mistral',
                category: 'Language',
                provider: 'pollinations'
            }
        ] as any[];
        mockedLoadDynamicRegistry.mockResolvedValueOnce(models);

        const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: any) => {
            const body = JSON.parse(String(init?.body || '{}'));
            return makeJsonResponse({ content: `reply:${body?.model || 'unknown'}`, diagnostics: {} });
        });
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        const modelSelect = await screen.findByRole('combobox', { name: /chat model/i });
        const prompt = 'Use this exact question: What is 2 + 2?';

        for (let i = 0; i < models.length; i += 1) {
            if (i > 0) {
                await user.click(screen.getAllByRole('button', { name: /^new session$/i })[0]);
                await user.click(await screen.findByRole('button', { name: /create session/i }));
            }

            await user.selectOptions(modelSelect, models[i].id);
            await user.clear(composer);
            await user.type(composer, `${prompt}{enter}`);
            await screen.findByText(`reply:${models[i].id}`);
        }

        expect(fetchMock).toHaveBeenCalledTimes(models.length);
        const calledModels = fetchMock.mock.calls.map(([, init]) => {
            const payload = JSON.parse(String(init?.body || '{}'));
            return payload?.model;
        });
        expect(calledModels).toEqual(models.map((m) => m.id));
    });

    it('sends image uploads as image_url parts for multimodal models', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-vision',
                label: 'Vision Model',
                category: 'Language',
                provider: 'pollinations',
                textInputModalities: ['text', 'image']
            } as any
        ]);

        class MockFileReader {
            public result: string | ArrayBuffer | null = null;
            public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
            readAsDataURL() {
                this.result = 'data:image/png;base64,ZmFrZQ==';
                if (this.onload) {
                    this.onload.call(this as any, {} as ProgressEvent<FileReader>);
                }
            }
        }
        vi.stubGlobal('FileReader', MockFileReader as any);

        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'ok', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const addImageButton = await screen.findByRole('button', { name: /add image/i });
        await user.click(addImageButton);

        const imageInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
        const testFile = new File(['fake'], 'cat.png', { type: 'image/png' });
        await user.upload(imageInput, testFile);

        await user.click(screen.getByTitle('Send'));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(init?.body || '{}'));
        expect(Array.isArray(payload.messages)).toBe(true);
        const userMessage = payload.messages[payload.messages.length - 1];
        expect(Array.isArray(userMessage?.content)).toBe(true);
        const imagePart = userMessage.content.find((part: any) => part.type === 'image_url');
        expect(imagePart?.image_url?.url).toContain('data:image/png;base64,');
    });

    it('shows search toggle as ON for tool-enabled models by default', async () => {
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-gemini-fast',
                label: 'Search Model',
                category: 'Language',
                provider: 'pollinations',
                textTools: true
            } as any
        ]);
        vi.stubGlobal('fetch', vi.fn());

        renderAIChat();
        expect(await screen.findByRole('button', { name: /search on/i })).toBeInTheDocument();
    });

    it('passes useSearch=true in dynamicParams by default for tool-enabled models', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-gemini-fast',
                label: 'Search Model',
                category: 'Language',
                provider: 'pollinations',
                textTools: true
            } as any
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'ok', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();
        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Search-enabled prompt{enter}');

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(init?.body || '{}'));
        expect(payload?.dynamicParams?.useSearch).toBe(true);
    });

    it('renders "Search: On (Grounded)" in assistant metadata when search was applied', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-search',
                label: 'Search Model',
                category: 'Language',
                provider: 'pollinations',
                textTools: true
            } as any
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({
            content: 'Grounded answer.',
            diagnostics: {
                searchApplied: true,
                searchMode: 'native',
                searchProvider: 'pollinations'
            }
        }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Find latest info{enter}');

        expect(await screen.findByText('Grounded answer.')).toBeInTheDocument();
        expect(await screen.findByText(/Search: On \(Grounded\)/i)).toBeInTheDocument();
    });

    it('renders "Search: On (Unavailable)" in assistant metadata when search was requested but not applied', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-search',
                label: 'Search Model',
                category: 'Language',
                provider: 'pollinations',
                textTools: true
            } as any
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({
            content: 'Ungrounded fallback answer.',
            diagnostics: {
                searchApplied: false,
                searchMode: 'fallback',
                searchWarning: 'Search provider unavailable.'
            }
        }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Find latest info{enter}');

        expect(await screen.findByText('Ungrounded fallback answer.')).toBeInTheDocument();
        expect(await screen.findByText(/Search: On \(Unavailable\)/i)).toBeInTheDocument();
    });

    it('renders a collapsed sources panel with links when diagnostics sources are present', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-search',
                label: 'Search Model',
                category: 'Language',
                provider: 'pollinations',
                textTools: true
            } as any
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({
            content: 'Grounded answer with sources.',
            diagnostics: {
                searchApplied: true,
                searchMode: 'fallback',
                sources: [
                    {
                        title: 'Example Source',
                        url: 'https://example.com/article',
                        snippet: 'Example snippet'
                    }
                ]
            }
        }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Give me sourced answer{enter}');

        expect(await screen.findByText('Grounded answer with sources.')).toBeInTheDocument();
        const summary = await screen.findByText('Sources (1)');
        expect(summary).toBeInTheDocument();
        await user.click(summary);
        expect(await screen.findByRole('link', { name: 'Example Source' })).toHaveAttribute('href', 'https://example.com/article');
    });

    it('does not render sources panel when diagnostics sources is empty', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({
            content: 'Answer without sources panel.',
            diagnostics: {
                searchApplied: false,
                sources: []
            }
        }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'No sources expected{enter}');

        expect(await screen.findByText('Answer without sources panel.')).toBeInTheDocument();
        expect(screen.queryByText(/Sources \(\d+\)/i)).not.toBeInTheDocument();
    });

    it('shows audio upload controls only for models with audio input modality', async () => {
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-audio',
                label: 'Audio Model',
                category: 'Language',
                provider: 'pollinations',
                textInputModalities: ['text', 'audio']
            } as any
        ]);
        vi.stubGlobal('fetch', vi.fn());

        renderAIChat();

        expect(await screen.findByRole('button', { name: /add audio/i })).toBeInTheDocument();
    });

    it('sends audio uploads as input_audio parts for multimodal models', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-audio',
                label: 'Audio Model',
                category: 'Language',
                provider: 'pollinations',
                textInputModalities: ['text', 'audio']
            } as any
        ]);

        class MockFileReader {
            public result: string | ArrayBuffer | null = null;
            public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
            readAsDataURL(file: File) {
                if ((file.type || '').startsWith('audio/')) {
                    this.result = 'data:audio/mpeg;base64,YXVkaW8=';
                } else {
                    this.result = 'data:image/png;base64,ZmFrZQ==';
                }
                if (this.onload) {
                    this.onload.call(this as any, {} as ProgressEvent<FileReader>);
                }
            }
        }
        vi.stubGlobal('FileReader', MockFileReader as any);

        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'ok', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const addAudioButton = await screen.findByRole('button', { name: /add audio/i });
        await user.click(addAudioButton);
        const audioInput = document.querySelector('input[type="file"][accept="audio/*"]') as HTMLInputElement;
        const testFile = new File(['fake'], 'sample.mp3', { type: 'audio/mpeg' });
        await user.upload(audioInput, testFile);

        await user.click(screen.getByTitle('Send'));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(init?.body || '{}'));
        const userMessage = payload.messages[payload.messages.length - 1];
        const audioPart = userMessage.content.find((part: any) => part.type === 'input_audio');
        expect(audioPart?.input_audio?.format).toBe('mp3');
        expect(audioPart?.input_audio?.data).toBe('YXVkaW8=');
    });

    it('shows logic toggle for reasoning-enabled models and forwards reasoning flag', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-openai-logic',
                label: 'Logic Model',
                category: 'Language',
                provider: 'pollinations',
                textReasoning: true
            } as any
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'ok', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        await user.click(await screen.findByRole('button', { name: /logic off/i }));
        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Reasoning prompt{enter}');

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse(String(init?.body || '{}'));
        expect(payload?.dynamicParams?.reasoning).toBe(true);
    });

    it('keeps edit + regenerate flow working with markdown assistant responses', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ content: '**Bold One**\n\n```ts\nconst alpha = 1;\n```', diagnostics: {} }))
            .mockResolvedValueOnce(makeJsonResponse({ content: '**Bold Two**\n\n```js\nconst beta = 2;\n```', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Original prompt{enter}');

        expect(await screen.findByText('Bold One')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /edit/i }));
        const editField = (await screen.findAllByDisplayValue('Original prompt'))
            .find((node) => node.tagName.toLowerCase() === 'textarea') as HTMLTextAreaElement | undefined;
        expect(editField).toBeDefined();
        if (!editField) {
            throw new Error('Inline edit textarea was not found.');
        }
        await user.clear(editField);
        await user.type(editField, 'Edited prompt');
        await user.click(screen.getByRole('button', { name: /save \+ regenerate/i }));

        expect(await screen.findByText('Bold Two')).toBeInTheDocument();
        expect(screen.getByText('Edited prompt')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keeps retry flow working with markdown assistant responses', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ content: '**First Pass**\n\n```ts\nconst first = true;\n```', diagnostics: {} }))
            .mockResolvedValueOnce(makeJsonResponse({ content: '**Retry Pass**\n\n```ts\nconst retry = true;\n```', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Retry this answer{enter}');
        expect(await screen.findByText('First Pass')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^retry$/i }));
        expect(await screen.findByText('Retry Pass')).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keeps session switching intact for formatted responses', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ content: '**Session Markdown**\n\n```ts\nconst session = 1;\n```', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Session prompt{enter}');
        expect(await screen.findByText('Session Markdown')).toBeInTheDocument();

        await user.click(screen.getAllByRole('button', { name: /^new session$/i })[0]);
        await user.click(screen.getByRole('button', { name: /create session/i }));

        await waitFor(() => {
            expect(screen.queryByText('Session Markdown')).not.toBeInTheDocument();
        });

        await user.click(screen.getByTitle('Show sessions'));
        await user.click(await screen.findByRole('button', { name: /Session prompt/i }));
        expect(await screen.findByText('Session Markdown')).toBeInTheDocument();
    });

    it('handles true event-stream responses (chunk aggregation + trailing buffer)', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeSseResponse([
            'data: {"delta":"Hello"}\n\n',
            'data: {"delta":" world","requestId":"req-stream","latencyMs":55}\n\n',
            'data: [DONE]\n\n',
            'data: {"delta":"!"}'
        ]));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Stream this{enter}');

        expect(await screen.findByText('Hello world!')).toBeInTheDocument();
        expect(await screen.findByText(/request: req-stream/i)).toBeInTheDocument();
    });

    it('handles event-stream done packets that carry final content without deltas', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeSseResponse([
            'data: {"done":true,"content":"Nomnom final content","requestId":"de477d3f-03b5-4f91-adcf-1e5b15eb9d00","latencyMs":7080}\n\n',
            'data: [DONE]\n\n'
        ]));
        vi.stubGlobal('fetch', fetchMock);

        renderAIChat();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Stream final-only response{enter}');

        expect(await screen.findByText('Nomnom final content')).toBeInTheDocument();
        expect(await screen.findByText(/request: de477d3f-03b5-4f91-adcf-1e5b15eb9d00/i)).toBeInTheDocument();
    });

    it('marks assistant message as stopped when generation is aborted', async () => {
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
        await user.type(composer, 'Abort this request');
        await user.click(screen.getByTitle('Send'));
        await user.click(screen.getByRole('button', { name: /^stop$/i }));

        expect(await screen.findByText('Generation stopped.')).toBeInTheDocument();
    });

    it('recovers from invalid localStorage JSON by creating a fresh session', async () => {
        localStorage.setItem(STORAGE_KEY, '{invalid-json');
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        expect(await screen.findByText('Start a chat')).toBeInTheDocument();
    });

    it('filters malformed hydrated messages and trims stored sessions to max limit', async () => {
        const now = Date.now();
        const manySessions = Array.from({ length: 55 }, (_, i) => ({
            id: `session-${i}`,
            title: `Session ${i}`,
            source: 'generate',
            projectId: '',
            modelId: 'pollinations-openai',
            systemPrompt: 'system',
            temperature: 0.7,
            maxTokens: 16384,
            messages: i === 0
                ? [
                    { id: 'm-valid', role: 'user', content: 'Hydrated valid message', status: 'done' },
                    { id: 'm-invalid-role', role: 'system', content: 'bad role', status: 'done' },
                    { id: 'm-invalid-status', role: 'assistant', content: 'bad status', status: 'unknown' }
                ]
                : [],
            createdAt: now - i,
            updatedAt: now - i
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(manySessions));
        vi.stubGlobal('fetch', vi.fn());

        const user = userEvent.setup();
        renderAIChat();

        expect(await screen.findByText('Hydrated valid message')).toBeInTheDocument();
        expect(screen.queryByText('bad role')).not.toBeInTheDocument();
        expect(screen.queryByText('bad status')).not.toBeInTheDocument();

        await user.click(screen.getByTitle('Show sessions'));
        await waitFor(() => {
            expect(screen.getAllByTitle('Delete session')).toHaveLength(50);
        });
    });

    it('supports confirm dialog keyboard controls (Esc + tab loop)', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        await user.click(screen.getAllByRole('button', { name: /^new session$/i })[0]);
        const cancelBtn = await screen.findByRole('button', { name: /^cancel$/i });
        const actionBtn = screen.getByRole('button', { name: /create session/i });

        await waitFor(() => expect(cancelBtn).toHaveFocus());
        await user.tab();
        expect(actionBtn).toHaveFocus();
        await user.tab();
        expect(cancelBtn).toHaveFocus();

        await user.keyboard('{Escape}');
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /create session/i })).not.toBeInTheDocument();
        });
    });

    it('creates a fallback new session when deleting the last remaining session', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        await user.click(screen.getByTitle('Show sessions'));
        await user.click((await screen.findAllByTitle('Delete session'))[0]);
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: /^delete session$/i }));

        await waitFor(() => {
            expect(screen.getAllByTitle('Delete session')).toHaveLength(1);
        });
        expect(screen.getByText('New Chat')).toBeInTheDocument();
    });

    it('disables session interactions while a response is sending', async () => {
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

        await user.click(await screen.findByTitle('Show sessions'));
        const panel = document.getElementById('chat-session-panel') as HTMLElement;
        expect(panel).not.toBeNull();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Lock session actions while sending');
        await user.click(screen.getByTitle('Send'));
        expect(await screen.findByText('Generating response...')).toBeInTheDocument();

        expect(screen.getByTitle('Hide sessions')).toBeDisabled();
        expect(screen.getByLabelText('Hide sessions')).toBeDisabled();
        expect(within(panel).getByRole('button', { name: /^new session$/i })).toBeDisabled();
        expect(within(panel).getByTitle('Delete session')).toBeDisabled();
        expect(panel.querySelector('button[aria-current="true"]')).toBeDisabled();

        await user.click(screen.getByRole('button', { name: /^stop$/i }));
        expect(await screen.findByText('Generation stopped.')).toBeInTheDocument();
    });

    it('keeps top bar action controls wired in their new placement', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        const sessionsButton = await screen.findByTitle('Show sessions');
        await user.click(sessionsButton);
        expect(await screen.findByText('Recent Sessions')).toBeInTheDocument();
        expect(screen.getByTitle('Hide sessions')).toBeInTheDocument();

        await user.click(screen.getByLabelText('More actions'));
        const moreMenu = await screen.findByRole('menu', { name: /more chat actions/i });
        await user.click(within(moreMenu).getByRole('menuitem', { name: /^settings$/i }));
        const runtimeSettingsMenus = await screen.findAllByRole('menu', { name: /runtime settings/i, hidden: true });
        expect(runtimeSettingsMenus.length).toBeGreaterThan(0);

        await user.click(screen.getByLabelText('More actions'));
        const fullscreenMenu = await screen.findByRole('menu', { name: /more chat actions/i });
        await user.click(within(fullscreenMenu).getByRole('menuitem', { name: /^fullscreen$/i }));
        await waitFor(() => {
            expect(document.querySelector('section.fixed')).not.toBeNull();
        });
        await user.click(screen.getByLabelText('More actions'));
        const exitMenu = await screen.findByRole('menu', { name: /more chat actions/i });
        await user.click(within(exitMenu).getByRole('menuitem', { name: /exit fullscreen/i }));
        await waitFor(() => {
            expect(document.querySelector('section.fixed')).toBeNull();
        });
    });

    it('keeps composer grouped controls interactive (media + toggles + model picker)', async () => {
        const user = userEvent.setup();
        mockedLoadDynamicRegistry.mockResolvedValueOnce([
            {
                id: 'pollinations-gemini',
                label: 'Multimodal Model',
                category: 'Language',
                provider: 'pollinations',
                textInputModalities: ['text', 'image', 'audio'],
                textTools: true,
                textReasoning: true
            } as any
        ]);

        class MockFileReader {
            public result: string | ArrayBuffer | null = null;
            public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => any) | null = null;
            readAsDataURL(file: File) {
                if ((file.type || '').startsWith('audio/')) {
                    this.result = 'data:audio/mpeg;base64,YXVkaW8=';
                } else {
                    this.result = 'data:image/png;base64,ZmFrZQ==';
                }
                if (this.onload) {
                    this.onload.call(this as any, {} as ProgressEvent<FileReader>);
                }
            }
        }
        vi.stubGlobal('FileReader', MockFileReader as any);
        vi.stubGlobal('fetch', vi.fn());

        renderAIChat();

        expect(await screen.findByRole('button', { name: /add image/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /add audio/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /search on/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /logic off/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /chat model/i })).toHaveValue('pollinations-gemini');

        await user.click(screen.getByRole('button', { name: /search on/i }));
        await user.click(screen.getByRole('button', { name: /logic off/i }));
        expect(screen.getByRole('button', { name: /search off/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /logic on/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /add image/i }));
        const imageInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
        await user.upload(imageInput, new File(['fake'], 'cat.png', { type: 'image/png' }));

        await user.click(screen.getByRole('button', { name: /add audio/i }));
        const audioInput = document.querySelector('input[type="file"][accept="audio/*"]') as HTMLInputElement;
        await user.upload(audioInput, new File(['fake'], 'voice.mp3', { type: 'audio/mpeg' }));

        expect(await screen.findByRole('button', { name: /remove cat\.png/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /remove voice\.mp3/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^clear$/i }));
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /remove cat\.png/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /remove voice\.mp3/i })).not.toBeInTheDocument();
        });
    });

    it('keeps overflow menu actions interactive for small-screen top bar behavior', async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'Overflow response', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);
        renderAIChat();

        await user.click(await screen.findByLabelText('More actions'));
        const initialMenu = await screen.findByRole('menu', { name: /more chat actions/i });
        expect(within(initialMenu).getByRole('menuitem', { name: /^fullscreen$/i })).toBeInTheDocument();
        expect(within(initialMenu).getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
        expect(within(initialMenu).getByRole('menuitem', { name: /export json/i })).toBeDisabled();
        expect(within(initialMenu).getByRole('menuitem', { name: /export txt/i })).toBeDisabled();
        expect(within(initialMenu).getByRole('menuitem', { name: /copy all/i })).toBeDisabled();

        const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
        await user.type(composer, 'Overflow transcript sample{enter}');
        expect(await screen.findByText('Overflow response')).toBeInTheDocument();

        await user.click(screen.getByLabelText('More actions'));
        const menuWithTranscript = await screen.findByRole('menu', { name: /more chat actions/i });
        const copyTranscriptItem = within(menuWithTranscript).getByRole('menuitem', { name: /copy all/i });
        expect(copyTranscriptItem).toBeEnabled();
        await user.click(copyTranscriptItem);

        await waitFor(() => {
            expect(screen.getByText('Transcript copied to clipboard.')).toBeInTheDocument();
            expect(screen.queryByRole('menu', { name: /more chat actions/i })).not.toBeInTheDocument();
        });
    });

    it('reflects open and closed visual state on the sessions toggle button', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        const sessionsToggle = await screen.findByTitle('Show sessions');
        expect(sessionsToggle).toHaveAttribute('aria-expanded', 'false');
        expect(sessionsToggle.className).not.toContain('text-indigo-400');

        await user.click(sessionsToggle);
        const openToggle = screen.getByTitle('Hide sessions');
        expect(openToggle).toHaveAttribute('aria-expanded', 'true');
        expect(openToggle.className).toContain('text-indigo-400');
        expect(await screen.findByText('Recent Sessions')).toBeInTheDocument();

        await user.click(openToggle);
        const closedToggle = screen.getByTitle('Show sessions');
        expect(closedToggle).toHaveAttribute('aria-expanded', 'false');
        expect(closedToggle.className).not.toContain('text-indigo-400');
    });

    it('applies active session card state to the selected session', async () => {
        const user = userEvent.setup();
        const now = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify([
            {
                id: 'session-alpha',
                title: 'Alpha Session',
                source: 'generate',
                projectId: '',
                modelId: 'pollinations-openai',
                systemPrompt: 'system',
                temperature: 0.7,
                maxTokens: 16384,
                useSearch: false,
                useReasoning: false,
                messages: [],
                createdAt: now - 10,
                updatedAt: now - 10
            },
            {
                id: 'session-beta',
                title: 'Beta Session',
                source: 'generate',
                projectId: '',
                modelId: 'pollinations-openai',
                systemPrompt: 'system',
                temperature: 0.7,
                maxTokens: 16384,
                useSearch: false,
                useReasoning: false,
                messages: [],
                createdAt: now,
                updatedAt: now
            }
        ]));
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        await user.click(await screen.findByTitle('Show sessions'));

        const betaButton = await screen.findByRole('button', { name: /beta session/i });
        const alphaButton = screen.getByRole('button', { name: /alpha session/i });
        const betaCard = betaButton.parentElement;
        const alphaCard = alphaButton.parentElement;

        expect(betaButton).toHaveAttribute('aria-current', 'true');
        expect(betaCard?.className).toContain('border-indigo-500/30');
        expect(alphaButton).not.toHaveAttribute('aria-current', 'true');
        expect(alphaCard?.className).toContain('border-slate-800');

        await user.click(alphaButton);
        expect(alphaButton).toHaveAttribute('aria-current', 'true');
        expect(alphaCard?.className).toContain('border-indigo-500/30');
        expect(betaButton).not.toHaveAttribute('aria-current', 'true');
        expect(betaCard?.className).toContain('border-slate-800');
    });

    it('updates the active chat title from the runtime title section', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        const titleInput = await screen.findByRole('textbox', { name: /current chat title/i });
        await user.clear(titleInput);
        await user.type(titleInput, 'Release Notes Thread');
        await user.click(screen.getByRole('button', { name: /save title/i }));

        expect(await screen.findByDisplayValue('Release Notes Thread')).toBeInTheDocument();
        expect(screen.getByText('Session title updated.')).toBeInTheDocument();

        await user.click(screen.getByTitle('Show sessions'));
        expect(await screen.findByRole('button', { name: /release notes thread/i })).toBeInTheDocument();
    });

    it('keeps delete control accessible and routed through confirmation dialog', async () => {
        const user = userEvent.setup();
        vi.stubGlobal('fetch', vi.fn());
        renderAIChat();

        await user.click(await screen.findByTitle('Show sessions'));
        const deleteButton = (await screen.findAllByRole('button', { name: /^delete session$/i }))[0];
        expect(deleteButton).toHaveAttribute('title', 'Delete session');

        await user.click(deleteButton);
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('heading', { name: 'Delete Session' })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /^delete session$/i })).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    });

    it('disables read-aloud button when browser speech synthesis is unavailable', async () => {
        const user = userEvent.setup();
        const originalUtterance = (globalThis as any).SpeechSynthesisUtterance;
        const originalSpeechSynthesis = (window as any).speechSynthesis;
        (globalThis as any).SpeechSynthesisUtterance = undefined;
        (window as any).speechSynthesis = undefined;
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'Assistant response for unsupported speech.', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Prompt for unsupported speech test{enter}');
            expect(await screen.findByText('Assistant response for unsupported speech.')).toBeInTheDocument();

            const readAloudButton = await screen.findByRole('button', { name: /read aloud unavailable in this browser/i });
            expect(readAloudButton).toBeDisabled();
            expect(readAloudButton).toHaveAttribute('title', 'Read aloud unavailable in this browser');
        } finally {
            (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
            (window as any).speechSynthesis = originalSpeechSynthesis;
        }
    });

    it('allows selecting read-aloud voice in settings and uses it for playback', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock([
            makeVoice('System Voice', 'system-voice', 'en-US', true),
            makeVoice('Calm Voice', 'calm-voice', 'en-US')
        ]);
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'Voice selection response', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();

            await user.click(await screen.findByLabelText('More actions'));
            const moreMenu = await screen.findByRole('menu', { name: /more chat actions/i });
            await user.click(within(moreMenu).getByRole('menuitem', { name: /^settings$/i }));

            const voiceSelects = await screen.findAllByRole('combobox', { name: /read aloud voice/i, hidden: true });
            expect(voiceSelects.length).toBeGreaterThan(0);
            await user.selectOptions(voiceSelects[0], 'calm-voice');

            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Use custom read aloud voice{enter}');
            expect(await screen.findByText('Voice selection response')).toBeInTheDocument();

            const card = screen.getByText('Voice selection response').closest('.chat-motion-message') as HTMLElement;
            await user.click(within(card).getByRole('button', { name: /read response aloud/i }));

            const utterance = ttsMock.getLastUtterance();
            expect(utterance?.voice?.voiceURI).toBe('calm-voice');

            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            expect(Array.isArray(stored)).toBe(true);
            expect(stored[0]?.readAloudVoiceURI).toBe('calm-voice');
            expect(stored[0]?.readAloudVoiceName).toBe('Calm Voice');
        } finally {
            ttsMock.restore();
        }
    });

    it('falls back to system default selection when saved read-aloud voice is no longer available', async () => {
        const user = userEvent.setup();
        const now = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify([
            {
                id: 'session-voice-fallback',
                title: 'Voice Fallback Session',
                source: 'generate',
                projectId: '',
                modelId: 'pollinations-openai',
                systemPrompt: 'system',
                temperature: 0.7,
                maxTokens: 16384,
                useSearch: false,
                useReasoning: false,
                useLinks: true,
                useMemory: true,
                showSources: true,
                readAloudVoiceURI: 'missing-voice',
                readAloudVoiceName: 'Missing Voice',
                messages: [],
                createdAt: now,
                updatedAt: now
            }
        ]));
        const ttsMock = installSpeechSynthesisMock([
            makeVoice('Available Voice', 'available-voice', 'en-US', true)
        ]);
        vi.stubGlobal('fetch', vi.fn());

        try {
            renderAIChat();

            await user.click(await screen.findByLabelText('More actions'));
            const moreMenu = await screen.findByRole('menu', { name: /more chat actions/i });
            await user.click(within(moreMenu).getByRole('menuitem', { name: /^settings$/i }));

            const voiceSelects = await screen.findAllByRole('combobox', { name: /read aloud voice/i, hidden: true });
            expect(voiceSelects.length).toBeGreaterThan(0);
            expect((voiceSelects[0] as HTMLSelectElement).value).toBe('');
        } finally {
            ttsMock.restore();
        }
    });

    it('keeps read-aloud single-message playback active on only one assistant message at a time', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ content: 'Assistant response one', diagnostics: {} }))
            .mockResolvedValueOnce(makeJsonResponse({ content: 'Assistant response two', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();

            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'First prompt{enter}');
            expect(await screen.findByText('Assistant response one')).toBeInTheDocument();

            await user.type(composer, 'Second prompt{enter}');
            expect(await screen.findByText('Assistant response two')).toBeInTheDocument();

            const firstCard = screen.getByText('Assistant response one').closest('.chat-motion-message') as HTMLElement;
            const secondCard = screen.getByText('Assistant response two').closest('.chat-motion-message') as HTMLElement;

            const speakBeforeFirst = ttsMock.synth.speak.mock.calls.length;
            const cancelBeforeFirst = ttsMock.synth.cancel.mock.calls.length;
            await user.click(within(firstCard).getByRole('button', { name: /read response aloud/i }));
            expect(ttsMock.synth.speak.mock.calls.length).toBe(speakBeforeFirst + 1);
            expect(ttsMock.synth.cancel.mock.calls.length).toBeGreaterThan(cancelBeforeFirst);
            expect(within(firstCard).getByRole('button', { name: /pause reading/i })).toBeInTheDocument();

            const speakBeforeSecond = ttsMock.synth.speak.mock.calls.length;
            const cancelBeforeSecond = ttsMock.synth.cancel.mock.calls.length;
            await user.click(within(secondCard).getByRole('button', { name: /read response aloud/i }));
            expect(ttsMock.synth.speak.mock.calls.length).toBe(speakBeforeSecond + 1);
            expect(ttsMock.synth.cancel.mock.calls.length).toBeGreaterThan(cancelBeforeSecond);
            expect(within(firstCard).getByRole('button', { name: /read response aloud/i })).toBeInTheDocument();
            expect(within(secondCard).getByRole('button', { name: /pause reading/i })).toBeInTheDocument();
        } finally {
            ttsMock.restore();
        }
    });

    it('supports keyboard read-aloud controls with aria-pressed state and live status updates', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'Keyboard accessibility response.', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Keyboard accessibility prompt{enter}');
            expect(await screen.findByText('Keyboard accessibility response.')).toBeInTheDocument();

            const card = screen.getByText('Keyboard accessibility response.').closest('.chat-motion-message') as HTMLElement;
            const idleButton = within(card).getByRole('button', { name: /read response aloud/i });
            expect(idleButton).toHaveAttribute('aria-pressed', 'false');
            expect(idleButton).toHaveAttribute('data-read-aloud-state', 'idle');
            idleButton.focus();
            await user.keyboard('{Enter}');
            expect(ttsMock.synth.speak.mock.calls.length).toBeGreaterThan(0);

            const playingButton = within(card).getByRole('button', { name: /pause reading/i });
            expect(playingButton).toHaveAttribute('aria-pressed', 'true');
            expect(playingButton).toHaveAttribute('data-read-aloud-state', 'playing');
            expect(screen.getByRole('status')).toHaveTextContent(/read aloud started/i);

            playingButton.focus();
            await user.keyboard('{Enter}');
            expect(ttsMock.synth.pause.mock.calls.length).toBeGreaterThan(0);
            const pausedButton = within(card).getByRole('button', { name: /resume reading/i });
            expect(pausedButton).toHaveAttribute('aria-pressed', 'true');
            expect(pausedButton).toHaveAttribute('data-read-aloud-state', 'paused');
            expect(screen.getByRole('status')).toHaveTextContent(/read aloud paused/i);

            pausedButton.focus();
            await user.keyboard('{Enter}');
            expect(ttsMock.synth.resume.mock.calls.length).toBeGreaterThan(0);
            expect(within(card).getByRole('button', { name: /pause reading/i })).toHaveAttribute('data-read-aloud-state', 'playing');
            expect(screen.getByRole('status')).toHaveTextContent(/read aloud resumed/i);
        } finally {
            ttsMock.restore();
        }
    });

    it('stops read-aloud playback before retry regeneration starts', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ content: 'Initial assistant response', diagnostics: {} }))
            .mockResolvedValueOnce(makeJsonResponse({ content: 'Regenerated assistant response', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Retry cleanup prompt{enter}');
            expect(await screen.findByText('Initial assistant response')).toBeInTheDocument();

            const firstCard = screen.getByText('Initial assistant response').closest('.chat-motion-message') as HTMLElement;
            await user.click(within(firstCard).getByRole('button', { name: /read response aloud/i }));
            const cancelBeforeRetry = ttsMock.synth.cancel.mock.calls.length;

            await user.click(within(firstCard).getByRole('button', { name: /regenerate response/i }));
            expect(ttsMock.synth.cancel.mock.calls.length).toBeGreaterThan(cancelBeforeRetry);
            expect(await screen.findByText('Regenerated assistant response')).toBeInTheDocument();
        } finally {
            ttsMock.restore();
        }
    });

    it('stops read-aloud playback before sending a new prompt', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeJsonResponse({ content: 'First send response', diagnostics: {} }))
            .mockResolvedValueOnce(makeJsonResponse({ content: 'Second send response', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'First send prompt{enter}');
            expect(await screen.findByText('First send response')).toBeInTheDocument();

            const firstCard = screen.getByText('First send response').closest('.chat-motion-message') as HTMLElement;
            await user.click(within(firstCard).getByRole('button', { name: /read response aloud/i }));
            const cancelBeforeSend = ttsMock.synth.cancel.mock.calls.length;

            await user.type(composer, 'Second send prompt{enter}');
            expect(ttsMock.synth.cancel.mock.calls.length).toBeGreaterThan(cancelBeforeSend);
            expect(await screen.findByText('Second send response')).toBeInTheDocument();
        } finally {
            ttsMock.restore();
        }
    });

    it('stops read-aloud playback when switching chat sessions', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'Session switch response', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Session switch prompt{enter}');
            expect(await screen.findByText('Session switch response')).toBeInTheDocument();

            const card = screen.getByText('Session switch response').closest('.chat-motion-message') as HTMLElement;
            await user.click(within(card).getByRole('button', { name: /read response aloud/i }));
            const cancelBeforeSwitch = ttsMock.synth.cancel.mock.calls.length;

            await user.click(screen.getByTitle('Show sessions'));
            await user.click((await screen.findAllByRole('button', { name: /^new session$/i }))[0]);
            await user.click(await screen.findByRole('button', { name: /create session/i }));

            expect(ttsMock.synth.cancel.mock.calls.length).toBeGreaterThan(cancelBeforeSwitch);
        } finally {
            ttsMock.restore();
        }
    });

    it('reads reasoning summary only after the summary panel is expanded', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({
            content: 'Final Answer: Main answer only.\n\nReasoning Summary: Extra hidden reasoning detail.',
            diagnostics: {}
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChat();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Reasoning summary read test{enter}');
            expect(await screen.findByText('Main answer only.')).toBeInTheDocument();

            const card = screen.getByText('Main answer only.').closest('.chat-motion-message') as HTMLElement;
            await user.click(within(card).getByRole('button', { name: /read response aloud/i }));
            const firstUtterance = ttsMock.getLastUtterance();
            const firstText = String(firstUtterance?.text || '');
            expect(firstText).toContain('Main answer only.');
            expect(firstText).not.toContain('Extra hidden reasoning detail.');

            firstUtterance?.onend?.();
            await user.click(within(card).getByText(/reasoning summary/i));

            await user.click(within(card).getByRole('button', { name: /read response aloud/i }));
            const secondUtterance = ttsMock.getLastUtterance();
            const secondText = String(secondUtterance?.text || '');
            expect(secondText).toContain('Main answer only.');
            expect(secondText).toContain('Extra hidden reasoning detail.');
        } finally {
            ttsMock.restore();
        }
    });

    it('stops read-aloud playback when navigating away from chat', async () => {
        const user = userEvent.setup();
        const ttsMock = installSpeechSynthesisMock();
        const fetchMock = vi.fn().mockResolvedValueOnce(makeJsonResponse({ content: 'Navigation cleanup response', diagnostics: {} }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            renderAIChatWithGenerateRoute();
            const composer = await screen.findByPlaceholderText('Ask for follow-up changes');
            await user.type(composer, 'Navigate away cleanup prompt{enter}');
            expect(await screen.findByText('Navigation cleanup response')).toBeInTheDocument();

            const card = screen.getByText('Navigation cleanup response').closest('.chat-motion-message') as HTMLElement;
            await user.click(within(card).getByRole('button', { name: /read response aloud/i }));
            const cancelBeforeNav = ttsMock.synth.cancel.mock.calls.length;

            await user.click(screen.getByRole('button', { name: /generate content/i }));
            expect(await screen.findByText('Generate Page')).toBeInTheDocument();
            expect(ttsMock.synth.cancel.mock.calls.length).toBeGreaterThan(cancelBeforeNav);
        } finally {
            ttsMock.restore();
        }
    });
});
