import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bot, Search, Sparkles } from 'lucide-react';
import { DashboardToolbar } from '../components/dashboard/DashboardToolbar';
import { DashboardSearchResults } from '../components/dashboard/DashboardSearchResults';
import { SearchInput } from '../components/dashboard/Toolbar/SearchInput';
import PromptAssistantPanel from '../components/prompt-assistant/PromptAssistantPanel';
import {
    createDefaultDashboardSearchFilters,
    DashboardSearchSort,
    useDashboardSearch
} from '../hooks/useDashboardSearch';
import { api } from '../services/api';
import { Project } from '../types';

const SearchResults: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<DashboardSearchSort>('relevance');
    const [filters, setFilters] = useState(createDefaultDashboardSearchFilters);
    const [activeTab, setActiveTab] = useState<'search' | 'ai-chat'>('search');

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        setQuery(params.get('q') || '');
        setActiveTab(params.get('tab') === 'ai-chat' ? 'ai-chat' : 'search');
    }, [location.search]);

    const buildSearchPath = useCallback((nextQuery: string, nextTab: 'search' | 'ai-chat' = activeTab) => {
        const cleanQuery = nextQuery.trim();
        const params = new URLSearchParams();
        if (cleanQuery) params.set('q', cleanQuery);
        if (nextTab === 'ai-chat') params.set('tab', 'ai-chat');
        const nextSearch = params.toString();
        return nextSearch ? `/search?${nextSearch}` : '/search';
    }, [activeTab]);

    useEffect(() => {
        let cancelled = false;
        const loadProjects = async () => {
            setIsLoadingProjects(true);
            try {
                const data = await api.projects.list();
                if (!cancelled) setProjects(data.filter((project) => !project.isArchived));
            } catch {
                if (!cancelled) setProjects([]);
            } finally {
                if (!cancelled) setIsLoadingProjects(false);
            }
        };

        void loadProjects();
        return () => { cancelled = true; };
    }, []);

    const search = useDashboardSearch(projects, query, filters, sort);

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        navigate(buildSearchPath(value), { replace: true });
    }, [buildSearchPath, navigate]);

    const handleTabChange = useCallback((nextTab: 'search' | 'ai-chat') => {
        setActiveTab(nextTab);
        navigate(buildSearchPath(query, nextTab), { replace: true });
    }, [buildSearchPath, navigate, query]);

    return (
        <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1480px] space-y-6 pb-24 animate-in fade-in duration-500">
            <section className="space-y-5 rounded-lg border border-slate-800/80 bg-[#050c1a]/70 p-5 shadow-[0_28px_90px_rgba(2,6,23,0.32)]">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
                        <Search size={18} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-white">Global Search</h1>
                        <p className="text-xs font-medium text-slate-400">
                            Search projects, generated assets, uploads, chat captures, and prompt drafts.
                        </p>
                    </div>
                </div>
                <SearchInput value={query} onChange={handleQueryChange} />
            </section>

            <DashboardToolbar
                searchTerm={query}
                onSearchChange={handleQueryChange}
                sortType="updated"
                onSortChange={() => {}}
                viewType="grid"
                onViewChange={() => {}}
                searchFilters={filters}
                onSearchFiltersChange={setFilters}
                searchFilterCount={search.filterCount}
                resultCount={search.results.length}
                availableTags={search.availableTags}
                showSearch={false}
                showProjectControls={false}
            />

            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-[#07101f]/80 p-2">
                <button
                    type="button"
                    onClick={() => handleTabChange('search')}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                        activeTab === 'search'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    }`}
                >
                    <Search size={14} />
                    Search
                </button>
                <button
                    type="button"
                    onClick={() => handleTabChange('ai-chat')}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                        activeTab === 'ai-chat'
                            ? 'bg-cyan-600 text-white'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    }`}
                >
                    <Bot size={14} />
                    AiMa Chat
                    {query.trim() && <Sparkles size={12} className="text-cyan-200" />}
                </button>
            </div>

            {activeTab === 'search' ? (
                <DashboardSearchResults
                    query={query}
                    results={search.results}
                    totalIndexed={search.totalIndexed}
                    isLoading={isLoadingProjects || search.isLoading}
                    error={search.error}
                    sort={sort}
                    onSortChange={setSort}
                />
            ) : (
                <PromptAssistantPanel
                    initialQuery={query}
                    contextLabel="Global search AiMa Chat"
                    sessionKey="top-nav-global-search"
                    topK={5}
                />
            )}
        </div>
    );
};

export default SearchResults;
