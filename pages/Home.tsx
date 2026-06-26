import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDashboard } from '../hooks/useDashboard';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { DashboardToolbar } from '../components/dashboard/DashboardToolbar';
import { DashboardContent } from '../components/dashboard/DashboardContent';
import { DashboardSearchResults } from '../components/dashboard/DashboardSearchResults';
import { DashboardBulkBar } from '../components/dashboard/DashboardBulkBar';
import { DashboardRecentActivity } from '../components/dashboard/DashboardRecentActivity';
import { SearchInput } from '../components/dashboard/Toolbar/SearchInput';
import { DashboardGreeting } from '../components/dashboard/Hero/DashboardGreeting';
import { DashboardStatsOverview } from '../components/dashboard/Hero/DashboardStatsOverview';
import CreateProjectModal from '../components/CreateProjectModal';
import { api } from '../services/api';
import { ItemWithCurrentRevision } from '../types';
import { ArrowLeft, Box, Info } from 'lucide-react';
import { useModalDialogs } from '../hooks/useModalDialogs';
import {
    createDefaultDashboardSearchFilters,
    DashboardSearchSort,
    useDashboardSearch
} from '../hooks/useDashboardSearch';

const Home: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { confirm, confirmDialog } = useModalDialogs();
    const {
        projects, allProjects, isLoading, searchTerm, setSearchTerm, sortType, setSortType,
        viewType, setViewType, isSelectMode, setIsSelectMode, selectedIds,
        toggleSelection, handleTogglePin, handleArchive, handleBulkAction,
        isBulkProcessing, toast, refresh, totalProjectCount, hasMoreProjects, loadMoreProjects
    } = useDashboard({ confirm });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchFilters, setSearchFilters] = useState(createDefaultDashboardSearchFilters);
    const [searchSort, setSearchSort] = useState<DashboardSearchSort>('relevance');
    const [dashboardTab, setDashboardTab] = useState<'projects' | 'forge'>('projects');
    const [activeForgeFolderProjectId, setActiveForgeFolderProjectId] = useState<string | null>(null);
    const [forgeReferences, setForgeReferences] = useState<Array<{ projectId: string; projectName: string; item: ItemWithCurrentRevision }>>([]);
    const [isLoadingForgeReferences, setIsLoadingForgeReferences] = useState(false);
    const [recentActivityItems, setRecentActivityItems] = useState<ItemWithCurrentRevision[]>([]);
    const [recentActivityProjects, setRecentActivityProjects] = useState<typeof projects>([]);
    const [isLoadingRecentActivity, setIsLoadingRecentActivity] = useState(false);
    const [mergingProjectIds, setMergingProjectIds] = useState<Set<string>>(new Set());
    const [isMergingAllFolders, setIsMergingAllFolders] = useState(false);
    const [forgeActionMessage, setForgeActionMessage] = useState<string | null>(null);
    const dashboardSearch = useDashboardSearch(allProjects, searchTerm, searchFilters, searchSort);
    const isSearchActive = searchTerm.trim().length > 0 || dashboardSearch.filterCount > 0;

    useEffect(() => {
        const query = new URLSearchParams(location.search).get('q') || '';
        setSearchTerm(query);
    }, [location.search, setSearchTerm]);

    const isReferenceImageItem = (item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return false;
        if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
        if (rev.fileUrl?.includes('/Neural_Reference/')) return true;
        try {
            if (!rev.aiParameters) return false;
            const params = JSON.parse(rev.aiParameters);
            const adv = params.advanced_params || params;
            return !!(
                (adv.isReference && !adv.parentItemId) ||
                adv.referenceAsset === true ||
                adv.source === 'reference_upload' ||
                adv.source === 'reference_drop' ||
                (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
            );
        } catch {
            return false;
        }
    };

    const extractReferenceHash = (item: ItemWithCurrentRevision): string | null => {
        try {
            const raw = item.currentRevision?.aiParameters;
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const adv = parsed.advanced_params || parsed;
            const hash = adv.referenceHash || parsed.referenceHash;
            if (typeof hash === 'string' && hash.trim()) return hash.trim().toLowerCase();
        } catch {}
        return null;
    };

    const loadForgeReferences = useCallback(async () => {
        setIsLoadingForgeReferences(true);
        try {
            const allProjects = await api.projects.list();
            const perProject = await Promise.all(
                allProjects.map(async (project) => {
                    const [items, relations] = await Promise.all([
                        api.items.list(project.id, false),
                        api.items.referencedTargetRelations(project.id).catch(() => [])
                    ]);

                    const forgeTargetIds = new Set(
                        relations
                            .filter((row) => {
                                const kinds = row.relationKinds || [];
                                return kinds.includes('linked') || kinds.includes('neural');
                            })
                            .map((row) => row.itemId)
                    );

                    return items
                        .filter((item) => forgeTargetIds.has(item.id) && isReferenceImageItem(item))
                        .map((item) => ({ projectId: project.id, projectName: project.name, item }));
                })
            );

            const merged = perProject.flat();
            merged.sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0));
            setForgeReferences(merged);
        } catch {
            setForgeReferences([]);
        } finally {
            setIsLoadingForgeReferences(false);
        }
    }, []);

    useEffect(() => {
        if (!isLoading) loadForgeReferences();
    }, [isLoading, loadForgeReferences]);

    const loadRecentActivity = useCallback(async () => {
        setIsLoadingRecentActivity(true);
        try {
            const [items, allProjects] = await Promise.all([
                api.items.listAll(false),
                api.projects.list()
            ]);
            const sorted = [...items]
                .sort((a, b) => (b.currentRevision?.createdAt || b.createdAt || 0) - (a.currentRevision?.createdAt || a.createdAt || 0))
                .slice(0, 12);
            setRecentActivityItems(sorted);
            setRecentActivityProjects(allProjects);
        } catch {
            setRecentActivityItems([]);
            setRecentActivityProjects([]);
        } finally {
            setIsLoadingRecentActivity(false);
        }
    }, []);

    useEffect(() => {
        if (!isLoading) loadRecentActivity();
    }, [isLoading, loadRecentActivity]);

    const refreshDashboard = useCallback(() => {
        refresh();
        void loadRecentActivity();
        void loadForgeReferences();
    }, [loadForgeReferences, loadRecentActivity, refresh]);

    const forgeFolders = useMemo(() => {
        const grouped = new Map<string, { projectId: string; projectName: string; items: ItemWithCurrentRevision[] }>();
        forgeReferences.forEach((entry) => {
            if (!grouped.has(entry.projectId)) {
                grouped.set(entry.projectId, {
                    projectId: entry.projectId,
                    projectName: entry.projectName,
                    items: []
                });
            }
            grouped.get(entry.projectId)!.items.push(entry.item);
        });

        return Array.from(grouped.values())
            .map((folder) => {
                const sortedItems = [...folder.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                const cover = sortedItems[0]?.currentRevision?.thumbnailLink || sortedItems[0]?.currentRevision?.fileUrl || '';
                const hashCounts = new Map<string, number>();
                folder.items.forEach((item) => {
                    const hash = extractReferenceHash(item);
                    if (!hash) return;
                    hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
                });
                const duplicateGroups = Array.from(hashCounts.values()).filter((count) => count > 1).length;
                return {
                    ...folder,
                    count: folder.items.length,
                    cover,
                    duplicateGroups
                };
            })
            .sort((a, b) => b.count - a.count);
    }, [forgeReferences]);

    const activeForgeFolder = useMemo(
        () => forgeFolders.find((f) => f.projectId === activeForgeFolderProjectId) || null,
        [forgeFolders, activeForgeFolderProjectId]
    );

    const duplicateFolderCount = useMemo(
        () => forgeFolders.filter((f) => f.duplicateGroups > 0).length,
        [forgeFolders]
    );

    const duplicateGroupCount = useMemo(
        () => forgeFolders.reduce((sum, folder) => sum + folder.duplicateGroups, 0),
        [forgeFolders]
    );

    const activeForgeFolderEntries = useMemo(() => {
        if (!activeForgeFolderProjectId) return [];
        return forgeReferences
            .filter((entry) => entry.projectId === activeForgeFolderProjectId)
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0));
    }, [forgeReferences, activeForgeFolderProjectId]);

    useEffect(() => {
        if (dashboardTab !== 'forge' && activeForgeFolderProjectId) {
            setActiveForgeFolderProjectId(null);
        }
    }, [dashboardTab, activeForgeFolderProjectId]);

    const mergeForgeDuplicates = async (projectId: string) => {
        setMergingProjectIds((prev) => new Set(prev).add(projectId));
        setForgeActionMessage(null);
        try {
            const result = await api.items.mergeDuplicateReferences(projectId);
            await loadForgeReferences();
            if (result.mergedItems > 0) {
                setForgeActionMessage(`Merged ${result.mergedItems} duplicate reference image(s).`);
            } else {
                setForgeActionMessage('No duplicate references found for this folder.');
            }
        } catch {
            setForgeActionMessage('Failed to merge duplicate references.');
        } finally {
            setMergingProjectIds((prev) => {
                const next = new Set(prev);
                next.delete(projectId);
                return next;
            });
        }
    };

    const handleCheckAllForgeFolders = async () => {
        setForgeActionMessage(null);
        const folderCount = duplicateFolderCount;
        const groupCount = duplicateGroupCount;
        setForgeActionMessage(
            folderCount > 0
                ? `Detected ${groupCount} duplicate group(s) across ${folderCount} folder(s).`
                : 'No duplicate references found across forge folders.'
        );
        await loadForgeReferences();
    };

    const handleMergeAllForgeFolders = async () => {
        const targets = forgeFolders.filter((f) => f.duplicateGroups > 0);
        if (targets.length === 0) {
            setForgeActionMessage('No duplicate references found across forge folders.');
            return;
        }

        setIsMergingAllFolders(true);
        setForgeActionMessage(null);
        let mergedItemsTotal = 0;
        let failedFolders = 0;

        try {
            for (const folder of targets) {
                try {
                    const result = await api.items.mergeDuplicateReferences(folder.projectId);
                    mergedItemsTotal += result.mergedItems || 0;
                } catch {
                    failedFolders += 1;
                }
            }
            await loadForgeReferences();
            if (failedFolders > 0) {
                setForgeActionMessage(`Merged ${mergedItemsTotal} duplicate reference(s). ${failedFolders} folder(s) failed.`);
            } else {
                setForgeActionMessage(`Merged ${mergedItemsTotal} duplicate reference(s) across forge folders.`);
            }
        } finally {
            setIsMergingAllFolders(false);
        }
    };

    return (
        <div className="max-w-[1760px] mx-auto space-y-8 min-h-[calc(100vh-4rem)] pb-24 animate-in fade-in duration-500">
            <div className="space-y-5 rounded-lg border border-slate-800/80 bg-[#050c1a]/70 p-5 shadow-[0_28px_90px_rgba(2,6,23,0.32)]">
                <DashboardGreeting />
                <DashboardStatsOverview projects={allProjects} />
            </div>

            <div className="space-y-6">
                <DashboardHeader 
                    isSelectMode={isSelectMode} 
                    onToggleSelectMode={() => setIsSelectMode(!isSelectMode)} 
                    onNewProject={() => setIsModalOpen(true)} 
                />

                <div className="pt-1">
                    <SearchInput value={searchTerm} onChange={setSearchTerm} />
                </div>

                <DashboardToolbar 
                    searchTerm={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    sortType={sortType} 
                    onSortChange={setSortType} 
                    viewType={viewType} 
                    onViewChange={setViewType} 
                    searchFilters={searchFilters}
                    onSearchFiltersChange={setSearchFilters}
                    searchFilterCount={dashboardSearch.filterCount}
                    resultCount={dashboardSearch.results.length}
                    availableTags={dashboardSearch.availableTags}
                    showSearch={false}
                />

                <DashboardRecentActivity
                    items={recentActivityItems}
                    projects={recentActivityProjects.length > 0 ? recentActivityProjects : allProjects}
                    isLoading={isLoadingRecentActivity}
                    onOpenProject={(projectId) => navigate(`/project/${projectId}`)}
                    onViewLog={() => navigate('/audit-trail')}
                />

                <div className="border-b border-slate-800">
                    <div className="flex gap-6">
                        <button
                            onClick={() => setDashboardTab('projects')}
                            className={`pb-3 text-sm font-bold transition-all relative ${dashboardTab === 'projects' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Project Dashboard
                            {dashboardTab === 'projects' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />}
                        </button>
                        <button
                            onClick={() => setDashboardTab('forge')}
                            className={`pb-3 text-sm font-bold transition-all relative ${dashboardTab === 'forge' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Used In Forge
                            {dashboardTab === 'forge' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />}
                        </button>
                    </div>
                </div>

                {dashboardTab === 'projects' ? (
                    isSearchActive ? (
                        <DashboardSearchResults
                            query={searchTerm}
                            results={dashboardSearch.results}
                            totalIndexed={dashboardSearch.totalIndexed}
                            isLoading={dashboardSearch.isLoading}
                            error={dashboardSearch.error}
                            sort={searchSort}
                            onSortChange={setSearchSort}
                        />
                    ) : (
                        <DashboardContent 
                            projects={projects}
                            isLoading={isLoading}
                            viewType={viewType}
                            isSelectMode={isSelectMode}
                            selectedIds={selectedIds}
                            toggleSelection={toggleSelection}
                            handleTogglePin={handleTogglePin}
                            handleArchive={handleArchive}
                            onNewProject={() => setIsModalOpen(true)}
                            hasMoreProjects={hasMoreProjects}
                            onLoadMoreProjects={loadMoreProjects}
                            totalProjectCount={totalProjectCount}
                        />
                    )
                ) : (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Forge Folders</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {isLoadingForgeReferences ? 'Loading...' : `${forgeReferences.length} References / ${forgeFolders.length} Projects`}
                                </span>
                                <button
                                    onClick={handleCheckAllForgeFolders}
                                    disabled={isLoadingForgeReferences || isMergingAllFolders}
                                    className="px-2.5 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-60"
                                >
                                    Check All
                                </button>
                                <button
                                    onClick={handleMergeAllForgeFolders}
                                    disabled={isMergingAllFolders || duplicateGroupCount === 0}
                                    className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-60"
                                >
                                    {isMergingAllFolders ? 'Merging All...' : 'Merge All'}
                                </button>
                            </div>
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {duplicateGroupCount} Duplicate Group(s) across {duplicateFolderCount} Folder(s)
                        </div>
                        {forgeActionMessage && (
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{forgeActionMessage}</div>
                        )}
                        {activeForgeFolder ? (
                            <div className="space-y-5">
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => setActiveForgeFolderProjectId(null)}
                                        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                                    >
                                        <ArrowLeft size={14} />
                                        Back To Folders
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => navigate(`/project/${activeForgeFolder.projectId}`)}
                                            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                                            title="Open Project"
                                        >
                                            <Info size={12} />
                                        </button>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {activeForgeFolder.duplicateGroups} Duplicate Group(s)
                                        </span>
                                        <button
                                            onClick={() => mergeForgeDuplicates(activeForgeFolder.projectId)}
                                            disabled={mergingProjectIds.has(activeForgeFolder.projectId) || isMergingAllFolders}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-60"
                                        >
                                            {mergingProjectIds.has(activeForgeFolder.projectId) ? 'Merging...' : 'Merge Duplicates'}
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {activeForgeFolderEntries.map((entry) => {
                                        const rev = entry.item.currentRevision;
                                        const previewUrl = rev?.thumbnailLink || rev?.fileUrl || '';
                                        return (
                                            <div
                                                key={entry.item.id}
                                                className="group text-left bg-slate-800 border border-slate-700 rounded-xl overflow-hidden"
                                                title={rev?.title || 'Reference Image'}
                                            >
                                                <div className="aspect-square bg-black">
                                                    {previewUrl ? (
                                                        <img src={previewUrl} alt={rev?.title || 'Reference'} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                            <Box size={18} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-2.5">
                                                    <p className="text-xs text-slate-300 truncate">{rev?.title || 'Reference Image'}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : forgeFolders.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {forgeFolders.map((folder) => (
                                    <button
                                        key={folder.projectId}
                                        onClick={() => setActiveForgeFolderProjectId(folder.projectId)}
                                        className="group text-left bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all"
                                        title={`${folder.projectName} - ${folder.count} Forge references`}
                                    >
                                        <div className="aspect-[16/10] bg-black">
                                            {folder.cover ? (
                                                <img src={folder.cover} alt={folder.projectName} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                    <Box size={20} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-bold text-slate-200 truncate">{folder.projectName}</p>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/project/${folder.projectId}`); }}
                                                    className="p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white transition-colors shrink-0"
                                                    title="Open Project"
                                                >
                                                    <Info size={11} />
                                                </button>
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mt-1">
                                                {folder.count} Used In Forge
                                            </p>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                    {folder.duplicateGroups} Duplicate Group(s)
                                                </span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); mergeForgeDuplicates(folder.projectId); }}
                                                    disabled={mergingProjectIds.has(folder.projectId) || isMergingAllFolders}
                                                    className="px-2 py-1 rounded-md bg-slate-700 hover:bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-60"
                                                >
                                                    {mergingProjectIds.has(folder.projectId) ? 'Merging' : 'Merge'}
                                                </button>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-slate-800/20 border border-dashed border-slate-800 rounded-xl p-4 text-xs text-slate-500">
                                No reference images currently used in Forge.
                            </div>
                        )}
                    </section>
                )}
            </div>

            <DashboardBulkBar 
                count={selectedIds.size} 
                isProcessing={isBulkProcessing} 
                onCancel={() => setIsSelectMode(false)} 
                onBulkAction={handleBulkAction} 
            />

            <CreateProjectModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onCreate={async (n, d, s, pt, c, df, de) => { 
                    await api.projects.create({ 
                        name: n, 
                        description: d, 
                        storageType: s, 
                        projectType: pt, 
                        color: c, 
                        driveFolderId: df, 
                        defaultEngine: de 
                    }); 
                    refreshDashboard();
                }} 
            />

            {confirmDialog}

            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold animate-in fade-in slide-in-from-bottom-4 z-[100] flex items-center gap-3 border border-white/10 ${
                    toast.type === 'error' ? 'bg-red-600 shadow-red-900/40' : 'bg-emerald-600 shadow-emerald-900/40'
                }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
};

export default Home;
