import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIChat from './AIChat';

let mockActiveSession: any = null;
let mockSessions: any[] = [];
let mockIsCapturing = false;
const mockUpdateActiveSession = vi.fn();
const mockCaptureToProject = vi.fn();
const mockProjectsList = vi.fn();

vi.mock('../services/api', () => ({
    api: {
        projects: {
            list: (...args: any[]) => mockProjectsList(...args)
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

vi.mock('../hooks/useChatSessions', () => ({
    useChatSessions: () => ({
        sessions: mockSessions,
        activeSessionId: mockActiveSession?.id || '',
        activeSession: mockActiveSession,
        setActiveSessionId: vi.fn(),
        updateSessionById: vi.fn(),
        updateActiveSession: mockUpdateActiveSession,
        createSessionAndSwitch: vi.fn(),
        deleteSession: vi.fn()
    })
}));

vi.mock('../hooks/useChatRuntime', () => ({
    useChatRuntime: () => ({
        isSending: false,
        errorMsg: null,
        setErrorMsg: vi.fn(),
        requestAssistantResponse: vi.fn(),
        sendPrompt: vi.fn(),
        retryPrompt: vi.fn(),
        stop: vi.fn()
    })
}));

vi.mock('../hooks/useChatItemCapture', () => ({
    useChatItemCapture: () => ({
        isCapturing: mockIsCapturing,
        error: null,
        clearError: vi.fn(),
        captureToProject: mockCaptureToProject
    })
}));

vi.mock('../components/project/lab/ModelSelector/registry/index', () => ({
    loadDynamicRegistry: vi.fn().mockResolvedValue([
        {
            id: 'pollinations-gemini-fast',
            label: 'Gemini Fast',
            category: 'Language',
            provider: 'pollinations',
            textInputModalities: ['text']
        }
    ])
}));

const renderChat = (path: string) => {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <AIChat />
        </MemoryRouter>
    );
};

describe('AI Chat capture UI', () => {
    beforeEach(() => {
        mockCaptureToProject.mockReset();
        mockProjectsList.mockReset();
        mockUpdateActiveSession.mockReset();
        mockIsCapturing = false;
    });

    it('disables Save when there are no messages', async () => {
        mockActiveSession = {
            id: 'session-1',
            title: 'New Chat',
            source: 'project',
            projectId: 'project-1',
            modelId: '',
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 16384,
            useSearch: false,
            useReasoning: false,
            messages: []
        };
        mockSessions = [mockActiveSession];

        renderChat('/chat?from=project&projectId=project-1');

        const user = userEvent.setup();
        await user.click(await screen.findByLabelText('More actions'));
        const menu = await screen.findByRole('menu', { name: /more chat actions/i });
        const saveButton = within(menu).getByRole('menuitem', { name: /^move$/i });
        expect(saveButton).toBeDisabled();
    });

    it('captures directly when projectId is present', async () => {
        mockActiveSession = {
            id: 'session-2',
            title: 'Chat Session',
            source: 'project',
            projectId: 'project-1',
            modelId: 'pollinations-gemini-fast',
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 16384,
            useSearch: false,
            useReasoning: false,
            messages: [
                { id: 'm1', role: 'user', content: 'Hi', status: 'done' }
            ]
        };
        mockSessions = [mockActiveSession];
        mockCaptureToProject.mockResolvedValue({ id: 'chat-1' });

        renderChat('/chat?from=project&projectId=project-1');

        const user = userEvent.setup();
        await user.click(await screen.findByLabelText('More actions'));
        const menu = await screen.findByRole('menu', { name: /more chat actions/i });
        await user.click(within(menu).getByRole('menuitem', { name: /^move$/i }));

        await waitFor(() => {
            expect(mockCaptureToProject).toHaveBeenCalledWith({
                projectId: 'project-1',
                session: mockActiveSession
            });
        });
        expect(mockUpdateActiveSession).toHaveBeenCalled();
    });

    it('opens project picker when no projectId is present', async () => {
        mockActiveSession = {
            id: 'session-3',
            title: 'Chat Session',
            source: 'generate',
            projectId: '',
            modelId: 'pollinations-gemini-fast',
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 16384,
            useSearch: false,
            useReasoning: false,
            messages: [
                { id: 'm1', role: 'user', content: 'Hi', status: 'done' }
            ]
        };
        mockSessions = [mockActiveSession];
        mockProjectsList.mockResolvedValue([
            { id: 'project-9', name: 'Alpha', color: '#fff' }
        ]);

        renderChat('/chat?from=generate');

        const user = userEvent.setup();
        await user.click(await screen.findByLabelText('More actions'));
        const menu = await screen.findByRole('menu', { name: /more chat actions/i });
        await user.click(within(menu).getByRole('menuitem', { name: /^move$/i }));

        await screen.findByText(/move chat capture/i);
        expect(mockProjectsList).toHaveBeenCalled();
    });
});
