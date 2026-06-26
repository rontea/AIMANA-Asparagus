
import React from 'react';
import { useNavigate } from 'react-router';
import { Check, FolderPlus, Info, Loader2, X } from 'lucide-react';
import { ItemWithCurrentRevision, Project, ReferenceUsage, AssetType } from '../../types';
import { api } from '../../services/api';
import { determineAssetType } from '../../services/db';
import { useItemDetail } from '../../hooks/useItemDetail';
import { LabTask } from '../../hooks/useAiGeneration';

// Sub-components
import RevisionDetailModal from './RevisionDetailModal';
import { MainRevisionPreview } from './MainRevisionPreview';
import { ItemSidebar } from './ItemSidebar';
import { MosaicManager } from './MosaicManager';
import { ItemManifestHeader } from './ItemManifestHeader';
import { ItemActionFooter } from './ItemActionFooter';
import { ItemArchiveConfirmModal } from './ItemArchiveConfirmModal';
import { ArtifactSelectorModal } from '../../extensions/image-editor/components/ArtifactSelectorModal';
import { GenerationDataModal } from './GenerationDataModal';
import { MosaicViewerModal } from './MosaicViewerModal';
import { useModalDialogs } from '../../hooks/useModalDialogs';
import { ArtifactInspector } from '../project/lab/workspace/ArtifactInspector';
import { ModelOption } from '../project/lab/ModelSelectorModal';
import { loadDynamicRegistry } from '../project/lab/ModelSelector/registry/index';
import { ProjectReassignModal } from '../lab/history/ProjectReassignModal';
import { ProjectCollectionAssignModal } from '../project/ProjectCollectionAssignModal';
import { toPromptDraft } from '../prompt-manager/utils';

interface ItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithCurrentRevision;
  project: Project;
  onUpdate: (updatedItem: ItemWithCurrentRevision) => void;
  onOpenItem?: (item: ItemWithCurrentRevision) => void;
  onDelete: (itemId: string) => void;
  onMove?: (item: ItemWithCurrentRevision) => void;
  onRefreshHistory?: () => void;
  onRemixToBulk?: (item: ItemWithCurrentRevision) => void;
  onRemix?: (rev: any) => void;
  previewTopRightActions?: React.ReactNode;
}

const ItemDetailModal: React.FC<ItemDetailModalProps> = (props) => {
  const navigate = useNavigate();
  const { confirm, choose, confirmDialog, choiceDialog } = useModalDialogs();
  const detail = useItemDetail({ ...props, confirm, choose });
  const [referencedBy, setReferencedBy] = React.useState<ReferenceUsage[]>([]);
  const [isReferencedByLoading, setIsReferencedByLoading] = React.useState(false);
  const [isReferenceGalleryOpen, setIsReferenceGalleryOpen] = React.useState(false);
  const [isReferenceImageGalleryOpen, setIsReferenceImageGalleryOpen] = React.useState(false);
  const [allProjects, setAllProjects] = React.useState<Project[]>([]);
  const [showBulkReferenceMoveSelector, setShowBulkReferenceMoveSelector] = React.useState(false);
  const [bulkReferenceMoveIds, setBulkReferenceMoveIds] = React.useState<string[]>([]);
  const [bulkReferenceTargetProjectId, setBulkReferenceTargetProjectId] = React.useState<string>('');
  const [isBulkReferenceMoving, setIsBulkReferenceMoving] = React.useState(false);
  const [showBulkReferenceCollectionSelector, setShowBulkReferenceCollectionSelector] = React.useState(false);
  const [bulkReferenceCollectionIds, setBulkReferenceCollectionIds] = React.useState<string[]>([]);
  const [bulkReferenceCollectionProjectId, setBulkReferenceCollectionProjectId] = React.useState<string>('');
  const [bulkReferenceCollections, setBulkReferenceCollections] = React.useState<any[]>([]);
  const [bulkReferenceInitialCollectionId, setBulkReferenceInitialCollectionId] = React.useState<string | null>(null);
  const [isBulkReferenceCollectionMoving, setIsBulkReferenceCollectionMoving] = React.useState(false);
  const [manifestGalleryProjectMeta, setManifestGalleryProjectMeta] = React.useState<Record<string, { projectId?: string; projectName?: string }>>({});
  const [actionMessage, setActionMessage] = React.useState<{ type: 'success' | 'error'; message: string; persistent?: boolean } | null>(null);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = React.useState(false);
  const [isArchiveProcessing, setIsArchiveProcessing] = React.useState(false);
  const [isArtifactInspectorOpen, setIsArtifactInspectorOpen] = React.useState(false);
  const [pendingInspectorItemId, setPendingInspectorItemId] = React.useState<string | null>(null);
  const [isBlurringVersion, setIsBlurringVersion] = React.useState(false);
  const [isMovingPromptToStaging, setIsMovingPromptToStaging] = React.useState(false);
  const [registry, setRegistry] = React.useState<ModelOption[]>([]);
  const currentRev = props.item.currentRevision;
  const assetType = currentRev ? determineAssetType(currentRev.mimeType) : (null as any);
  const isReferenceAsset = React.useMemo(() => {
    if (!currentRev) return false;
    if (currentRev.engine === 'reference' || currentRev.engine === 'reference-upload') return true;
    if (currentRev.fileUrl?.includes('/Neural_Reference/')) return true;
    try {
      const parsed = currentRev.aiParameters ? JSON.parse(currentRev.aiParameters) : {};
      const adv = parsed?.advanced_params || parsed || {};
      return !!(
        adv.isReference ||
        adv.referenceAsset === true ||
        adv.source === 'reference_upload' ||
        adv.source === 'reference_drop' ||
        (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
      );
    } catch (e) {
      return false;
    }
  }, [currentRev]);
  const parsedAiParameters = React.useMemo(() => {
    if (!detail.formData.aiParameters) return { parsed: null, parseError: null as string | null };
    try {
      return { parsed: JSON.parse(detail.formData.aiParameters), parseError: null as string | null };
    } catch (e: any) {
      return { parsed: null, parseError: e?.message || 'Invalid JSON' };
    }
  }, [detail.formData.aiParameters]);

  const handleMovePromptToStaging = React.useCallback(async () => {
    const prompt = String(detail.formData.prompt || currentRev?.prompt || '').trim();
    if (!prompt) {
      setActionMessage({ type: 'error', message: 'This item does not have prompt text to move.' });
      setTimeout(() => setActionMessage(null), 2500);
      return;
    }

    setIsMovingPromptToStaging(true);
    try {
      const draft = toPromptDraft({ prompt, source: 'manual' });
      await api.settings.appendPromptManagerDrafts([draft]);
      window.dispatchEvent(new CustomEvent('aimana-prompt-drafts-updated'));
      setActionMessage({ type: 'success', message: 'Moved this item prompt to Prompt Manager staging.' });
      setTimeout(() => setActionMessage(null), 2500);
    } catch (error: any) {
      setActionMessage({ type: 'error', message: error?.message || 'Failed to move item prompt to Prompt Manager staging.' });
    } finally {
      setIsMovingPromptToStaging(false);
    }
  }, [currentRev?.prompt, detail.formData.prompt]);

  const rawDataEnvelope = React.useMemo(() => {
    return JSON.stringify({
      envelope: 'aimana.revision.raw.v1',
      item: {
        id: props.item.id,
        projectId: props.item.projectId,
        currentRevisionId: props.item.currentRevisionId
      },
      revision: currentRev ? {
        id: currentRev.id,
        itemId: currentRev.itemId,
        versionNumber: currentRev.versionNumber,
        storage: currentRev.storage,
        mimeType: currentRev.mimeType,
        size: currentRev.size,
        originalFilename: currentRev.originalFilename,
        remoteId: currentRev.remoteId || null,
        fileUrl: currentRev.fileUrl || null,
        thumbnailLink: currentRev.thumbnailLink || null,
        webViewLink: currentRev.webViewLink || null,
        webContentLink: currentRev.webContentLink || null,
        createdAt: currentRev.createdAt,
        isArchived: !!currentRev.isArchived,
        secondaryFiles: currentRev.secondaryFiles || []
      } : null,
      manifest: {
        title: detail.formData.title,
        label: detail.formData.label,
        tags: detail.formData.tags,
        prompt: detail.formData.prompt,
        engine: detail.formData.engine,
        note: detail.formData.note,
        originalFilename: detail.formData.originalFilename
      },
      neural: {
        aiParametersRaw: detail.formData.aiParameters || '',
        aiParametersParsed: parsedAiParameters.parsed,
        aiParametersParseError: parsedAiParameters.parseError
      }
    }, null, 2);
  }, [props.item.id, props.item.projectId, props.item.currentRevisionId, currentRev, detail.formData, parsedAiParameters]);

  const handleRawDataChange = (val: string) => {
    let nextAiParameters = val;
    try {
      const parsed = JSON.parse(val);
      const neural = (parsed && typeof parsed === 'object') ? (parsed as any).neural : null;
      if (typeof neural?.aiParametersRaw === 'string') {
        nextAiParameters = neural.aiParametersRaw;
      } else if (neural?.aiParametersParsed && typeof neural.aiParametersParsed === 'object') {
        nextAiParameters = JSON.stringify(neural.aiParametersParsed, null, 2);
      } else if (typeof (parsed as any)?.aiParametersRaw === 'string') {
        nextAiParameters = (parsed as any).aiParametersRaw;
      }
    } catch {
      // Backward-compatible: allow pasting raw aiParameters directly.
    }
    detail.setFormData({ ...detail.formData, aiParameters: nextAiParameters });
  };

  const pushActionMessage = React.useCallback((type: 'success' | 'error', message: string, options?: { persistent?: boolean }) => {
    const persistent = !!options?.persistent;
    setActionMessage({ type, message, persistent });
    if (!persistent) {
      setTimeout(() => setActionMessage(null), 2500);
    }
  }, []);

  const canBlurCurrentVersion = !!currentRev && (assetType === AssetType.IMAGE || assetType === AssetType.VIDEO);
  const isThumbnailBlurEnabled = React.useMemo(() => {
    if (!currentRev?.aiParameters) return false;
    try {
      const parsed = JSON.parse(currentRev.aiParameters);
      const adv = parsed?.advanced_params || parsed || {};
      return !!(adv.thumbnailBlur || parsed?.thumbnailBlur);
    } catch (e) {
      return false;
    }
  }, [currentRev?.aiParameters]);

  const handleCreateBlurredVersion = React.useCallback(async () => {
    if (!currentRev || !canBlurCurrentVersion) return;

    setIsBlurringVersion(true);
    try {
      let parsed: any = {};
      if (currentRev.aiParameters) {
        try {
          parsed = JSON.parse(currentRev.aiParameters);
        } catch (e) {
          pushActionMessage('error', 'Blur setting failed: invalid AI metadata JSON.');
          return;
        }
      }

      const adv = (parsed.advanced_params && typeof parsed.advanced_params === 'object')
        ? parsed.advanced_params
        : {};
      const nextEnabled = !isThumbnailBlurEnabled;
      const updatedParams = {
        ...parsed,
        thumbnailBlur: nextEnabled,
        advanced_params: {
          ...adv,
          thumbnailBlur: nextEnabled
        }
      };
      const aiParameters = JSON.stringify(updatedParams, null, 2);
      const updatedRev = { ...currentRev, aiParameters };
      await api.revisions.update(updatedRev);
      detail.setFormData({ ...detail.formData, aiParameters });
      props.onUpdate({ ...props.item, currentRevision: updatedRev });
      pushActionMessage('success', nextEnabled ? 'Thumbnail blur enabled.' : 'Thumbnail blur disabled.');
    } catch (error: any) {
      console.error('Blur version creation failed', error);
      pushActionMessage('error', `Blur setting failed: ${error?.message || 'Unable to update this item.'}`);
    } finally {
      setIsBlurringVersion(false);
    }
  }, [
    currentRev,
    canBlurCurrentVersion,
    isThumbnailBlurEnabled,
    props,
    detail,
    pushActionMessage
  ]);

  if (!props.isOpen) return null;

  const handleRemixToBulk = () => {
    if (!currentRev) return;

    if (props.onRemixToBulk) {
      props.onRemixToBulk(props.item);
      return;
    }

    const newTask = {
      id: Math.random().toString(36).substring(7),
      title: currentRev.title,
      prompt: currentRev.prompt,
      status: 'pending',
      progress: 0
    };
    void (async () => {
    try {
      await api.settings.appendBulkStudioTasks([newTask]);
      window.dispatchEvent(new CustomEvent('aimana-bulk-tasks-updated'));
      setActionMessage({ type: 'success', message: `Remix prompt added to Bulk section: "${currentRev.title}"` });
      setTimeout(() => setActionMessage(null), 2500);
    } catch (e) {
      console.error("Bulk add fail", e);
      setActionMessage({ type: 'error', message: "Failed to add remix prompt to Bulk section." });
      setTimeout(() => setActionMessage(null), 2500);
    }
    })();
  };

  const handleViewReference = async (refItem: ItemWithCurrentRevision) => {
    const fullItem = await api.items.get(refItem.id);
    if (fullItem) {
        if (props.onOpenItem) props.onOpenItem(fullItem);
        else props.onUpdate(fullItem);
        detail.setSelectedRevision(null);
    }
  };

  const handleGalleryInspect = async (id: string) => {
      const cleanId = id.startsWith('root-') ? id.slice(5) : id;
      const isCurrentItemRoot = cleanId === props.item.id
        || cleanId === props.item.currentRevisionId
        || cleanId === props.item.currentRevision?.id;

      if (isCurrentItemRoot) {
        detail.setIsMosaicViewerOpen(false);
        setIsArtifactInspectorOpen(true);
        return;
      }

      const item = await api.items.get(cleanId);
      if (item) {
          detail.setIsMosaicViewerOpen(false);
          if (props.onOpenItem) props.onOpenItem(item);
          else props.onUpdate(item);
          detail.setSelectedRevision(null);
          setPendingInspectorItemId(item.id);
      }
  };

  const handleGalleryMoveToProject = async (id: string) => {
      if (!props.onMove) return;

      const cleanId = id.startsWith('root-') ? id.slice(5) : id;
      const isCurrentItemRoot = cleanId === props.item.id
        || cleanId === props.item.currentRevisionId
        || cleanId === props.item.currentRevision?.id;

      detail.setIsMosaicViewerOpen(false);

      if (isCurrentItemRoot) {
        props.onMove(props.item);
        return;
      }

      const item = await api.items.get(cleanId);
      props.onMove(item || props.item);
  };

  const loadReferencedBy = React.useCallback(async () => {
    if (!props.isOpen) return;
    setIsReferencedByLoading(true);
    try {
      const refs = await api.items.referencedBy(props.item.id);
      setReferencedBy(refs);
    } catch (e) {
      setReferencedBy([]);
    } finally {
      setIsReferencedByLoading(false);
    }
  }, [props.isOpen, props.item.id]);

  React.useEffect(() => {
    loadReferencedBy();
  }, [loadReferencedBy]);

  React.useEffect(() => {
    if (!props.isOpen) return;
    loadDynamicRegistry().then(setRegistry).catch(() => {});
  }, [props.isOpen]);

  React.useEffect(() => {
    if (!props.isOpen || !props.onMove) return;
    api.projects.list()
      .then((projects) => {
        setAllProjects(projects);
        if (!bulkReferenceTargetProjectId && projects.length > 0) {
          setBulkReferenceTargetProjectId(projects[0].id);
        }
      })
      .catch(() => {});
  }, [bulkReferenceTargetProjectId, props.isOpen, props.onMove]);

  React.useEffect(() => {
    if (!props.isOpen || !pendingInspectorItemId) return;
    if (props.item.id !== pendingInspectorItemId) return;
    setIsArtifactInspectorOpen(true);
    setPendingInspectorItemId(null);
  }, [pendingInspectorItemId, props.isOpen, props.item.id]);

  const handleOpenReferenceParent = async (itemId: string) => {
    const parent = await api.items.get(itemId);
    if (parent) {
      if (props.onOpenItem) props.onOpenItem(parent);
      else props.onUpdate(parent);
      detail.setSelectedRevision(null);
    }
  };

  const referenceGalleryFiles = React.useMemo(() => {
    return referencedBy.map((ref) => ({
      id: ref.parentItemId,
      url: ref.parentPreviewUrl || '',
      mimeType: ref.parentPreviewUrl ? (ref.parentMimeType || 'image/png') : 'application/octet-stream',
      projectName: ref.parentProjectName,
      projectId: ref.parentProjectId
    }));
  }, [referencedBy]);

  const referenceImageGalleryFiles = React.useMemo(() => {
    return referencedBy
      .filter((ref) => ref.relationKind === 'reference_image')
      .map((ref) => ({
        id: ref.parentItemId,
        url: ref.parentPreviewUrl || '',
        mimeType: ref.parentPreviewUrl ? (ref.parentMimeType || 'image/png') : 'application/octet-stream',
        projectName: ref.parentProjectName,
        projectId: ref.parentProjectId
      }));
  }, [referencedBy]);

  React.useEffect(() => {
    if (!props.isOpen) return;

    const linkedIds = Array.from(new Set(
      detail.allManifestFiles
        .filter((file) => !(file as any).isMain && !!file.id)
        .map((file) => file.id)
    ));

    if (linkedIds.length === 0) {
      setManifestGalleryProjectMeta({});
      return;
    }

    let isCancelled = false;
    void (async () => {
      const linkedItems = await Promise.all(linkedIds.map((itemId) => api.items.get(itemId).catch(() => null)));
      if (isCancelled) return;

      const nextMeta: Record<string, { projectId?: string; projectName?: string }> = {};
      linkedItems.forEach((linkedItem) => {
        if (!linkedItem) return;
        const projectName = allProjects.find((project) => project.id === linkedItem.projectId)?.name;
        nextMeta[linkedItem.id] = {
          projectId: linkedItem.projectId,
          projectName: projectName || linkedItem.projectId
        };
      });
      setManifestGalleryProjectMeta(nextMeta);
    })();

    return () => {
      isCancelled = true;
    };
  }, [allProjects, detail.allManifestFiles, props.isOpen]);

  const fullManifestGalleryFiles = React.useMemo(() => {
    return detail.allManifestFiles.map((file) => {
      if ((file as any).isMain) {
        return {
          ...file,
          projectId: props.item.projectId,
          projectName: props.project.name
        };
      }
      return {
        ...file,
        projectId: manifestGalleryProjectMeta[file.id]?.projectId,
        projectName: manifestGalleryProjectMeta[file.id]?.projectName
      };
    });
  }, [detail.allManifestFiles, manifestGalleryProjectMeta, props.item.projectId, props.project.name]);

  const handleReferenceGalleryInspect = async (itemId: string) => {
    setIsReferenceGalleryOpen(false);
    setIsReferenceImageGalleryOpen(false);
    if (itemId === props.item.id) {
      setIsArtifactInspectorOpen(true);
      return;
    }
    const item = await api.items.get(itemId);
    if (item) {
      if (props.onOpenItem) props.onOpenItem(item);
      else props.onUpdate(item);
      detail.setSelectedRevision(null);
      setPendingInspectorItemId(item.id);
    }
  };

  const handleReferenceGalleryMoveToProject = async (itemId: string) => {
    if (!props.onMove) return;

    setIsReferenceGalleryOpen(false);
    setIsReferenceImageGalleryOpen(false);

    if (itemId === props.item.id) {
      props.onMove(props.item);
      return;
    }

    const item = await api.items.get(itemId);
    props.onMove(item || props.item);
  };

  const handleReferenceGalleryBulkMoveToProject = async (itemIds: string[]) => {
    if (!props.onMove) return;
    const ids = Array.from(new Set(itemIds.filter(Boolean)));
    if (ids.length === 0) return;

    if (allProjects.length === 0) {
      const projects = await api.projects.list().catch(() => []);
      setAllProjects(projects);
      if (!bulkReferenceTargetProjectId && projects.length > 0) {
        setBulkReferenceTargetProjectId(projects[0].id);
      }
    }

    setBulkReferenceMoveIds(ids);
    setShowBulkReferenceMoveSelector(true);
  };

  const prepareBulkReferenceCollectionMove = async (
    itemIds: string[],
    projectId: string,
    options: { requireCurrentProjectMatch?: boolean } = {}
  ) => {
    const ids = Array.from(new Set(itemIds.filter(Boolean)));
    if (ids.length === 0 || !projectId) return false;

    try {
      const [collections, resolvedItems] = await Promise.all([
        api.collections.list(projectId),
        Promise.all(ids.map((itemId) => api.items.get(itemId)))
      ]);
      const validItems = resolvedItems.filter((item): item is ItemWithCurrentRevision => !!item);
      if (validItems.length === 0) {
        pushActionMessage('error', 'Selected manifest items could not be found.');
        return false;
      }
      const uniqueProjectIds = new Set(validItems.map((item) => item.projectId).filter(Boolean));
      if (options.requireCurrentProjectMatch && (uniqueProjectIds.size !== 1 || !uniqueProjectIds.has(projectId))) {
        pushActionMessage('error', 'Move to Collection is available only when all selected items belong to the same project.');
        return false;
      }

      setBulkReferenceCollectionIds(ids);
      setBulkReferenceCollectionProjectId(projectId);
      setBulkReferenceCollections(collections);
      const initialCollectionId = options.requireCurrentProjectMatch && validItems.every((item) => item.collectionId === (validItems[0]?.collectionId || null))
        ? (validItems[0]?.collectionId || null)
        : null;
      setBulkReferenceInitialCollectionId(initialCollectionId);
      setShowBulkReferenceCollectionSelector(true);
      return true;
    } catch (error: any) {
      pushActionMessage('error', error?.message || 'Failed to prepare collection move.');
      return false;
    }
  };

  const handleReferenceGalleryBulkMoveToCollection = async (itemIds: string[], projectId: string) => {
    await prepareBulkReferenceCollectionMove(itemIds, projectId, { requireCurrentProjectMatch: true });
  };

  const handleConfirmBulkReferenceMove = async () => {
    if (!bulkReferenceTargetProjectId || bulkReferenceMoveIds.length === 0) return;
    setIsBulkReferenceMoving(true);
    try {
      const prepared = await prepareBulkReferenceCollectionMove(bulkReferenceMoveIds, bulkReferenceTargetProjectId);
      if (!prepared) return;
      setShowBulkReferenceMoveSelector(false);
    } catch (error: any) {
      pushActionMessage('error', error?.message || 'Failed to prepare selected manifest items.');
    } finally {
      setIsBulkReferenceMoving(false);
    }
  };

  const handleConfirmBulkReferenceCollectionMove = async (collectionId: string | null) => {
    if (!bulkReferenceCollectionProjectId || bulkReferenceCollectionIds.length === 0) return;
    setIsBulkReferenceCollectionMoving(true);
    try {
      const resolvedItems = await Promise.all(bulkReferenceCollectionIds.map((itemId) => api.items.get(itemId)));
      const validItems = resolvedItems.filter((item): item is ItemWithCurrentRevision => !!item);
      const sourceProjectIds = new Set(validItems.map((item) => item.projectId).filter(Boolean));
      const targetProjectName = allProjects.find((project) => project.id === bulkReferenceCollectionProjectId)?.name || '';

      for (const item of validItems) {
        await api.items.update({ id: item.id, projectId: bulkReferenceCollectionProjectId, collectionId, isArchived: false });
      }

      setReferencedBy((prev) => prev.map((ref) => (
        bulkReferenceCollectionIds.includes(ref.parentItemId)
          ? {
              ...ref,
              parentProjectId: bulkReferenceCollectionProjectId,
              parentProjectName: targetProjectName || ref.parentProjectName
            }
          : ref
      )));
      setManifestGalleryProjectMeta((prev) => {
        const next = { ...prev };
        bulkReferenceCollectionIds.forEach((itemId) => {
          next[itemId] = {
            ...(next[itemId] || {}),
            projectId: bulkReferenceCollectionProjectId,
            projectName: targetProjectName || next[itemId]?.projectName || bulkReferenceCollectionProjectId
          };
        });
        return next;
      });

      sourceProjectIds.forEach((projectId) => {
        window.dispatchEvent(new CustomEvent('project-items-updated', {
          detail: { projectId, reason: 'reference-gallery-bulk-move-source' }
        }));
      });
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: bulkReferenceCollectionProjectId, reason: 'reference-gallery-bulk-move-target' }
      }));

      await loadReferencedBy();
      setShowBulkReferenceCollectionSelector(false);
      setShowBulkReferenceMoveSelector(false);
      detail.setIsMosaicViewerOpen(false);
      setIsReferenceGalleryOpen(false);
      setIsReferenceImageGalleryOpen(false);
      setBulkReferenceMoveIds([]);
      setBulkReferenceCollectionIds([]);
      pushActionMessage('success', collectionId
        ? `Moved ${validItems.length} manifest item${validItems.length === 1 ? '' : 's'} into collection.`
        : `Moved ${validItems.length} manifest item${validItems.length === 1 ? '' : 's'} to project root.`
      );
      props.onRefreshHistory?.();
    } catch (error: any) {
      pushActionMessage('error', error?.message || 'Failed to move selected reference images into collection.');
    } finally {
      setIsBulkReferenceCollectionMoving(false);
    }
  };

  const handleArchiveRequest = () => {
    setIsArchiveConfirmOpen(true);
  };

  const handleConfirmArchive = async () => {
    setIsArchiveProcessing(true);
    try {
      await detail.handleArchiveItem();
    } finally {
      setIsArchiveProcessing(false);
      setIsArchiveConfirmOpen(false);
    }
  };

  const inspectorTask = React.useMemo<LabTask | null>(() => {
    if (!currentRev) return null;

    let metadata: any = null;
    try {
      metadata = currentRev.aiParameters ? JSON.parse(currentRev.aiParameters) : null;
    } catch (e) {}

    return {
      id: props.item.id,
      title: detail.formData.title || currentRev.title,
      prompt: detail.formData.prompt || currentRev.prompt || '',
      modelId: currentRev.engine || 'unknown',
      modelLabel: registry.find((model) => model.id === currentRev.engine)?.label || currentRev.engine || 'Unknown Engine',
      status: 'success',
      progress: 100,
      result: null,
      error: null,
      timestamp: currentRev.createdAt || props.item.createdAt,
      aspectRatio: '1:1',
      archivedItem: {
        ...props.item,
        currentRevision: {
          ...currentRev,
          title: detail.formData.title || currentRev.title,
          prompt: detail.formData.prompt || currentRev.prompt || ''
        }
      },
      metadata
    };
  }, [currentRev, detail.formData.prompt, detail.formData.title, props.item, registry]);

  return (
    <>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center md:p-4 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500" role="dialog" aria-modal="true">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-[1800px] h-full md:h-[95vh] md:rounded-[3rem] shadow-[0_32px_120px_-16px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">

          {detail.showSaveSuccess && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[1100] bg-emerald-600 text-white px-8 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest animate-in slide-in-from-top-4 ring-4 ring-emerald-500/20">
              <Check size={18} strokeWidth={4} /> Manifest Synchronized
            </div>
          )}

          {actionMessage && (
            <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-[1100] px-8 py-3 rounded-full shadow-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest animate-in slide-in-from-top-4 ring-4 ${
              actionMessage.type === 'error'
                ? 'bg-red-600 text-white ring-red-500/20'
                : 'bg-emerald-600 text-white ring-emerald-500/20'
            }`}>
              <Check size={18} strokeWidth={4} />
              <span>{actionMessage.message}</span>
              <button
                onClick={() => setActionMessage(null)}
                className="ml-2 p-1 rounded-full bg-black/20 hover:bg-black/30 transition-colors"
                title="Close notification"
              >
                <X size={12} />
              </button>
            </div>
          )}

          <button onClick={props.onClose} className="absolute top-6 right-6 md:hidden z-[1100] p-3 bg-slate-800 text-white rounded-full shadow-2xl">
            <X size={24} />
          </button>

          <div className="flex-1 flex flex-col bg-black overflow-hidden relative border-r border-white/5">
            <MainRevisionPreview
              item={props.item} currentRev={currentRev} previewUrl={detail.previewUrl} isDragging={detail.isDragging}
              onDragEnter={(e) => { e.preventDefault(); detail.dragCounter.current++; detail.setIsDragging(true); }}
              onDragLeave={() => { detail.dragCounter.current--; if (detail.dragCounter.current <= 0) detail.setIsDragging(false); }}
              onDrop={detail.handleMainDrop}
              onReplaceClick={() => { detail.setSelectorMode('swap'); detail.setIsSelectorOpen(true); }}
              onBlurVersion={canBlurCurrentVersion ? () => { void handleCreateBlurredVersion(); } : undefined}
              isBlurring={isBlurringVersion}
              isBlurEnabled={isThumbnailBlurEnabled}
              onPinToggle={() => { }} onArchiveVersion={() => { }}
              onRemix={!isReferenceAsset && props.onRemix ? () => {
                if (!currentRev) return;
                props.onRemix!(currentRev);
                setActionMessage({ type: 'success', message: 'Remix prompt loaded in AI Lab.' });
                setTimeout(() => setActionMessage(null), 2500);
              } : undefined}
              onOpenFull={() => {
                if (!currentRev) return;
                detail.setMosaicInitialIndex(0);
                detail.setIsMosaicViewerOpen(true);
              }}
              onCancelDrag={() => { detail.setIsDragging(false); detail.dragCounter.current = 0; }}
              extraTopRightActions={
                <>
                  {currentRev && props.onMove && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onMove?.(props.item);
                      }}
                      className="p-3 rounded-full bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-xl"
                      title="Move to Project"
                    >
                      <FolderPlus size={18} />
                    </button>
                  )}
                  {currentRev && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsArtifactInspectorOpen(true);
                      }}
                      className="p-3 rounded-full bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-xl"
                      title="Inspect Manifest"
                    >
                      <Info size={18} />
                    </button>
                  )}
                  {props.previewTopRightActions}
                </>
              }
            />

            <MosaicManager
              secondaryFiles={detail.secondaryFiles}
              onAdd={() => { detail.setSelectorMode('mosaic'); detail.setIsSelectorOpen(true); }}
              onRemove={detail.handleRemoveSecondary}
              onView={(idx) => { detail.setMosaicInitialIndex(idx + 1); detail.setIsMosaicViewerOpen(true); }}
              onDrop={detail.handleMosaicDrop}
              onExpand={() => { detail.setMosaicInitialIndex(null); detail.setIsMosaicViewerOpen(true); }}
              viewMode="strip"
            />
          </div>

          <div className="w-full md:w-[580px] flex flex-col bg-[#080808] flex-1 md:h-full overflow-hidden relative shadow-[-40px_0_80px_rgba(0,0,0,0.5)] border-l border-white/5">
            <ItemManifestHeader
              title={detail.formData.title}
              onTitleChange={(val) => detail.setFormData({ ...detail.formData, title: val })}
              onClose={props.onClose}
              itemId={props.item.id}
              assetType={assetType}
              onNavigateToLab={() => navigate(`/extensions/image-editor?itemId=${props.item.id}`)}
              onRemixToBulk={!isReferenceAsset ? handleRemixToBulk : undefined}
              onMovePromptToStaging={String(detail.formData.prompt || currentRev?.prompt || '').trim() ? handleMovePromptToStaging : undefined}
              isMovingPromptToStaging={isMovingPromptToStaging}
              onMove={() => props.onMove?.(props.item)}
              onArchive={handleArchiveRequest}
            />

            <div className="flex-1 overflow-y-auto bg-black custom-scrollbar">
              <ItemSidebar
                item={props.item} project={props.project} currentRev={currentRev} formData={detail.formData} setFormData={detail.setFormData}
                secondaryFiles={detail.secondaryFiles} onCommitRefinement={detail.handleCommitRefinement}
                onLinkRequested={() => { detail.setSelectorMode('reference'); detail.setIsSelectorOpen(true); }}
                onUnlinkRequested={detail.handleUnlinkReference} onDropLink={(id) => detail.handleLinkReference([id])}
                onViewReference={handleViewReference}
                onMoveReferenceToProject={props.onMove}
                onRemoveSecondary={detail.handleRemoveSecondary}
                revisions={detail.revisions} isHistoryDragging={detail.isHistoryDragging}
                onHistoryDragEnter={(e) => { e.preventDefault(); detail.historyDragCounter.current++; detail.setIsHistoryDragging(true); }}
                onHistoryDragLeave={() => { detail.historyDragCounter.current--; if (detail.historyDragCounter.current <= 0) detail.setIsHistoryDragging(false); }}
                onHistoryDrop={detail.handleHistoryDrop}
                onHistoryAddClick={() => detail.replaceMainInputRef.current?.click()} onSelectRevision={detail.setSelectedRevision}
                onRestoreRevision={detail.handleRestorePromotion}
                onShowParams={() => detail.setShowParamsModal(true)} engines={detail.engines}
                onMosaicDrop={detail.handleMosaicDrop}
                onMosaicView={(idx) => { detail.setMosaicInitialIndex(idx + 1); detail.setIsMosaicViewerOpen(true); }}
                onMosaicAdd={() => { detail.setSelectorMode('mosaic'); detail.setIsSelectorOpen(true); }}
                onReferenceDrop={detail.handleReferenceDrop}
                referencedBy={referencedBy}
                isReferencedByLoading={isReferencedByLoading}
                onOpenReferenceParent={handleOpenReferenceParent}
                onOpenReferenceGallery={() => setIsReferenceGalleryOpen(true)}
                onOpenReferenceImageGallery={() => setIsReferenceImageGalleryOpen(true)}
                onOpenItemById={(itemId) => { void handleOpenReferenceParent(itemId); }}
              />
            </div>

            <ItemActionFooter
              onClose={props.onClose}
              onSave={detail.handleSaveMeta}
              onArchive={handleArchiveRequest}
              isSubmitting={detail.isSubmitting}
              canSave={!!detail.formData.title}
            />
          </div>
        </div>
      </div>

      <ItemArchiveConfirmModal
        isOpen={isArchiveConfirmOpen}
        itemTitle={detail.formData.title || props.item.currentRevision?.originalFilename || props.item.id}
        onCancel={() => { if (!isArchiveProcessing) setIsArchiveConfirmOpen(false); }}
        onConfirm={handleConfirmArchive}
        isProcessing={isArchiveProcessing}
      />

      {confirmDialog}
      {choiceDialog}

      {isArtifactInspectorOpen && inspectorTask && (
        <ArtifactInspector
          task={inspectorTask}
          onClose={() => setIsArtifactInspectorOpen(false)}
          onUpdate={(_, updates) => {
            const nextArchivedItem = updates.archivedItem || props.item;
            const nextCurrentRevision = nextArchivedItem.currentRevision || currentRev;
            if (!nextCurrentRevision) return;
            const nextRevision = {
              ...nextCurrentRevision,
              title: updates.title ?? nextCurrentRevision.title,
              prompt: updates.prompt ?? nextCurrentRevision.prompt
            };
            const updatedItem = {
              ...nextArchivedItem,
              currentRevision: nextRevision
            };
            detail.setFormData({
              ...detail.formData,
              title: nextRevision.title,
              prompt: nextRevision.prompt
            });
            props.onUpdate(updatedItem);
            void detail.loadRevisions();
            props.onRefreshHistory?.();
          }}
          onDelete={() => {
            setIsArtifactInspectorOpen(false);
            props.onDelete(props.item.id);
            props.onClose();
          }}
          onRemix={(task) => {
            if (task.archivedItem?.currentRevision && props.onRemix) {
              setIsArtifactInspectorOpen(false);
              props.onRemix(task.archivedItem.currentRevision);
            }
          }}
          registry={registry}
        />
      )}

      {detail.isSelectorOpen && (
        <ArtifactSelectorModal
          isOpen={detail.isSelectorOpen} onClose={() => detail.setIsSelectorOpen(false)}
          ingestContext={
            detail.selectorMode === 'reference'
              ? 'reference'
              : detail.selectorMode === 'mosaic'
                ? 'mosaic'
                : 'main'
          }
          referencedInItemIds={
            detail.selectorMode === 'mosaic'
              ? referencedBy.map((ref) => ref.parentItemId)
              : []
          }
          sourceItemId={detail.selectorMode === 'mosaic' ? props.item.id : undefined}
          onSelect={async (ids) => {
            if (detail.selectorMode === 'reference') detail.handleLinkReference(ids);
            else if (detail.selectorMode === 'mosaic') {
              const result = await detail.handleLinkMosaic(ids);
              const skippedCount = Number(result?.skippedCount || 0);
              const addedCount = Number(result?.addedCount || 0);
              if (skippedCount > 0) {
                const plural = skippedCount === 1 ? '' : 's';
                if (addedCount > 0) {
                  pushActionMessage('success', `Skipped ${skippedCount} artifact${plural}; already linked.`, { persistent: true });
                } else {
                  pushActionMessage('error', `No new artifacts added. ${skippedCount} already linked.`, { persistent: true });
                }
              }
            }
            else if (ids[0]) {
              const selected = await api.items.get(ids[0]);
              if (selected?.currentRevision?.fileUrl) {
                const res = await fetch(selected.currentRevision.fileUrl);
                const blob = await res.blob();
                detail.handleReplaceMain(new File([blob], selected.currentRevision.originalFilename, { type: selected.currentRevision.mimeType }));
                detail.setIsSelectorOpen(false);
              }
            }
          }}
        />
      )}

      {detail.selectedRevision && (
        <RevisionDetailModal
          isOpen={!!detail.selectedRevision}
          onClose={() => detail.setSelectedRevision(null)}
          revision={detail.selectedRevision}
          project={props.project}
          isHead={detail.selectedRevision.id === props.item.currentRevisionId}
          onUpdate={() => {
            detail.loadRevisions();
            api.items.get(props.item.id).then(freshItem => {
              if (freshItem) {
                props.onUpdate(freshItem);
                props.onRefreshHistory?.();
              }
            });
          }}
          onRefreshHistory={() => detail.loadRevisions()}
        />
      )}

      <MosaicViewerModal
        isOpen={detail.isMosaicViewerOpen}
        onClose={() => detail.setIsMosaicViewerOpen(false)}
        files={fullManifestGalleryFiles}
        title={detail.formData.title}
        initialIndex={detail.mosaicInitialIndex}
        onInspect={handleGalleryInspect}
        onMoveToProject={props.onMove ? handleGalleryMoveToProject : undefined}
        onBulkMoveToProject={props.onMove ? handleReferenceGalleryBulkMoveToProject : undefined}
        onBulkMoveToCollection={handleReferenceGalleryBulkMoveToCollection}
        enableSelection
      />

      <MosaicViewerModal
        isOpen={isReferenceGalleryOpen}
        onClose={() => setIsReferenceGalleryOpen(false)}
        files={referenceGalleryFiles}
        title="Referenced In Manifest Gallery"
        initialIndex={null}
        onInspect={handleReferenceGalleryInspect}
        onMoveToProject={props.onMove ? handleReferenceGalleryMoveToProject : undefined}
        onBulkMoveToProject={props.onMove ? handleReferenceGalleryBulkMoveToProject : undefined}
        onBulkMoveToCollection={handleReferenceGalleryBulkMoveToCollection}
        enableSelection
      />

      <MosaicViewerModal
        isOpen={isReferenceImageGalleryOpen}
        onClose={() => setIsReferenceImageGalleryOpen(false)}
        files={referenceImageGalleryFiles}
        title="Reference Image Usage Gallery"
        initialIndex={null}
        onInspect={handleReferenceGalleryInspect}
        onMoveToProject={props.onMove ? handleReferenceGalleryMoveToProject : undefined}
        onBulkMoveToProject={props.onMove ? handleReferenceGalleryBulkMoveToProject : undefined}
        onBulkMoveToCollection={handleReferenceGalleryBulkMoveToCollection}
        enableSelection
      />

      {showBulkReferenceMoveSelector && (
        <ProjectReassignModal
          projects={allProjects}
          selectedProjectId={bulkReferenceTargetProjectId}
          onSelectProject={setBulkReferenceTargetProjectId}
          onConfirm={handleConfirmBulkReferenceMove}
          onCancel={() => {
            if (!isBulkReferenceMoving) {
              setShowBulkReferenceMoveSelector(false);
              setBulkReferenceMoveIds([]);
            }
          }}
        isMoving={isBulkReferenceMoving}
          title={bulkReferenceMoveIds.length > 1 ? `Move ${bulkReferenceMoveIds.length} Manifest Items` : 'Move Manifest Item'}
          description="Select a destination project, then choose the project root or one of its collections."
          confirmLabel="Choose Collection"
        />
      )}

      <ProjectCollectionAssignModal
        isOpen={showBulkReferenceCollectionSelector}
        collections={bulkReferenceCollections}
        itemCount={bulkReferenceCollectionIds.length}
        initialCollectionId={bulkReferenceInitialCollectionId}
        isSubmitting={isBulkReferenceCollectionMoving}
        title="Choose Project Collection"
        description={`Place ${bulkReferenceCollectionIds.length} selected manifest item${bulkReferenceCollectionIds.length === 1 ? '' : 's'} in the project root or a collection.`}
        helperNote="Choose Project Root to keep the items directly in the selected project."
        confirmLabel="Move Selected"
        onClose={() => {
          if (!isBulkReferenceCollectionMoving) {
            setShowBulkReferenceCollectionSelector(false);
            setBulkReferenceCollectionIds([]);
          }
        }}
        onConfirm={handleConfirmBulkReferenceCollectionMove}
      />

      <GenerationDataModal isOpen={detail.showParamsModal} onClose={() => detail.setShowParamsModal(false)} data={rawDataEnvelope} onDataChange={handleRawDataChange} />

      <input type="file" ref={detail.replaceMainInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && detail.handleReplaceMain(e.target.files[0])} />
      <input type="file" ref={detail.galleryInputRef} multiple className="hidden" accept="image/*" onChange={(e) => e.target.files && detail.handleAddSecondaryHeadless(e.target.files)} />

      {detail.isSubmitting && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in">
          <Loader2 className="animate-spin text-indigo-500 mb-6" size={64} />
          <span className="text-sm font-black uppercase tracking-[0.4em] text-white">Promoting Manifest...</span>
        </div>
      )}
    </>
  );
};

export default ItemDetailModal;
