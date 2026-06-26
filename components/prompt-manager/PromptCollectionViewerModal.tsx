import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Copy, CopyPlus, Download, Eye, EyeOff, FileText, FolderInput, FolderOpen, FolderPlus, History, Image as ImageIcon, Images, LayoutGrid, List, Loader2, Maximize2, MoreVertical, Pencil, Plus, SendToBack, Square, StickyNote, Trash2, Volume2, X } from 'lucide-react';
import type { ItemWithCurrentRevision, Project, ProjectCollection, Revision } from '../../types';
import { api } from '../../services/api';
import type { ConfirmConfig } from '../../hooks/useModalDialogs';
import { createBrowserTtsController } from '../chat/browserTts';
import { buildPromptThumbnailBlurAiParameters, getPromptThumbnailBlurClass, isPromptThumbnailBlurEnabled, toPromptDraft } from './utils';
import { ProjectCollectionModal } from '../project/ProjectCollectionModal';
import { GenerationDataModal } from '../item/GenerationDataModal';

type PromptCollectionViewMode = 'grid' | 'gallery' | 'list';

const MAX_PROMPT_COPY_TITLE_LENGTH = 160;

const buildQueuePromptDuplicateTitle = (title?: string, collectionName?: string | null) => {
  const baseTitle = String(title || '').trim() || 'Untitled Prompt';
  const scope = String(collectionName || '').trim() || 'Queue Prompt Collection';
  const suffix = ` - ${scope}`;
  const prefix = 'Copy ';
  const allowedBaseLength = Math.max(1, MAX_PROMPT_COPY_TITLE_LENGTH - prefix.length - suffix.length);
  const trimmedBase = baseTitle.slice(0, allowedBaseLength).trim() || 'Untitled Prompt';
  return `${prefix}${trimmedBase}${suffix}`;
};

interface PromptCollectionViewerModalProps {
  project: Project | null;
  collection?: ProjectCollection | null;
  isOpen: boolean;
  onClose: () => void;
  onArchiveProject: (projectId: string) => Promise<boolean> | boolean;
  onArchiveQueueCollection?: (collectionId: string) => Promise<boolean> | boolean;
  onProjectRenamed?: (project: Project) => void;
  onQueueCollectionRenamed?: (collection: ProjectCollection) => void;
  confirm: (config: ConfirmConfig) => Promise<boolean>;
}

export const PromptCollectionViewerModal: React.FC<PromptCollectionViewerModalProps> = ({
  project,
  collection = null,
  isOpen,
  onClose,
  onArchiveProject,
  onArchiveQueueCollection,
  onProjectRenamed,
  onQueueCollectionRenamed,
  confirm
}) => {
  const [items, setItems] = useState<ItemWithCurrentRevision[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [duplicatingItemId, setDuplicatingItemId] = useState<string | null>(null);
  const [copiedDetailKey, setCopiedDetailKey] = useState<string | null>(null);
  const [hasCopiedCollectionJson, setHasCopiedCollectionJson] = useState(false);
  const [viewMode, setViewMode] = useState<PromptCollectionViewMode>('grid');
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [availableTargetCollections, setAvailableTargetCollections] = useState<ProjectCollection[]>([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [selectedTargetProjectId, setSelectedTargetProjectId] = useState('');
  const [selectedTargetCollectionId, setSelectedTargetCollectionId] = useState('');
  const [moveScope, setMoveScope] = useState<'selected' | 'all'>('selected');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [isMovingItemToCompleteId, setIsMovingItemToCompleteId] = useState<string | null>(null);
  const [isBulkCompleting, setIsBulkCompleting] = useState(false);
  const [isPromptTextModalOpen, setIsPromptTextModalOpen] = useState(false);
  const [promptTextToApply, setPromptTextToApply] = useState('');
  const [promptTextPlacement, setPromptTextPlacement] = useState<'append' | 'prepend'>('append');
  const [isApplyingPromptText, setIsApplyingPromptText] = useState(false);
  const [isLoadingTargetCollections, setIsLoadingTargetCollections] = useState(false);
  const [isQueueingToPromptManager, setIsQueueingToPromptManager] = useState(false);
  const [isQueueingToBulkStudio, setIsQueueingToBulkStudio] = useState(false);
  const [isMovingAllToStaging, setIsMovingAllToStaging] = useState(false);
  const [isBlurringAll, setIsBlurringAll] = useState(false);
  const [isBlurringItemId, setIsBlurringItemId] = useState<string | null>(null);
  const [isMovingCollectionToQueueAsset, setIsMovingCollectionToQueueAsset] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isRenamingCollection, setIsRenamingCollection] = useState(false);
  const [isUpdatingCollectionThumbnail, setIsUpdatingCollectionThumbnail] = useState(false);
  const [isReplacingPreview, setIsReplacingPreview] = useState(false);
  const [isPreviewDragActive, setIsPreviewDragActive] = useState(false);
  const [selectedItemRevisions, setSelectedItemRevisions] = useState<Revision[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
  const [updatedSampleItemId, setUpdatedSampleItemId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'prompt' | 'raw' | 'note' | 'label' | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [editingRawValue, setEditingRawValue] = useState('');
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const [isSavingField, setIsSavingField] = useState<'prompt' | 'raw' | 'note' | 'label' | null>(null);
  const [queueState, setQueueState] = useState<'waiting' | 'pending' | 'done'>('waiting');
  const [queueLetter, setQueueLetter] = useState('A-Z');
  const [queueNumber, setQueueNumber] = useState('0-9');
  const [isSavingQueueMeta, setIsSavingQueueMeta] = useState(false);
  const [isGenerationDataOpen, setIsGenerationDataOpen] = useState(false);
  const [isReadAloudSupported, setIsReadAloudSupported] = useState(false);
  const [activeReadAloudKey, setActiveReadAloudKey] = useState<string | null>(null);
  const [readAloudState, setReadAloudState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [globalReadAloudDefault, setGlobalReadAloudDefault] = useState<{ voiceURI: string; voiceName: string }>({
    voiceURI: '',
    voiceName: ''
  });
  const ttsControllerRef = useRef<ReturnType<typeof createBrowserTtsController> | null>(null);
  const previewFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewDragCounterRef = useRef(0);
  const collectionActionsRef = useRef<HTMLDivElement | null>(null);

  const stopReadAloud = useCallback(() => {
    ttsControllerRef.current?.stop();
    setActiveReadAloudKey(null);
    setReadAloudState('idle');
  }, []);

  const isAssetIngestionProject = project?.systemKey === 'asset-ingestion' || project?.name === 'Asset Ingestion';
  const isQueueCollectionMode = Boolean(collection?.id && isAssetIngestionProject);
  const [isCollectionActionsOpen, setIsCollectionActionsOpen] = useState(false);
  const [projectNameOverride, setProjectNameOverride] = useState<string | null>(null);
  const [collectionNameOverride, setCollectionNameOverride] = useState<string | null>(null);
  const [collectionThumbnailItemIdOverride, setCollectionThumbnailItemIdOverride] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setProjectNameOverride(null);
    setCollectionNameOverride(null);
    setCollectionThumbnailItemIdOverride(undefined);
    setIsCollectionActionsOpen(false);
    setIsRenameModalOpen(false);
    setIsRenamingCollection(false);
    setIsUpdatingCollectionThumbnail(false);
    setIsReplacingPreview(false);
    setIsPreviewDragActive(false);
    setPreviewRefreshNonce(0);
    setUpdatedSampleItemId(null);
  }, [project?.id, collection?.id, isOpen]);

  useEffect(() => {
    if (!isCollectionActionsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!collectionActionsRef.current?.contains(event.target as Node)) {
        setIsCollectionActionsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCollectionActionsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCollectionActionsOpen]);

  const runCollectionAction = (action: () => Promise<boolean> | boolean | Promise<void> | void) => {
    setIsCollectionActionsOpen(false);
    void action();
  };

  useEffect(() => {
    const controller = createBrowserTtsController();
    ttsControllerRef.current = controller;
    setIsReadAloudSupported(controller.isSupported());
    return () => {
      controller.destroy();
      ttsControllerRef.current = null;
      setIsReadAloudSupported(false);
      setActiveReadAloudKey(null);
      setReadAloudState('idle');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDefaultVoice = async () => {
      try {
        const settings = await api.settings.get();
        if (cancelled) return;
        setGlobalReadAloudDefault({
          voiceURI: String(settings?.defaultReadAloudVoiceURI || '').trim(),
          voiceName: String(settings?.defaultReadAloudVoiceName || '').trim()
        });
      } catch {}
    };
    const onSettingsUpdated = () => {
      void loadDefaultVoice();
    };
    void loadDefaultVoice();
    window.addEventListener('settings-updated', onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('settings-updated', onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !project?.id) {
      setItems([]);
      setSelectedItemId(null);
      setSelectedItemIds(new Set());
      setIsLoading(false);
      stopReadAloud();
      return;
    }

    let cancelled = false;
    const loadItems = async () => {
      setIsLoading(true);
      try {
        const rows = await api.items.list(project.id);
        if (cancelled) return;
        const filtered = collection?.id
          ? rows.filter((item) => item.collectionId === collection.id)
          : rows;
        const sorted = [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setItems(sorted);
        setSelectedItemId((current) => (
          current && sorted.some((item) => item.id === current) ? current : (sorted[0]?.id || null)
        ));
        setSelectedItemIds((current) => new Set([...current].filter((id) => sorted.some((item) => item.id === id))));
      } catch {
        if (cancelled) return;
        setItems([]);
        setSelectedItemId(null);
        setSelectedItemIds(new Set());
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadItems();

    const handleProjectItemsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId?: string }>;
      if (customEvent.detail?.projectId !== project.id) return;
      void loadItems();
    };

    window.addEventListener('project-items-updated', handleProjectItemsUpdated as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('project-items-updated', handleProjectItemsUpdated as EventListener);
    };
  }, [collection?.id, isOpen, project?.id, stopReadAloud]);

  useEffect(() => {
    stopReadAloud();
  }, [selectedItemId, stopReadAloud]);

  const selectedCurrentRevisionId = useMemo(
    () => items.find((item) => item.id === selectedItemId)?.currentRevisionId || '',
    [items, selectedItemId]
  );

  useEffect(() => {
    if (!isOpen || !selectedItemId) {
      setSelectedItemRevisions([]);
      setIsLoadingRevisions(false);
      return;
    }

    let cancelled = false;
    const loadRevisions = async () => {
      setIsLoadingRevisions(true);
      try {
        const rows = await api.revisions.list(selectedItemId);
        if (!cancelled) setSelectedItemRevisions(rows);
      } catch {
        if (!cancelled) setSelectedItemRevisions([]);
      } finally {
        if (!cancelled) setIsLoadingRevisions(false);
      }
    };

    void loadRevisions();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedItemId, selectedCurrentRevisionId]);

  useEffect(() => {
    if (!isOpen || !project?.id) {
      setAvailableProjects([]);
      setAvailableTargetCollections([]);
      setSelectedTargetProjectId('');
      setSelectedTargetCollectionId('');
      setIsMoveModalOpen(false);
      setIsQueueModalOpen(false);
      setIsBulkMoving(false);
      setIsPromptTextModalOpen(false);
      setPromptTextToApply('');
      setPromptTextPlacement('append');
      setIsApplyingPromptText(false);
      setIsLoadingTargetCollections(false);
      setIsQueueingToPromptManager(false);
      setIsQueueingToBulkStudio(false);
      return;
    }

    let cancelled = false;
    const loadProjects = async () => {
      try {
        const rows = await api.projects.list();
        if (cancelled) return;
        const promptProjects = rows.filter((entry) => (
          entry.projectType === 'prompt'
          || entry.systemKey === 'asset-ingestion'
          || entry.name === 'Asset Ingestion'
        ) && !entry.isArchived);
        setAvailableProjects(promptProjects);
        setSelectedTargetProjectId((current) => (
          current && promptProjects.some((entry) => entry.id === current)
            ? current
            : (promptProjects.find((entry) => entry.id === project.id)?.id || promptProjects[0]?.id || '')
        ));
      } catch {
        if (cancelled) return;
        setAvailableProjects([]);
        setSelectedTargetProjectId('');
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [isOpen, project?.id]);

  useEffect(() => {
    if (!isOpen || !selectedTargetProjectId) {
      setAvailableTargetCollections([]);
      setSelectedTargetCollectionId('');
      setIsLoadingTargetCollections(false);
      return;
    }

    let cancelled = false;
    const loadCollections = async () => {
      setIsLoadingTargetCollections(true);
      try {
        const rows = await api.collections.list(selectedTargetProjectId);
        if (cancelled) return;
        setAvailableTargetCollections(rows);
        setSelectedTargetCollectionId((current) => (
          current && rows.some((entry) => entry.id === current)
            ? current
            : ''
        ));
      } catch {
        if (cancelled) return;
        setAvailableTargetCollections([]);
        setSelectedTargetCollectionId('');
      } finally {
        if (!cancelled) setIsLoadingTargetCollections(false);
      }
    };

    void loadCollections();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedTargetProjectId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId]
  );
  const previewItem = useMemo(
    () => items.find((item) => item.id === previewItemId) || null,
    [items, previewItemId]
  );
  const allItemsSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedItemIds.has(item.id)),
    [items, selectedItemIds]
  );
  const selectedItemIndex = useMemo(
    () => items.findIndex((item) => item.id === selectedItemId),
    [items, selectedItemId]
  );
  const canNavigateToPreviousItem = selectedItemIndex > 0;
  const canNavigateToNextItem = selectedItemIndex >= 0 && selectedItemIndex < items.length - 1;

  const resolvePreview = (item: ItemWithCurrentRevision | null | undefined) => {
    const revision = item?.currentRevision;
    if (!revision) return { url: '', mimeType: '' };

    const candidates: string[] = [];
    if (revision.fileUrl) candidates.push(revision.fileUrl);
    try {
      if (revision.aiParameters) {
        const parsed = JSON.parse(revision.aiParameters);
        const adv = parsed?.advanced_params || parsed || {};
        if (typeof adv.previewImageUrl === 'string' && adv.previewImageUrl.trim()) {
          candidates.push(adv.previewImageUrl.trim());
        }
        if (typeof adv.parentItemThumbnail === 'string' && adv.parentItemThumbnail.trim()) {
          candidates.push(adv.parentItemThumbnail.trim());
        }
        if (revision.thumbnailLink) candidates.push(revision.thumbnailLink);
        const url = candidates.find(Boolean) || '';
        const mimeType = typeof adv.previewMimeType === 'string' && adv.previewMimeType.trim()
          ? adv.previewMimeType.trim()
          : (revision.mimeType || '');
        return { url, mimeType };
      }
    } catch {}
    if (revision.thumbnailLink) candidates.push(revision.thumbnailLink);
    return { url: candidates.find(Boolean) || '', mimeType: revision.mimeType || '' };
  };

  const previewableItems = useMemo(
    () => items.filter((item) => Boolean(resolvePreview(item).url)),
    [items]
  );
  const previewItemIndex = previewableItems.findIndex((item) => item.id === previewItemId);
  const navigatePromptCollectionPreview = (direction: 'previous' | 'next') => {
    if (previewableItems.length === 0) return;
    const currentIndex = previewItemIndex >= 0 ? previewItemIndex : 0;
    const nextIndex = direction === 'previous'
      ? (currentIndex - 1 + previewableItems.length) % previewableItems.length
      : (currentIndex + 1) % previewableItems.length;
    setPreviewItemId(previewableItems[nextIndex]?.id || null);
  };

  const resolveAdvancedParams = (item: ItemWithCurrentRevision | null | undefined) => {
    const raw = item?.currentRevision?.aiParameters;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed?.advanced_params || parsed || {};
    } catch {
      return {};
    }
  };

  const isThumbnailBlurEnabled = (item: ItemWithCurrentRevision | null | undefined) => {
    return isPromptThumbnailBlurEnabled(item);
  };

  const isRevisionThumbnailBlurEnabled = (revision: Revision | null | undefined) => {
    return isPromptThumbnailBlurEnabled(revision);
  };

  const resolveRevisionAdvancedParams = (revision: Revision | null | undefined) => {
    const raw = revision?.aiParameters;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed?.advanced_params || parsed || {};
    } catch {
      return {};
    }
  };

  const getRevisionRawPrompt = (revision: Revision | null | undefined) => {
    const advancedParams = resolveRevisionAdvancedParams(revision) as Record<string, unknown>;
    return typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : '';
  };

  const hasPromptCollectionRevisionDelta = (current: Revision | null | undefined, candidate: Revision | null | undefined) => {
    if (!current || !candidate || current.id === candidate.id) return false;
    return String(current.title || '') !== String(candidate.title || '')
      || String(current.prompt || '') !== String(candidate.prompt || '')
      || String(getRevisionRawPrompt(current) || '') !== String(getRevisionRawPrompt(candidate) || '')
      || String(current.label || '') !== String(candidate.label || '')
      || String(current.tags || '') !== String(candidate.tags || '')
      || String(current.note || '') !== String(candidate.note || '');
  };

  const buildAiParameters = (
    item: ItemWithCurrentRevision | null | undefined,
    advancedParamUpdates: Record<string, unknown>
  ) => {
    const raw = item?.currentRevision?.aiParameters;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      parsed = {};
    }

    return JSON.stringify({
      ...parsed,
      advanced_params: {
        ...(parsed.advanced_params && typeof parsed.advanced_params === 'object' ? parsed.advanced_params as Record<string, unknown> : {}),
        ...advancedParamUpdates
      }
    }, null, 2);
  };

  const buildAiParametersWithThumbnailBlur = (
    item: ItemWithCurrentRevision | null | undefined,
    enabled: boolean
  ) => {
    return buildPromptThumbnailBlurAiParameters(item?.currentRevision?.aiParameters, enabled);
  };

  useEffect(() => {
    const revision = selectedItem?.currentRevision;
    const advancedParams = resolveAdvancedParams(selectedItem) as Record<string, unknown>;
    setIsGenerationDataOpen(false);
    setEditingField(null);
    setEditingPromptValue(revision?.prompt || '');
    setEditingRawValue(typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : '');
    setEditingNoteValue(revision?.note || '');
    setEditingLabelValue(revision?.label || '');
    setQueueState(
      String(advancedParams.ingestionState || 'waiting').toLowerCase() === 'pending'
        ? 'pending'
        : String(advancedParams.ingestionState || 'waiting').toLowerCase() === 'done'
          ? 'done'
          : 'waiting'
    );
    setQueueLetter((() => {
      const value = String(advancedParams.queueLetter || 'A-Z').trim().toUpperCase();
      return value === 'A-Z' || /^[A-Z]$/.test(value) ? value : 'A-Z';
    })());
    setQueueNumber((() => {
      const value = String(advancedParams.queueNumber || '0-9').trim();
      return value === '0-9' || /^[0-9]$/.test(value) ? value : '0-9';
    })());
    setIsSavingField(null);
    setIsSavingQueueMeta(false);
  }, [selectedItem]);

  const selectedItemAiParameters = selectedItem?.currentRevision?.aiParameters || '';
  const selectedItemParsedAiParameters = useMemo(() => {
    if (!selectedItemAiParameters) return { parsed: null, parseError: null as string | null };
    try {
      return { parsed: JSON.parse(selectedItemAiParameters), parseError: null as string | null };
    } catch (error) {
      return {
        parsed: null,
        parseError: error instanceof Error ? error.message : 'Invalid JSON'
      };
    }
  }, [selectedItemAiParameters]);

  const selectedItemRawDataEnvelope = useMemo(() => {
    const revision = selectedItem?.currentRevision;
    return JSON.stringify({
      envelope: 'aimana.revision.raw.v1',
      context: {
        source: isQueueCollectionMode ? 'queue-prompt-collection' : 'prompt-collection',
        projectId: project?.id || null,
        projectName: project?.name || null,
        collectionId: collection?.id || null,
        collectionName: collection?.name || null
      },
      item: selectedItem ? {
        id: selectedItem.id,
        projectId: selectedItem.projectId,
        collectionId: selectedItem.collectionId || null,
        currentRevisionId: selectedItem.currentRevisionId,
        createdAt: selectedItem.createdAt,
        updatedAt: selectedItem.updatedAt
      } : null,
      revision: revision ? {
        id: revision.id,
        itemId: revision.itemId,
        versionNumber: revision.versionNumber,
        storage: revision.storage,
        mimeType: revision.mimeType,
        size: revision.size,
        originalFilename: revision.originalFilename,
        remoteId: revision.remoteId || null,
        fileUrl: revision.fileUrl || null,
        thumbnailLink: revision.thumbnailLink || null,
        webViewLink: revision.webViewLink || null,
        webContentLink: revision.webContentLink || null,
        createdAt: revision.createdAt,
        isArchived: !!revision.isArchived,
        secondaryFiles: revision.secondaryFiles || []
      } : null,
      manifest: {
        title: revision?.title || '',
        label: revision?.label || '',
        tags: revision?.tags || '',
        prompt: revision?.prompt || '',
        engine: revision?.engine || '',
        note: revision?.note || '',
        originalFilename: revision?.originalFilename || ''
      },
      neural: {
        aiParametersRaw: selectedItemAiParameters,
        aiParametersParsed: selectedItemParsedAiParameters.parsed,
        aiParametersParseError: selectedItemParsedAiParameters.parseError
      }
    }, null, 2);
  }, [
    collection?.id,
    collection?.name,
    isQueueCollectionMode,
    project?.id,
    project?.name,
    selectedItem,
    selectedItemAiParameters,
    selectedItemParsedAiParameters
  ]);

  const resolveEngineDisplayLabel = (item: ItemWithCurrentRevision | null | undefined) => {
    const revision = item?.currentRevision;
    const engine = String(revision?.engine || '').trim();
    const advancedParams = resolveAdvancedParams(item) as Record<string, unknown>;
    const source = String(advancedParams.promptSource || advancedParams.source || '').trim().toLowerCase();

    if (!engine) return 'Prompt';
    if (engine === 'gemini-2.5-flash' || engine === 'gemini-2.5-flash-lite') {
      return source === 'json' ? 'Imported Prompt' : 'Prompt';
    }
    if (engine === 'gemini-2.5-flash-image') return 'Image Prompt';
    if (engine === 'gemini-3.1-flash-image-preview') return 'Grounded Image Prompt';
    if (engine === 'gemini-2.5-flash-preview-tts') return 'Speech Prompt';

    return engine
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const queueStatusBadge = useMemo(() => {
    if (!isQueueCollectionMode || !selectedItem) return null;

    if (queueState === 'pending') {
      return {
        label: 'Pending',
        className: 'border-amber-500/25 bg-amber-500/10 text-amber-200'
      };
    }
    if (queueState === 'done') {
      return {
        label: 'Done',
        className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
      };
    }

    return {
      label: 'Waiting',
      className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
    };
  }, [isQueueCollectionMode, queueState, selectedItem]);

  const handleArchive = async () => {
    if (!project?.id) return;
    setIsArchiving(true);
    try {
      const archived = await onArchiveProject(project.id);
      if (archived) onClose();
    } finally {
      setIsArchiving(false);
    }
  };

  const handleCopyPrompt = async (item: ItemWithCurrentRevision) => {
    const prompt = item.currentRevision?.prompt || '';
    if (!prompt.trim()) return;
    await navigator.clipboard.writeText(prompt);
    setCopiedItemId(item.id);
    window.setTimeout(() => {
      setCopiedItemId((current) => current === item.id ? null : current);
    }, 1800);
  };

  const handleReadAloudToggle = useCallback((key: string, text: string) => {
    const value = String(text || '').trim();
    if (!value) return;
    const tts = ttsControllerRef.current;
    if (!tts || !tts.isSupported()) return;

    const currentState = tts.getState();
    if (activeReadAloudKey === key && currentState === 'playing') {
      tts.pause();
      setReadAloudState('paused');
      return;
    }
    if (activeReadAloudKey === key && currentState === 'paused') {
      tts.resume();
      setReadAloudState('playing');
      return;
    }

    const preferredVoiceURI = String(globalReadAloudDefault.voiceURI || '').trim();
    const preferredVoiceName = String(globalReadAloudDefault.voiceName || '').trim();
    const matchedVoice = preferredVoiceURI
      ? tts.getVoices().find((voice) => String(voice?.voiceURI || '').trim() === preferredVoiceURI)
      : null;

    setActiveReadAloudKey(key);
    const started = tts.speak(value, {
      voiceURI: preferredVoiceURI || undefined,
      voiceName: preferredVoiceName || String(matchedVoice?.name || '').trim() || undefined,
      onStart: () => {
        setActiveReadAloudKey(key);
        setReadAloudState('playing');
      },
      onPause: () => {
        setActiveReadAloudKey(key);
        setReadAloudState('paused');
      },
      onResume: () => {
        setActiveReadAloudKey(key);
        setReadAloudState('playing');
      },
      onEnd: () => {
        setActiveReadAloudKey((current) => (current === key ? null : current));
        setReadAloudState('idle');
      },
      onError: () => {
        setActiveReadAloudKey((current) => (current === key ? null : current));
        setReadAloudState('idle');
      }
    });

    if (!started) {
      setActiveReadAloudKey(null);
      setReadAloudState('idle');
    }
  }, [activeReadAloudKey, globalReadAloudDefault.voiceName, globalReadAloudDefault.voiceURI]);

  const toggleBulkSelection = (itemId: string) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedItemIds((current) => {
      if (items.length > 0 && items.every((item) => current.has(item.id))) {
        return new Set();
      }
      return new Set(items.map((item) => item.id));
    });
  };

  const startEditingField = (field: 'prompt' | 'raw' | 'note' | 'label') => {
    const revision = selectedItem?.currentRevision;
    const advancedParams = resolveAdvancedParams(selectedItem) as Record<string, unknown>;
    if (field === 'prompt') {
      setEditingPromptValue(revision?.prompt || '');
    } else if (field === 'raw') {
      setEditingRawValue(typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : '');
    } else if (field === 'note') {
      setEditingNoteValue(revision?.note || '');
    } else {
      setEditingLabelValue(revision?.label || '');
    }
    setEditingField(field);
  };

  const cancelEditingField = () => {
    const revision = selectedItem?.currentRevision;
    const advancedParams = resolveAdvancedParams(selectedItem) as Record<string, unknown>;
    setEditingPromptValue(revision?.prompt || '');
    setEditingRawValue(typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : '');
    setEditingNoteValue(revision?.note || '');
    setEditingLabelValue(revision?.label || '');
    setEditingField(null);
    setIsSavingField(null);
  };

  const mergeSelectedRevisionHistory = (nextEntries: Array<Revision | null | undefined>) => {
    setSelectedItemRevisions((previous) => {
      const merged: Revision[] = [];
      const seen = new Set<string>();
      [...nextEntries, ...previous].forEach((entry) => {
        if (!entry?.id || seen.has(entry.id)) return;
        seen.add(entry.id);
        merged.push(entry);
      });
      return merged;
    });
  };

  const applyNewCurrentRevision = (itemId: string, revision: Revision, previousRevision?: Revision | null) => {
    setItems((previous) => previous.map((item) => (
      item.id === itemId
        ? {
            ...item,
            currentRevisionId: revision.id,
            currentRevision: revision,
            updatedAt: Date.now()
          }
        : item
    )));
    mergeSelectedRevisionHistory([revision, previousRevision]);
    window.dispatchEvent(new CustomEvent('project-items-updated', {
      detail: { projectId: project?.id, reason: 'prompt-collection-revision-created' }
    }));
  };

  const handleSaveField = async (field: 'prompt' | 'raw' | 'note' | 'label') => {
    const revision = selectedItem?.currentRevision;
    if (!selectedItem || !revision?.id) return;

    setIsSavingField(field);
    try {
      let nextRevision: Revision | null = null;
      if (field === 'prompt') {
        const nextPrompt = editingPromptValue;
        if (nextPrompt === (revision.prompt || '')) {
          setEditingField(null);
          return;
        }
        nextRevision = await api.revisions.addMetadataRevision(selectedItem.id, { prompt: nextPrompt });
      } else if (field === 'raw') {
        const serialized = buildAiParameters(selectedItem, { rawPrompt: editingRawValue });
        if (serialized === (revision.aiParameters || '')) {
          setEditingField(null);
          return;
        }
        nextRevision = await api.revisions.addMetadataRevision(selectedItem.id, { aiParameters: serialized });
      } else if (field === 'note') {
        const nextNote = editingNoteValue;
        if (nextNote === (revision.note || '')) {
          setEditingField(null);
          return;
        }
        nextRevision = await api.revisions.addMetadataRevision(selectedItem.id, { note: nextNote });
      } else {
        const nextLabel = editingLabelValue.trim();
        if (nextLabel === (revision.label || '')) {
          setEditingField(null);
          return;
        }
        nextRevision = await api.revisions.addMetadataRevision(selectedItem.id, { label: nextLabel });
      }

      if (nextRevision) applyNewCurrentRevision(selectedItem.id, nextRevision, revision);
      setEditingField(null);
      const fieldLabel = field === 'prompt'
        ? 'Prompt'
        : field === 'raw'
          ? 'Raw prompt'
          : field === 'note'
            ? 'Notes'
            : 'Label';
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `${fieldLabel} updated.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Failed to update ${field === 'prompt' ? 'prompt' : field === 'raw' ? 'raw prompt' : field === 'note' ? 'notes' : 'label'}.`,
          type: 'error'
        }
      }));
    } finally {
      setIsSavingField(null);
    }
  };

  const handleRestoreCollectionRevision = async (revision: Revision) => {
    if (!selectedItem?.id || !project?.id) return;
    try {
      await api.items.restore(selectedItem.id, revision.id);
      const refreshed = await api.items.get(selectedItem.id);
      if (refreshed?.currentRevision) {
        setItems((previous) => previous.map((item) => (
          item.id === selectedItem.id
            ? { ...item, currentRevisionId: revision.id, currentRevision: refreshed.currentRevision, updatedAt: Date.now() }
            : item
        )));
        setSelectedItemRevisions((previous) => previous.map((entry) => (
          entry.id === revision.id ? refreshed.currentRevision! : entry
        )));
      }
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: project.id, reason: 'prompt-collection-revision-restored' }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Restored revision v${revision.versionNumber}.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to restore revision.',
          type: 'error'
        }
      }));
    }
  };

  const buildPromptWithAddedText = (prompt: string, textToAdd: string, placement: 'append' | 'prepend') => {
    const base = String(prompt || '');
    const addition = textToAdd.trim();
    if (!addition) return base;
    if (!base.trim()) return addition;
    return placement === 'prepend'
      ? `${addition}\n${base.trimStart()}`
      : `${base.trimEnd()}\n${addition}`;
  };

  const handleApplyTextToCollectionPrompts = async () => {
    if (!isQueueCollectionMode || items.length === 0 || isApplyingPromptText) return;
    const addition = promptTextToApply.trim();
    if (!addition) return;

    setIsApplyingPromptText(true);
    try {
      const targets = items.filter((item) => item.currentRevision?.id);
      const createdRevisions = await Promise.all(targets.map((item) => {
        const revision = item.currentRevision!;
        return api.revisions.addMetadataRevision(item.id, {
          prompt: buildPromptWithAddedText(revision.prompt || '', addition, promptTextPlacement)
        });
      }));
      const createdByItemId = new Map(createdRevisions.map((revision) => [revision.itemId, revision]));

      setItems((previous) => previous.map((item) => (
        createdByItemId.has(item.id)
          ? {
              ...item,
              currentRevisionId: createdByItemId.get(item.id)!.id,
              currentRevision: createdByItemId.get(item.id)!,
              updatedAt: Date.now()
            }
          : item
      )));
      if (selectedItem?.id && createdByItemId.has(selectedItem.id)) {
        mergeSelectedRevisionHistory([
          createdByItemId.get(selectedItem.id)!,
          selectedItem.currentRevision
        ]);
      }
      if (selectedItem?.currentRevision?.id) {
        setEditingPromptValue((current) => buildPromptWithAddedText(current, addition, promptTextPlacement));
      }
      setPromptTextToApply('');
      setPromptTextPlacement('append');
      setIsPromptTextModalOpen(false);
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: {
          projectId: project?.id,
          collectionId: collection?.id,
          reason: 'queue-collection-prompts-updated'
        }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: `${promptTextPlacement === 'prepend' ? 'Prepended' : 'Appended'} text to ${targets.length} prompt${targets.length === 1 ? '' : 's'}.`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to update collection prompts.',
          type: 'error'
        }
      }));
    } finally {
      setIsApplyingPromptText(false);
    }
  };

  const handleDuplicatePromptItem = async (item: ItemWithCurrentRevision) => {
    if (!project?.id) return;
    const revision = item.currentRevision;
    if (!revision?.prompt?.trim()) return;

    const advancedParams = resolveAdvancedParams(item) as Record<string, unknown>;
    const preview = resolvePreview(item);
    const normalizedIngestionState = String(advancedParams.ingestionState || 'waiting').toLowerCase();
    const ingestionState = ['waiting', 'pending', 'done'].includes(normalizedIngestionState)
      ? normalizedIngestionState
      : 'waiting';
    const normalizedQueueLetter = typeof advancedParams.queueLetter === 'string'
      ? advancedParams.queueLetter.trim().toUpperCase()
      : 'A-Z';
    const queueLetterValue = normalizedQueueLetter === 'A-Z' || /^[A-Z]$/.test(normalizedQueueLetter)
      ? normalizedQueueLetter
      : 'A-Z';
    const normalizedQueueNumber = typeof advancedParams.queueNumber === 'string'
      ? advancedParams.queueNumber.trim()
      : '0-9';
    const queueNumberValue = normalizedQueueNumber === '0-9' || /^[0-9]$/.test(normalizedQueueNumber)
      ? normalizedQueueNumber
      : '0-9';
    const duplicateTitle = isQueueCollectionMode
      ? buildQueuePromptDuplicateTitle(revision.title, collectionNameOverride || collection?.name)
      : (revision.title || 'Untitled Prompt');

    setDuplicatingItemId(item.id);
    try {
      const response = await api.items.createFromPrompts(
        project.id,
        revision.engine || project.defaultEngine || 'gemini-2.5-flash',
        [{
          title: duplicateTitle,
          prompt: revision.prompt || '',
          raw: typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : undefined,
          label: revision.label || undefined,
          tags: revision.tags || undefined,
          note: revision.note || undefined,
          source: String(advancedParams.promptSource || 'manual').toLowerCase() === 'json' ? 'json' : 'manual',
          previewImageUrl: preview.url || undefined,
          previewMimeType: preview.mimeType || undefined,
          ingestionState: isQueueCollectionMode ? ingestionState : undefined,
          queueLetter: isQueueCollectionMode ? queueLetterValue : undefined,
          queueNumber: isQueueCollectionMode ? queueNumberValue : undefined
        }],
        true,
        collection?.id || null,
        'suffix'
      );

      const rows = await api.items.list(project.id);
      const filtered = collection?.id
        ? rows.filter((entry) => entry.collectionId === collection.id)
        : rows;
      const sorted = [...filtered].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setItems(sorted);
      setSelectedItemId(sorted[0]?.id || null);

      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: project.id, reason: isQueueCollectionMode ? 'queue-prompt-duplicated' : 'prompt-collection-item-duplicated' }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: isQueueCollectionMode
            ? response.renamed
              ? `Duplicated "${revision.title || 'Untitled Prompt'}" as a renamed copy.`
              : `Duplicated "${revision.title || 'Untitled Prompt'}" as "${duplicateTitle}".`
            : response.renamed
              ? `Duplicated "${revision.title || 'Untitled Prompt'}" with a renamed title to avoid duplicates.`
              : `Duplicated "${revision.title || 'Untitled Prompt'}".`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: error instanceof Error && error.message ? error.message : 'Failed to duplicate prompt.',
          type: 'error'
        }
      }));
    } finally {
      setDuplicatingItemId(null);
    }
  };

  const handleRenameCollection = async (name: string) => {
    if (!project?.id) return;
    setIsRenamingCollection(true);
    try {
      const nextName = name.trim();
      if (!nextName) return;

      if (collection?.id) {
        const updated = await api.collections.update(project.id, collection.id, { name: nextName });
        setCollectionNameOverride(updated.name);
        setIsRenameModalOpen(false);
        onQueueCollectionRenamed?.(updated);
        window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated'));
        window.dispatchEvent(new CustomEvent('aimana-notification', {
          detail: {
            title: 'Queue Asset',
            message: `Renamed collection to "${updated.name}".`,
            type: 'success'
          }
        }));
        return;
      }

      const updated = await api.projects.update(project.id, { name: nextName });
      setProjectNameOverride(updated.name);
      setIsRenameModalOpen(false);
      onProjectRenamed?.(updated);
      window.dispatchEvent(new CustomEvent('aimana-prompt-projects-updated'));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Renamed collection to "${updated.name}".`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: collection?.id ? 'Queue Asset' : 'Prompt Collection',
          message: error instanceof Error && error.message ? error.message : 'Failed to rename collection.',
          type: 'error'
        }
      }));
    } finally {
      setIsRenamingCollection(false);
    }
  };

  const handleArchiveQueueCollection = async () => {
    if (!collection?.id || !onArchiveQueueCollection) return;
    setIsArchiving(true);
    try {
      const archived = await onArchiveQueueCollection(collection.id);
      if (archived) onClose();
    } finally {
      setIsArchiving(false);
    }
  };

  const handleSetCollectionThumbnail = async () => {
    if (!project?.id || !collection?.id || !selectedItem?.id) return;

    setIsUpdatingCollectionThumbnail(true);
    try {
      const updated = await api.collections.update(project.id, collection.id, { thumbnailItemId: selectedItem.id });
      setCollectionThumbnailItemIdOverride(updated.thumbnailItemId ?? selectedItem.id);
      setUpdatedSampleItemId(null);
      window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated'));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: 'Queue collection sample thumbnail updated.',
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to update queue collection sample thumbnail.',
          type: 'error'
        }
      }));
    } finally {
      setIsUpdatingCollectionThumbnail(false);
    }
  };

  const resetPreviewDragState = () => {
    previewDragCounterRef.current = 0;
    setIsPreviewDragActive(false);
  };

  const withPreviewRefresh = (url: string) => {
    if (!previewRefreshNonce || !url || url.startsWith('data:')) return url;
    return `${url}${url.includes('?') ? '&' : '?'}previewRefresh=${previewRefreshNonce}`;
  };

  const syncSelectedItemFromServer = async (itemId: string) => {
    const refreshed = await api.items.get(itemId);
    if (!refreshed) return;
    setItems((previous) => previous.map((item) => item.id === itemId ? refreshed : item));
  };

  const createFileFromDroppedUrl = async (url: string): Promise<File | null> => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;
    try {
      const response = await fetch(trimmedUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      const mimeType = blob.type || 'application/octet-stream';
      const pathname = new URL(trimmedUrl, window.location.origin).pathname;
      const filename = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || `dropped-preview-${Date.now()}`);
      return new File([blob], filename, { type: mimeType });
    } catch {
      return null;
    }
  };

  const getDroppedPreviewFile = async (dataTransfer: DataTransfer): Promise<File | null> => {
    const isPreviewFile = (file: File) => (
      file.type.startsWith('image/')
      || file.type.startsWith('video/')
      || /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov)$/i.test(file.name || '')
    );

    const directFile = Array.from(dataTransfer.files || []).find(isPreviewFile);
    if (directFile) return directFile;

    const itemFile = Array.from(dataTransfer.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .find((file): file is File => Boolean(file && isPreviewFile(file)));
    if (itemFile) return itemFile;

    const uriList = dataTransfer.getData('text/uri-list')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    const plainUrl = dataTransfer.getData('text/plain').trim();
    const downloadUrl = dataTransfer.getData('DownloadURL').split(':').slice(2).join(':').trim();
    const droppedUrl = uriList || plainUrl || downloadUrl;
    return droppedUrl ? createFileFromDroppedUrl(droppedUrl) : null;
  };

  const handleReplacePreviewWithItem = async (sourceItemId: string): Promise<boolean> => {
    if (!selectedItem?.currentRevision?.id || !selectedItem?.id) return false;
    const sourceItem = await api.items.get(sourceItemId);
    const sourceRevision = sourceItem?.currentRevision;
    const nextUrl = sourceRevision?.fileUrl || sourceRevision?.thumbnailLink || '';
    if (!sourceRevision || !nextUrl) return false;

    await api.revisions.update({
      id: selectedItem.currentRevision.id,
      fileUrl: sourceRevision.fileUrl || '',
      thumbnailLink: sourceRevision.thumbnailLink || '',
      mimeType: sourceRevision.mimeType,
      size: sourceRevision.size,
      originalFilename: sourceRevision.originalFilename || selectedItem.currentRevision.originalFilename,
      aiParameters: buildAiParameters(selectedItem, {
        previewImageUrl: nextUrl,
        parentItemThumbnail: nextUrl,
        previewMimeType: sourceRevision.mimeType || 'image/png'
      })
    });
    await syncSelectedItemFromServer(selectedItem.id);
    setPreviewRefreshNonce(Date.now());
    setUpdatedSampleItemId(selectedItem.id);
    return true;
  };

  const handleReplacePreviewWithFile = async (file: File): Promise<boolean> => {
    if (!selectedItem?.currentRevision?.id || !selectedItem?.id) return false;
    await api.revisions.replaceFile(selectedItem.currentRevision.id, file);
    await syncSelectedItemFromServer(selectedItem.id);
    setPreviewRefreshNonce(Date.now());
    setUpdatedSampleItemId(selectedItem.id);
    return true;
  };

  const handlePreviewFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsReplacingPreview(true);
      const didUpdate = await handleReplacePreviewWithFile(file);
      if (!didUpdate) return;
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: 'Preview sample updated.',
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to replace preview sample.',
          type: 'error'
        }
      }));
    } finally {
      setIsReplacingPreview(false);
      event.target.value = '';
    }
  };

  const handleSaveQueueMeta = async (overrides?: {
    queueState?: 'waiting' | 'pending' | 'done';
    queueLetter?: string;
    queueNumber?: string;
  }) => {
    const revision = selectedItem?.currentRevision;
    if (!selectedItem || !revision?.id) return;

    const nextQueueState = overrides?.queueState ?? queueState;
    const nextQueueLetter = overrides?.queueLetter ?? queueLetter;
    const nextQueueNumber = overrides?.queueNumber ?? queueNumber;

    setIsSavingQueueMeta(true);
    const serialized = buildAiParameters(selectedItem, {
      ingestionState: nextQueueState,
      queueLetter: nextQueueLetter,
      queueNumber: nextQueueNumber
    });

    try {
      if (serialized === (revision.aiParameters || '')) return;
      const nextRevision = await api.revisions.addMetadataRevision(selectedItem.id, { aiParameters: serialized });
      applyNewCurrentRevision(selectedItem.id, nextRevision, revision);
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to update queue workflow.',
          type: 'error'
        }
      }));
    } finally {
      setIsSavingQueueMeta(false);
    }
  };

  const renderReadAloudButton = (key: string, label: string, text: string) => {
    const hasText = Boolean(String(text || '').trim());
    const isActive = activeReadAloudKey === key;
    const statusLabel = isActive && readAloudState === 'paused'
      ? 'Resume Reader'
      : isActive && readAloudState === 'playing'
        ? 'Pause Reader'
        : 'Read';

    return (
      <button
        type="button"
        onClick={() => handleReadAloudToggle(key, text)}
        disabled={!isReadAloudSupported || !hasText}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
          isActive
            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
            : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:text-white'
        }`}
        title={hasText ? `Read ${label} aloud` : `No ${label.toLowerCase()} content available`}
      >
        <Volume2 size={14} />
        {statusLabel}
      </button>
    );
  };

  const buildCollectionExportJson = useCallback(() => {
    return JSON.stringify(
      items.map((item) => String(item.currentRevision?.prompt || '').trim()).filter(Boolean),
      null,
      2
    );
  }, [items]);

  const handleCopyCollectionJson = useCallback(async () => {
    if (items.length === 0) return;
    try {
      await navigator.clipboard.writeText(buildCollectionExportJson());
      setHasCopiedCollectionJson(true);
      window.setTimeout(() => {
        setHasCopiedCollectionJson(false);
      }, 1800);
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Copied ${items.length} prompt${items.length === 1 ? '' : 's'} as JSON.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to copy collection JSON.',
          type: 'error'
        }
      }));
    }
  }, [buildCollectionExportJson, items.length]);

  const handleExportCollectionJson = useCallback(() => {
    if (!project || items.length === 0 || isExportingJson) return;

    const slug = project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'prompt-collection';

    setIsExportingJson(true);
    try {
      const blob = new Blob([buildCollectionExportJson()], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${slug}-prompts.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Exported ${items.length} prompt${items.length === 1 ? '' : 's'} to JSON.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to export collection JSON.',
          type: 'error'
        }
      }));
    } finally {
      setIsExportingJson(false);
    }
  }, [buildCollectionExportJson, isExportingJson, items.length, project]);

  const notifyItemsArchived = useCallback((archivedIds: string[]) => {
    if (!project?.id || archivedIds.length === 0) return;
    window.dispatchEvent(new CustomEvent('project-items-updated', {
      detail: {
        projectId: project.id,
        reason: collection?.id ? 'queue-asset-item-archived' : 'prompt-collection-item-archived',
        itemIds: archivedIds
      }
    }));
    if (collection?.id) {
      window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
        detail: {
          projectId: project.id,
          collectionId: collection.id,
          reason: 'queue-asset-item-archived'
        }
      }));
    }
  }, [collection?.id, project?.id]);

  if (!isOpen || !project) return null;
  const viewerTitle = collection
    ? (collectionNameOverride || collection.name)
    : (projectNameOverride || project.name);
  const activeCollectionThumbnailItemId = collectionThumbnailItemIdOverride !== undefined
    ? collectionThumbnailItemIdOverride
    : collection?.thumbnailItemId;
  const viewerDescription = collection
    ? 'Queue prompt collection inside Asset Ingestion.'
    : (project.description || 'Prompt collection opened inside Prompt Manager.');

  const handleArchiveItem = async (item: ItemWithCurrentRevision) => {
    const title = item.currentRevision?.title || 'Untitled Prompt';
    const confirmed = await confirm({
      title: 'Move Prompt To Recycle Bin',
      description: `Move "${title}" to recycle bin?`,
      confirmLabel: 'Move To Recycle Bin',
      tone: 'danger'
    });
    if (!confirmed) return;

    await api.items.update({ id: item.id, isArchived: true, isPinned: false });
    setItems((previous) => {
      const next = previous.filter((entry) => entry.id !== item.id);
      setSelectedItemIds((current) => {
        const updated = new Set(current);
        updated.delete(item.id);
        return updated;
      });
      setSelectedItemId((current) => {
        if (current !== item.id) return current;
        return next[0]?.id || null;
      });
      return next;
    });
    notifyItemsArchived([item.id]);
    window.dispatchEvent(new CustomEvent('aimana-notification', {
      detail: {
        title: 'Prompt Collection',
        message: `Moved "${title}" to recycle bin.`,
        type: 'success'
      }
    }));
  };

  const handleBulkArchiveItems = async () => {
    const targets = items.filter((item) => selectedItemIds.has(item.id));
    if (targets.length === 0) return;

    const confirmed = await confirm({
      title: 'Move Selected Prompts To Recycle Bin',
      description: `Move ${targets.length} selected prompt${targets.length === 1 ? '' : 's'} to Neural Recycle Bin?`,
      confirmLabel: 'Move To Recycle Bin',
      tone: 'danger'
    });
    if (!confirmed) return;

    setIsBulkArchiving(true);
    try {
      await Promise.all(targets.map((item) => api.items.update({ id: item.id, isArchived: true, isPinned: false })));
      const removedIds = new Set(targets.map((item) => item.id));
      setItems((previous) => {
        const next = previous.filter((entry) => !removedIds.has(entry.id));
        setSelectedItemId((current) => {
          if (current && !removedIds.has(current)) return current;
          return next[0]?.id || null;
        });
        return next;
      });
      setSelectedItemIds(new Set());
      notifyItemsArchived(Array.from(removedIds));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Moved ${targets.length} prompt${targets.length === 1 ? '' : 's'} to recycle bin.`,
          type: 'success'
        }
      }));
    } finally {
      setIsBulkArchiving(false);
    }
  };

  const openMoveModal = (scope: 'selected' | 'all') => {
    setMoveScope(scope);
    if (scope === 'all') {
      setSelectedTargetCollectionId('');
    }
    setIsMoveModalOpen(true);
  };

  const handleBulkMoveItems = async () => {
    const targets = moveScope === 'all'
      ? items
      : items.filter((item) => selectedItemIds.has(item.id));
    if (!selectedTargetProjectId || targets.length === 0) return;

    const targetProject = availableProjects.find((entry) => entry.id === selectedTargetProjectId);
    const targetCollection = availableTargetCollections.find((entry) => entry.id === selectedTargetCollectionId);
    if (moveScope === 'all') {
      const destination = targetCollection
        ? `${targetProject?.name || 'the selected project'} / ${targetCollection.name}`
        : `${targetProject?.name || 'the selected project'}${targetProject?.systemKey === 'asset-ingestion' || targetProject?.name === 'Asset Ingestion' ? ' as a collection' : ' project root'}`;
      const confirmed = await confirm({
        title: 'Move All Prompts',
        description: `Move all ${targets.length} prompt${targets.length === 1 ? '' : 's'} from "${viewerTitle}" to ${destination}?`,
        confirmLabel: 'Yes, Move All'
      });
      if (!confirmed) return;
    }

    setIsBulkMoving(true);
    try {
      const targetIsAssetIngestion = targetProject?.systemKey === 'asset-ingestion' || targetProject?.name === 'Asset Ingestion';
      let movedCollectionName = '';

      if (moveScope === 'all' && targetIsAssetIngestion && !selectedTargetCollectionId) {
        if (collection?.id) {
          const movedCollection = await api.collections.update(project.id, collection.id, {
            projectId: selectedTargetProjectId,
            isArchived: false
          });
          movedCollectionName = movedCollection.name;
        } else {
          const targetCollections = await api.collections.list(selectedTargetProjectId);
          const existingNames = new Set(targetCollections.map((entry) => entry.name.trim().toLowerCase()));
          const baseName = viewerTitle.trim() || 'Prompt Collection';
          let nextName = baseName;
          let suffix = 2;
          while (existingNames.has(nextName.trim().toLowerCase())) {
            nextName = `${baseName} ${suffix}`;
            suffix += 1;
          }
          const movedCollection = await api.collections.create(selectedTargetProjectId, { name: nextName });
          movedCollectionName = movedCollection.name;
          await Promise.all(targets.map((item) => api.items.update({
            id: item.id,
            projectId: selectedTargetProjectId,
            collectionId: movedCollection.id,
            isArchived: false
          })));
        }
      } else {
        await Promise.all(targets.map((item) => api.items.update({
          id: item.id,
          projectId: selectedTargetProjectId,
          collectionId: selectedTargetCollectionId || null,
          isArchived: false
        })));
      }

      const removedIds = new Set(targets.map((item) => item.id));
      setItems((previous) => {
        const next = previous.filter((entry) => !removedIds.has(entry.id));
        setSelectedItemId((current) => {
          if (current && !removedIds.has(current)) return current;
          return next[0]?.id || null;
        });
        return next;
      });
      setSelectedItemIds(new Set());
      setIsMoveModalOpen(false);

      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: project.id, reason: 'prompt-collection-bulk-move-out' }
      }));
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: selectedTargetProjectId, reason: 'prompt-collection-bulk-move-in' }
      }));
      if (targetIsAssetIngestion) {
        window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
          detail: {
            projectId: selectedTargetProjectId,
            collectionId: collection?.id || selectedTargetCollectionId || undefined,
            reason: movedCollectionName ? 'prompt-collection-moved-as-asset-ingestion-collection' : 'prompt-collection-bulk-move-in'
          }
        }));
      }

      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: movedCollectionName
            ? `Moved ${targets.length} prompt${targets.length === 1 ? '' : 's'} to Asset Ingestion collection "${movedCollectionName}".`
            : targetCollection
            ? `Moved ${targets.length} prompt${targets.length === 1 ? '' : 's'} to ${targetCollection.name}.`
            : `Moved ${targets.length} prompt${targets.length === 1 ? '' : 's'} to ${targetProject?.name || 'the selected project'}.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to move selected prompts.',
          type: 'error'
        }
      }));
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleQueueToPromptManager = async () => {
    const targets = items.filter((item) => selectedItemIds.has(item.id));
    if (targets.length === 0) return;

    setIsQueueingToPromptManager(true);
    try {
      const timestamp = Date.now();
      const nextDrafts = targets.map((item, index) => {
        const revision = item.currentRevision;
        const advancedParams = resolveAdvancedParams(item) as Record<string, unknown>;
        const draft = toPromptDraft({
          title: revision?.title || undefined,
          prompt: revision?.prompt || '',
          raw: typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : undefined,
          label: revision?.label || undefined,
          tags: revision?.tags || undefined,
          note: revision?.note || undefined,
          source: String(advancedParams.promptSource || 'manual').toLowerCase() === 'json' ? 'json' : 'manual'
        }, undefined, timestamp + index);
        const preview = resolvePreview(item);
        return {
          ...draft,
          status: 'ready' as const,
          ingestionState: 'waiting' as const,
          previewImageUrl: preview.url || undefined,
          previewMimeType: preview.mimeType || undefined,
          thumbnailBlur: isThumbnailBlurEnabled(item)
        };
      });

      await api.settings.appendPromptManagerDrafts(nextDrafts);
      window.dispatchEvent(new CustomEvent('aimana-prompt-drafts-updated'));
      setSelectedItemIds(new Set());
      setIsQueueModalOpen(false);
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Copied ${targets.length} prompt${targets.length === 1 ? '' : 's'} to Prompt Manager Queue. The original Prompt Collection item${targets.length === 1 ? ' stays' : 's stay'} unchanged.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to copy prompts to Prompt Manager Queue.',
          type: 'error'
        }
      }));
    } finally {
      setIsQueueingToPromptManager(false);
    }
  };

  const handleMoveAllToPromptStaging = async () => {
    const targets = items.filter((item) => String(item.currentRevision?.prompt || '').trim());
    if (targets.length === 0) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: 'No prompt text found in this collection.',
          type: 'error'
        }
      }));
      return;
    }

    const confirmed = await confirm({
      title: 'Move Prompts To Staging',
      description: `Create ${targets.length} new Prompt Manager staging draft${targets.length === 1 ? '' : 's'} from "${viewerTitle}"? Only prompt text will be moved; images, thumbnails, labels, notes, queue state, and item metadata will not be moved.`,
      confirmLabel: 'Move To Staging'
    });
    if (!confirmed) return;

    setIsMovingAllToStaging(true);
    try {
      const timestamp = Date.now();
      const drafts = targets.map((item, index) => (
        toPromptDraft({
          prompt: String(item.currentRevision?.prompt || '').trim(),
          source: 'manual'
        }, undefined, timestamp + index)
      ));

      await api.settings.appendPromptManagerDrafts(drafts);
      window.dispatchEvent(new CustomEvent('aimana-prompt-drafts-updated'));
      setSelectedItemIds(new Set());
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: `Moved ${drafts.length} prompt${drafts.length === 1 ? '' : 's'} to Prompt Manager staging.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: 'Failed to move prompts to Prompt Manager staging.',
          type: 'error'
        }
      }));
    } finally {
      setIsMovingAllToStaging(false);
    }
  };

  const handleMoveCollectionToQueueAsset = async () => {
    if (!project?.id || collection || isQueueCollectionMode || items.length === 0) return;

    const confirmed = await confirm({
      title: 'Copy Prompt Collection To Queue Asset',
      description: `Create a separate Queue Asset copy of "${project.name}" with all ${items.length} prompt${items.length === 1 ? '' : 's'}?`,
      confirmLabel: 'Create Copy'
    });
    if (!confirmed) return;

    setIsMovingCollectionToQueueAsset(true);
    try {
      const assetIngestionProject = await api.projects.getAssetIngestion();
      if (!assetIngestionProject?.id) {
        throw new Error('Asset Ingestion project could not be resolved.');
      }

      const existingCollections = await api.collections.list(assetIngestionProject.id);
      const trimmedProjectName = project.name.trim() || 'Prompt Collection';
      const baseCollectionName = `${trimmedProjectName} Queue Asset`;
      const existingNames = new Set(existingCollections.map((entry) => entry.name.trim().toLowerCase()));
      let targetCollectionName = baseCollectionName;
      let copyIndex = 2;
      while (existingNames.has(targetCollectionName.trim().toLowerCase())) {
        targetCollectionName = `${baseCollectionName} ${copyIndex}`;
        copyIndex += 1;
      }

      const targetCollection = await api.collections.create(assetIngestionProject.id, { name: targetCollectionName });
      const exportEngine = assetIngestionProject.defaultEngine || 'gemini-2.5-flash';
      const prompts = items.map((item) => {
        const revision = item.currentRevision;
        const advancedParams = resolveAdvancedParams(item) as Record<string, unknown>;
        const preview = resolvePreview(item);
        const normalizedIngestionState = String(advancedParams.ingestionState || 'waiting').toLowerCase();
        const ingestionState = ['waiting', 'pending', 'done'].includes(normalizedIngestionState)
          ? normalizedIngestionState
          : 'waiting';
        const normalizedQueueLetter = typeof advancedParams.queueLetter === 'string'
          ? advancedParams.queueLetter.trim().toUpperCase()
          : 'A-Z';
        const queueLetter = normalizedQueueLetter === 'A-Z' || /^[A-Z]$/.test(normalizedQueueLetter)
          ? normalizedQueueLetter
          : 'A-Z';
        const normalizedQueueNumber = typeof advancedParams.queueNumber === 'string'
          ? advancedParams.queueNumber.trim()
          : '0-9';
        const queueNumber = normalizedQueueNumber === '0-9' || /^[0-9]$/.test(normalizedQueueNumber)
          ? normalizedQueueNumber
          : '0-9';

        return {
          title: revision?.title || 'Untitled Prompt',
          prompt: revision?.prompt || '',
          raw: typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : undefined,
          label: revision?.label || undefined,
          tags: revision?.tags || undefined,
          note: revision?.note || undefined,
          source: String(advancedParams.promptSource || 'manual').toLowerCase() === 'json' ? 'json' : 'manual',
          previewImageUrl: preview.url || undefined,
          previewMimeType: preview.mimeType || undefined,
          ingestionState,
          queueLetter,
          queueNumber
        };
      });

      const response = await api.items.createFromPrompts(
        assetIngestionProject.id,
        exportEngine,
        prompts,
        true,
        targetCollection.id,
        'suffix'
      );

      setSelectedItemIds(new Set());

      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: assetIngestionProject.id, reason: 'prompt-collection-move-to-queue-asset-in' }
      }));
      window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated'));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: response.created > 0
            ? response.renamed
              ? `Created Queue Asset copy "${targetCollection.name}" from "${project.name}" while keeping the original Prompt Collection intact. ${response.renamed} title${response.renamed === 1 ? ' was' : 's were'} renamed to avoid duplicates.`
              : `Created Queue Asset copy "${targetCollection.name}" from "${project.name}" while keeping the original Prompt Collection intact.`
            : `Created Queue Asset collection "${targetCollection.name}", but all prompts were skipped as duplicates.`,
          type: response.created > 0 ? 'success' : 'info'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: error instanceof Error && error.message ? error.message : 'Failed to copy prompt collection to Queue Asset.',
          type: 'error'
        }
      }));
    } finally {
      setIsMovingCollectionToQueueAsset(false);
    }
  };

  const handleMoveItemToComplete = async (item: ItemWithCurrentRevision) => {
    if (!isQueueCollectionMode || !collection?.id) return;

    const title = item.currentRevision?.title || 'Untitled Prompt';
    const confirmed = await confirm({
      title: 'Move Prompt To Complete',
      description: `Mark "${title}" complete and keep it inside the "${viewerTitle}" Asset Ingestion collection?`,
      confirmLabel: 'Move To Complete'
    });
    if (!confirmed) return;

    setIsMovingItemToCompleteId(item.id);
    try {
      const nextRevision = await api.revisions.addMetadataRevision(item.id, {
        aiParameters: buildAiParameters(item, { ingestionState: 'done' })
      });
      applyNewCurrentRevision(item.id, nextRevision, item.currentRevision);
      setQueueState('done');
      setSelectedItemIds((current) => {
        const updated = new Set(current);
        updated.delete(item.id);
        return updated;
      });

      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: project.id, reason: 'queue-asset-item-completed', itemIds: [item.id] }
      }));
      window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
        detail: {
          projectId: project.id,
          collectionId: collection.id,
          reason: 'queue-asset-item-completed'
        }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: `Marked "${title}" complete inside "${viewerTitle}".`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to move prompt to complete.',
          type: 'error'
        }
      }));
    } finally {
      setIsMovingItemToCompleteId(null);
    }
  };

  const handleBulkMoveToComplete = async () => {
    if (!isQueueCollectionMode || !collection?.id) return;

    const targets = items.filter((item) => selectedItemIds.has(item.id));
    if (targets.length === 0) return;

    const confirmed = await confirm({
      title: 'Move Selected Prompts To Complete',
      description: `Mark ${targets.length} selected prompt${targets.length === 1 ? '' : 's'} complete and keep them inside the "${viewerTitle}" Asset Ingestion collection?`,
      confirmLabel: 'Move To Complete'
    });
    if (!confirmed) return;

    setIsBulkCompleting(true);
    try {
      const nextRevisions = await Promise.all(targets.map((item) => api.revisions.addMetadataRevision(item.id, {
        aiParameters: buildAiParameters(item, { ingestionState: 'done' })
      })));

      const completedIds = new Set(targets.map((item) => item.id));
      setItems((previous) => {
        const revisionsByItemId = new Map(nextRevisions.map((revision) => [revision.itemId, revision]));
        return previous.map((entry) => {
          const nextRevision = revisionsByItemId.get(entry.id);
          return nextRevision ? { ...entry, currentRevision: nextRevision, currentRevisionId: nextRevision.id, updatedAt: Date.now() } : entry;
        });
      });
      setSelectedItemIds(new Set());
      if (selectedItem && completedIds.has(selectedItem.id)) {
        setQueueState('done');
      }

      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: project.id, reason: 'queue-asset-item-completed', itemIds: Array.from(completedIds) }
      }));
      window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
        detail: {
          projectId: project.id,
          collectionId: collection.id,
          reason: 'queue-asset-item-completed'
        }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: `Marked ${targets.length} prompt${targets.length === 1 ? '' : 's'} complete inside "${viewerTitle}".`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to move selected prompts to complete.',
          type: 'error'
        }
      }));
    } finally {
      setIsBulkCompleting(false);
    }
  };

  const handleMoveAllToComplete = async () => {
    if (!isQueueCollectionMode || !collection?.id || items.length === 0) return;

    const confirmed = await confirm({
      title: 'Move All Prompts To Complete',
      description: `Mark all ${items.length} prompt${items.length === 1 ? '' : 's'} complete and keep them inside the "${viewerTitle}" Asset Ingestion collection?`,
      confirmLabel: 'Move All To Complete'
    });
    if (!confirmed) return;

    setIsBulkCompleting(true);
    try {
      const targets = items;
      const nextRevisions = await Promise.all(targets.map((item) => api.revisions.addMetadataRevision(item.id, {
        aiParameters: buildAiParameters(item, { ingestionState: 'done' })
      })));

      const completedIds = targets.map((item) => item.id);
      setItems((previous) => {
        const revisionsByItemId = new Map(nextRevisions.map((revision) => [revision.itemId, revision]));
        return previous.map((entry) => {
          const nextRevision = revisionsByItemId.get(entry.id);
          return nextRevision ? { ...entry, currentRevision: nextRevision, currentRevisionId: nextRevision.id, updatedAt: Date.now() } : entry;
        });
      });
      setQueueState('done');
      setSelectedItemIds(new Set());

      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: project.id, reason: 'queue-asset-all-items-completed', itemIds: completedIds }
      }));
      window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
        detail: {
          projectId: project.id,
          collectionId: collection.id,
          reason: 'queue-asset-all-items-completed'
        }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: `Marked all ${targets.length} prompt${targets.length === 1 ? '' : 's'} complete inside "${viewerTitle}".`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to move all prompts to complete.',
          type: 'error'
        }
      }));
    } finally {
      setIsBulkCompleting(false);
    }
  };

  const handleSetAllPromptImagesBlur = async (enabled: boolean) => {
    if (items.length === 0 || isBlurringAll) return;

    const targets = items.filter((item) => item.currentRevision?.id && isThumbnailBlurEnabled(item) !== enabled);
    if (targets.length === 0) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: enabled ? 'All prompt images are already blurred.' : 'All prompt images are already unblurred.',
          type: 'info'
        }
      }));
      return;
    }

    const confirmed = await confirm({
      title: enabled ? 'Blur All Prompt Images' : 'Unblur All Prompt Images',
      description: `${enabled ? 'Enable' : 'Disable'} thumbnail blur for ${targets.length} prompt image${targets.length === 1 ? '' : 's'} in "${viewerTitle}"?`,
      confirmLabel: enabled ? 'Blur All' : 'Unblur All'
    });
    if (!confirmed) return;

    setIsBlurringAll(true);
    try {
      const nextRevisions = await Promise.all(targets.map((item) => api.revisions.addMetadataRevision(item.id, {
        aiParameters: buildAiParametersWithThumbnailBlur(item, enabled)
      })));

      const revisionsByItemId = new Map(nextRevisions.map((revision) => [revision.itemId, revision]));
      setItems((previous) => previous.map((item) => {
        const nextRevision = revisionsByItemId.get(item.id);
        return nextRevision
          ? { ...item, currentRevisionId: nextRevision.id, currentRevision: nextRevision, updatedAt: Date.now() }
          : item;
      }));
      if (selectedItem?.id && revisionsByItemId.has(selectedItem.id)) {
        mergeSelectedRevisionHistory([
          revisionsByItemId.get(selectedItem.id)!,
          selectedItem.currentRevision
        ]);
      }
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: {
          projectId: project?.id,
          collectionId: collection?.id,
          reason: isQueueCollectionMode
            ? (enabled ? 'queue-prompt-collection-blurred' : 'queue-prompt-collection-unblurred')
            : (enabled ? 'prompt-collection-blurred' : 'prompt-collection-unblurred')
        }
      }));
      if (isQueueCollectionMode && collection?.id) {
        window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
          detail: {
            projectId: project?.id,
            collectionId: collection.id,
            reason: enabled ? 'queue-prompt-collection-blurred' : 'queue-prompt-collection-unblurred'
          }
        }));
      }
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: `${enabled ? 'Blurred' : 'Unblurred'} ${targets.length} prompt image${targets.length === 1 ? '' : 's'}.`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: error instanceof Error && error.message
            ? error.message
            : `Failed to ${enabled ? 'blur' : 'unblur'} prompt images.`,
          type: 'error'
        }
      }));
    } finally {
      setIsBlurringAll(false);
    }
  };

  const handleBlurAllPromptImages = () => handleSetAllPromptImagesBlur(true);
  const handleUnblurAllPromptImages = () => handleSetAllPromptImagesBlur(false);

  const handleSetPromptImageBlur = async (item: ItemWithCurrentRevision, enabled: boolean) => {
    if (!item.currentRevision?.id || isBlurringItemId) return;

    setIsBlurringItemId(item.id);
    try {
      const nextRevision = await api.revisions.addMetadataRevision(item.id, {
        aiParameters: buildAiParametersWithThumbnailBlur(item, enabled)
      });
      setItems((previous) => previous.map((entry) => (
        entry.id === item.id
          ? { ...entry, currentRevisionId: nextRevision.id, currentRevision: nextRevision, updatedAt: Date.now() }
          : entry
      )));
      if (selectedItem?.id === item.id) {
        mergeSelectedRevisionHistory([nextRevision, selectedItem.currentRevision]);
      }
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: {
          projectId: project?.id,
          collectionId: collection?.id,
          itemId: item.id,
          reason: enabled ? 'prompt-item-blurred' : 'prompt-item-unblurred'
        }
      }));
      if (isQueueCollectionMode && collection?.id) {
        window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
          detail: {
            projectId: project?.id,
            collectionId: collection.id,
            itemId: item.id,
            reason: enabled ? 'queue-prompt-item-blurred' : 'queue-prompt-item-unblurred'
          }
        }));
      }
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: enabled ? 'Prompt image blurred.' : 'Prompt image unblurred.',
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection',
          message: error instanceof Error && error.message
            ? error.message
            : `Failed to ${enabled ? 'blur' : 'unblur'} prompt image.`,
          type: 'error'
        }
      }));
    } finally {
      setIsBlurringItemId(null);
    }
  };

  const handleQueueToBulkStudio = async () => {
    const targets = items.filter((item) => selectedItemIds.has(item.id));
    if (targets.length === 0) return;

    setIsQueueingToBulkStudio(true);
    try {
      const nextTasks = targets.map((item, index) => ({
        id: `bulk-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        title: item.currentRevision?.title || undefined,
        prompt: item.currentRevision?.prompt || '',
        status: 'pending',
        progress: 0
      }));
      await api.settings.appendBulkStudioTasks(nextTasks);
      window.dispatchEvent(new CustomEvent('aimana-bulk-tasks-updated'));
      setSelectedItemIds(new Set());
      setIsQueueModalOpen(false);
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: `Queued ${targets.length} prompt${targets.length === 1 ? '' : 's'} to Bulk Synthesis Engine.`,
          type: 'success'
        }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Collection',
          message: 'Failed to queue prompts to Bulk Synthesis Engine.',
          type: 'error'
        }
      }));
    } finally {
      setIsQueueingToBulkStudio(false);
    }
  };

  const handleCopyDetail = async (key: string, value: string) => {
    const text = String(value || '');
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopiedDetailKey(key);
    window.setTimeout(() => {
      setCopiedDetailKey((current) => current === key ? null : current);
    }, 1800);
  };

  const renderDetailCopyButton = (key: string, label: string, value: string) => (
    <button
      type="button"
      onClick={() => void handleCopyDetail(key, value)}
      disabled={!String(value || '').trim()}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
        copiedDetailKey === key
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
          : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      title={copiedDetailKey === key ? `${label} copied` : `Quick copy ${label.toLowerCase()}`}
      aria-label={copiedDetailKey === key ? `${label} copied` : `Quick copy ${label.toLowerCase()}`}
    >
      {copiedDetailKey === key ? <Check size={12} /> : <Copy size={12} />}
      {copiedDetailKey === key ? 'Copied' : 'Quick Copy'}
    </button>
  );

  const navigateSelectedItem = (direction: 'previous' | 'next') => {
    if (selectedItemIndex < 0) return;
    const nextIndex = direction === 'previous' ? selectedItemIndex - 1 : selectedItemIndex + 1;
    const nextItem = items[nextIndex];
    if (!nextItem) return;
    setSelectedItemId(nextItem.id);
  };
  const previewMedia = resolvePreview(previewItem);
  const previewMediaUrl = withPreviewRefresh(previewMedia.url);
  const previewRevision = previewItem?.currentRevision;
  const previewThumbnailBlurClass = getPromptThumbnailBlurClass(previewItem);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="relative flex h-[90vh] w-full max-w-[1500px] overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#050b18] shadow-[0_24px_80px_rgba(2,6,23,0.62)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.08),transparent_40%)]" />

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-5">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-300">
                {isQueueCollectionMode ? 'Queue Prompt Collection' : 'Prompt Collection'}
              </div>
              {queueStatusBadge && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Status
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${queueStatusBadge.className}`}>
                    {queueStatusBadge.label}
                  </span>
                </div>
              )}
              <h2 className="mt-2 truncate text-2xl font-black text-white">{viewerTitle}</h2>
              <p className="mt-2 max-w-3xl truncate text-sm text-slate-400">
                {viewerDescription}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-1">
                  <button
                    type="button"
                    onClick={() => navigateSelectedItem('previous')}
                    disabled={!canNavigateToPreviousItem}
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    title="Previous item"
                    aria-label="Previous item"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="min-w-[64px] px-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    {selectedItemIndex >= 0 ? `${selectedItemIndex + 1} / ${items.length}` : `0 / ${items.length}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateSelectedItem('next')}
                    disabled={!canNavigateToNextItem}
                    className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    title="Next item"
                    aria-label="Next item"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
              {isQueueCollectionMode ? (
                <div className="relative" ref={collectionActionsRef}>
                  <button
                    type="button"
                    onClick={() => setIsCollectionActionsOpen((open) => !open)}
                    aria-label="Queue collection actions"
                    aria-expanded={isCollectionActionsOpen}
                    aria-haspopup="menu"
                    title="Queue collection actions"
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
                      isCollectionActionsOpen
                        ? 'border-indigo-500/50 bg-indigo-500/20 text-white shadow-lg shadow-indigo-950/20'
                        : 'border-slate-700 bg-slate-900/70 text-slate-200 hover:border-indigo-500/40 hover:bg-slate-800'
                    }`}
                  >
                    <MoreVertical size={16} />
                    <span className="hidden sm:inline">Actions</span>
                    <ChevronDown size={13} className={`transition-transform ${isCollectionActionsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isCollectionActionsOpen && (
                    <div
                      role="menu"
                      aria-label="Queue collection actions"
                      className="absolute right-0 top-full z-[70] mt-2 w-72 overflow-hidden rounded-[1.4rem] border border-slate-700 bg-slate-900 py-1 shadow-2xl shadow-black/30"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(() => setIsRenameModalOpen(true))}
                        disabled={isRenamingCollection || isArchiving}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        <Pencil size={16} className="text-slate-300" />
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleArchiveQueueCollection)}
                        disabled={isArchiving}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-rose-100 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:text-slate-500"
                      >
                        {isArchiving ? <Loader2 size={16} className="animate-spin text-rose-300" /> : <Trash2 size={16} className="text-rose-300" />}
                        Move To Recycle Bin
                      </button>
                      <div className="mx-2 my-1 h-px bg-slate-700/80" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleMoveAllToPromptStaging)}
                        disabled={items.length === 0 || isMovingAllToStaging}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-emerald-100 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isMovingAllToStaging ? <Loader2 size={16} className="animate-spin text-emerald-300" /> : <SendToBack size={16} className="text-emerald-300" />}
                        Move All To Staging
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleBlurAllPromptImages)}
                        disabled={items.length === 0 || isBlurringAll}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-cyan-100 transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isBlurringAll ? <Loader2 size={16} className="animate-spin text-cyan-300" /> : <Images size={16} className="text-cyan-300" />}
                        Blur All
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleUnblurAllPromptImages)}
                        disabled={items.length === 0 || isBlurringAll}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-slate-100 transition-colors hover:bg-slate-700/40 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isBlurringAll ? <Loader2 size={16} className="animate-spin text-slate-300" /> : <Images size={16} className="text-slate-300" />}
                        Unblur All
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(() => openMoveModal('all'))}
                        disabled={items.length === 0 || availableProjects.length === 0 || isBulkMoving}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-indigo-100 transition-colors hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isBulkMoving && moveScope === 'all' ? <Loader2 size={16} className="animate-spin text-indigo-300" /> : <FolderPlus size={16} className="text-indigo-300" />}
                        Move All
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleMoveAllToComplete)}
                        disabled={items.length === 0 || isBulkCompleting}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-emerald-100 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isBulkCompleting ? <Loader2 size={16} className="animate-spin text-emerald-300" /> : <Check size={16} className="text-emerald-300" />}
                        Complete All
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative" ref={collectionActionsRef}>
                  <button
                    type="button"
                    onClick={() => setIsCollectionActionsOpen((open) => !open)}
                    aria-label="Prompt collection actions"
                    aria-expanded={isCollectionActionsOpen}
                    aria-haspopup="menu"
                    title="Prompt collection actions"
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
                      isCollectionActionsOpen
                        ? 'border-indigo-500/50 bg-indigo-500/20 text-white shadow-lg shadow-indigo-950/20'
                        : 'border-slate-700 bg-slate-900/70 text-slate-200 hover:border-indigo-500/40 hover:bg-slate-800'
                    }`}
                  >
                    <MoreVertical size={16} />
                    <span className="hidden sm:inline">Actions</span>
                    <ChevronDown size={13} className={`transition-transform ${isCollectionActionsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isCollectionActionsOpen && (
                    <div
                      role="menu"
                      aria-label="Prompt collection actions"
                      className="absolute right-0 top-full z-[70] mt-2 w-72 overflow-hidden rounded-[1.4rem] border border-slate-700 bg-slate-900 py-1 shadow-2xl shadow-black/30"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(() => setIsRenameModalOpen(true))}
                        disabled={isRenamingCollection || isArchiving}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        <Pencil size={16} className="text-slate-300" />
                        Rename
                      </button>
                      {!collection && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => runCollectionAction(handleMoveCollectionToQueueAsset)}
                          disabled={isMovingCollectionToQueueAsset || items.length === 0}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-emerald-100 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                        >
                          {isMovingCollectionToQueueAsset ? <Loader2 size={16} className="animate-spin text-emerald-300" /> : <FolderInput size={16} className="text-emerald-300" />}
                          Move To Queue Asset
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleMoveAllToPromptStaging)}
                        disabled={items.length === 0 || isMovingAllToStaging}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-emerald-100 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isMovingAllToStaging ? <Loader2 size={16} className="animate-spin text-emerald-300" /> : <SendToBack size={16} className="text-emerald-300" />}
                        Move All To Staging
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleBlurAllPromptImages)}
                        disabled={items.length === 0 || isBlurringAll}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-cyan-100 transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isBlurringAll ? <Loader2 size={16} className="animate-spin text-cyan-300" /> : <Images size={16} className="text-cyan-300" />}
                        Blur All
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCollectionAction(handleUnblurAllPromptImages)}
                        disabled={items.length === 0 || isBlurringAll}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-slate-100 transition-colors hover:bg-slate-700/40 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {isBlurringAll ? <Loader2 size={16} className="animate-spin text-slate-300" /> : <Images size={16} className="text-slate-300" />}
                        Unblur All
                      </button>
                      {items.length > 0 && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => runCollectionAction(() => openMoveModal('all'))}
                          disabled={availableProjects.length === 0 || isBulkMoving}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-indigo-100 transition-colors hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:text-slate-500"
                        >
                          {isBulkMoving && moveScope === 'all' ? <Loader2 size={16} className="animate-spin text-indigo-300" /> : <FolderPlus size={16} className="text-indigo-300" />}
                          Move All
                        </button>
                      )}
                      <div className="mx-2 my-1 h-px bg-slate-700/80" />
                      {collection ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => runCollectionAction(handleArchiveQueueCollection)}
                          disabled={isArchiving}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-rose-100 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:text-slate-500"
                        >
                          {isArchiving ? <Loader2 size={16} className="animate-spin text-rose-300" /> : <Trash2 size={16} className="text-rose-300" />}
                          Move To Recycle Bin
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => runCollectionAction(handleArchive)}
                          disabled={isArchiving}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left text-xs font-bold text-rose-100 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:text-slate-500"
                        >
                          {isArchiving ? <Loader2 size={16} className="animate-spin text-rose-300" /> : <Trash2 size={16} className="text-rose-300" />}
                          Move To Recycle Bin
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button onClick={onClose} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-900/70 hover:text-white">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="flex min-h-0 min-w-0 flex-col border-r border-slate-800/70">
              <div className="flex items-center justify-between border-b border-slate-800/70 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Stored Prompts ({items.length})
                  </div>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-900"
                    >
                      {allItemsSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      {allItemsSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                  {selectedItemIds.size > 0 && (
                    <div className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                      {selectedItemIds.size} selected
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {items.length > 0 && (
                    <>
                      {isQueueCollectionMode && (
                        <button
                          type="button"
                          onClick={() => setIsPromptTextModalOpen(true)}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
                        >
                          <Plus size={14} />
                          Add Text
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopyCollectionJson()}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
                          hasCopiedCollectionJson
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        {hasCopiedCollectionJson ? <Check size={14} /> : <Copy size={14} />}
                        {hasCopiedCollectionJson ? 'Copied JSON' : 'Copy JSON'}
                      </button>
                      <button
                        type="button"
                        onClick={handleExportCollectionJson}
                        disabled={isExportingJson}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-900 disabled:opacity-50"
                      >
                        {isExportingJson ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Export JSON
                      </button>
                    </>
                  )}
                  <div className="inline-flex items-center rounded-2xl border border-slate-800/80 bg-slate-950/80 p-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`rounded-xl p-2 transition-colors ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Grid view"
                      aria-label="Grid view"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode('gallery')}
                      className={`rounded-xl p-2 transition-colors ${viewMode === 'gallery' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Gallery view"
                      aria-label="Gallery view"
                    >
                      <Images size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`rounded-xl p-2 transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      title="List view"
                      aria-label="List view"
                    >
                      <List size={16} />
                    </button>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    {project.storageType}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {isLoading ? (
                  <div className="flex h-full min-h-[300px] items-center justify-center">
                    <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                      <Loader2 size={18} className="animate-spin" />
                      Loading prompt collection
                    </div>
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 px-6 text-center">
                    <FolderOpen size={28} className="text-slate-600" />
                    <p className="mt-4 text-lg font-semibold text-slate-300">No prompts saved yet</p>
                    <p className="mt-2 text-sm text-slate-500">Export prompts into this collection to see them here.</p>
                  </div>
                ) : viewMode === 'gallery' ? (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                    {items.map((item) => {
                      const revision = item.currentRevision;
                      const isSelected = item.id === selectedItemId;
                      const preview = resolvePreview(item);
                      const thumbnailBlurEnabled = isThumbnailBlurEnabled(item);
                      const thumbnailBlurClass = getPromptThumbnailBlurClass(item);
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedItemId(item.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`group relative overflow-hidden rounded-[1.35rem] border bg-slate-950/75 text-left transition-all ${
                            isSelected
                              ? 'border-violet-500/60 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
                              : 'border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-[#040918] text-slate-700">
                            {preview.url ? (
                              preview.mimeType?.startsWith('video/')
                                ? <video src={preview.url} className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${thumbnailBlurClass}`} muted playsInline loop autoPlay />
                                : <img src={preview.url} alt={revision?.title || 'Prompt preview'} className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${thumbnailBlurClass}`} />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 text-slate-700">
                                <ImageIcon size={32} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">No Preview</span>
                              </div>
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/10" />
                          </div>

                          <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleBulkSelection(item.id);
                              }}
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-lg backdrop-blur transition-colors ${
                                selectedItemIds.has(item.id)
                                  ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                                  : 'border-white/15 bg-slate-950/70 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                              }`}
                              title={selectedItemIds.has(item.id) ? 'Deselect prompt' : 'Select prompt'}
                              aria-label={selectedItemIds.has(item.id) ? 'Deselect prompt' : 'Select prompt'}
                            >
                              {selectedItemIds.has(item.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                            </button>
                            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-lg backdrop-blur">
                              saved
                            </span>
                          </div>

                          <div className="absolute inset-x-0 bottom-0 p-4">
                            <h3 className="truncate text-sm font-black text-white">{revision?.title || 'Untitled Prompt'}</h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">
                              {revision?.prompt || 'No prompt content available.'}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 p-2 backdrop-blur-md">
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleCopyPrompt(item);
                                }}
                                disabled={!revision?.prompt?.trim()}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
                                  copiedItemId === item.id
                                    ? 'text-emerald-300'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                              >
                                {copiedItemId === item.id ? <Check size={12} /> : <Copy size={12} />}
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (preview.url) setPreviewItemId(item.id);
                                }}
                                disabled={!preview.url}
                                className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                title={preview.url ? 'View thumbnail' : 'No thumbnail to view'}
                                aria-label={preview.url ? 'View thumbnail' : 'No thumbnail to view'}
                              >
                                <Maximize2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleSetPromptImageBlur(item, !thumbnailBlurEnabled);
                                }}
                                disabled={!preview.url || isBlurringItemId === item.id}
                                className={`rounded-xl p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                  thumbnailBlurEnabled
                                    ? 'text-amber-200 hover:bg-amber-500/10 hover:text-white'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                                title={thumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                                aria-label={thumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                              >
                                {isBlurringItemId === item.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : thumbnailBlurEnabled ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                              {Boolean(project?.id) && (
                                <button
                                  type="button"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    await handleDuplicatePromptItem(item);
                                  }}
                                  disabled={duplicatingItemId === item.id || !revision?.prompt?.trim()}
                                  className="rounded-xl p-2 text-indigo-200 transition-colors hover:bg-indigo-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title={duplicatingItemId === item.id ? 'Duplicating prompt item' : 'Duplicate prompt item'}
                                  aria-label={duplicatingItemId === item.id ? 'Duplicating prompt item' : 'Duplicate prompt item'}
                                >
                                  {duplicatingItemId === item.id ? <Loader2 size={13} className="animate-spin" /> : <CopyPlus size={13} />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleArchiveItem(item);
                                }}
                                className="ml-auto rounded-xl p-2 text-rose-200 transition-colors hover:bg-rose-500/10 hover:text-white"
                                title="Move prompt to recycle bin"
                                aria-label="Move prompt to recycle bin"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : viewMode === 'list' ? (
                  <div className="space-y-4">
                    {items.map((item) => {
                      const revision = item.currentRevision;
                      const isSelected = item.id === selectedItemId;
                      const preview = resolvePreview(item);
                      const thumbnailBlurEnabled = isThumbnailBlurEnabled(item);
                      const thumbnailBlurClass = getPromptThumbnailBlurClass(item);
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedItemId(item.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`flex w-full items-center gap-4 rounded-[1.4rem] border bg-slate-950/65 p-4 text-left backdrop-blur-sm transition-all ${
                            isSelected
                              ? 'border-violet-500/55 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
                              : 'border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleBulkSelection(item.id);
                            }}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                              selectedItemIds.has(item.id)
                                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                                : 'border-slate-800 bg-slate-950/80 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                            }`}
                            title={selectedItemIds.has(item.id) ? 'Deselect prompt' : 'Select prompt'}
                            aria-label={selectedItemIds.has(item.id) ? 'Deselect prompt' : 'Select prompt'}
                          >
                            {selectedItemIds.has(item.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                          </button>
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800/70 bg-[#040918] text-slate-700">
                            {preview.url ? (
                              preview.mimeType?.startsWith('video/')
                                ? <video src={preview.url} className={`h-full w-full object-contain ${thumbnailBlurClass}`} muted playsInline loop autoPlay />
                                : <img src={preview.url} alt={revision?.title || 'Prompt preview'} className={`h-full w-full object-contain ${thumbnailBlurClass}`} />
                            ) : (
                              <ImageIcon size={20} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-bold text-white">{revision?.title || 'Untitled Prompt'}</h3>
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                                  {revision?.prompt || 'No prompt content available.'}
                                </p>
                              </div>
                              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">
                                saved
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-end gap-2">
                              {isQueueCollectionMode && (
                                <button
                                  type="button"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    await handleMoveItemToComplete(item);
                                  }}
                                  disabled={isMovingItemToCompleteId === item.id}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 transition-colors hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title={isMovingItemToCompleteId === item.id ? 'Moving prompt to complete' : 'Move prompt to complete in Asset Ingestion'}
                                  aria-label={isMovingItemToCompleteId === item.id ? 'Moving prompt to complete' : 'Move prompt to complete in Asset Ingestion'}
                                >
                                  {isMovingItemToCompleteId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleCopyPrompt(item);
                                }}
                                disabled={!revision?.prompt?.trim()}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                                  copiedItemId === item.id
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                                title={copiedItemId === item.id ? 'Prompt copied' : 'Quick copy prompt'}
                                aria-label={copiedItemId === item.id ? 'Prompt copied' : 'Quick copy prompt'}
                              >
                                {copiedItemId === item.id ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (preview.url) setPreviewItemId(item.id);
                                }}
                                disabled={!preview.url}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                title={preview.url ? 'View thumbnail' : 'No thumbnail to view'}
                                aria-label={preview.url ? 'View thumbnail' : 'No thumbnail to view'}
                              >
                                <Maximize2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleSetPromptImageBlur(item, !thumbnailBlurEnabled);
                                }}
                                disabled={!preview.url || isBlurringItemId === item.id}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                  thumbnailBlurEnabled
                                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                                }`}
                                title={thumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                                aria-label={thumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                              >
                                {isBlurringItemId === item.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : thumbnailBlurEnabled ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              {Boolean(project?.id) && (
                                <button
                                  type="button"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    await handleDuplicatePromptItem(item);
                                  }}
                                  disabled={duplicatingItemId === item.id || !revision?.prompt?.trim()}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-200 transition-colors hover:bg-indigo-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title={duplicatingItemId === item.id ? 'Duplicating prompt item' : 'Duplicate prompt item'}
                                  aria-label={duplicatingItemId === item.id ? 'Duplicating prompt item' : 'Duplicate prompt item'}
                                >
                                  {duplicatingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CopyPlus size={14} />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleArchiveItem(item);
                                }}
                                className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
                                title="Move prompt to recycle bin"
                                aria-label="Move prompt to recycle bin"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                    {items.map((item) => {
                      const revision = item.currentRevision;
                      const isSelected = item.id === selectedItemId;
                      const preview = resolvePreview(item);
                      const thumbnailBlurEnabled = isThumbnailBlurEnabled(item);
                      const thumbnailBlurClass = getPromptThumbnailBlurClass(item);
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedItemId(item.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`relative overflow-hidden rounded-[1.4rem] border bg-slate-950/65 text-left backdrop-blur-sm transition-all ${
                            isSelected
                              ? 'border-violet-500/55 shadow-[0_0_0_1px_rgba(139,92,246,0.45)]'
                              : 'border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="absolute left-4 top-4 z-10">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleBulkSelection(item.id);
                              }}
                              className={`flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition-colors ${
                                selectedItemIds.has(item.id)
                                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200'
                                  : 'border-slate-700 bg-slate-950/85 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                              }`}
                              title={selectedItemIds.has(item.id) ? 'Deselect prompt' : 'Select prompt'}
                              aria-label={selectedItemIds.has(item.id) ? 'Deselect prompt' : 'Select prompt'}
                            >
                              {selectedItemIds.has(item.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                            </button>
                          </div>
                          <div className="flex h-40 items-center justify-center overflow-hidden border-b border-slate-800/70 bg-[#040918] text-slate-700">
                            {preview.url ? (
                              preview.mimeType?.startsWith('video/')
                                ? <video src={preview.url} className={`h-full w-full object-contain ${thumbnailBlurClass}`} muted playsInline loop autoPlay />
                                : <img src={preview.url} alt={revision?.title || 'Prompt preview'} className={`h-full w-full object-contain ${thumbnailBlurClass}`} />
                            ) : (
                              <ImageIcon size={28} />
                            )}
                          </div>
                          <div className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-bold text-white">{revision?.title || 'Untitled Prompt'}</h3>
                                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">
                                  {revision?.prompt || 'No prompt content available.'}
                                </p>
                              </div>
                              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">
                                saved
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-2 border-t border-slate-800/70 pt-3">
                              {isQueueCollectionMode && (
                                <button
                                  type="button"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    await handleMoveItemToComplete(item);
                                  }}
                                  disabled={isMovingItemToCompleteId === item.id}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 transition-colors hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title={isMovingItemToCompleteId === item.id ? 'Moving prompt to complete' : 'Move prompt to complete in Asset Ingestion'}
                                  aria-label={isMovingItemToCompleteId === item.id ? 'Moving prompt to complete' : 'Move prompt to complete in Asset Ingestion'}
                                >
                                  {isMovingItemToCompleteId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleCopyPrompt(item);
                                }}
                                disabled={!revision?.prompt?.trim()}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                                  copiedItemId === item.id
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                                title={copiedItemId === item.id ? 'Prompt copied' : 'Quick copy prompt'}
                                aria-label={copiedItemId === item.id ? 'Prompt copied' : 'Quick copy prompt'}
                              >
                                {copiedItemId === item.id ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (preview.url) setPreviewItemId(item.id);
                                }}
                                disabled={!preview.url}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                title={preview.url ? 'View thumbnail' : 'No thumbnail to view'}
                                aria-label={preview.url ? 'View thumbnail' : 'No thumbnail to view'}
                              >
                                <Maximize2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleSetPromptImageBlur(item, !thumbnailBlurEnabled);
                                }}
                                disabled={!preview.url || isBlurringItemId === item.id}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                  thumbnailBlurEnabled
                                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                                    : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                                }`}
                                title={thumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                                aria-label={thumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                              >
                                {isBlurringItemId === item.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : thumbnailBlurEnabled ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              {Boolean(project?.id) && (
                                <button
                                  type="button"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    await handleDuplicatePromptItem(item);
                                  }}
                                  disabled={duplicatingItemId === item.id || !revision?.prompt?.trim()}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-200 transition-colors hover:bg-indigo-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title={duplicatingItemId === item.id ? 'Duplicating prompt item' : 'Duplicate prompt item'}
                                  aria-label={duplicatingItemId === item.id ? 'Duplicating prompt item' : 'Duplicate prompt item'}
                                >
                                  {duplicatingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CopyPlus size={14} />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await handleArchiveItem(item);
                                }}
                                className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-200 transition-colors hover:bg-rose-500/20 hover:text-white"
                                title="Move prompt to recycle bin"
                                aria-label="Move prompt to recycle bin"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 min-w-0 overflow-y-auto p-6">
              {selectedItem ? (
                <div className="min-w-0 space-y-5">
                  {(() => {
                    const selectedPreview = resolvePreview(selectedItem);
                    const selectedPreviewUrl = withPreviewRefresh(selectedPreview.url);
                    const revision = selectedItem.currentRevision;
                    const selectedThumbnailBlurEnabled = isThumbnailBlurEnabled(selectedItem);
                    const selectedThumbnailBlurClass = getPromptThumbnailBlurClass(selectedItem);
                    const promptText = revision?.prompt || '';
                    const advancedParams = resolveAdvancedParams(selectedItem) as Record<string, unknown>;
                    const sourceText = String(advancedParams.promptSource || 'manual').toLowerCase() === 'json' ? 'JSON Import' : 'New Prompt';
                    const rawPromptText = typeof advancedParams.rawPrompt === 'string' ? advancedParams.rawPrompt : '';
                    const rawText = rawPromptText;
                    const noteText = revision?.note || '';
                    const engineDisplayLabel = resolveEngineDisplayLabel(selectedItem);
                    const promptRevisions = selectedItemRevisions
                      .filter((entry) => hasPromptCollectionRevisionDelta(revision, entry))
                      .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
                    return (
                      <>
                  <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 p-5">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Prompt Detail</div>
                    <h3 className="mt-3 break-words text-xl font-black text-white [overflow-wrap:anywhere]">{revision?.title || 'Untitled Prompt'}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="inline-flex rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        {engineDisplayLabel}
                      </div>
                      <div className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
                        {sourceText}
                      </div>
                      {revision?.label && (
                        <div className="inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                          {revision.label}
                        </div>
                      )}
                      {String(revision?.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                        <div key={tag} className="inline-flex rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
                          #{tag}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          <History size={13} />
                          Revision History
                        </div>
                        <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-300">
                          {promptRevisions.length}
                        </span>
                      </div>
                      {promptRevisions.length > 0 ? (
                        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200">
                              Previous v{promptRevisions[0].versionNumber}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                              {promptRevisions[0].prompt || promptRevisions[0].title || 'Previous prompt state'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRestoreCollectionRevision(promptRevisions[0])}
                            className="shrink-0 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                          >
                            Restore
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-500">
                          No previous prompt revisions for this item yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {isQueueCollectionMode && (
                    <div className="rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</span>
                          <select
                            value={queueState}
                            onChange={(event) => {
                              const value = event.target.value as 'waiting' | 'pending' | 'done';
                              setQueueState(value);
                              void handleSaveQueueMeta({ queueState: value });
                            }}
                            className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white outline-none transition-colors focus:border-violet-500/40"
                          >
                            <option value="waiting">Waiting</option>
                            <option value="pending">Pending</option>
                            <option value="done">Done</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">A-Z</span>
                          <select
                            value={queueLetter}
                            onChange={(event) => {
                              const value = event.target.value;
                              setQueueLetter(value);
                              void handleSaveQueueMeta({ queueLetter: value });
                            }}
                            className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white outline-none transition-colors focus:border-violet-500/40"
                          >
                            {['A-Z', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">0-9</span>
                          <select
                            value={queueNumber}
                            onChange={(event) => {
                              const value = event.target.value;
                              setQueueNumber(value);
                              void handleSaveQueueMeta({ queueNumber: value });
                            }}
                            className="w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white outline-none transition-colors focus:border-violet-500/40"
                          >
                            {['0-9', ...Array.from({ length: 10 }, (_, index) => String(index))].map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {selectedItem && (
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleMoveItemToComplete(selectedItem)}
                            disabled={isMovingItemToCompleteId === selectedItem.id}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition-colors hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isMovingItemToCompleteId === selectedItem.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {isMovingItemToCompleteId === selectedItem.id ? 'Moving To Asset Ingestion' : 'Move To Complete'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="overflow-hidden rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                        Preview
                      </div>
                      {isQueueCollectionMode && collection && selectedItem && (
                        <button
                          type="button"
                          onClick={() => void handleSetCollectionThumbnail()}
                          disabled={isUpdatingCollectionThumbnail || activeCollectionThumbnailItemId === selectedItem.id}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] transition-colors disabled:opacity-40 ${
                            updatedSampleItemId === selectedItem.id
                              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                              : activeCollectionThumbnailItemId === selectedItem.id
                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-emerald-500/25 hover:bg-emerald-500/10 hover:text-emerald-200'
                          }`}
                        >
                          {isUpdatingCollectionThumbnail ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                          {updatedSampleItemId === selectedItem.id ? 'Updated' : 'Sample'}
                        </button>
                      )}
                      {selectedItem && (
                        <button
                          type="button"
                          onClick={() => void handleSetPromptImageBlur(selectedItem, !selectedThumbnailBlurEnabled)}
                          disabled={!selectedPreviewUrl || isBlurringItemId === selectedItem.id}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            selectedThumbnailBlurEnabled
                              ? 'border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                              : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                          }`}
                          title={selectedThumbnailBlurEnabled ? 'Unblur prompt image' : 'Blur prompt image'}
                        >
                          {isBlurringItemId === selectedItem.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : selectedThumbnailBlurEnabled ? <EyeOff size={12} /> : <Eye size={12} />}
                          {selectedThumbnailBlurEnabled ? 'Unblur' : 'Blur'}
                        </button>
                      )}
                    </div>
                    <div
                      onDragEnter={(event) => {
                        if (!isQueueCollectionMode) return;
                        event.preventDefault();
                        event.stopPropagation();
                        previewDragCounterRef.current += 1;
                        setIsPreviewDragActive(true);
                      }}
                      onDragOver={(event) => {
                        if (!isQueueCollectionMode) return;
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDragLeave={(event) => {
                        if (!isQueueCollectionMode) return;
                        event.preventDefault();
                        event.stopPropagation();
                        previewDragCounterRef.current -= 1;
                        if (previewDragCounterRef.current <= 0) {
                          resetPreviewDragState();
                        }
                      }}
                      onDrop={async (event) => {
                        if (!isQueueCollectionMode) return;
                        event.preventDefault();
                        event.stopPropagation();
                        try {
                          setIsReplacingPreview(true);
                          let didUpdate = false;
                          const internalId = event.dataTransfer.getData('application/x-aimana-asset');
                          if (internalId) {
                            didUpdate = await handleReplacePreviewWithItem(internalId);
                          } else {
                            const file = await getDroppedPreviewFile(event.dataTransfer);
                            if (file) {
                              didUpdate = await handleReplacePreviewWithFile(file);
                            }
                          }
                          window.dispatchEvent(new CustomEvent('aimana-notification', {
                            detail: didUpdate
                              ? {
                                  title: 'Queue Asset',
                                  message: 'Preview sample updated.',
                                  type: 'success'
                                }
                              : {
                                  title: 'Queue Asset',
                                  message: 'Drop an image or video file to replace the preview sample.',
                                  type: 'info'
                                }
                          }));
                        } catch (error) {
                          window.dispatchEvent(new CustomEvent('aimana-notification', {
                            detail: {
                              title: 'Queue Asset',
                              message: error instanceof Error && error.message ? error.message : 'Failed to replace preview sample.',
                              type: 'error'
                            }
                          }));
                        } finally {
                          setIsReplacingPreview(false);
                          resetPreviewDragState();
                        }
                      }}
                      className={`relative flex h-72 items-center justify-center bg-[#040918] text-slate-700 transition-colors ${
                        isPreviewDragActive ? 'ring-2 ring-cyan-500/30' : ''
                      }`}
                    >
                      {selectedPreviewUrl ? (
                        selectedPreview.mimeType?.startsWith('video/')
                          ? <video src={selectedPreviewUrl} className={`h-full w-full object-contain ${selectedThumbnailBlurClass}`} controls playsInline />
                          : <img src={selectedPreviewUrl} alt={revision?.title || 'Prompt preview'} className={`h-full w-full object-contain ${selectedThumbnailBlurClass}`} />
                      ) : (
                        <ImageIcon size={32} />
                      )}
                      {isQueueCollectionMode && (
                        <>
                          <input
                            ref={previewFileInputRef}
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(event) => void handlePreviewFileInput(event)}
                          />
                          <div className={`pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                            isPreviewDragActive
                              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                              : 'border-slate-700/80 bg-slate-950/85 text-slate-300'
                          }`}>
                            {isReplacingPreview
                              ? 'Updating Preview Sample...'
                              : isPreviewDragActive
                                ? 'Drop New Preview Here'
                                : 'Drag And Drop Or Upload A New Preview'}
                          </div>
                          <button
                            type="button"
                            onClick={() => previewFileInputRef.current?.click()}
                            disabled={isReplacingPreview}
                            className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-900 disabled:opacity-40"
                          >
                            {isReplacingPreview ? <Loader2 size={12} className="animate-spin" /> : <FolderInput size={12} />}
                            Upload
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                          <History size={13} />
                          Revisions
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">
                          Previous prompt states appear here after prompt content or metadata changes.
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                        {promptRevisions.length}
                      </span>
                    </div>
                    {isLoadingRevisions ? (
                      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-5 text-xs text-slate-400">
                        Loading revisions...
                      </div>
                    ) : promptRevisions.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 px-4 py-5 text-xs text-slate-500">
                        No prompt revisions saved yet.
                      </div>
                    ) : (
                      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1 scrollbar-subtle">
                        {promptRevisions.map((entry) => {
                          const entryPreviewUrl = entry.fileUrl || entry.thumbnailLink || '';
                          const entryRaw = getRevisionRawPrompt(entry);
                          const entryThumbnailBlurClass = getPromptThumbnailBlurClass(entry);
                          return (
                            <article key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                              <div className="flex items-start gap-3">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-700">
                                  {entryPreviewUrl ? (
                                    String(entry.mimeType || '').startsWith('video/')
                                      ? <video src={entryPreviewUrl} className={`h-full w-full object-cover ${entryThumbnailBlurClass}`} muted playsInline />
                                      : <img src={entryPreviewUrl} alt={entry.title} className={`h-full w-full object-cover ${entryThumbnailBlurClass}`} />
                                  ) : (
                                    <ImageIcon size={18} />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="truncate text-sm font-bold text-white">{entry.title || 'Untitled Prompt'}</h4>
                                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{entry.prompt || 'No prompt saved.'}</p>
                                      {entryRaw && (
                                        <p className="mt-1 line-clamp-1 font-mono text-[10px] text-slate-500">{entryRaw}</p>
                                      )}
                                    </div>
                                    <span className="shrink-0 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-violet-200">
                                      v{entry.versionNumber}
                                    </span>
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown date'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleRestoreCollectionRevision(entry)}
                                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                                    >
                                      <History size={12} />
                                      Restore
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Prompt</div>
                      <div className="flex items-center gap-2">
                        {editingField === 'prompt' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSaveField('prompt')}
                              disabled={isSavingField === 'prompt'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
                            >
                              {isSavingField === 'prompt' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingField}
                              disabled={isSavingField === 'prompt'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                            >
                              <X size={12} />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditingField('prompt')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800"
                            title="Edit prompt"
                            aria-label="Edit prompt"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )}
                        {renderReadAloudButton(`prompt-${selectedItem.id}`, 'Prompt', promptText)}
                        {renderDetailCopyButton(`prompt-${selectedItem.id}`, 'Prompt', promptText)}
                      </div>
                    </div>
                    {editingField === 'prompt' ? (
                      <textarea
                        value={editingPromptValue}
                        onChange={(event) => setEditingPromptValue(event.target.value)}
                        className="min-h-[160px] w-full resize-y rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-white outline-none focus:border-violet-500/50"
                        placeholder="Edit prompt..."
                      />
                    ) : (
                      <div className="whitespace-pre-wrap rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-white [overflow-wrap:anywhere]">
                        {promptText || 'No prompt content available.'}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                        <StickyNote size={12} />
                        Notes
                      </div>
                      <div className="flex items-center gap-2">
                        {editingField === 'note' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSaveField('note')}
                              disabled={isSavingField === 'note'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
                            >
                              {isSavingField === 'note' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingField}
                              disabled={isSavingField === 'note'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                            >
                              <X size={12} />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditingField('note')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800"
                            title="Edit notes"
                            aria-label="Edit notes"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )}
                        {renderDetailCopyButton(`note-${selectedItem.id}`, 'Note', noteText)}
                      </div>
                    </div>
                    {editingField === 'note' ? (
                      <textarea
                        value={editingNoteValue}
                        onChange={(event) => setEditingNoteValue(event.target.value)}
                        className="min-h-[130px] w-full resize-y rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300 outline-none focus:border-violet-500/50"
                        placeholder="Edit notes..."
                      />
                    ) : (
                      <div className="whitespace-pre-wrap rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
                        {noteText || 'No notes available.'}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Raw</div>
                      <div className="flex items-center gap-2">
                        {editingField === 'raw' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSaveField('raw')}
                              disabled={isSavingField === 'raw'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
                            >
                              {isSavingField === 'raw' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingField}
                              disabled={isSavingField === 'raw'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                            >
                              <X size={12} />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditingField('raw')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800"
                            title="Edit raw prompt"
                            aria-label="Edit raw prompt"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )}
                        {renderReadAloudButton(`raw-${selectedItem.id}`, 'Raw', rawText)}
                        {renderDetailCopyButton(`raw-${selectedItem.id}`, 'Raw', rawText)}
                      </div>
                    </div>
                    {editingField === 'raw' ? (
                      <textarea
                        value={editingRawValue}
                        onChange={(event) => setEditingRawValue(event.target.value)}
                        className="min-h-[160px] w-full resize-y rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 font-mono text-xs leading-relaxed text-slate-300 outline-none focus:border-violet-500/50"
                        placeholder="Edit raw prompt..."
                      />
                    ) : (
                      <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 font-mono text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
                        {rawText || 'No raw prompt available.'}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Label</div>
                      <div className="flex items-center gap-2">
                        {editingField === 'label' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSaveField('label')}
                              disabled={isSavingField === 'label'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:opacity-40"
                            >
                              {isSavingField === 'label' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingField}
                              disabled={isSavingField === 'label'}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:opacity-40"
                            >
                              <X size={12} />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditingField('label')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800"
                            title="Edit label"
                            aria-label="Edit label"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                    {editingField === 'label' ? (
                      <input
                        value={editingLabelValue}
                        onChange={(event) => setEditingLabelValue(event.target.value)}
                        className="w-full rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300 outline-none focus:border-violet-500/50"
                        placeholder="Edit label..."
                      />
                    ) : (
                      <div className="rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
                        {revision?.label || 'No label assigned.'}
                      </div>
                    )}

                    <div className="mt-5 mb-3 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Metadata</div>
                      <button
                        type="button"
                        onClick={() => setIsGenerationDataOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200 transition-colors hover:bg-indigo-500/20 hover:text-white"
                      >
                        <FileText size={12} />
                        Raw Data
                      </button>
                    </div>
                    <div className="min-w-0 space-y-2 rounded-[1.3rem] border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300 [overflow-wrap:anywhere]">
                      <div>Storage: {project.storageType}</div>
                      <div>Source: {sourceText}</div>
                      <div>Engine: {engineDisplayLabel}</div>
                      <div>MIME: {revision?.mimeType || 'unknown'}</div>
                      <div>Original File: {revision?.originalFilename || 'unknown'}</div>
                      <div>Version: {revision?.versionNumber || 1}</div>
                      <div>Item ID: {selectedItem.id}</div>
                      <div>Revision ID: {revision?.id || 'unknown'}</div>
                      <div>Created: {revision?.createdAt ? new Date(revision.createdAt).toLocaleString() : 'unknown'}</div>
                      <div>Updated: {new Date(selectedItem.updatedAt).toLocaleString()}</div>
                      <div>Size: {typeof revision?.size === 'number' ? `${revision.size} bytes` : 'unknown'}</div>
                      <div>Secondary Files: {revision?.secondaryFiles?.length || 0}</div>
                      <div>File URL: {revision?.fileUrl || 'Not available'}</div>
                      <div>Thumbnail: {revision?.thumbnailLink || 'Not available'}</div>
                      <div>Remote ID: {revision?.remoteId || 'Not available'}</div>
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center rounded-[1.6rem] border border-slate-800/80 bg-slate-950/55 px-6 text-center">
                  <div>
                    <FolderOpen size={28} className="mx-auto text-slate-600" />
                    <p className="mt-4 text-lg font-semibold text-slate-300">Select a saved prompt</p>
                    <p className="mt-2 text-sm text-slate-500">Its details will appear here.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewItem && previewMediaUrl && (
        <div
          className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/95 p-4 backdrop-blur-3xl animate-in fade-in"
          onClick={() => setPreviewItemId(null)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewItemId(null);
            }}
            className="absolute right-6 top-6 z-10 rounded-full p-3 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close thumbnail preview"
          >
            <X size={26} />
          </button>
          {previewableItems.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigatePromptCollectionPreview('previous');
                }}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-4 text-white/35 transition-colors hover:bg-white/10 hover:text-white md:left-8"
                aria-label="Previous prompt thumbnail"
              >
                <ChevronLeft size={46} strokeWidth={1.4} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigatePromptCollectionPreview('next');
                }}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-4 text-white/35 transition-colors hover:bg-white/10 hover:text-white md:right-8"
                aria-label="Next prompt thumbnail"
              >
                <ChevronRight size={46} strokeWidth={1.4} />
              </button>
            </>
          )}
          <div className="flex max-h-[86vh] max-w-[92vw] flex-col items-center gap-4" onClick={(event) => event.stopPropagation()}>
            {previewMedia.mimeType?.startsWith('video/') ? (
              <video src={previewMediaUrl} className={`max-h-[78vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-[0_0_100px_rgba(99,102,241,0.16)] ${previewThumbnailBlurClass}`} controls autoPlay loop />
            ) : (
              <img src={previewMediaUrl} alt={previewRevision?.title || 'Prompt thumbnail'} className={`max-h-[78vh] max-w-[92vw] rounded-2xl border border-white/10 object-contain shadow-[0_0_100px_rgba(99,102,241,0.16)] ${previewThumbnailBlurClass}`} />
            )}
            <div className="max-w-3xl text-center">
              <h3 className="line-clamp-1 text-lg font-black uppercase tracking-tight text-white">{previewRevision?.title || 'Untitled Prompt'}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-400">{previewRevision?.prompt || 'No prompt content available.'}</p>
              {previewableItems.length > 1 && (
                <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 backdrop-blur-md">
                  {previewItemIndex + 1} / {previewableItems.length}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedItemIds.size > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[320] w-[min(96vw,1120px)] -translate-x-1/2 animate-in slide-in-from-bottom-8">
          <div className="pointer-events-auto rounded-[1.7rem] border border-indigo-500/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.95))] px-5 py-3.5 shadow-[0_20px_80px_rgba(2,6,23,0.75)] ring-4 ring-indigo-500/10 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[150px] flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Bulk Actions</div>
                <div className="mt-0.5 text-sm font-semibold leading-none text-white md:text-[0.98rem]">
                  {selectedItemIds.size} Selected
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedItemIds(new Set())}
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-white"
              >
                <X size={16} />
                Cancel
              </button>

              <button
                type="button"
                onClick={() => setIsQueueModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-500/25 hover:text-amber-100"
              >
                <Copy size={15} />
                Queue
              </button>

              {isQueueCollectionMode && (
                <button
                  type="button"
                  onClick={() => void handleBulkMoveToComplete()}
                  disabled={isBulkCompleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBulkCompleting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Move To Complete
                </button>
              )}

              <button
                type="button"
                onClick={() => openMoveModal('selected')}
                disabled={availableProjects.length === 0 || isBulkMoving}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-4 py-2.5 text-sm font-bold text-indigo-300 transition-colors hover:bg-indigo-600/35 hover:text-indigo-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
              >
                <FolderPlus size={15} />
                Move
              </button>

              <button
                type="button"
                onClick={() => void handleBulkArchiveItems()}
                disabled={isBulkArchiving}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBulkArchiving ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Move To Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}

      <GenerationDataModal
        isOpen={isGenerationDataOpen}
        onClose={() => setIsGenerationDataOpen(false)}
        data={selectedItemRawDataEnvelope}
        readOnly
      />

      <ProjectCollectionModal
        isOpen={isRenameModalOpen}
        isSubmitting={isRenamingCollection}
        mode="edit"
        initialName={viewerTitle}
        onClose={() => setIsRenameModalOpen(false)}
        onSubmit={handleRenameCollection}
      />

      {isPromptTextModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/90 px-4 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-2xl rounded-[2.4rem] border border-slate-700 bg-slate-900 p-8 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">
                  <Plus size={14} />
                  Queue Prompt Collection
                </div>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-white">Add Text To All Prompts</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Apply the same text to every prompt in {viewerTitle}. Existing prompt text will be kept.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPromptTextModalOpen(false)}
                disabled={isApplyingPromptText}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="inline-flex rounded-2xl border border-slate-800 bg-slate-950/80 p-1">
                {(['append', 'prepend'] as const).map((placement) => (
                  <button
                    key={placement}
                    type="button"
                    onClick={() => setPromptTextPlacement(placement)}
                    disabled={isApplyingPromptText}
                    className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors disabled:opacity-40 ${
                      promptTextPlacement === placement
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {placement === 'append' ? 'Add To End' : 'Add To Start'}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Text To Add</span>
                <textarea
                  value={promptTextToApply}
                  onChange={(event) => setPromptTextToApply(event.target.value)}
                  disabled={isApplyingPromptText}
                  className="min-h-[180px] w-full resize-y rounded-[1.4rem] border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-white outline-none transition-colors focus:border-emerald-500/45 disabled:opacity-50"
                  placeholder="Enter the text to apply to every prompt in this queue collection..."
                />
              </label>

              <div className="rounded-[1.3rem] border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs leading-relaxed text-slate-400">
                This will update {items.length} prompt{items.length === 1 ? '' : 's'} in this queue collection.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPromptTextModalOpen(false)}
                disabled={isApplyingPromptText}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApplyTextToCollectionPrompts()}
                disabled={isApplyingPromptText || !promptTextToApply.trim() || items.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isApplyingPromptText ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Apply To All
              </button>
            </div>
          </div>
        </div>
      )}

      {isMoveModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/90 px-4 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-3xl rounded-[2.4rem] border border-slate-700 bg-slate-900 p-8 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">
                  <FolderInput size={14} />
                  Move Prompt
                </div>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-white">
                  {moveScope === 'all' ? 'Move All Prompts To Project' : 'Move Prompts To Project'}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Choose a prompt workspace, then pick where to place {moveScope === 'all' ? `all ${items.length}` : `the ${selectedItemIds.size} selected`} prompt{(moveScope === 'all' ? items.length : selectedItemIds.size) === 1 ? '' : 's'} as project item{(moveScope === 'all' ? items.length : selectedItemIds.size) === 1 ? '' : 's'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                disabled={isBulkMoving}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.8rem] border border-slate-800 bg-slate-950/60 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Prompt Workspace</div>
                <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
                  {availableProjects.length > 0 ? availableProjects.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedTargetProjectId(entry.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selectedTargetProjectId === entry.id
                          ? 'border-indigo-500 bg-indigo-500/10 text-white'
                          : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color || '#6366f1' }} />
                        <span className="text-sm font-semibold">{entry.name}</span>
                      </div>
                      {selectedTargetProjectId === entry.id && <Check size={16} className="text-indigo-300" />}
                    </button>
                  )) : (
                    <div className="rounded-2xl border border-red-900/30 bg-red-950/20 px-4 py-5 text-sm text-red-200">
                      No prompt workspaces are available yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.8rem] border border-slate-800 bg-slate-950/60 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Destination Collection</div>
                <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
                  <button
                    type="button"
                    onClick={() => setSelectedTargetCollectionId('')}
                    disabled={!selectedTargetProjectId || isLoadingTargetCollections}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedTargetCollectionId === ''
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">Project Root</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">No collection</div>
                    </div>
                    {selectedTargetCollectionId === '' && <Check size={16} className="text-indigo-300" />}
                  </button>

                  {isLoadingTargetCollections ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4 text-sm text-slate-300">
                      <Loader2 size={16} className="animate-spin" />
                      Loading collections...
                    </div>
                  ) : availableTargetCollections.length > 0 ? availableTargetCollections.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedTargetCollectionId(entry.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selectedTargetCollectionId === entry.id
                          ? 'border-indigo-500 bg-indigo-500/10 text-white'
                          : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold">{entry.name}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {entry.itemCount} total prompts
                        </div>
                      </div>
                      {selectedTargetCollectionId === entry.id && <Check size={16} className="text-indigo-300" />}
                    </button>
                  )) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 text-sm text-slate-400">
                      This prompt workspace does not have any collections yet. You can still move the prompts to the project root.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                disabled={isBulkMoving}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkMoveItems()}
                disabled={!selectedTargetProjectId || availableProjects.length === 0 || isBulkMoving || (moveScope === 'all' ? items.length === 0 : selectedItemIds.size === 0)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkMoving && <Loader2 size={16} className="animate-spin" />}
                {moveScope === 'all' ? 'Move All' : 'Move Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isQueueModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
          <div className="w-full max-w-2xl rounded-[2.4rem] border border-slate-700 bg-slate-900 p-8 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-white">Copy Selected Prompts</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Choose where to copy the {selectedItemIds.size} selected prompt{selectedItemIds.size === 1 ? '' : 's'} while keeping the original Prompt Collection intact.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsQueueModalOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleQueueToPromptManager()}
                  disabled={isQueueingToPromptManager || isQueueingToBulkStudio}
                  className="rounded-[1.8rem] border border-indigo-500/25 bg-indigo-500/10 p-6 text-left transition-colors hover:bg-indigo-500/15 disabled:opacity-50"
                >
                <div className="flex items-center gap-3 text-indigo-300">
                  {isQueueingToPromptManager ? <Loader2 size={20} className="animate-spin" /> : <FolderPlus size={20} />}
                  <span className="text-lg font-black">Copy To Prompt Manager Queue</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Create Queue Asset draft copies in Prompt Manager without changing or removing the original Prompt Collection items.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-indigo-200/80">
                  If you later export them back into a collection with the same title, the new copy will be auto-renamed instead of skipped.
                </p>
              </button>

              <button
                type="button"
                onClick={() => void handleQueueToBulkStudio()}
                disabled={isQueueingToPromptManager || isQueueingToBulkStudio}
                className="rounded-[1.8rem] border border-amber-500/25 bg-amber-500/10 p-6 text-left transition-colors hover:bg-amber-500/15 disabled:opacity-50"
              >
                <div className="flex items-center gap-3 text-amber-200">
                  {isQueueingToBulkStudio ? <Loader2 size={20} className="animate-spin" /> : <Copy size={20} />}
                  <span className="text-lg font-black">Bulk Synthesis Engine</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Copy the selected prompts into the Bulk Synthesis queue so they are ready to generate.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
