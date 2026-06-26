import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicDashboard from './PublicDashboard';
import { api } from '../services/api';

vi.mock('../services/projectTypes', () => ({
    getProjectTypes: vi.fn().mockResolvedValue([])
}));

vi.mock('../services/api', () => ({
    api: {
        auth: {
            getUser: vi.fn(() => ({ id: 'user-1', role: 'user' }))
        },
        projects: {
            list: vi.fn(),
            getArchive: vi.fn(),
            getAssetIngestion: vi.fn()
        },
        items: {
            listAll: vi.fn()
        },
        collections: {
            list: vi.fn()
        },
        settings: {
            get: vi.fn()
        },
        chatItems: {
            listAll: vi.fn(),
            listByProject: vi.fn()
        }
    }
}));

const mockedProjectsList = vi.mocked(api.projects.list);
const mockedItemsListAll = vi.mocked(api.items.listAll);
const mockedGetArchive = vi.mocked(api.projects.getArchive);
const mockedGetAssetIngestion = vi.mocked(api.projects.getAssetIngestion);
const mockedCollectionsList = vi.mocked(api.collections.list);
const mockedSettingsGet = vi.mocked(api.settings.get);
const mockedChatItemsListAll = vi.mocked(api.chatItems.listAll);

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>;
};

describe('PublicDashboard AI Chat shortcut', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedProjectsList.mockResolvedValue([
            {
                id: 'project-1',
                name: 'Neon Project',
                description: 'Night portrait ideas',
                storageType: 'Local Drive',
                projectType: 'image',
                color: '#22d3ee',
                isArchived: false,
                isPinned: false,
                isSystem: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                ownerId: 'user-1'
            } as any
        ]);
        mockedItemsListAll.mockResolvedValue([]);
        mockedGetArchive.mockResolvedValue(null);
        mockedGetAssetIngestion.mockResolvedValue(null);
        mockedCollectionsList.mockResolvedValue([]);
        mockedSettingsGet.mockResolvedValue({ dashboardResultLimit: 24 } as any);
        mockedChatItemsListAll.mockResolvedValue([]);
    });

    it('opens the normal AI Chat route from dashboard search controls', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Routes>
                    <Route path="/" element={<><PublicDashboard /><LocationProbe /></>} />
                    <Route path="/chat" element={<><div>Normal AI Chat</div><LocationProbe /></>} />
                </Routes>
            </MemoryRouter>
        );

        const searchInput = await screen.findByPlaceholderText('Search anything...');
        await user.type(searchInput, 'neon');

        await user.click(await screen.findByRole('button', { name: /^ai chat$/i }));
        expect(screen.getByText('Normal AI Chat')).toBeInTheDocument();
        expect(screen.getByTestId('location-probe')).toHaveTextContent('/chat?from=dashboard');
    });
});
