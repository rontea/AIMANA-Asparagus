import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { Project, ProjectStorageType } from '../types';
import { ConfirmConfig } from './useModalDialogs';

export type SortType = 'updated' | 'name-asc' | 'name-desc' | 'created' | 'created-old';

interface UseDashboardOptions {
    confirm?: (config: ConfirmConfig) => Promise<boolean>;
}

export const useDashboard = (options: UseDashboardOptions = {}) => {
    const normalizeDashboardLimit = (value: unknown) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return 24;
        return Math.max(1, Math.min(200, Math.round(parsed)));
    };
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<ProjectStorageType | 'all'>('all');
    const [sortType, setSortType] = useState<SortType>(() => (localStorage.getItem('aimana_dashboard_sort') as SortType) || 'updated');
    const [viewType, setViewType] = useState<'grid' | 'list'>(() => (localStorage.getItem('aimana_dashboard_view') as 'grid' | 'list') || 'grid');
    const [dashboardResultLimit, setDashboardResultLimit] = useState(24);
    const [visibleProjectCount, setVisibleProjectCount] = useState(24);
    
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const [data, settings] = await Promise.all([
                api.projects.list(),
                api.settings.get().catch(() => null)
            ]);
            setProjects(data);
            const nextLimit = normalizeDashboardLimit(settings?.dashboardResultLimit);
            setDashboardResultLimit(nextLimit);
            setVisibleProjectCount(nextLimit);
        } catch (err) {
            showToast("Unable to load projects.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadProjects(); }, [loadProjects]);
    useEffect(() => { localStorage.setItem('aimana_dashboard_view', viewType); }, [viewType]);
    useEffect(() => { localStorage.setItem('aimana_dashboard_sort', sortType); }, [sortType]);

    useEffect(() => {
        let isCancelled = false;

        const loadDashboardSettings = async () => {
            try {
                const settings = await api.settings.get();
                if (!isCancelled) {
                    const nextLimit = normalizeDashboardLimit(settings.dashboardResultLimit);
                    setDashboardResultLimit(nextLimit);
                    setVisibleProjectCount((count) => Math.max(count, nextLimit));
                }
            } catch {
                if (!isCancelled) {
                    setDashboardResultLimit(24);
                    setVisibleProjectCount((count) => Math.max(count, 24));
                }
            }
        };

        const handleSettingsUpdated = () => {
            void loadDashboardSettings();
        };

        void loadDashboardSettings();
        window.addEventListener('settings-updated', handleSettingsUpdated);

        return () => {
            isCancelled = true;
            window.removeEventListener('settings-updated', handleSettingsUpdated);
        };
    }, []);

    const handleTogglePin = async (project: Project) => {
        try {
            const updated = { ...project, isPinned: !project.isPinned };
            await api.projects.update(project.id, updated);
            setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
            showToast(updated.isPinned ? "Project pinned" : "Project unpinned");
            window.dispatchEvent(new CustomEvent('project-pinned-updated'));
        } catch (err: any) {
            showToast(err.message || "Failed to toggle pin", "error");
        }
    };

    const handleArchive = async (project: Project) => {
        const confirm = options.confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
        const ok = await confirm({
            title: 'Move Project To Recycle Bin',
            description: `Delete project "${project.name}"? It will be moved to the recycle bin.`,
            confirmLabel: 'Delete Project',
            tone: 'danger'
        });
        if (!ok) return;
        try {
            await api.projects.archive(project.id);
            setProjects(prev => prev.filter(p => p.id !== project.id));
            showToast("Project moved to deleted items");
            window.dispatchEvent(new CustomEvent('project-pinned-updated'));
        } catch (err: any) {
            showToast(err.message || "Failed to delete project", "error");
        }
    };

    const handleBulkAction = async () => {
        if (selectedIds.size === 0) return;
        const confirm = options.confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
        const ok = await confirm({
            title: 'Move Projects To Recycle Bin',
            description: `Move ${selectedIds.size} selected project${selectedIds.size > 1 ? 's' : ''} to Neural Recycle Bin?`,
            confirmLabel: 'Move To Recycle Bin',
            tone: 'danger'
        });
        if (!ok) return;
        
        setIsBulkProcessing(true);
        try {
            // Explicitly cast Array.from to string[] to ensure type safety for bulk operations
            const ids = Array.from(selectedIds) as string[];
            for (const id of ids) {
                await api.projects.archive(id);
            }
            setProjects(prev => prev.filter(p => !selectedIds.has(p.id)));
            setSelectedIds(new Set());
            setIsSelectMode(false);
            showToast(`${ids.length} project${ids.length === 1 ? '' : 's'} moved to recycle bin.`);
            window.dispatchEvent(new CustomEvent('project-pinned-updated'));
        } catch (e) {
            showToast(`Bulk recycle move failed.`, 'error');
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const dashboardProjects = useMemo(
        () => projects.filter(p => p.projectType !== 'prompt'),
        [projects]
    );

    const filteredAndSorted = useMemo(() => {
        const filtered = dashboardProjects.filter(p => {
            const isPromptManagerProject = p.projectType === 'prompt';
            const normalizedSearch = searchTerm.toLowerCase();
            const matchesSearch = !normalizedSearch
                || p.name.toLowerCase().includes(normalizedSearch)
                || (p.description || '').toLowerCase().includes(normalizedSearch);
            const matchesFilter = filterType === 'all' || p.storageType === filterType;
            return !isPromptManagerProject && matchesSearch && matchesFilter;
        });

        const sorted = filtered.sort((a, b) => {
            switch (sortType) {
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                case 'created': return b.createdAt - a.createdAt;
                case 'created-old': return a.createdAt - b.createdAt;
                default: return b.updatedAt - a.updatedAt;
            }
        });

        return sorted;
    }, [dashboardProjects, searchTerm, filterType, sortType]);

    useEffect(() => {
        setVisibleProjectCount(dashboardResultLimit);
    }, [dashboardResultLimit, filterType, searchTerm, sortType]);

    const visibleProjects = useMemo(
        () => filteredAndSorted.slice(0, visibleProjectCount),
        [filteredAndSorted, visibleProjectCount]
    );

    const hasMoreProjects = visibleProjectCount < filteredAndSorted.length;

    const loadMoreProjects = useCallback(() => {
        setVisibleProjectCount((count) => Math.min(count + dashboardResultLimit, filteredAndSorted.length));
    }, [dashboardResultLimit, filteredAndSorted.length]);

    return {
        projects: visibleProjects,
        allProjects: dashboardProjects,
        totalProjectCount: filteredAndSorted.length,
        hasMoreProjects,
        loadMoreProjects,
        isLoading,
        searchTerm,
        setSearchTerm,
        sortType,
        setSortType,
        viewType,
        setViewType,
        isSelectMode,
        setIsSelectMode: (val: boolean) => { setIsSelectMode(val); setSelectedIds(new Set()); },
        selectedIds,
        toggleSelection,
        handleTogglePin,
        handleArchive,
        handleBulkAction,
        isBulkProcessing,
        toast,
        refresh: loadProjects
    };
};
