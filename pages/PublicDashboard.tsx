import React from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  AudioLines,
  ArrowUpRight,
  Box,
  ChevronDown,
  Cloud,
  Database,
  Folder,
  FolderOpen,
  Gauge,
  Grid2X2,
  HardDrive,
  ImageIcon,
  Layers,
  List,
  File,
  MessageSquare,
  Pin,
  Search,
  Server,
  Sparkles,
  Star,
  Tag,
  Video,
  type LucideIcon
} from 'lucide-react';
import { api } from '../services/api';
import { DashboardToolbar } from '../components/dashboard/DashboardToolbar';
import { DashboardRecentActivity } from '../components/dashboard/DashboardRecentActivity';
import { DashboardSearchResults } from '../components/dashboard/DashboardSearchResults';
import { getProjectTypes, type CustomProjectType } from '../services/projectTypes';
import { ItemWithCurrentRevision, Project, ProjectCollection, ProjectStorageType } from '../types';
import { SortType } from '../hooks/useDashboard';
import {
  createDefaultDashboardSearchFilters,
  DashboardSearchSort,
  useDashboardSearch
} from '../hooks/useDashboardSearch';

type DashboardView = 'grid' | 'list';
type SortMode = 'updated' | 'created' | 'name';
type QuickFilter = 'all' | 'pinned' | 'local' | 'cloud' | 'recent';
type SavedViewKey = 'all' | 'recent' | 'pinned' | 'local' | 'cloud' | 'system';
type DashboardMediaType = 'image' | 'video' | 'audio' | 'chat' | 'text' | 'files' | 'prompt' | 'other';
type DashboardEntityKind = 'project' | 'collection' | 'queue_collection' | 'project_collection';
type DashboardResultType = 'workspace' | 'prompt_collection' | 'queue_prompt_collection' | 'project_collection';

interface DashboardProjectCollectionEntry {
  project: Project;
  collection: ProjectCollection;
}

interface DashboardResultEntity {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  createdAt: number;
  color: string;
  storageType: ProjectStorageType;
  isPinned: boolean;
  isSystem: boolean;
  projectType: string;
  defaultEngine?: string;
  systemKey?: string;
  ownerName?: string;
  kind: DashboardEntityKind;
  resultType: DashboardResultType;
  openPath: string;
  itemCount?: number;
  collectionCount?: number;
  chatItemCount?: number;
  imageItemCount?: number;
  videoItemCount?: number;
  audioItemCount?: number;
  otherItemCount?: number;
}

const PROJECT_TYPE_META: Record<
  string,
  { label: string; color: string; icon: LucideIcon }
> = {
  image: { label: 'Image', color: 'text-violet-300', icon: Sparkles },
  video: { label: 'Video', color: 'text-rose-300', icon: Video },
  audio: { label: 'Audio', color: 'text-emerald-300', icon: AudioLines },
  chat: { label: 'Chat', color: 'text-cyan-300', icon: MessageSquare },
  text: { label: 'Text', color: 'text-sky-300', icon: Layers },
  files: { label: 'Files', color: 'text-amber-300', icon: Box },
  prompt: { label: 'Prompt', color: 'text-emerald-300', icon: Tag }
};

const DASHBOARD_MEDIA_TYPE_ORDER = ['image', 'video', 'audio', 'chat', 'text', 'files', 'prompt'] as const;
const COLLAPSED_TYPE_ROW_COUNT = DASHBOARD_MEDIA_TYPE_ORDER.length;
const RECENT_WINDOW_DAYS = 7;

const STORAGE_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  [ProjectStorageType.LOCAL_DRIVE]: { label: 'Local Drive', color: 'text-emerald-300', icon: HardDrive },
  [ProjectStorageType.GOOGLE_DRIVE]: { label: 'Google Drive', color: 'text-sky-300', icon: Cloud }
};
const DASHBOARD_STORAGE_TYPES = [
  ProjectStorageType.LOCAL_DRIVE,
  ProjectStorageType.GOOGLE_DRIVE
] as const;

const savedViews: Array<{
  key: SavedViewKey;
  title: string;
  subtitle: string;
  accent: string;
}> = [
  { key: 'all', title: 'All Workspaces', subtitle: 'Everything you can access', accent: 'text-slate-200' },
  { key: 'recent', title: 'Recent Workspaces', subtitle: 'Fresh activity and active labs', accent: 'text-indigo-300' },
  { key: 'pinned', title: 'Pinned Focus', subtitle: 'Priority spaces at the top', accent: 'text-amber-300' },
  { key: 'local', title: 'Local Drive', subtitle: 'Fast access on this device', accent: 'text-emerald-300' },
  { key: 'cloud', title: 'Cloud Storage', subtitle: 'Shared and remote storage', accent: 'text-sky-300' },
  { key: 'system', title: 'System Workspaces', subtitle: 'Internal and managed spaces', accent: 'text-fuchsia-300' }
];

const relativeTime = (timestamp: number) => {
  const diff = Math.max(0, Date.now() - timestamp);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) {
    const minutes = Math.max(1, Math.round(diff / (60 * 1000)));
    return `${minutes}m ago`;
  }
  if (diff < day) {
    return `${Math.round(diff / hour)}h ago`;
  }
  return `${Math.round(diff / day)}d ago`;
};

const ENTITY_META: Record<DashboardEntityKind, { label: string; icon: LucideIcon }> = {
  project: { label: 'Project', icon: Folder },
  collection: { label: 'Prompt Collection', icon: FolderOpen },
  queue_collection: { label: 'Queue Prompt Collection', icon: FolderOpen },
  project_collection: { label: 'Project Collection', icon: FolderOpen }
};

const getEntityKindForProject = (project: Project): DashboardEntityKind => {
  const projectType = String(project.projectType || '').trim().toLowerCase();
  return projectType === 'prompt' ? 'collection' : 'project';
};

const getProjectOpenPath = (project: Project) => {
  const projectType = String(project.projectType || '').trim().toLowerCase();
  return projectType === 'prompt'
    ? `/prompt-manager?tab=projects&projectId=${project.id}`
    : `/project/${project.id}`;
};

const getResultTypeLabel = (entity: DashboardResultEntity, fallbackLabel: string) => {
  if (entity.resultType === 'prompt_collection') return 'Prompt Collection';
  if (entity.resultType === 'queue_prompt_collection') return 'Queue Prompt Collection';
  if (entity.resultType === 'project_collection') return 'Project Collection';
  return fallbackLabel;
};

const getPercentageLabel = (count: number, total: number) => {
  if (total <= 0 || count <= 0) return '0%';
  const rawPercent = (count / total) * 100;
  if (rawPercent < 0.1) return '<0.1%';
  if (rawPercent < 1) return `${rawPercent.toFixed(1)}%`;
  return `${Math.round(rawPercent)}%`;
};

const getPercentageWidth = (count: number, total: number) => {
  if (total <= 0 || count <= 0) return 0;
  const rawPercent = (count / total) * 100;
  return Math.min(100, Math.max(rawPercent, 1));
};

const getMediaTypeFromPath = (value: string): DashboardMediaType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  const pathname = normalized.split(/[?#]/)[0];
  const extension = pathname.includes('.') ? pathname.slice(pathname.lastIndexOf('.') + 1) : '';
  if (!extension) return null;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'wmv', 'flv'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'].includes(extension)) return 'audio';
  return null;
};

const getMediaTypeForItem = (
  item: ItemWithCurrentRevision,
  projectById: Map<string, Project>
): DashboardMediaType | null => {
  const revision = item.currentRevision;
  const project = projectById.get(item.projectId);
  const projectType = String(project?.projectType || '').trim().toLowerCase();
  const mimeType = String(revision?.mimeType || '').trim().toLowerCase();
  const engine = String(revision?.engine || '').trim().toLowerCase();
  const originalFilename = String(revision?.originalFilename || '').trim();
  const fileUrl = String(revision?.fileUrl || '').trim();
  const title = String(revision?.title || '').trim();

  if (projectType === 'prompt') return 'prompt';
  if (projectType === 'chat' || projectType.includes('chat')) return 'chat';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/pdf'
    || mimeType === 'application/xml'
    || mimeType === 'application/x-empty'
  ) {
    return 'text';
  }
  const extensionMediaType = getMediaTypeFromPath(originalFilename)
    || getMediaTypeFromPath(fileUrl)
    || getMediaTypeFromPath(title);
  if (extensionMediaType) return extensionMediaType;
  if (projectType.includes('video')) return 'video';
  if (projectType.includes('audio') || projectType.includes('music') || projectType.includes('voice') || projectType.includes('speech')) return 'audio';
  if (engine.includes('chat')) return 'chat';
  if (engine.includes('video')) return 'video';
  if (engine.includes('audio') || engine.includes('music') || engine.includes('voice') || engine.includes('speech') || engine.includes('tts')) return 'audio';
  if (projectType === 'image' || projectType === 'video' || projectType === 'audio' || projectType === 'text' || projectType === 'files') {
    return projectType as DashboardMediaType;
  }
  if (mimeType) return 'files';
  return null;
};

const sortProjects = (projects: Project[], sortMode: SortMode) => {
  const sorted = [...projects];
  sorted.sort((a, b) => {
    if (sortMode === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortMode === 'created') {
      return b.createdAt - a.createdAt;
    }
    return b.updatedAt - a.updatedAt;
  });
  return sorted;
};

const sortResultEntities = (entities: DashboardResultEntity[], sortMode: SortMode) => {
  const sorted = [...entities];
  sorted.sort((a, b) => {
    if (sortMode === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortMode === 'created') {
      return b.createdAt - a.createdAt;
    }
    return b.updatedAt - a.updatedAt;
  });
  return sorted;
};

const DashboardEntityLabel: React.FC<{ kind: DashboardEntityKind; color?: string }> = ({ kind, color }) => {
  const meta = ENTITY_META[kind];
  const Icon = meta.icon;
  const accentColor = color || '#94a3b8';

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-200"
      title={meta.label}
      aria-label={meta.label}
    >
      <Icon size={14} style={{ color: accentColor }} />
      {meta.label}
    </div>
  );
};

const PublicDashboard: React.FC = () => {
  const normalizeDashboardLimit = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 24;
    return Math.max(1, Math.min(200, Math.round(parsed)));
  };

  const navigate = useNavigate();
  const user = api.auth.getUser();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [items, setItems] = React.useState<ItemWithCurrentRevision[]>([]);
  const [queueCollections, setQueueCollections] = React.useState<ProjectCollection[]>([]);
  const [projectCollections, setProjectCollections] = React.useState<DashboardProjectCollectionEntry[]>([]);
  const [projectTypes, setProjectTypes] = React.useState<CustomProjectType[]>([]);
  const [dashboardResultLimit, setDashboardResultLimit] = React.useState(24);
  const [isLoading, setIsLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState<DashboardView>('grid');
  const [sortMode, setSortMode] = React.useState<SortMode>('updated');
  const [dashboardSearchFilters, setDashboardSearchFilters] = React.useState(createDefaultDashboardSearchFilters);
  const [dashboardSearchSort, setDashboardSearchSort] = React.useState<DashboardSearchSort>('relevance');
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>('all');
  const [activeSavedView, setActiveSavedView] = React.useState<SavedViewKey>('all');
  const [isTypePanelExpanded, setIsTypePanelExpanded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [projectRows, allItems, typeRows, archiveProject, assetIngestionProject, dashboardSettings] = await Promise.all([
          api.projects.list(),
          api.items.listAll(),
          getProjectTypes().catch(() => []),
          api.projects.getArchive(),
          api.projects.getAssetIngestion(),
          api.settings.get().catch(() => null)
        ]);
        if (!cancelled) {
          const combinedProjects = [...projectRows];
          for (const project of [archiveProject, assetIngestionProject]) {
            if (project && !combinedProjects.some((entry) => entry.id === project.id)) {
              combinedProjects.push(project);
            }
          }
          setProjects(combinedProjects.filter((project) => !project.isArchived));
          setItems(allItems.filter((item) => !item.isArchived));
          setProjectTypes(typeRows);
          setDashboardResultLimit(normalizeDashboardLimit(dashboardSettings?.dashboardResultLimit));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const assetIngestionProject = projects.find((project) => project.systemKey === 'asset-ingestion');
    if (!assetIngestionProject?.id) {
      setQueueCollections([]);
      return;
    }

    const loadQueueCollections = async () => {
      try {
        const collections = await api.collections.list(assetIngestionProject.id);
        if (!cancelled) {
          setQueueCollections(collections.filter((collection) => !collection.isArchived));
        }
      } catch {
        if (!cancelled) {
          setQueueCollections([]);
        }
      }
    };

    void loadQueueCollections();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  React.useEffect(() => {
    const loadDashboardSettings = async () => {
      try {
        const settings = await api.settings.get();
        setDashboardResultLimit(normalizeDashboardLimit(settings.dashboardResultLimit));
      } catch {
        setDashboardResultLimit(24);
      }
    };

    const handleSettingsUpdated = () => {
      void loadDashboardSettings();
    };

    void loadDashboardSettings();
    window.addEventListener('settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('settings-updated', handleSettingsUpdated);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const eligibleProjects = projects.filter((project) => {
      const projectType = String(project.projectType || '').trim().toLowerCase();
      return projectType !== 'prompt' && project.systemKey !== 'asset-ingestion';
    });

    if (eligibleProjects.length === 0) {
      setProjectCollections([]);
      return;
    }

    const loadProjectCollections = async () => {
      try {
        const rows = await Promise.all(
          eligibleProjects.map(async (project) => {
            const collections = await api.collections.list(project.id);
            return collections
              .filter((collection) => !collection.isArchived)
              .map((collection) => ({ project, collection }));
          })
        );
        if (!cancelled) {
          setProjectCollections(rows.flat());
        }
      } catch {
        if (!cancelled) {
          setProjectCollections([]);
        }
      }
    };

    void loadProjectCollections();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const startOfToday = React.useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value.getTime();
  }, []);

  const projectTypeLookup = React.useMemo(() => {
    return new Map(projectTypes.map((type) => [type.id, type]));
  }, [projectTypes]);
  const projectById = React.useMemo(() => {
    return new Map(projects.map((project) => [project.id, project]));
  }, [projects]);
  const dashboardSearch = useDashboardSearch(projects, query, dashboardSearchFilters, dashboardSearchSort);
  const isComprehensiveSearchActive = query.trim().length > 0 || dashboardSearch.filterCount > 0;

  const toolbarSortType = React.useMemo<SortType>(() => {
    if (sortMode === 'name') return 'name-asc';
    return sortMode;
  }, [sortMode]);

  const handleToolbarSortChange = React.useCallback((nextSort: SortType) => {
    if (nextSort === 'name-asc' || nextSort === 'name-desc') {
      setSortMode('name');
      setDashboardSearchSort('name');
      return;
    }
    if (nextSort === 'created' || nextSort === 'created-old') {
      setSortMode('created');
      setDashboardSearchSort('created');
      return;
    }
    setSortMode('updated');
    setDashboardSearchSort('updated');
  }, []);
  const dashboardEntities = React.useMemo<DashboardResultEntity[]>(() => {
    const assetIngestionProject = projects.find((project) => project.systemKey === 'asset-ingestion') || null;
    const projectEntities: DashboardResultEntity[] = projects.map((project) => {
      const isPromptCollection = String(project.projectType || '').trim().toLowerCase() === 'prompt';
      return {
        id: project.id,
        name: project.name,
        description: project.description || '',
        updatedAt: project.updatedAt,
        createdAt: project.createdAt,
        color: project.color,
        storageType: project.storageType,
        isPinned: !!project.isPinned,
        isSystem: !!project.isSystem,
        projectType: project.projectType,
        defaultEngine: project.defaultEngine,
        systemKey: project.systemKey,
        ownerName: project.ownerName,
        kind: getEntityKindForProject(project),
        resultType: isPromptCollection ? 'prompt_collection' : 'workspace',
        openPath: getProjectOpenPath(project),
        itemCount: Number(project.itemCount || 0),
        collectionCount: Number(project.collectionCount || 0),
        chatItemCount: Number(project.chatItemCount || 0),
        imageItemCount: Number(project.imageItemCount || 0),
        videoItemCount: Number(project.videoItemCount || 0),
        audioItemCount: Number(project.audioItemCount || 0),
        otherItemCount: Number(project.otherItemCount || 0)
      };
    });

    const queueEntities = assetIngestionProject
      ? queueCollections.map((collection) => ({
          id: `queue-${collection.id}`,
          name: collection.name,
          description: `Queue Prompt Collection in ${assetIngestionProject.name}.`,
          updatedAt: collection.updatedAt,
          createdAt: collection.createdAt,
          color: assetIngestionProject.color,
          storageType: assetIngestionProject.storageType,
          isPinned: !!collection.isPinned,
          isSystem: !!assetIngestionProject.isSystem,
          projectType: 'prompt',
          defaultEngine: assetIngestionProject.defaultEngine,
          systemKey: assetIngestionProject.systemKey,
          ownerName: assetIngestionProject.ownerName,
          kind: 'queue_collection' as const,
          resultType: 'queue_prompt_collection' as const,
          openPath: `/prompt-manager?tab=ready&collectionId=${collection.id}`,
          itemCount: Number(collection.itemCount || 0),
          collectionCount: 1,
          chatItemCount: 0,
          imageItemCount: 0,
          videoItemCount: 0,
          audioItemCount: 0,
          otherItemCount: 0
        }))
      : [];
    const projectCollectionEntities = projectCollections.map(({ project, collection }) => ({
      id: `project-collection-${collection.id}`,
      name: collection.name,
      description: `Project Collection in ${project.name}.`,
      updatedAt: collection.updatedAt,
      createdAt: collection.createdAt,
      color: project.color,
      storageType: project.storageType,
      isPinned: !!collection.isPinned,
      isSystem: !!project.isSystem,
      projectType: project.projectType,
      defaultEngine: project.defaultEngine,
      systemKey: project.systemKey,
      ownerName: project.ownerName,
      kind: 'project_collection' as const,
      resultType: 'project_collection' as const,
      openPath: `/project/${project.id}?collectionId=${collection.id}`,
      itemCount: Number(collection.itemCount || 0),
      collectionCount: 1,
      chatItemCount: 0,
      imageItemCount: 0,
      videoItemCount: 0,
      audioItemCount: 0,
      otherItemCount: 0
    }));

    return [...projectEntities, ...projectCollectionEntities, ...queueEntities];
  }, [projectCollections, projects, queueCollections]);

  const totalProjects = projects.length;
  const pinnedProjects = projects.filter((project) => project.isPinned);
  const localProjects = projects.filter((project) => project.storageType === ProjectStorageType.LOCAL_DRIVE);
  const cloudProjects = projects.filter((project) => project.storageType !== ProjectStorageType.LOCAL_DRIVE);
  const updatedToday = projects.filter((project) => project.updatedAt >= startOfToday);
  const systemProjects = projects.filter((project) => project.isSystem);

  const applySavedView = React.useCallback((viewKey: SavedViewKey, input: DashboardResultEntity[]) => {
    switch (viewKey) {
      case 'all':
        return input;
      case 'pinned':
        return input.filter((entity) => entity.isPinned);
      case 'local':
        return input.filter((entity) => entity.storageType === ProjectStorageType.LOCAL_DRIVE);
      case 'cloud':
        return input.filter((entity) => entity.storageType !== ProjectStorageType.LOCAL_DRIVE);
      case 'system':
        return input.filter((entity) => entity.isSystem);
      case 'recent':
      default:
        return input.filter((entity) => entity.updatedAt >= startOfToday - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    }
  }, [startOfToday]);

  const filteredProjects = React.useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();

    const matchesQuickFilter = (entity: DashboardResultEntity) => {
      switch (quickFilter) {
        case 'pinned':
          return !!entity.isPinned;
        case 'local':
          return entity.storageType === ProjectStorageType.LOCAL_DRIVE;
        case 'cloud':
          return entity.storageType !== ProjectStorageType.LOCAL_DRIVE;
        case 'recent':
          return entity.updatedAt >= startOfToday - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        case 'all':
        default:
          return true;
      }
    };

    const matchesSearch = (entity: DashboardResultEntity) => {
      if (!loweredQuery) return true;
      const searchFields = [
        entity.name,
        entity.description,
        entity.ownerName,
        entity.projectType,
        entity.storageType,
        entity.defaultEngine,
        entity.systemKey,
        ENTITY_META[entity.kind]?.label
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchFields.includes(loweredQuery);
    };

    return sortResultEntities(
      applySavedView(
        activeSavedView,
        dashboardEntities.filter((entity) => matchesQuickFilter(entity) && matchesSearch(entity))
      ),
      sortMode
    ).slice(0, dashboardResultLimit);
  }, [activeSavedView, applySavedView, dashboardEntities, dashboardResultLimit, query, quickFilter, sortMode, startOfToday]);

  const recentActivity = React.useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [projects]
  );

  const storageDistribution = React.useMemo(() => {
    const rows = DASHBOARD_STORAGE_TYPES.map((storageType) => {
      const count = projects.filter((project) => project.storageType === storageType).length;
      const percent = totalProjects > 0 ? Math.round((count / totalProjects) * 100) : 0;
      return { storageType, count, percent, ...STORAGE_META[storageType] };
    });
    return rows;
  }, [projects, totalProjects]);

  const typeDistribution = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const mediaType = getMediaTypeForItem(item, projectById);
      if (!mediaType || mediaType === 'other') continue;
      counts.set(mediaType, (counts.get(mediaType) || 0) + 1);
    }
    const typedItemCount = [...counts.values()].reduce((sum, count) => sum + count, 0);

    const knownRows = DASHBOARD_MEDIA_TYPE_ORDER.map((typeId) => {
      const custom = projectTypeLookup.get(typeId);
      const meta = PROJECT_TYPE_META[typeId];
      const count = counts.get(typeId) || 0;
      return {
        id: typeId,
        label: custom?.label || meta?.label || typeId,
        color: custom?.color ? '' : meta?.color || 'text-slate-300',
        customColor: custom?.color || null,
        count,
        percent: typedItemCount > 0 ? (count / typedItemCount) * 100 : 0,
        percentLabel: getPercentageLabel(count, typedItemCount),
        barWidth: getPercentageWidth(count, typedItemCount)
      };
    });

    const customRows = [...counts.entries()]
      .filter(([typeId]) => !DASHBOARD_MEDIA_TYPE_ORDER.includes(typeId as typeof DASHBOARD_MEDIA_TYPE_ORDER[number]))
      .map(([typeId, count]) => {
        const custom = projectTypeLookup.get(typeId);
        const meta = PROJECT_TYPE_META[typeId];
        return {
          id: typeId,
          label: custom?.label || meta?.label || typeId,
          color: custom?.color ? '' : meta?.color || 'text-slate-300',
          customColor: custom?.color || null,
          count,
          percent: typedItemCount > 0 ? (count / typedItemCount) * 100 : 0,
          percentLabel: getPercentageLabel(count, typedItemCount),
          barWidth: getPercentageWidth(count, typedItemCount)
        };
      });

    const orderedKnownRows = [...knownRows].sort((a, b) => {
      const aIndex = DASHBOARD_MEDIA_TYPE_ORDER.indexOf(a.id as typeof DASHBOARD_MEDIA_TYPE_ORDER[number]);
      const bIndex = DASHBOARD_MEDIA_TYPE_ORDER.indexOf(b.id as typeof DASHBOARD_MEDIA_TYPE_ORDER[number]);
      return aIndex - bIndex;
    });
    const orderedCustomRows = [...customRows].sort((a, b) => {
      if (a.count === b.count) return a.label.localeCompare(b.label);
      return b.count - a.count;
    });
    return [...orderedKnownRows, ...orderedCustomRows];
  }, [items, projectById, projectTypeLookup]);

  const stats = [
    {
      label: 'Total Projects',
      value: totalProjects,
      detail: 'Accessible workspaces',
      icon: Layers,
      tone: 'text-blue-300 border-blue-500/20 bg-blue-500/10'
    },
    {
      label: 'Pinned Projects',
      value: pinnedProjects.length,
      detail: 'Priority spaces',
      icon: Pin,
      tone: 'text-amber-300 border-amber-500/20 bg-amber-500/10'
    },
    {
      label: 'Local Projects',
      value: localProjects.length,
      detail: 'Stored on device',
      icon: HardDrive,
      tone: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10'
    },
    {
      label: 'Cloud Projects',
      value: cloudProjects.length,
      detail: 'Remote storage',
      icon: Cloud,
      tone: 'text-sky-300 border-sky-500/20 bg-sky-500/10'
    },
    {
      label: 'Updated Today',
      value: updatedToday.length,
      detail: 'Active work today',
      icon: Activity,
      tone: 'text-violet-300 border-violet-500/20 bg-violet-500/10'
    },
    {
      label: 'System Workspaces',
      value: systemProjects.length,
      detail: 'Managed internally',
      icon: Server,
      tone: 'text-fuchsia-300 border-fuchsia-500/20 bg-fuchsia-500/10'
    }
  ];

  const quickFilters: Array<{ key: QuickFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'pinned', label: 'Pinned' },
    { key: 'local', label: 'Local Drive' },
    { key: 'cloud', label: 'Cloud' },
    { key: 'recent', label: 'Recently Updated' }
  ];

  const canExpandTypePanel = typeDistribution.length > COLLAPSED_TYPE_ROW_COUNT;
  const visibleTypeDistribution = isTypePanelExpanded || !canExpandTypePanel
    ? typeDistribution
    : typeDistribution.slice(0, COLLAPSED_TYPE_ROW_COUNT);

  return (
    <div className="mx-auto max-w-[1760px] space-y-8 pb-20">
      <section className="flex flex-col gap-3 pt-3">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-200">
              <Gauge size={12} />
              Dashboard
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
            </h1>
          </div>
          <div className="hidden items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-400 lg:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <Activity size={16} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">System Status</div>
              <div className="mt-1 font-semibold text-emerald-300">Operational</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${stat.tone}`}>
                <stat.icon size={18} />
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-white">{stat.value}</div>
              </div>
            </div>
            <div className="mt-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{stat.label}</div>
            <div className="mt-1 text-xs text-slate-400">{stat.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <section className="space-y-4">
            <DashboardToolbar
              searchTerm={query}
              onSearchChange={setQuery}
              sortType={toolbarSortType}
              onSortChange={handleToolbarSortChange}
              viewType={view}
              onViewChange={setView}
              searchFilters={dashboardSearchFilters}
              onSearchFiltersChange={setDashboardSearchFilters}
              searchFilterCount={dashboardSearch.filterCount}
              resultCount={dashboardSearch.results.length}
              availableTags={dashboardSearch.availableTags}
            />

            {!isComprehensiveSearchActive && (
              <div className="flex flex-wrap items-center gap-2">
                {quickFilters.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setQuickFilter(filter.key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      quickFilter === filter.key
                        ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-200'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}

            {isComprehensiveSearchActive && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-[#07101f]/80 p-2">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
                    <Search size={14} />
                    Search
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/chat?from=dashboard')}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400 transition-colors hover:bg-slate-900 hover:text-white"
                  >
                    <MessageSquare size={14} />
                    AI Chat
                  </button>
                </div>

                <DashboardSearchResults
                  query={query}
                  results={dashboardSearch.results}
                  totalIndexed={dashboardSearch.totalIndexed}
                  isLoading={dashboardSearch.isLoading}
                  error={dashboardSearch.error}
                  sort={dashboardSearchSort}
                  onSortChange={setDashboardSearchSort}
                />
              </div>
            )}

            {!isComprehensiveSearchActive && (
              <DashboardRecentActivity
                items={items}
                projects={projects}
                isLoading={isLoading}
                onOpenProject={(projectId) => {
                  const project = projectById.get(projectId);
                  navigate(project ? getProjectOpenPath(project) : `/project/${projectId}`);
                }}
              />
            )}
          </section>

          {!isComprehensiveSearchActive && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Saved Views</div>
                <div className="mt-1 text-sm text-slate-400">Fast scopes for the dashboard concept.</div>
              </div>
              <div className="text-xs text-slate-500">{filteredProjects.length} results</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {savedViews.map((savedView) => (
                <button
                  key={savedView.key}
                  onClick={() => setActiveSavedView(savedView.key)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    activeSavedView === savedView.key
                      ? 'border-indigo-500/40 bg-indigo-500/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className={`text-xs font-black uppercase tracking-[0.2em] ${savedView.accent}`}>{savedView.title}</div>
                  <div className="mt-2 text-sm text-slate-400">{savedView.subtitle}</div>
                </button>
              ))}
            </div>
          </section>
          )}

          {!isComprehensiveSearchActive && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Results</div>
                <div className="mt-1 text-sm text-slate-400">
                  {isComprehensiveSearchActive
                    ? `Showing ${dashboardSearch.results.length} search result${dashboardSearch.results.length === 1 ? '' : 's'}.`
                    : isLoading
                      ? 'Loading dashboard entries...'
                      : `Showing ${filteredProjects.length} result${filteredProjects.length === 1 ? '' : 's'}.`}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-48 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
                <div className="text-sm font-semibold text-slate-200">No dashboard entries match the current filters.</div>
                <div className="mt-2 text-sm text-slate-500">Try clearing the search text or switching to a broader saved view.</div>
              </div>
            ) : view === 'grid' ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredProjects.map((project) => {
                  const customType = projectTypeLookup.get(project.projectType);
                  const typeMeta = PROJECT_TYPE_META[project.projectType] || null;
                  const storageMeta = STORAGE_META[project.storageType] || STORAGE_META[ProjectStorageType.LOCAL_DRIVE];
                  const StorageIcon = storageMeta.icon;
                  const TypeIcon = typeMeta?.icon || Layers;
                  const typeLabel = getResultTypeLabel(project, customType?.label || typeMeta?.label || project.projectType || 'Workspace');
                  const collectionCount = Number(project.collectionCount || 0);
                  const imageItemCount = Number(project.imageItemCount || 0);
                  const videoItemCount = Number(project.videoItemCount || 0);
                  const chatItemCount = Number(project.chatItemCount || 0);
                  const audioItemCount = Number(project.audioItemCount || 0);
                  const otherItemCount = Number(project.otherItemCount || 0);

                  return (
                    <button
                      key={project.id}
                      onClick={() => navigate(project.openPath)}
                      className="group rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-slate-700"
                    >
                      <div className="rounded-2xl border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.92))] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-950/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${customType?.color ? '' : typeMeta?.color || 'text-slate-200'}`}
                                style={customType?.color ? { color: customType.color } : undefined}
                              >
                                <TypeIcon size={12} />
                                {typeLabel}
                              </span>
                              {project.isPinned && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                                  <Star size={12} />
                                  Pinned
                                </span>
                              )}
                              {project.isSystem && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-200">
                                  <Server size={12} />
                                  System
                                </span>
                              )}
                            </div>
                            <h3 className="mt-4 truncate text-xl font-black text-white">{project.name}</h3>
                            <p className="mt-2 line-clamp-2 min-h-[40px] text-sm text-slate-200/75">
                              {project.description || 'No description provided for this workspace yet.'}
                            </p>
                          </div>

                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-950/80 text-white/80 transition-colors group-hover:border-slate-600 group-hover:text-white">
                            <ArrowUpRight size={16} />
                          </div>
                        </div>

                        <div className="mt-6 flex items-start justify-between gap-3 text-[11px] text-slate-300">
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                            <StorageIcon size={12} />
                            {storageMeta.label}
                          </span>
                          <div className="flex flex-col items-end gap-2 text-right">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                              <Activity size={12} />
                              {relativeTime(project.updatedAt)}
                            </span>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1.5" title={`${collectionCount} collection${collectionCount === 1 ? '' : 's'}`}>
                                <Folder size={12} />
                                {collectionCount}
                              </span>
                              <span className="inline-flex items-center gap-1.5" title={`${imageItemCount} image${imageItemCount === 1 ? '' : 's'}`}>
                                <ImageIcon size={12} />
                                {imageItemCount}
                              </span>
                              <span className="inline-flex items-center gap-1.5" title={`${videoItemCount} video${videoItemCount === 1 ? '' : 's'}`}>
                                <Video size={12} />
                                {videoItemCount}
                              </span>
                              <span className="inline-flex items-center gap-1.5" title={`${chatItemCount} chat capture${chatItemCount === 1 ? '' : 's'}`}>
                                <MessageSquare size={12} />
                                {chatItemCount}
                              </span>
                              <span className="inline-flex items-center gap-1.5" title={`${audioItemCount} audio file${audioItemCount === 1 ? '' : 's'}`}>
                                <AudioLines size={12} />
                                {audioItemCount}
                              </span>
                              <span className="inline-flex items-center gap-1.5" title={`${otherItemCount} other file${otherItemCount === 1 ? '' : 's'}`}>
                                <File size={12} />
                                {otherItemCount}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-start">
                          <DashboardEntityLabel kind={project.kind} color={project.color} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60">
                <div className="grid grid-cols-[minmax(0,2fr)_160px_160px_120px] gap-3 border-b border-slate-800 px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  <span>Entry</span>
                  <span>Type</span>
                  <span>Storage</span>
                  <span>Updated</span>
                </div>
                {filteredProjects.map((project) => {
                  const customType = projectTypeLookup.get(project.projectType);
                  const typeMeta = PROJECT_TYPE_META[project.projectType] || null;
                  const storageMeta = STORAGE_META[project.storageType] || STORAGE_META[ProjectStorageType.LOCAL_DRIVE];
                  const typeLabel = getResultTypeLabel(project, customType?.label || typeMeta?.label || project.projectType || 'Workspace');
                  return (
                    <button
                      key={project.id}
                      onClick={() => navigate(project.openPath)}
                      className="grid w-full grid-cols-[minmax(0,2fr)_160px_160px_120px] gap-3 border-b border-slate-800/80 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{project.name}</div>
                        <div className="mt-1 truncate text-xs text-slate-500">{project.description || 'No description provided.'}</div>
                      </div>
                      <div
                        className={`text-sm ${customType?.color ? '' : typeMeta?.color || 'text-slate-300'}`}
                        style={customType?.color ? { color: customType.color } : undefined}
                      >
                        {typeLabel}
                      </div>
                      <div className="text-sm text-slate-300">{storageMeta.label}</div>
                      <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
                        <span>{relativeTime(project.updatedAt)}</span>
                        <DashboardEntityLabel kind={project.kind} color={project.color} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              <Database size={14} />
              Storage Overview
            </div>
            <div className="mt-5 space-y-4">
              {storageDistribution.map((storage) => (
                <div key={storage.storageType} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <storage.icon size={14} className={storage.color} />
                      {storage.label}
                    </div>
                    <div className="text-xs text-slate-400">{storage.count} projects</div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${storage.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                <Layers size={14} />
                Items by Type
              </div>
              {canExpandTypePanel && (
                <button
                  onClick={() => setIsTypePanelExpanded((value) => !value)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/70 text-slate-400 transition-colors hover:text-white"
                  title={isTypePanelExpanded ? 'Collapse project types' : 'Expand project types'}
                  aria-label={isTypePanelExpanded ? 'Collapse project types' : 'Expand project types'}
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${isTypePanelExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>
            <div className="mt-5 space-y-3">
              {visibleTypeDistribution.map((typeRow) => (
                <div key={typeRow.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span
                      className={`font-semibold ${typeRow.color || 'text-white'}`}
                      style={typeRow.customColor ? { color: typeRow.customColor } : undefined}
                    >
                      {typeRow.label}
                    </span>
                    <span className="text-slate-400">{typeRow.percentLabel}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{
                        width: `${typeRow.barWidth}%`,
                        backgroundColor: typeRow.customColor || undefined
                      }}
                    />
                  </div>
                </div>
              ))}
              {canExpandTypePanel && (
                <div className="pt-1 text-xs text-slate-500">
                  {isTypePanelExpanded
                    ? `Showing all ${typeDistribution.length} types`
                    : `Showing ${visibleTypeDistribution.length} of ${typeDistribution.length} types`}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Recent Workspaces</div>
              <div className="text-xs text-slate-500">Live from projects</div>
            </div>
            <div className="mt-5 space-y-4">
              {recentActivity.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigate(getProjectOpenPath(project))}
                  className="flex w-full items-start gap-3 rounded-2xl text-left transition-colors hover:bg-slate-800/40"
                >
                  <div className="mt-1 h-8 w-8 shrink-0 rounded-xl border border-slate-800 bg-slate-950/70" style={{ backgroundColor: project.color || '#0f172a' }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{project.name}</div>
                    <div className="mt-1 text-xs text-slate-500">Updated {relativeTime(project.updatedAt)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
};

export default PublicDashboard;
