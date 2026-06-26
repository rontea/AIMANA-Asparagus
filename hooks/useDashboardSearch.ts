import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { ItemWithCurrentRevision, Project, ProjectStorageType } from '../types';
import type { ChatItem } from '../types/chatItems';
import type { PromptDraft } from '../components/prompt-manager/types';

export type DashboardSearchKind = 'project' | 'item' | 'chat' | 'prompt';
export type DashboardSearchMedia = 'image' | 'video' | 'audio' | 'document' | 'other';
export type DashboardSearchDateRange = 'any' | 'day' | 'week' | 'month';
export type DashboardSearchSort = 'relevance' | 'updated' | 'created' | 'name';
export type DashboardSearchStatus = 'ready' | 'processing' | 'failed';

export interface DashboardSearchFilters {
    kinds: DashboardSearchKind[];
    media: DashboardSearchMedia[];
    storage: Array<ProjectStorageType | 'prompt-manager'>;
    dateRange: DashboardSearchDateRange;
    pinnedOnly: boolean;
    tags: string[];
    statuses: DashboardSearchStatus[];
}

export interface DashboardSearchResult {
    id: string;
    kind: DashboardSearchKind;
    media?: DashboardSearchMedia;
    title: string;
    subtitle: string;
    projectId?: string;
    projectName?: string;
    description: string;
    searchableText: string;
    storageLabel: string;
    storageKey: ProjectStorageType | 'prompt-manager';
    updatedAt: number;
    createdAt: number;
    isPinned: boolean;
    tags: string[];
    status: DashboardSearchStatus;
    previewUrl?: string;
    thumbnailBlur?: boolean;
    href: string;
}

const DEFAULT_FILTERS: DashboardSearchFilters = {
    kinds: ['project', 'item', 'chat', 'prompt'],
    media: ['image', 'video', 'audio', 'document', 'other'],
    storage: [
        ProjectStorageType.GOOGLE_DRIVE,
        ProjectStorageType.LOCAL_DRIVE,
        'prompt-manager'
    ],
    dateRange: 'any',
    pinnedOnly: false,
    tags: [],
    statuses: ['ready', 'processing', 'failed']
};

export const createDefaultDashboardSearchFilters = (): DashboardSearchFilters => ({
    kinds: [...DEFAULT_FILTERS.kinds],
    media: [...DEFAULT_FILTERS.media],
    storage: [...DEFAULT_FILTERS.storage],
    dateRange: DEFAULT_FILTERS.dateRange,
    pinnedOnly: DEFAULT_FILTERS.pinnedOnly,
    tags: [...DEFAULT_FILTERS.tags],
    statuses: [...DEFAULT_FILTERS.statuses]
});

const parseTags = (value: unknown) => String(value || '')
    .split(/[,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);

const hasThumbnailBlur = (aiParameters?: string | null): boolean => {
    if (!aiParameters) return false;
    try {
        const parsed = JSON.parse(aiParameters);
        const advancedParams = parsed?.advanced_params || parsed || {};
        return !!(advancedParams.thumbnailBlur || parsed?.thumbnailBlur);
    } catch {
        return false;
    }
};

const getMediaKind = (mimeType = ''): DashboardSearchMedia => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
        mimeType.includes('pdf')
        || mimeType.includes('text')
        || mimeType.includes('document')
        || mimeType.includes('json')
        || mimeType.includes('csv')
    ) return 'document';
    return 'other';
};

const normalize = (value: unknown) => String(value || '').toLowerCase();

const getSearchStorageKey = (storageType?: ProjectStorageType | string): ProjectStorageType => (
    storageType === ProjectStorageType.GOOGLE_DRIVE ? ProjectStorageType.GOOGLE_DRIVE : ProjectStorageType.LOCAL_DRIVE
);

const scoreResult = (result: DashboardSearchResult, terms: string[]) => {
    if (terms.length === 0) return 1;
    const title = normalize(result.title);
    const project = normalize(result.projectName);
    const body = normalize(result.searchableText);
    let score = 0;
    terms.forEach((term) => {
        if (title === term) score += 80;
        if (title.startsWith(term)) score += 40;
        if (title.includes(term)) score += 24;
        if (project.includes(term)) score += 12;
        if (body.includes(term)) score += 8;
    });
    if (result.isPinned) score += 3;
    return score;
};

const isWithinDateRange = (timestamp: number, range: DashboardSearchDateRange) => {
    if (range === 'any') return true;
    if (!timestamp) return false;
    const age = Date.now() - timestamp;
    const day = 24 * 60 * 60 * 1000;
    if (range === 'day') return age <= day;
    if (range === 'week') return age <= 7 * day;
    return age <= 30 * day;
};

const getFilterCount = (filters: DashboardSearchFilters) => {
    let count = 0;
    if (filters.kinds.length !== DEFAULT_FILTERS.kinds.length) count += 1;
    if (filters.media.length !== DEFAULT_FILTERS.media.length) count += 1;
    if (filters.storage.length !== DEFAULT_FILTERS.storage.length) count += 1;
    if (filters.dateRange !== 'any') count += 1;
    if (filters.pinnedOnly) count += 1;
    if (filters.tags.length > 0) count += 1;
    if (filters.statuses.length !== DEFAULT_FILTERS.statuses.length) count += 1;
    return count;
};

export const useDashboardSearch = (
    projects: Project[],
    query: string,
    filters: DashboardSearchFilters,
    sort: DashboardSearchSort
) => {
    const [items, setItems] = useState<ItemWithCurrentRevision[]>([]);
    const [chatItems, setChatItems] = useState<ChatItem[]>([]);
    const [promptDrafts, setPromptDrafts] = useState<PromptDraft[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (projects.length === 0) return;
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [itemResult, promptResult, chatResults] = await Promise.all([
                    api.items.listAll(false),
                    api.settings.listPromptManagerDrafts().catch(() => []),
                    api.chatItems.listAll().catch(() => [])
                ]);

                if (cancelled) return;

                setItems(itemResult);
                setPromptDrafts(promptResult.filter((draft) => draft.status !== 'deleted'));
                setChatItems(chatResults.filter((item) => !item.isArchived));
            } catch {
                if (!cancelled) {
                    setItems([]);
                    setChatItems([]);
                    setPromptDrafts([]);
                    setError('Search index could not be loaded.');
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void load();
        return () => { cancelled = true; };
    }, [projects]);

    const projectLookup = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

    const allResults = useMemo<DashboardSearchResult[]>(() => {
        const projectResults = projects.map((project): DashboardSearchResult => ({
            id: project.id,
            kind: 'project',
            title: project.name,
            subtitle: 'Project',
            projectId: project.id,
            projectName: project.name,
            description: project.description || 'No description provided.',
            searchableText: [
                project.name,
                project.description,
                project.storageType,
                project.projectType
            ].join(' '),
            storageLabel: project.storageType,
            storageKey: getSearchStorageKey(project.storageType),
            updatedAt: project.updatedAt || project.createdAt || 0,
            createdAt: project.createdAt || 0,
            isPinned: !!project.isPinned,
            tags: parseTags(project.projectType),
            status: 'ready',
            href: `/project/${project.id}`
        }));

        const itemResults = items
            .filter((item) => item.currentRevision)
            .map((item): DashboardSearchResult => {
                const rev = item.currentRevision!;
                const project = projectLookup.get(item.projectId);
                const media = getMediaKind(rev.mimeType);
                const itemHref = `/project/${item.projectId}?tab=active${item.collectionId ? `&collectionId=${encodeURIComponent(item.collectionId)}` : ''}&itemId=${encodeURIComponent(item.id)}`;
                return {
                    id: item.id,
                    kind: 'item',
                    media,
                    title: rev.title || rev.originalFilename || 'Untitled item',
                    subtitle: `${media[0].toUpperCase()}${media.slice(1)} item`,
                    projectId: item.projectId,
                    projectName: project?.name || 'Workspace',
                    description: rev.prompt || rev.note || rev.label || rev.originalFilename || 'Saved item',
                    searchableText: [
                        rev.title,
                        rev.originalFilename,
                        rev.label,
                        rev.tags,
                        rev.prompt,
                        rev.note,
                        rev.engine,
                        rev.mimeType,
                        project?.name
                    ].join(' '),
                    storageLabel: project?.storageType || rev.storage,
                    storageKey: getSearchStorageKey(project?.storageType),
                    updatedAt: item.updatedAt || rev.createdAt || item.createdAt || 0,
                    createdAt: item.createdAt || rev.createdAt || 0,
                    isPinned: !!item.isPinned,
                    tags: parseTags(rev.tags || rev.label || ''),
                    status: 'ready',
                    previewUrl: rev.thumbnailLink || rev.fileUrl,
                    thumbnailBlur: hasThumbnailBlur(rev.aiParameters),
                    href: itemHref
                };
            });

        const chatResults = chatItems.map((item): DashboardSearchResult => {
            const project = projectLookup.get(item.projectId);
            return {
                id: item.id,
                kind: 'chat',
                media: 'document',
                title: item.title || 'Untitled chat capture',
                subtitle: 'Chat capture',
                projectId: item.projectId,
                projectName: project?.name || 'Workspace',
                description: item.transcriptText || item.systemPrompt || `${item.messageCount || 0} messages`,
                searchableText: [
                    item.title,
                    item.systemPrompt,
                    item.transcriptText,
                    item.modelId,
                    item.modelIds?.join(' '),
                    project?.name
                ].join(' '),
                storageLabel: project?.storageType || 'Project',
                storageKey: getSearchStorageKey(project?.storageType),
                updatedAt: item.updatedAt || item.createdAt || 0,
                createdAt: item.createdAt || 0,
                isPinned: !!item.isPinned,
                tags: parseTags(item.modelIds?.join(' ') || item.modelId || ''),
                status: 'ready',
                href: `/chat?from=project&projectId=${encodeURIComponent(item.projectId)}&chatItemId=${encodeURIComponent(item.id)}`
            };
        });

        const promptResults = promptDrafts.map((draft): DashboardSearchResult => ({
            id: draft.id,
            kind: 'prompt',
            media: 'document',
            title: draft.title || 'Untitled prompt',
            subtitle: `Prompt Manager - ${draft.status}`,
            description: draft.prompt || draft.note || draft.label || 'Saved prompt draft',
            searchableText: [
                draft.title,
                draft.prompt,
                draft.raw,
                draft.label,
                draft.tags,
                draft.note,
                draft.status,
                draft.ingestionState
            ].join(' '),
            storageLabel: 'Prompt Manager',
            storageKey: 'prompt-manager',
            updatedAt: draft.updatedAt || draft.createdAt || 0,
            createdAt: draft.createdAt || 0,
            isPinned: false,
            tags: parseTags(draft.tags || draft.label || ''),
            status: draft.previewError ? 'failed' : draft.ingestionState === 'pending' ? 'processing' : 'ready',
            previewUrl: draft.previewImageUrl,
            href: '/prompt-manager'
        }));

        return [...projectResults, ...itemResults, ...chatResults, ...promptResults];
    }, [chatItems, items, projectLookup, projects, promptDrafts]);

    const results = useMemo(() => {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const scored = allResults
            .map((result) => ({ result, score: scoreResult(result, terms) }))
            .filter(({ result, score }) => {
                if (terms.length > 0 && score <= 0) return false;
                if (!filters.kinds.includes(result.kind)) return false;
                if (result.media && !filters.media.includes(result.media)) return false;
                if (!filters.storage.includes(result.storageKey)) return false;
                if (filters.pinnedOnly && !result.isPinned) return false;
                if (!filters.statuses.includes(result.status)) return false;
                if (filters.tags.length > 0) {
                    const resultTags = new Set(result.tags.map((tag) => tag.toLowerCase()));
                    if (!filters.tags.every((tag) => resultTags.has(tag.toLowerCase()))) return false;
                }
                return isWithinDateRange(result.updatedAt || result.createdAt, filters.dateRange);
            });

        scored.sort((a, b) => {
            if (sort === 'name') return a.result.title.localeCompare(b.result.title);
            if (sort === 'created') return b.result.createdAt - a.result.createdAt;
            if (sort === 'updated') return b.result.updatedAt - a.result.updatedAt;
            return b.score - a.score || b.result.updatedAt - a.result.updatedAt;
        });

        return scored.map(({ result }) => result);
    }, [allResults, filters, query, sort]);

    const filterCount = useMemo(() => getFilterCount(filters), [filters]);
    const availableTags = useMemo(() => {
        const counts = new Map<string, number>();
        allResults.forEach((result) => {
            result.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 12)
            .map(([tag]) => tag);
    }, [allResults]);

    return {
        results,
        totalIndexed: allResults.length,
        isLoading,
        error,
        filterCount,
        availableTags
    };
};
