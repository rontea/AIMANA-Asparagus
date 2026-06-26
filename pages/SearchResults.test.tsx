import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchResults from './SearchResults';
import { api } from '../services/api';
import { useDashboardSearch } from '../hooks/useDashboardSearch';

vi.mock('../services/api', () => ({
    api: {
        auth: {
            getUser: vi.fn(() => ({ id: 'user-1', role: 'user' }))
        },
        projects: {
            list: vi.fn()
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

vi.mock('../hooks/useDashboardSearch', async () => {
    const actual = await vi.importActual<typeof import('../hooks/useDashboardSearch')>('../hooks/useDashboardSearch');
    return {
        ...actual,
        useDashboardSearch: vi.fn()
    };
});

const mockedUseDashboardSearch = vi.mocked(useDashboardSearch);
const mockedProjectsList = vi.mocked(api.projects.list);

const renderSearch = (entry = '/search?q=neon') => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes>
            <Route path="/search" element={<SearchResults />} />
        </Routes>
    </MemoryRouter>
);

describe('SearchResults AiMa Chat tab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (!HTMLElement.prototype.scrollIntoView) {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                value: () => {}
            });
        }
        mockedProjectsList.mockResolvedValue([]);
        mockedUseDashboardSearch.mockReturnValue({
            results: [],
            totalIndexed: 0,
            isLoading: false,
            error: null,
            filterCount: 0,
            availableTags: []
        });
    });

    it('preserves search query when switching between Search and AiMa Chat tabs', async () => {
        const user = userEvent.setup();
        renderSearch();

        const searchInput = await screen.findByPlaceholderText('Search anything...');
        expect(searchInput).toHaveValue('neon');

        await user.click(screen.getByRole('button', { name: /aima chat/i }));
        expect(screen.getByPlaceholderText(/Ask for ideas/i)).toHaveValue('neon');

        await user.clear(searchInput);
        await user.type(searchInput, 'neon rain');
        await waitFor(() => expect(screen.getByPlaceholderText(/Ask for ideas/i)).toHaveValue('neon rain'));

        await user.click(screen.getByRole('button', { name: /^search$/i }));
        expect(screen.getAllByText((_content, node) => (
            Boolean(node?.textContent?.includes('Showing 0 results for "neon rain"'))
        )).length).toBeGreaterThan(0);

        await user.click(screen.getByRole('button', { name: /aima chat/i }));
        expect(screen.getByPlaceholderText(/Ask for ideas/i)).toHaveValue('neon rain');
    });

    it('opens directly to AiMa Chat from the search tab URL parameter', async () => {
        renderSearch('/search?q=neon&tab=ai-chat');

        expect(await screen.findByPlaceholderText(/Ask for ideas/i)).toHaveValue('neon');
        expect(screen.getByRole('button', { name: /^aima chat$/i })).toHaveClass('bg-cyan-600');
    });
});
