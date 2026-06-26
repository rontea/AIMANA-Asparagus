import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
/* Importing from react-router core to fix missing named export errors */
import { useParams, useNavigate, useLocation } from 'react-router';
import { ArrowLeft, Check, Clock, Folder, ImageIcon, MoreVertical, Plus, SendToBack, Settings, Trash2, UploadCloud, X, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { ItemWithCurrentRevision, Revision, Project, ProjectCollection, ProjectStorageType } from '../types';
import { useProjectData } from '../hooks/useProjectData';
import { useProjectActions } from '../hooks/useProjectActions';
import { useAssetFilters } from '../hooks/useAssetFilters';
import { useProjectSharing } from '../hooks/useProjectSharing';
import { useToast } from '../hooks/useToast';
import { useItemActions } from '../hooks/useItemActions';
import { LabTask } from '../hooks/useAiGeneration';
import { sortAssets } from '../utils/assetSorting';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { useChatItems } from '../hooks/useChatItems';

import UploadManager from '../components/UploadManager';
import { ProjectHeader } from '../components/project/ProjectHeader';
import { ProjectToolbar } from '../components/project/ProjectToolbar';
import { BulkActionBar } from '../components/project/BulkActionBar';
import { BulkMergeModal } from '../components/project/BulkMergeModal';
import { ProjectTabs, TabID } from '../components/project/ProjectTabs';
import { ActiveAssetsTab } from '../components/project/ActiveAssetsTab';
import { PinnedAssetsTab } from '../components/project/PinnedAssetsTab';
import { ReferenceAssetsTab } from '../components/project/ReferenceAssetsTab';
import { GroupedAssetsTab } from '../components/project/GroupedAssetsTab';
import AssetCard from '../components/AssetCard';
import { GeneratedImageResult } from '../services/geminiService';

// New Sub-components
import { ProjectQuickLab, LabMode } from '../components/project/ProjectQuickLab';
import { ProjectLightboxOverlay } from '../components/project/ProjectLightboxOverlay';
import { ProjectModalsOrchestrator } from '../components/project/ProjectModalsOrchestrator';
import { ArtifactInspector } from '../components/project/lab/workspace/ArtifactInspector';
import { ItemArchiveConfirmModal } from '../components/item/ItemArchiveConfirmModal';
import { ModelOption } from '../components/project/lab/ModelSelectorModal';
import { loadDynamicRegistry } from '../components/project/lab/ModelSelector/registry/index';
import { ChatItemDetailModal } from '../components/chat-items/ChatItemDetailModal';
import { ProjectCollectionModal } from '../components/project/ProjectCollectionModal';
import { ProjectCollectionAssignModal } from '../components/project/ProjectCollectionAssignModal';
import { ChatItem, ChatItemDetail } from '../types/chatItems';
import { createGeneratedAssetFile } from '../utils/generatedAssetFile';
import { isTranscriptionAudioModel } from '../components/project/lab/ModelSelector/audioModelUtils';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import { extractAutoReferenceImageTag, mergeRevisionTags } from '../utils/revisionTags';
import { toPromptDraft } from '../components/prompt-manager/utils';
import { DEFAULT_GOOGLE_TEXT_MODEL } from '../utils/googleModelIds';

type ProjectMediaFilter = 'all' | 'image' | 'video' | 'audio' | 'text' | 'collections';

const hasThumbnailBlur = (revision: Revision | null | undefined): boolean => {
    const raw = revision?.aiParameters;
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        const advancedParams = parsed?.advanced_params || parsed || {};
        return !!(advancedParams.thumbnailBlur || parsed?.thumbnailBlur);
    } catch {
        return false;
    }
};

const ProjectDashboard: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    
    const { toast, showToast } = useToast();
    const { confirm, confirmDialog } = useModalDialogs();
    const [activeTab, setActiveTab] = useState<TabID>('active');
    const [isDragging, setIsDragging] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [roleFilter, setRoleFilter] = useState<'all' | 'none' | 'linked' | 'neural' | 'reference_image' | 'forge'>('all');
    const [mediaFilter, setMediaFilter] = useState<ProjectMediaFilter>('all');
    const [selectedItem, setSelectedItem] = useState<ItemWithCurrentRevision | null>(null);
    const [pendingArchiveItem, setPendingArchiveItem] = useState<ItemWithCurrentRevision | null>(null);
    const [isArchiveProcessing, setIsArchiveProcessing] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImportPromptOpen, setIsImportPromptOpen] = useState(false);
    const [isAiLabOpen, setIsAiLabOpen] = useState(false);
    const [labMode, setLabMode] = useState<LabMode>('image');
    const [remixRevision, setRemixRevision] = useState<Revision | null>(null);
    const [inspectorRegistry, setInspectorRegistry] = useState<ModelOption[]>([]);
    const [inspectedItemTask, setInspectedItemTask] = useState<LabTask | null>(null);
    
    const [movingItem, setMovingItem] = useState<ItemWithCurrentRevision | null>(null);
    const [isBulkMove, setIsBulkMove] = useState(false);
    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [targetProjectId, setTargetProjectId] = useState<string>('');
    const [isMoving, setIsMoving] = useState(false);
    const [isMergingReferences, setIsMergingReferences] = useState(false);
    const [isCheckingPromptDuplicates, setIsCheckingPromptDuplicates] = useState(false);
    const [isMovingPromptsToStaging, setIsMovingPromptsToStaging] = useState(false);
    const [isBulkMergeModalOpen, setIsBulkMergeModalOpen] = useState(false);
    const [bulkMergeCandidateIds, setBulkMergeCandidateIds] = useState<string[]>([]);
    const [bulkMergeMainItemId, setBulkMergeMainItemId] = useState<string>('');
    const [isBulkMerging, setIsBulkMerging] = useState(false);
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const lastRequestedCollectionIdRef = useRef<string | null>(null);
    const collectionPromptMenuRef = useRef<HTMLDivElement>(null);
    const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [editingCollection, setEditingCollection] = useState<ProjectCollection | null>(null);
    const [isCollectionPromptMenuOpen, setIsCollectionPromptMenuOpen] = useState(false);
    const [collectionPromptAction, setCollectionPromptAction] = useState<'queue' | 'prompt' | 'staging' | 'recycle' | null>(null);
    const [isUpdatingCollectionName, setIsUpdatingCollectionName] = useState(false);
    const [isCollectionThumbnailPickerOpen, setIsCollectionThumbnailPickerOpen] = useState(false);
    const [isUploadingCollectionThumbnail, setIsUploadingCollectionThumbnail] = useState(false);
    const [collectionTargetItem, setCollectionTargetItem] = useState<ItemWithCurrentRevision | null>(null);
    const [isBulkCollectionAssign, setIsBulkCollectionAssign] = useState(false);
    const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
    const [isCollectionAssigning, setIsCollectionAssigning] = useState(false);
    const [externalReferencedItems, setExternalReferencedItems] = useState<ItemWithCurrentRevision[]>([]);
    const [inboundReferencedTargetIds, setInboundReferencedTargetIds] = useState<Set<string>>(new Set());
    const [inboundRelationKindsByTarget, setInboundRelationKindsByTarget] = useState<Map<string, Set<string>>>(new Map());
    const [selectedChatItem, setSelectedChatItem] = useState<ChatItemDetail | null>(null);
    const [isChatItemDetailOpen, setIsChatItemDetailOpen] = useState(false);
    const [isChatItemDetailLoading, setIsChatItemDetailLoading] = useState(false);
    const [isChatItemArchiving, setIsChatItemArchiving] = useState(false);
    const [selectedChatItemIds, setSelectedChatItemIds] = useState<Set<string>>(new Set());
    const [movingChatItem, setMovingChatItem] = useState<ChatItemDetail | null>(null);
    const [isBulkChatMove, setIsBulkChatMove] = useState(false);
    const [showChatProjectSelector, setShowChatProjectSelector] = useState(false);
    const [targetChatProjectId, setTargetChatProjectId] = useState<string>('');
    const [isChatMoving, setIsChatMoving] = useState(false);

    // Lightbox State
    const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
    const [zoomScale, setZoomScale] = useState(1);
    const [isAutoPlaying, setIsAutoPlaying] = useState(false);

    const { project, setProject, collections, setCollections, items, setItems, loading, refresh } = useProjectData(id);
    const [engines, setEngines] = useState<string[]>([]);
    const { items: chatItems, isLoading: isChatItemsLoading, refresh: refreshChatItems } = useChatItems(id);
    const availableChatMoveProjects = useMemo(
        () => allProjects.filter((project) => project.id !== id),
        [allProjects, id]
    );

    useEffect(() => {
        const loadEngines = async () => {
            try {
                const settings = await api.settings.get();
                setEngines(settings.aiEngines || []);
            } catch (e) { console.error("Failed to load engines", e); }
        };
        loadEngines();
        loadDynamicRegistry().then(setInspectorRegistry).catch(() => {});
        api.projects.list().then(setAllProjects);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (collectionPromptMenuRef.current && !collectionPromptMenuRef.current.contains(event.target as Node)) {
                setIsCollectionPromptMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const { uploads, setUploads, isZipping, handleFileUpload, handleBulkDownload, handleProjectExport } = useProjectActions(
        id, project?.name, (m) => showToast(m), (m) => showToast(m, 'error'), refresh, confirm
    );

    const { handlePinToggle, handleArchiveItem } = useItemActions({ setItems, showToast });

    const { isShareModalOpen, setIsShareModalOpen } = useProjectSharing({
        projectId: project?.id || '',
        projectName: project?.name || ''
    });

    const activeItems = useMemo(() => items.filter(i => !i.isArchived), [items]);
    const { 
        searchTerm, setSearchTerm, 
        sortType, setSortType, 
        viewType, setViewType, 
        filteredAndSortedItems 
    } = useAssetFilters({ 
        items: activeItems, 
        storageKeyPrefix: 'aimana_project' 
    });
    const allowGroupedView = roleFilter !== 'all' && roleFilter !== 'none';
    const assetPanelViewType = viewType === 'group' ? 'grid' : viewType;

    const pinnedItems = useMemo(() => filteredAndSortedItems.filter(i => i.isPinned), [filteredAndSortedItems]);

    const collectReferencedIdsFromRevision = useCallback((item: ItemWithCurrentRevision, sink: Set<string>) => {
        const rev = item.currentRevision;
        if (!rev) return;

        rev.secondaryFiles?.forEach(file => {
            if (file?.id) sink.add(file.id);
        });

        try {
            if (!rev.aiParameters) return;
            const params = JSON.parse(rev.aiParameters);
            const adv = params.advanced_params || params;
            const list = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds : [];
            const audioList = Array.isArray(adv.referenceAudioItemIds) ? adv.referenceAudioItemIds : [];
            list.forEach((refId: string) => {
                if (refId) sink.add(refId);
            });
            audioList.forEach((refId: string) => {
                if (refId) sink.add(refId);
            });
            if (typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()) {
                sink.add(adv.referenceItemId.trim());
            }
            if (typeof adv.referenceAudioItemId === 'string' && adv.referenceAudioItemId.trim()) {
                sink.add(adv.referenceAudioItemId.trim());
            }
        } catch (e) {}
    }, []);

    const { localReferencedTargetIds, externalReferencedIds } = useMemo(() => {
        const localIds = new Set(activeItems.map(i => i.id));
        const referenced = new Set<string>();

        activeItems.forEach(item => collectReferencedIdsFromRevision(item, referenced));

        const localTargets = new Set<string>();
        const externalTargets = new Set<string>();
        referenced.forEach((id) => {
            if (localIds.has(id)) localTargets.add(id);
            else externalTargets.add(id);
        });

        return { localReferencedTargetIds: localTargets, externalReferencedIds: externalTargets };
    }, [activeItems, collectReferencedIdsFromRevision]);

    const isReferenceNode = useCallback((item: ItemWithCurrentRevision) => {
        if (localReferencedTargetIds.has(item.id)) return true;
        if (inboundReferencedTargetIds.has(item.id)) return true;

        const rev = item.currentRevision;
        if (!rev) return false;

        if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
        if (rev.fileUrl?.includes('/Neural_Reference/')) return true;
        if (rev.secondaryFiles && rev.secondaryFiles.length > 0) return true;

        try {
            if (rev.aiParameters) {
                const params = JSON.parse(rev.aiParameters);
                const adv = params.advanced_params || params;
                const hasReferenceManifest = Array.isArray(adv.referenceItemIds) && adv.referenceItemIds.length > 0;
                const isExplicitReferenceImage = !!(
                    (adv.isReference && !adv.parentItemId) ||
                    adv.referenceAsset === true ||
                    adv.source === 'reference_upload' ||
                    adv.source === 'reference_drop' ||
                    (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
                );
                return hasReferenceManifest || isExplicitReferenceImage;
            }
        } catch (e) {}
        return false;
    }, [inboundReferencedTargetIds, localReferencedTargetIds]);

    const isReferenceImageItem = useCallback((item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return false;
        try {
            let adv: any = null;
            if (rev.aiParameters) {
                const params = JSON.parse(rev.aiParameters);
                adv = params.advanced_params || params;
            }

            // Manifest-linked artifacts should stay classified as linked assets,
            // even when stored under Neural_Reference containers.
            if (adv?.source === 'manifest_link') return false;

            const explicitReferenceImage = !!(
                (adv.isReference && !adv.parentItemId) ||
                adv.referenceAsset === true ||
                adv.source === 'reference_upload' ||
                adv.source === 'reference_drop' ||
                (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
            );
            if (explicitReferenceImage) return true;
        } catch (e) {
            // Fall through to engine/path heuristics if metadata is malformed.
        }
        if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
        if (rev.fileUrl?.includes('/Neural_Reference/')) return true;
        return false;
    }, []);

    const isManifestLinkedItem = useCallback((item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev?.aiParameters) return false;
        try {
            const params = JSON.parse(rev.aiParameters);
            const adv = params.advanced_params || params;
            return adv?.source === 'manifest_link';
        } catch (e) {
            return false;
        }
    }, []);

    const isMoveRestricted = useCallback((item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return false;
        return item.isArchived;
    }, []);

    const isMergeSupportedItem = useCallback((item: ItemWithCurrentRevision) => {
        const mimeType = String(item.currentRevision?.mimeType || '').toLowerCase();
        return mimeType.startsWith('image/') || mimeType.startsWith('video/');
    }, []);

    const handleArchiveRequest = useCallback((item: ItemWithCurrentRevision) => {
        setPendingArchiveItem(item);
    }, []);

    const buildInspectorTaskFromItem = useCallback((item: ItemWithCurrentRevision): LabTask | null => {
        const rev = item.currentRevision;
        if (!rev) return null;

        let metadata: any = null;
        try {
            metadata = rev.aiParameters ? JSON.parse(rev.aiParameters) : null;
        } catch (e) {}

        const modelId = rev.engine || 'unknown';
        const modelLabel = inspectorRegistry.find((model) => model.id === modelId)?.label || modelId || 'Unknown Engine';

        return {
            id: item.id,
            title: rev.title,
            prompt: rev.prompt || '',
            modelId,
            modelLabel,
            status: 'success',
            progress: 100,
            result: null,
            error: null,
            timestamp: rev.createdAt || item.createdAt,
            aspectRatio: '1:1',
            archivedItem: item,
            metadata
        };
    }, [inspectorRegistry]);

    const handleInspectItemInfo = useCallback((item: ItemWithCurrentRevision) => {
        const task = buildInspectorTaskFromItem(item);
        if (task) setInspectedItemTask(task);
    }, [buildInspectorTaskFromItem]);

    const syncItemAcrossViews = useCallback((updatedItem: ItemWithCurrentRevision) => {
        setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
        setSelectedItem(prev => prev?.id === updatedItem.id ? updatedItem : prev);
        setInspectedItemTask(prev => prev?.archivedItem?.id === updatedItem.id ? buildInspectorTaskFromItem(updatedItem) : prev);
    }, [buildInspectorTaskFromItem, setItems]);

    const handleConfirmArchive = useCallback(async () => {
        if (!pendingArchiveItem) return;
        setIsArchiveProcessing(true);
        try {
            await handleArchiveItem(pendingArchiveItem);
        } finally {
            setIsArchiveProcessing(false);
            setPendingArchiveItem(null);
        }
    }, [handleArchiveItem, pendingArchiveItem]);

    const { linkedArtifactIds, neuralReferenceIds, referenceImageRelationIds } = useMemo(() => {
        const linked = new Set<string>();
        const neural = new Set<string>();
        const referenceImages = new Set<string>();

        activeItems.forEach((item) => {
            const rev = item.currentRevision;
            if (!rev) return;

            const hasLinkedArtifacts = Array.isArray(rev.secondaryFiles) && rev.secondaryFiles.length > 0;
            if (hasLinkedArtifacts) {
                // Only tag the linked artifact entries themselves as "Linked Artifacts".
                // Do not tag the parent item that owns the linked-artifact manifest.
                rev.secondaryFiles?.forEach((f) => {
                    if (f?.id) linked.add(f.id);
                });
            }

            try {
                if (!rev.aiParameters) return;
                const params = JSON.parse(rev.aiParameters);
                const adv = params.advanced_params || params;
                const refIds = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds : [];
                const refAudioIds = Array.isArray(adv.referenceAudioItemIds) ? adv.referenceAudioItemIds : [];
                const hasNeuralRefs = refIds.length > 0;
                if (hasNeuralRefs) neural.add(item.id);
                refIds.forEach((id: string) => {
                    if (id) neural.add(id);
                });
                refAudioIds.forEach((id: string) => {
                    if (id) neural.add(id);
                });
                if (typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()) {
                    referenceImages.add(adv.referenceItemId.trim());
                }
                if (typeof adv.referenceAudioItemId === 'string' && adv.referenceAudioItemId.trim()) {
                    referenceImages.add(adv.referenceAudioItemId.trim());
                }
            } catch (e) {}
        });

        return { linkedArtifactIds: linked, neuralReferenceIds: neural, referenceImageRelationIds: referenceImages };
    }, [activeItems]);

    const getMainViewContextBadges = useCallback((item: ItemWithCurrentRevision) => {
        const isReferenceImage = isReferenceImageItem(item);
        const isManifestLinked = isManifestLinkedItem(item);
        const badges: string[] = [];
        const inboundKinds = inboundRelationKindsByTarget.get(item.id);
        const hasLinkedRole = linkedArtifactIds.has(item.id) || !!inboundKinds?.has('linked');
        const hasNeuralRole = neuralReferenceIds.has(item.id) || !!inboundKinds?.has('neural');
        const hasReferenceImageRole = referenceImageRelationIds.has(item.id) || !!inboundKinds?.has('reference_image');

        if (isManifestLinked) {
            // Keep manifest-linked assets as linked by default, but if they are
            // actively used as Forge source images, surface them as Forge.
            if (hasReferenceImageRole) return ['Forge'];
            if (hasLinkedRole) badges.push('Linked Artifacts');
            if (hasNeuralRole) badges.push('Neural References');
            if (isReferenceImage) badges.push('Reference Image');
            return badges.length > 0 ? badges : ['Linked Artifacts'];
        }

        // Any source asset actively used as a Forge reference image should surface
        // under a single role, even if it originated in another project and was not
        // uploaded as a dedicated reference artifact.
        if (hasReferenceImageRole || (isReferenceImage && (hasLinkedRole || hasNeuralRole))) return ['Forge'];

        if (hasLinkedRole) badges.push('Linked Artifacts');
        if (hasNeuralRole) badges.push('Neural References');
        if (isReferenceImage) badges.push('Reference Image');

        return badges;
    }, [inboundRelationKindsByTarget, isManifestLinkedItem, isReferenceImageItem, linkedArtifactIds, neuralReferenceIds, referenceImageRelationIds]);

    const isLinkedArtifactItem = useCallback((item: ItemWithCurrentRevision) => {
        const inboundKinds = inboundRelationKindsByTarget.get(item.id);
        return isManifestLinkedItem(item) || linkedArtifactIds.has(item.id) || !!inboundKinds?.has('linked');
    }, [inboundRelationKindsByTarget, isManifestLinkedItem, linkedArtifactIds]);

    const matchesRoleFilter = useCallback((item: ItemWithCurrentRevision) => {
        if (roleFilter === 'all') return true;
        const badges = getMainViewContextBadges(item);
        if (roleFilter === 'none') return badges.length === 0;
        if (roleFilter === 'linked') return badges.includes('Linked Artifacts');
        if (roleFilter === 'neural') return badges.includes('Neural References');
        if (roleFilter === 'reference_image') return badges.includes('Reference Image');
        if (roleFilter === 'forge') return badges.includes('Forge');
        return true;
    }, [getMainViewContextBadges, roleFilter]);

    const matchesSearchTerm = useCallback((item: ItemWithCurrentRevision) => {
        if (!searchTerm) return true;
        const lowSearch = searchTerm.toLowerCase();
        const rev = item.currentRevision;
        return !!(
            rev?.title?.toLowerCase().includes(lowSearch) ||
            rev?.prompt?.toLowerCase().includes(lowSearch) ||
            rev?.note?.toLowerCase().includes(lowSearch)
        );
    }, [searchTerm]);

    const resolveMediaType = useCallback((item: ItemWithCurrentRevision): Exclude<ProjectMediaFilter, 'all'> | 'unknown' => {
        const mime = item.currentRevision?.mimeType?.toLowerCase() || '';
        if (!mime) return 'unknown';
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        if (
            mime.startsWith('text/') ||
            mime.includes('json') ||
            mime.includes('xml') ||
            mime.includes('javascript')
        ) {
            return 'text';
        }
        return 'unknown';
    }, []);

    const matchesMediaFilter = useCallback((item: ItemWithCurrentRevision) => {
        if (mediaFilter === 'all') return true;
        return resolveMediaType(item) === mediaFilter;
    }, [mediaFilter, resolveMediaType]);

    const getForgeSourceId = useCallback((item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev?.aiParameters) return null;
        try {
            const params = JSON.parse(rev.aiParameters);
            const adv = params.advanced_params || params;
            if (typeof adv.referenceAudioItemId === 'string' && adv.referenceAudioItemId.trim()) {
                return adv.referenceAudioItemId.trim();
            }
            return typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()
                ? adv.referenceItemId.trim()
                : null;
        } catch (e) {
            return null;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadExternalReferences = async () => {
            try {
                const externalIds = Array.from(externalReferencedIds);
                if (externalIds.length === 0) {
                    if (!cancelled) setExternalReferencedItems([]);
                    return;
                }

                const resolved = await api.items.resolve(externalIds);
                const valid = resolved.filter((i): i is ItemWithCurrentRevision => !!i && !i.isArchived);
                if (!cancelled) setExternalReferencedItems(valid);
            } catch (e) {
                if (!cancelled) setExternalReferencedItems([]);
            }
        };

        loadExternalReferences();
        return () => { cancelled = true; };
    }, [externalReferencedIds]);

    useEffect(() => {
        let cancelled = false;

        const loadInboundReferencedTargets = async () => {
            if (!id) {
                if (!cancelled) {
                    setInboundReferencedTargetIds(new Set());
                    setInboundRelationKindsByTarget(new Map());
                }
                return;
            }
            try {
                const relations = await api.items.referencedTargetRelations(id);
                if (!cancelled) {
                    const relationMap = new Map<string, Set<string>>();
                    for (const row of relations) {
                        relationMap.set(row.itemId, new Set(row.relationKinds || []));
                    }
                    setInboundRelationKindsByTarget(relationMap);
                    setInboundReferencedTargetIds(new Set(relations.map((r) => r.itemId)));
                }
            } catch (e) {
                try {
                    const ids = await api.items.referencedTargetIds(id);
                    if (!cancelled) {
                        setInboundReferencedTargetIds(new Set(ids));
                        setInboundRelationKindsByTarget(new Map(ids.map((targetId) => [targetId, new Set(['linked', 'neural'])])));
                    }
                } catch (fallbackErr) {
                    if (!cancelled) {
                        setInboundReferencedTargetIds(new Set());
                        setInboundRelationKindsByTarget(new Map());
                    }
                }
            }
        };

        loadInboundReferencedTargets();
        return () => { cancelled = true; };
    }, [id]);

    const referencedInItemIds = useMemo(() => {
        const merged = new Set<string>();
        localReferencedTargetIds.forEach((targetId) => merged.add(targetId));
        inboundReferencedTargetIds.forEach((targetId) => merged.add(targetId));
        return merged;
    }, [localReferencedTargetIds, inboundReferencedTargetIds]);

    const isReferencedInItem = useCallback(
        (item: ItemWithCurrentRevision) => referencedInItemIds.has(item.id),
        [referencedInItemIds]
    );
    
    const hasLinkedArtifactsManifest = useCallback((item: ItemWithCurrentRevision) => {
        const secondaryFiles = item.currentRevision?.secondaryFiles;
        return Array.isArray(secondaryFiles) && secondaryFiles.length > 0;
    }, []);

    /**
     * REFERENCE TAB ROOT LOGIC
     * Show only manifest roots that actually contain linked artifacts.
     */
    const referenceItems = useMemo(() => {
        const localManifestRoots = activeItems
            .filter(hasLinkedArtifactsManifest)
            .filter(matchesSearchTerm);
        return sortAssets(localManifestRoots, sortType);
    }, [activeItems, hasLinkedArtifactsManifest, matchesSearchTerm, sortType]);

    const filteredActiveItems = useMemo(() => {
        const localMatches = filteredAndSortedItems
            .filter(matchesRoleFilter)
            .filter(matchesMediaFilter);
        if (roleFilter !== 'forge') return localMatches;

        const externalForgeMatches = externalReferencedItems
            .filter(matchesSearchTerm)
            .filter(matchesRoleFilter)
            .filter(matchesMediaFilter);

        const merged = [...localMatches, ...externalForgeMatches];
        const deduped = Array.from(new Map(merged.map(item => [item.id, item])).values());
        return sortAssets(deduped, sortType);
    }, [externalReferencedItems, filteredAndSortedItems, matchesMediaFilter, matchesRoleFilter, matchesSearchTerm, roleFilter, sortType]);

    const filteredPinnedItems = useMemo(
        () => pinnedItems.filter(matchesRoleFilter).filter(matchesMediaFilter),
        [matchesMediaFilter, matchesRoleFilter, pinnedItems]
    );

    const filteredReferenceItems = useMemo(
        () => referenceItems.filter(matchesRoleFilter).filter(matchesMediaFilter),
        [matchesMediaFilter, matchesRoleFilter, referenceItems]
    );

    const forgeReferenceItems = useMemo(() => {
        // Strict Forge set: reference images that are actively used in Forge relations.
        return referenceItems.filter((item) => {
            const badges = getMainViewContextBadges(item);
            return badges.includes('Forge');
        });
    }, [getMainViewContextBadges, referenceItems]);

    const filteredForgeReferenceItems = useMemo(
        () => forgeReferenceItems.filter(matchesRoleFilter).filter(matchesMediaFilter),
        [forgeReferenceItems, matchesMediaFilter, matchesRoleFilter]
    );

    const forgeActiveGroups = useMemo(() => {
        const sourceMap = new Map<string, ItemWithCurrentRevision>();
        [...activeItems, ...externalReferencedItems].forEach((item) => {
            sourceMap.set(item.id, item);
        });

        const groupMap = new Map<string, { source: ItemWithCurrentRevision | null; related: ItemWithCurrentRevision[] }>();

        activeItems.forEach((item) => {
            const sourceId = getForgeSourceId(item);
            if (!sourceId) return;

            const existing = groupMap.get(sourceId);
            const source = sourceMap.get(sourceId) || existing?.source || null;
            if (existing) {
                existing.source = source;
                existing.related.push(item);
                return;
            }

            groupMap.set(sourceId, {
                source,
                related: [item]
            });
        });

        const groups = Array.from(groupMap.entries())
            .map(([sourceId, group]) => ({
                sourceId,
                source: group.source,
                related: sortAssets(
                    Array.from(new Map(group.related.map((item) => [item.id, item])).values()),
                    sortType
                )
            }))
            .filter((group) => {
                const sourceMatches = group.source ? (matchesSearchTerm(group.source) && matchesMediaFilter(group.source)) : false;
                const relatedMatches = group.related.filter((item) => matchesSearchTerm(item) && matchesMediaFilter(item));
                if (!sourceMatches && relatedMatches.length === 0) return false;
                group.related = relatedMatches;
                return true;
            });

        const ranked = sortAssets(
            groups
                .map((group) => group.source || group.related[0])
                .filter((item): item is ItemWithCurrentRevision => !!item),
            sortType
        );
        const rankMap = new Map(ranked.map((item, index) => [item.id, index]));

        return groups.sort((a, b) => {
            const aKey = a.source?.id || a.related[0]?.id || a.sourceId;
            const bKey = b.source?.id || b.related[0]?.id || b.sourceId;
            return (rankMap.get(aKey) ?? Number.MAX_SAFE_INTEGER) - (rankMap.get(bKey) ?? Number.MAX_SAFE_INTEGER);
        });
    }, [activeItems, externalReferencedItems, getForgeSourceId, matchesMediaFilter, matchesSearchTerm, sortType]);

    const forgeActiveSelectableItems = useMemo(() => {
        const localSourceIds = new Set(activeItems.map((item) => item.id));
        const visible: ItemWithCurrentRevision[] = [];

        forgeActiveGroups.forEach((group) => {
            if (group.source && localSourceIds.has(group.source.id)) visible.push(group.source);
            visible.push(...group.related);
        });

        return Array.from(new Map(visible.map((item) => [item.id, item])).values());
    }, [activeItems, forgeActiveGroups]);

    const linkedArtifactItemIds = useMemo(
        () => new Set(activeItems.filter(isLinkedArtifactItem).map((item) => item.id)),
        [activeItems, isLinkedArtifactItem]
    );

    const linkedArtifactItems = useMemo(
        () => filteredAndSortedItems.filter((item) => linkedArtifactItemIds.has(item.id)),
        [filteredAndSortedItems, linkedArtifactItemIds]
    );

    const filteredActiveItemsWithoutLinked = useMemo(
        () => filteredActiveItems.filter((item) => !isLinkedArtifactItem(item)),
        [filteredActiveItems, isLinkedArtifactItem]
    );

    const filteredCollectionItemsById = useMemo(() => {
        const map = new Map<string, ItemWithCurrentRevision[]>();
        filteredActiveItemsWithoutLinked.forEach((item) => {
            if (!item.collectionId) return;
            if (!map.has(item.collectionId)) map.set(item.collectionId, []);
            map.get(item.collectionId)?.push(item);
        });
        return map;
    }, [filteredActiveItemsWithoutLinked]);

    const filteredAllCollectionItemsById = useMemo(() => {
        const map = new Map<string, ItemWithCurrentRevision[]>();
        filteredActiveItems.forEach((item) => {
            if (!item.collectionId) return;
            if (!map.has(item.collectionId)) map.set(item.collectionId, []);
            map.get(item.collectionId)?.push(item);
        });
        return map;
    }, [filteredActiveItems]);

    const visibleCollections = useMemo(() => {
        if (mediaFilter !== 'all' && mediaFilter !== 'collections') return [];
        if (roleFilter !== 'all') return [];
        const lowSearch = searchTerm.trim().toLowerCase();
        return collections.filter((collection) => {
            if (filteredCollectionItemsById.has(collection.id)) return true;
            if (!lowSearch) return true;
            return collection.name.toLowerCase().includes(lowSearch);
        });
    }, [collections, filteredCollectionItemsById, mediaFilter, roleFilter, searchTerm]);

    useEffect(() => {
        if ((mediaFilter === 'all' || mediaFilter === 'collections') && roleFilter === 'all') return;
        setSelectedCollectionIds(new Set());
    }, [mediaFilter, roleFilter]);

    const filteredLooseActiveItems = useMemo(
        () => mediaFilter === 'collections'
            ? []
            : filteredActiveItemsWithoutLinked.filter((item) => !item.collectionId),
        [filteredActiveItemsWithoutLinked, mediaFilter]
    );

    const activeCollectionItems = useMemo(
        () => activeCollectionId ? (filteredAllCollectionItemsById.get(activeCollectionId) || []) : [],
        [activeCollectionId, filteredAllCollectionItemsById]
    );

    const activeCollectionAllItems = useMemo(
        () => activeCollectionId ? activeItems.filter((item) => item.collectionId === activeCollectionId) : [],
        [activeCollectionId, activeItems]
    );

    useEffect(() => {
        if (!activeCollectionId) return;
        if (collections.some((collection) => collection.id === activeCollectionId)) return;
        setActiveCollectionId(null);
    }, [activeCollectionId, collections]);

    const currentTabItems = activeTab === 'pinned'
        ? filteredPinnedItems
        : activeTab === 'linked_artifacts'
            ? linkedArtifactItems
        : activeTab === 'reference'
            ? filteredReferenceItems
            : activeTab === 'forge_reference'
                ? filteredForgeReferenceItems
                : activeCollectionId
                    ? activeCollectionItems
                    : filteredLooseActiveItems;
    const visibleChatItems = useMemo(() => {
        if (activeTab !== 'active') return [];
        if (activeCollectionId) return [];
        if (mediaFilter !== 'all' && mediaFilter !== 'text') return [];
        if (roleFilter !== 'all' && roleFilter !== 'none') return [];
        const query = searchTerm.trim().toLowerCase();
        const filtered = chatItems.filter((item) => {
            if (!query) return true;
            const haystack = `${item.title || ''}\n${item.transcriptText || ''}`.toLowerCase();
            return haystack.includes(query);
        });
        return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    }, [activeCollectionId, activeTab, chatItems, mediaFilter, roleFilter, searchTerm]);

    const selectedItems = useMemo(
        () => Array.from(selectedItemIds).map((itemId) => items.find((item) => item.id === itemId)).filter((item): item is ItemWithCurrentRevision => !!item),
        [items, selectedItemIds]
    );

    const activeCollection = useMemo(
        () => activeCollectionId ? collections.find((collection) => collection.id === activeCollectionId) || null : null,
        [activeCollectionId, collections]
    );

    const canOpenBulkMerge = useMemo(() => {
        if (selectedCollectionIds.size > 0) return false;
        if (selectedItems.length < 2) return false;
        return selectedItems.every(isMergeSupportedItem);
    }, [isMergeSupportedItem, selectedCollectionIds.size, selectedItems]);

    const bulkMergeCandidates = useMemo(
        () => bulkMergeCandidateIds
            .map((itemId) => items.find((item) => item.id === itemId))
            .filter((item): item is ItemWithCurrentRevision => !!item && isMergeSupportedItem(item)),
        [bulkMergeCandidateIds, isMergeSupportedItem, items]
    );

    useEffect(() => {
        if (!isBulkMergeModalOpen) return;
        if (bulkMergeCandidates.length === 0) {
            setBulkMergeMainItemId('');
            return;
        }
        if (!bulkMergeCandidates.some((item) => item.id === bulkMergeMainItemId)) {
            setBulkMergeMainItemId(bulkMergeCandidates[0].id);
        }
    }, [bulkMergeCandidates, bulkMergeMainItemId, isBulkMergeModalOpen]);

    const renderGrouped = (itemsToRender: ItemWithCurrentRevision[], showReferencedInIndicator: boolean = false, groupedChatItems: ChatItem[] = []) => (
        <GroupedAssetsTab
            items={itemsToRender}
            chatItems={groupedChatItems}
            selectedItemIds={selectedItemIds}
            selectedChatItemIds={selectedChatItemIds}
            onItemClick={(item, index) => viewType === 'gallery' ? setActiveLightboxIndex(index) : setSelectedItem(item)}
            onChatItemClick={(item) => handleOpenChatItem(item.id)}
            onPinToggle={handlePinToggle}
            onArchive={handleArchiveRequest}
            onMove={handleMoveInitiate}
            onMoveChat={handleChatMoveInitiate}
            onRemixToBulk={handleRemixToBulk}
            onInspectInfo={handleInspectItemInfo}
            getContextBadges={getMainViewContextBadges}
            isItemReferencedIn={showReferencedInIndicator ? isReferencedInItem : undefined}
            onToggleSelect={(e, id) => {
                e.stopPropagation();
                const next = new Set(selectedItemIds);
                if (next.has(id)) next.delete(id); else next.add(id);
                setSelectedItemIds(next);
            }}
            onToggleChatSelect={(item) => {
                setSelectedItemIds(new Set());
                setSelectedCollectionIds(new Set());
                setSelectedChatItemIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                });
            }}
            chatRegistry={inspectorRegistry}
        />
    );

    const renderLinkedArtifactGroups = () => {
        if (forgeActiveGroups.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-24 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-800">
                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                        <Loader2 size={32} className="opacity-60" />
                    </div>
                    <p className="text-slate-400 text-lg font-medium">No linked artifact groups found.</p>
                    <p className="text-slate-600 text-sm mt-1">Forge-linked source artifacts will appear here with the items that use them.</p>
                </div>
            );
        }

        return (
            <div className="space-y-8">
                {forgeActiveGroups.map((group) => {
                    const sourceItem = group.source;
                    const isLocalSource = !!sourceItem && sourceItem.projectId === project?.id;

                    return (
                        <div key={group.sourceId} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                                <span>Linked Source</span>
                                <span className="text-slate-500">{group.related.length} artifact{group.related.length === 1 ? '' : 's'} used this source</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {sourceItem && (
                                    <AssetCard
                                        key={sourceItem.id}
                                        item={sourceItem}
                                        onClick={() => handleOpenItemNormalView(sourceItem)}
                                        onPinToggle={isLocalSource ? handlePinToggle : undefined}
                                        onArchive={isLocalSource ? handleArchiveRequest : undefined}
                                        onMove={isLocalSource ? handleMoveInitiate : undefined}
                                        onRemixToBulk={isLocalSource ? handleRemixToBulk : undefined}
                                        onInspectInfo={handleInspectItemInfo}
                                        contextBadges={['Linked Artifacts']}
                                        isSelected={isLocalSource ? selectedItemIds.has(sourceItem.id) : false}
                                        onToggleSelect={isLocalSource ? (e, id) => {
                                            e.stopPropagation();
                                            const next = new Set(selectedItemIds);
                                            if (next.has(id)) next.delete(id); else next.add(id);
                                            setSelectedItemIds(next);
                                        } : undefined}
                                        viewType="grid"
                                    />
                                )}
                                {group.related.map((item) => (
                                    <AssetCard
                                        key={item.id}
                                        item={item}
                                        onClick={() => handleOpenItemNormalView(item)}
                                        onPinToggle={handlePinToggle}
                                        onArchive={handleArchiveRequest}
                                        onMove={handleMoveInitiate}
                                        onRemixToBulk={handleRemixToBulk}
                                        onInspectInfo={handleInspectItemInfo}
                                        contextBadges={Array.from(new Set(['Linked Artifacts', ...getMainViewContextBadges(item).filter((badge) => badge !== 'Forge')]))}
                                        isSelected={selectedItemIds.has(item.id)}
                                        onToggleSelect={(e, id) => {
                                            e.stopPropagation();
                                            const next = new Set(selectedItemIds);
                                            if (next.has(id)) next.delete(id); else next.add(id);
                                            setSelectedItemIds(next);
                                        }}
                                        viewType="grid"
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const requestedTab = q.get('tab');
        if (requestedTab === 'active' || requestedTab === 'linked_artifacts' || requestedTab === 'pinned' || requestedTab === 'reference' || requestedTab === 'forge_reference') {
            setActiveTab(requestedTab);
        }
    }, [location.search]);

    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const requestedCollectionId = q.get('collectionId');
        const previousRequestedCollectionId = lastRequestedCollectionIdRef.current;
        lastRequestedCollectionIdRef.current = requestedCollectionId;

        if (!requestedCollectionId) {
            if (previousRequestedCollectionId) {
                setActiveCollectionId(null);
            }
            return;
        }

        if (collections.some((collection) => collection.id === requestedCollectionId)) {
            setActiveTab('active');
            setActiveCollectionId((current) => current === requestedCollectionId ? current : requestedCollectionId);
        }
    }, [collections, location.search]);

    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const requestedItemId = q.get('itemId');
        if (!requestedItemId) return;

        const existingItem = items.find((item) => item.id === requestedItemId);
        if (existingItem) {
            setActiveTab('active');
            if (existingItem.collectionId) {
                setActiveCollectionId((current) => current === existingItem.collectionId ? current : existingItem.collectionId || null);
            }
            setSelectedItem(prev => prev?.id === existingItem.id ? prev : existingItem);
            return;
        }

        let isCancelled = false;
        api.items.get(requestedItemId)
            .then((item) => {
                if (!item || isCancelled) return;
                setActiveTab('active');
                if (item.collectionId) {
                    setActiveCollectionId((current) => current === item.collectionId ? current : item.collectionId || null);
                }
                setSelectedItem(prev => prev?.id === item.id ? prev : item);
            })
            .catch(() => {
                if (!isCancelled) {
                    showToast('Failed to load the requested item.', 'error');
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [items, location.search, showToast]);

    useEffect(() => {
        if (!allowGroupedView && viewType === 'group') {
            setViewType('grid');
        }
    }, [allowGroupedView, viewType, setViewType]);

    useEffect(() => {
        const handleProjectItemsUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<{ projectId?: string }>;
            if (!id || customEvent.detail?.projectId !== id) return;
            refresh().catch(() => {});
        };
        window.addEventListener('project-items-updated', handleProjectItemsUpdated as EventListener);
        return () => window.removeEventListener('project-items-updated', handleProjectItemsUpdated as EventListener);
    }, [id, refresh]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (activeLightboxIndex === null) return;
        setActiveLightboxIndex((activeLightboxIndex + 1) % currentTabItems.length);
        setZoomScale(1);
    }, [activeLightboxIndex, currentTabItems.length]);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (activeLightboxIndex === null) return;
        setActiveLightboxIndex((activeLightboxIndex - 1 + currentTabItems.length) % currentTabItems.length);
        setZoomScale(1);
    }, [activeLightboxIndex, currentTabItems.length]);

    useEffect(() => {
        let interval: any;
        if (isAutoPlaying && activeLightboxIndex !== null) {
            interval = setInterval(() => {
                handleNext();
            }, 4000);
        }
        return () => clearInterval(interval);
    }, [isAutoPlaying, activeLightboxIndex, handleNext]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (activeLightboxIndex === null) return;
        if (e.key === 'ArrowRight') handleNext();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'Escape') { setActiveLightboxIndex(null); setIsAutoPlaying(false); }
        if (e.key === '=' || e.key === '+') setZoomScale(prev => Math.min(prev + 0.5, 5));
        if (e.key === '-') setZoomScale(prev => Math.max(prev - 0.5, 0.5));
        if (e.key === '0') setZoomScale(1);
        if (e.key === ' ') { e.preventDefault(); setIsAutoPlaying(!isAutoPlaying); }
    }, [activeLightboxIndex, handleNext, handlePrev, isAutoPlaying]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleLightboxDragStart = (e: React.DragEvent, item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return;
        e.dataTransfer.setData('application/x-aimana-asset', item.id);
        const rawUrl = rev.fileUrl || (rev.blob ? URL.createObjectURL(rev.blob) : '');
        if (rawUrl) {
            const absoluteUrl = rawUrl.startsWith('http') ? rawUrl : window.location.origin + rawUrl;
            e.dataTransfer.setData('text/uri-list', absoluteUrl);
            e.dataTransfer.setData('text/plain', absoluteUrl);
            const dragData = `${rev.mimeType}:${rev.originalFilename}:${absoluteUrl}`;
            e.dataTransfer.setData('DownloadURL', dragData);
        }
    };

    const handleProjectPinToggle = async () => {
        if (!project) return;
        try {
            const updated = { ...project, isPinned: !project.isPinned };
            await api.projects.update(project.id, updated);
            setProject(updated);
            window.dispatchEvent(new CustomEvent('project-pinned-updated'));
        } catch (err) { showToast("Project pin failed", "error"); }
    };

    const handleUpdateProject = async (updates: Partial<Project>) => {
        if (!project) return;
        try {
            await api.projects.update(project.id, updates);
            const fresh = await api.projects.get(project.id);
            if (fresh) setProject(fresh);
            showToast("Workspace topology updated.");
        } catch (e) { showToast("Update failed.", "error"); }
    };

    const handleEngineChange = async (newEngine: string) => {
        if (!project) return;
        try {
            const updated = { ...project, defaultEngine: newEngine };
            await api.projects.update(project.id, updated);
            setProject(updated);
            showToast(`${project.systemKey === 'asset-ingestion' ? 'Asset Ingestion engine' : 'Default engine'} updated to: ${newEngine}`);
        } catch (e) { showToast("Failed to update engine", "error"); }
    };

    const handleCreateBlankItem = async () => {
        if (!id) return;
        try {
            const newItem = await api.items.createBlank(id);
            if (activeCollectionId) {
                await api.items.update({ id: newItem.id, collectionId: activeCollectionId });
            }
            await refresh();
            setSelectedItem(activeCollectionId ? { ...newItem, collectionId: activeCollectionId } : newItem);
            showToast("Blank artifact created.");
        } catch (err) { showToast("Failed to create blank item", "error"); }
    };

    const handleAddAiImage = async (result: GeneratedImageResult, originalPrompt: string, engineId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => {
        if (!project || !id) return;
        try {
            const finalTitle = userTitle?.trim() || `AI: ${originalPrompt.substring(0, 30)}${originalPrompt.length > 30 ? '...' : ''}`;
            if (archivedItem) {
                await api.items.update({ id: archivedItem.id, projectId: id, isArchived: false });
                if (archivedItem.currentRevision) {
                    await api.revisions.update({
                        id: archivedItem.currentRevision.id, prompt: originalPrompt, engine: engineId,
                        aiParameters: JSON.stringify(metadata, null, 2), title: finalTitle
                    });
                }
            } else {
                const file = createGeneratedAssetFile(result, {
                    baseName: finalTitle || metadata?.sourceFileName || `ai-gen-${Date.now()}`,
                    formatHint: metadata?.dynamicParams?.response_format
                });
                const itemWithRev = await api.items.create(id, file, () => {});
                if (itemWithRev.currentRevision) {
                    const nextTags = mergeRevisionTags(
                        itemWithRev.currentRevision.tags,
                        extractAutoReferenceImageTag(metadata)
                    );
                    await api.revisions.update({
                        id: itemWithRev.currentRevision.id, prompt: originalPrompt, engine: engineId,
                        aiParameters: JSON.stringify(metadata, null, 2), title: finalTitle, tags: nextTags
                    });
                }
            }
            await refresh();
            showToast("Asset saved with generation parameters.");
        } catch (err) { showToast("Failed to ingest AI asset", "error"); }
    };

    const handleRemix = (rev: Revision) => {
        if (rev.mimeType.startsWith('text/') && isTranscriptionAudioModel({ id: rev.engine, label: rev.title, desc: rev.prompt })) {
            showToast('Transcript captures cannot be remixed. Upload a new audio file in Audio to Text.', 'error');
            return;
        }
        setRemixRevision(rev);
        setLabMode(rev.mimeType.startsWith('video/') ? 'video' : rev.mimeType.startsWith('audio/') ? 'audio' : 'image');
        setIsAiLabOpen(true);
        showToast('Remix prompt loaded in AI Lab.');
    };

    const handleRemixToBulk = (item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return;
        const newTask = { id: Math.random().toString(36).substring(7), title: rev.title, prompt: rev.prompt, status: 'pending', progress: 0 };
        void (async () => {
        try {
            await api.settings.appendBulkStudioTasks([newTask]);
            window.dispatchEvent(new CustomEvent('aimana-bulk-tasks-updated'));
            showToast(`Remix prompt added to Bulk section: "${rev.title}"`);
        } catch (e) { showToast("Failed to stage bulk task", "error"); }
        })();
    };

    const handleMoveInitiate = (item: ItemWithCurrentRevision) => {
        if (isMoveRestricted(item)) {
            showToast("This reference asset is protected and cannot be moved.", "error");
            return;
        }
        setIsBulkMove(false); setMovingItem(item); setTargetProjectId(''); setShowProjectSelector(true);
    };

    const handleCollectionMoveInitiate = useCallback((item: ItemWithCurrentRevision) => {
        setIsBulkCollectionAssign(false);
        setCollectionTargetItem(item);
        setSelectedCollectionId(item.collectionId || null);
    }, []);

    const handleCreateCollection = useCallback(async (name: string) => {
        if (!id) return;
        setIsCreatingCollection(true);
        try {
            const created = await api.collections.create(id, { name });
            setCollections((prev) => [created, ...prev]);
            setIsCreateCollectionOpen(false);
            setActiveCollectionId(created.id);
            showToast(`Collection created: ${created.name}`);
        } catch (e: any) {
            showToast(e?.message || 'Failed to create collection.', 'error');
        } finally {
            setIsCreatingCollection(false);
        }
    }, [id, setCollections, showToast]);

    const handleUpdateCollectionSettings = useCallback(async (name: string, description: string) => {
        if (!id || !editingCollection) return;
        setIsUpdatingCollectionName(true);
        try {
            const updated = await api.collections.update(id, editingCollection.id, { name, description });
            setCollections((prev) => prev.map((collection) => collection.id === updated.id ? updated : collection));
            setEditingCollection(null);
            showToast('Collection settings updated.');
        } catch (e: any) {
            showToast(e?.message || 'Failed to update collection settings.', 'error');
        } finally {
            setIsUpdatingCollectionName(false);
        }
    }, [editingCollection, id, setCollections, showToast]);

    const handleAssignCollection = useCallback(async (collectionId: string | null) => {
        if (!collectionTargetItem && !isBulkCollectionAssign) return;
        setIsCollectionAssigning(true);
        try {
            if (isBulkCollectionAssign) {
                const selectedIds = Array.from(selectedItemIds);
                for (const itemId of selectedIds) {
                    await api.items.update({ id: itemId, collectionId });
                }
            } else if (collectionTargetItem) {
                await api.items.update({ id: collectionTargetItem.id, collectionId });
            }
            await refresh();
            setCollectionTargetItem(null);
            setIsBulkCollectionAssign(false);
            setSelectedCollectionId(null);
            if (collectionTargetItem && selectedItem?.id === collectionTargetItem.id) {
                setSelectedItem((prev) => prev ? { ...prev, collectionId } : prev);
            }
            if (isBulkCollectionAssign) {
                setSelectedItemIds(new Set());
                showToast(collectionId ? `Moved ${selectedItemIds.size} item${selectedItemIds.size === 1 ? '' : 's'} into collection.` : `Moved ${selectedItemIds.size} item${selectedItemIds.size === 1 ? '' : 's'} to project root.`);
            } else {
                showToast(collectionId ? 'Asset moved into collection.' : 'Asset moved to project root.');
            }
        } catch (e: any) {
            showToast(e?.message || 'Failed to move asset into collection.', 'error');
        } finally {
            setIsCollectionAssigning(false);
        }
    }, [collectionTargetItem, isBulkCollectionAssign, refresh, selectedItem?.id, selectedItemIds, showToast]);

    const handleSetCollectionThumbnail = useCallback(async (item: ItemWithCurrentRevision) => {
        if (!id || !item.collectionId) return;
        try {
            const updated = await api.collections.update(id, item.collectionId, { thumbnailItemId: item.id });
            setCollections((prev) => prev.map((collection) => collection.id === updated.id ? updated : collection));
            showToast('Collection thumbnail updated.');
        } catch (e: any) {
            showToast(e?.message || 'Failed to set collection thumbnail.', 'error');
        }
    }, [id, setCollections, showToast]);

    const handleSetActiveCollectionThumbnail = useCallback(async (item: ItemWithCurrentRevision) => {
        if (!id || !activeCollection) return;
        try {
            const updated = await api.collections.update(id, activeCollection.id, { thumbnailItemId: item.id });
            setCollections((prev) => prev.map((collection) => collection.id === updated.id ? updated : collection));
            setIsCollectionThumbnailPickerOpen(false);
            showToast('Collection thumbnail updated.');
        } catch (e: any) {
            showToast(e?.message || 'Failed to set collection thumbnail.', 'error');
        }
    }, [activeCollection, id, setCollections, showToast]);

    const handleUploadActiveCollectionThumbnail = useCallback(async (files: FileList | null) => {
        const file = files?.[0];
        if (!id || !activeCollection || !file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Choose an image file for the collection thumbnail.', 'error');
            return;
        }
        setIsUploadingCollectionThumbnail(true);
        try {
            const uploadedItem = await api.items.create(id, file, () => {}, {
                collectionId: activeCollection.id,
                title: `${activeCollection.name} Thumbnail`,
                label: 'Collection Thumbnail'
            });
            const updated = await api.collections.update(id, activeCollection.id, { thumbnailItemId: uploadedItem.id });
            setCollections((prev) => prev.map((collection) => collection.id === updated.id ? updated : collection));
            await refresh();
            setIsCollectionThumbnailPickerOpen(false);
            showToast('Uploaded and set collection thumbnail.');
        } catch (e: any) {
            showToast(e?.message || 'Failed to upload collection thumbnail.', 'error');
        } finally {
            setIsUploadingCollectionThumbnail(false);
        }
    }, [activeCollection, id, refresh, setCollections, showToast]);

    const handleDropItemIntoCollection = useCallback(async (itemId: string, collectionId: string) => {
        const item = items.find((entry) => entry.id === itemId);
        if (!item) return;
        if (item.collectionId === collectionId) return;
        try {
            await api.items.update({ id: itemId, collectionId });
            await refresh();
            showToast(`Moved "${item.currentRevision?.title || 'asset'}" into collection.`);
        } catch (e: any) {
            showToast(e?.message || 'Failed to move asset into collection.', 'error');
        }
    }, [items, refresh, showToast]);

    const handleBulkMoveInitiate = () => {
        setIsBulkMove(true); setMovingItem(null); setTargetProjectId(''); setShowProjectSelector(true);
    };

    const handleBulkMoveToCollectionInitiate = useCallback(() => {
        if (selectedItemIds.size === 0) {
            showToast('Select one or more items first.', 'error');
            return;
        }
        if (selectedCollectionIds.size > 0) {
            showToast('Move to collection is available only for item selections.', 'error');
            return;
        }
        setIsBulkCollectionAssign(true);
        setCollectionTargetItem(null);
        setSelectedCollectionId(null);
    }, [selectedCollectionIds.size, selectedItemIds.size, showToast]);

    const handleBulkMergeInitiate = () => {
        if (!canOpenBulkMerge) {
            showToast('Merge is available only when 2 or more selected items are image/video.', 'error');
            return;
        }
        const candidateIds = selectedItems.map((item) => item.id);
        setBulkMergeCandidateIds(candidateIds);
        setBulkMergeMainItemId(candidateIds[0] || '');
        setIsBulkMergeModalOpen(true);
    };

    const handleConfirmMove = async () => {
        if (!targetProjectId) return;
        setIsMoving(true);
        try {
            const sourceProjectId = id || '';
            if (isBulkMove) {
                const movedCollectionCount = selectedCollectionIds.size;
                const movedItemCount = selectedItemIds.size;
                for (const collectionId of Array.from(selectedCollectionIds)) {
                    await api.collections.update(id!, collectionId, { projectId: targetProjectId });
                }
                for (const itemId of Array.from(selectedItemIds)) {
                    await api.items.update({ id: itemId, projectId: targetProjectId, collectionId: null, isArchived: false });
                }
                await refresh();
                setSelectedCollectionIds(new Set());
                setSelectedItemIds(new Set());
                showToast(`Moved ${movedCollectionCount} collection${movedCollectionCount === 1 ? '' : 's'} and ${movedItemCount} item${movedItemCount === 1 ? '' : 's'} to ${allProjects.find(p => p.id === targetProjectId)?.name || 'the selected project'}.`);
            } else if (movingItem) {
                await api.items.update({ id: movingItem.id, projectId: targetProjectId, collectionId: null, isArchived: false });
                setItems(prev => prev.filter(i => i.id !== movingItem.id));
                setSelectedItem(null);
                showToast(`Asset migrated to ${allProjects.find(p => p.id === targetProjectId)?.name}`);
            }
            if (sourceProjectId) {
                window.dispatchEvent(new CustomEvent('project-items-updated', {
                    detail: { projectId: sourceProjectId, reason: 'project-move-source' }
                }));
            }
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: targetProjectId, reason: 'project-move-target' }
            }));
            setShowProjectSelector(false); setMovingItem(null); setIsBulkMove(false);
        } catch (e: any) {
            showToast(e?.message || "Migration failed", "error");
        } finally { setIsMoving(false); }
    };

    const handleBulkArchiveMixed = useCallback(async () => {
        const collectionCount = selectedCollectionIds.size;
        const itemCount = selectedItemIds.size;
        if (collectionCount === 0 && itemCount === 0) return;

        const ok = await confirm({
            title: 'Move Selection To Recycle Bin',
            description: `Move ${collectionCount} collection${collectionCount === 1 ? '' : 's'} and ${itemCount} item${itemCount === 1 ? '' : 's'} to trash?`,
            confirmLabel: 'Move To Trash',
            tone: 'danger'
        });
        if (!ok) return;

        try {
            for (const collectionId of Array.from(selectedCollectionIds)) {
                await api.collections.update(id!, collectionId, { isArchived: true });
            }
            for (const itemId of Array.from(selectedItemIds)) {
                const item = items.find((entry) => entry.id === itemId);
                if (item) await api.items.update({ ...item, isArchived: true, isPinned: false });
            }
            setSelectedCollectionIds(new Set());
            setSelectedItemIds(new Set());
            await refresh();
            showToast(`Moved ${collectionCount} collection${collectionCount === 1 ? '' : 's'} and ${itemCount} item${itemCount === 1 ? '' : 's'} to recycle bin.`);
        } catch (e: any) {
            showToast(e?.message || 'Bulk delete failed.', 'error');
            await refresh();
        }
    }, [confirm, id, items, refresh, selectedCollectionIds, selectedItemIds, showToast]);

    const handleMoveActiveCollectionToRecycleBin = useCallback(async () => {
        if (!id || !activeCollection) return;
        const collectionItemCount = activeCollection.itemCount ?? activeCollectionAllItems.length;

        const ok = await confirm({
            title: 'Delete Collection',
            description: `This collection has ${collectionItemCount} item${collectionItemCount === 1 ? '' : 's'}. Are you sure you want to move "${activeCollection.name}" to the recycle bin? You can restore it later from Deleted.`,
            confirmLabel: 'Move To Recycle Bin',
            tone: 'danger'
        });
        if (!ok) return;

        setCollectionPromptAction('recycle');
        try {
            await api.collections.update(id, activeCollection.id, { isArchived: true });
            setActiveCollectionId(null);
            setSelectedCollectionIds(new Set());
            setSelectedItemIds(new Set());
            await refresh();
            showToast(`Moved collection "${activeCollection.name}" and ${collectionItemCount} item${collectionItemCount === 1 ? '' : 's'} to recycle bin.`);
        } catch (error: any) {
            showToast(error?.message || 'Failed to move collection to recycle bin.', 'error');
            await refresh();
        } finally {
            setCollectionPromptAction(null);
        }
    }, [activeCollection, activeCollectionAllItems.length, confirm, id, refresh, showToast]);

    const handleConfirmBulkMerge = useCallback(async () => {
        if (!id) return;
        if (bulkMergeCandidates.length < 2) {
            showToast('Select at least 2 image/video items to merge.', 'error');
            return;
        }
        if (!bulkMergeMainItemId || !bulkMergeCandidates.some((item) => item.id === bulkMergeMainItemId)) {
            showToast('Please select a valid Main Image for merge.', 'error');
            return;
        }

        setIsBulkMerging(true);
        try {
            const result = await api.items.mergeSelectedMedia(id, {
                mainItemId: bulkMergeMainItemId,
                itemIds: bulkMergeCandidates.map((item) => item.id)
            });
            await refresh();
            setSelectedItemIds(new Set([result.mainItemId]));
            setIsBulkMergeModalOpen(false);
            setBulkMergeCandidateIds([]);
            showToast(`Merge complete. ${result.mergedItems} item(s) moved into revision history.`);
        } catch (e: any) {
            showToast(e?.message || 'Bulk merge failed.', 'error');
        } finally {
            setIsBulkMerging(false);
        }
    }, [bulkMergeCandidates, bulkMergeMainItemId, id, refresh, showToast]);

    const handleViewMetadataFromManager = async (itemId: string) => {
        try {
            const item = await api.items.get(itemId);
            if (item) setSelectedItem(item);
        } catch (err) { showToast("Failed to load item metadata", "error"); }
    };

    const handleOpenItemNormalView = useCallback((item: ItemWithCurrentRevision) => {
        if (item.projectId === project?.id) {
            setSelectedItem(item);
            return;
        }
        navigate(`/project/${item.projectId}?itemId=${encodeURIComponent(item.id)}`);
    }, [navigate, project?.id]);

    const handleMergeDuplicateReferences = useCallback(async () => {
        if (!id) return;
        setIsMergingReferences(true);
        try {
            const result = await api.items.mergeDuplicateReferences(id);
            await refresh();
            if (result.mergedItems > 0) {
                showToast(`Merged ${result.mergedItems} duplicate reference item(s).`);
            } else {
                showToast('No duplicate uploaded references found.');
            }
        } catch (e) {
            showToast('Failed to merge duplicate references.', 'error');
        } finally {
            setIsMergingReferences(false);
        }
    }, [id, refresh, showToast]);

    const handleCheckPromptDuplicates = useCallback(async () => {
        if (!id || !project || project.projectType !== 'prompt') return;
        setIsCheckingPromptDuplicates(true);
        try {
            const scan = await api.items.getPromptDuplicates(id);
            if (scan.duplicateGroups === 0) {
                showToast('No duplicate prompts found.');
                return;
            }

            const previewLines = scan.groups.slice(0, 3).map((group) => {
                const sample = group.items[0];
                const scopeLabel = group.collectionName ? `Collection: ${group.collectionName}` : 'Project Root';
                return `- ${sample.title || 'Untitled Prompt'} (${group.items.length} matches, ${scopeLabel})`;
            });
            const remainingGroups = scan.duplicateGroups - previewLines.length;
            const description = [
                `Detected ${scan.duplicateGroups} duplicate group${scan.duplicateGroups === 1 ? '' : 's'} across ${scan.duplicateItems} prompt item${scan.duplicateItems === 1 ? '' : 's'}.`,
                '',
                'This merge keeps the oldest prompt in each exact-match group, merges safe metadata, and archives the duplicate items.',
                '',
                ...previewLines,
                ...(remainingGroups > 0 ? [`- plus ${remainingGroups} more group${remainingGroups === 1 ? '' : 's'}`] : [])
            ].join('\n');

            const confirmed = await confirm({
                title: 'Merge Duplicate Prompts',
                description,
                confirmLabel: 'Merge Duplicates',
                tone: 'danger'
            });
            if (!confirmed) return;

            const result = await api.items.mergePromptDuplicates(id);
            await refresh();
            showToast(`Merged ${result.mergedItems} duplicate prompt item${result.mergedItems === 1 ? '' : 's'} across ${result.duplicateGroups} group${result.duplicateGroups === 1 ? '' : 's'}.`);
        } catch (e: any) {
            showToast(e?.message || 'Failed to check prompt duplicates.', 'error');
        } finally {
            setIsCheckingPromptDuplicates(false);
        }
    }, [confirm, id, project, refresh, showToast]);

    const handleMovePromptsToStaging = useCallback(async () => {
        if (!project) return;

        const promptTexts = items
            .map((item) => String(item.currentRevision?.prompt || '').trim())
            .filter(Boolean);

        if (promptTexts.length === 0) {
            showToast('No prompt text found in this project.', 'error');
            return;
        }

        const confirmed = await confirm({
            title: 'Move Prompts To Staging',
            description: `Create ${promptTexts.length} new Prompt Manager staging draft${promptTexts.length === 1 ? '' : 's'} using prompt text only? Images, thumbnails, titles, labels, tags, notes, and item metadata will not be moved.`,
            confirmLabel: 'Move Prompts',
            tone: 'primary'
        });
        if (!confirmed) return;

        setIsMovingPromptsToStaging(true);
        try {
            const timestamp = Date.now();
            const drafts = promptTexts.map((prompt, index) => (
                toPromptDraft({ prompt, source: 'manual' }, undefined, timestamp + index)
            ));
            const response = await api.settings.appendPromptManagerDrafts(drafts);
            window.dispatchEvent(new CustomEvent('aimana-prompt-drafts-updated'));
            showToast(`Moved ${response.count || drafts.length} prompt${drafts.length === 1 ? '' : 's'} to Prompt Manager staging.`);
        } catch (error: any) {
            showToast(error?.message || 'Failed to move prompts to Prompt Manager staging.', 'error');
        } finally {
            setIsMovingPromptsToStaging(false);
        }
    }, [confirm, items, project, showToast]);

    const buildCollectionPromptDrafts = useCallback(() => {
        const timestamp = Date.now();
        return activeCollectionAllItems
            .map((item) => String(item.currentRevision?.prompt || '').trim())
            .filter(Boolean)
            .map((prompt, index) => toPromptDraft({ prompt, source: 'manual' }, undefined, timestamp + index));
    }, [activeCollectionAllItems]);

    const handleMoveCollectionPromptsToStaging = useCallback(async () => {
        if (!activeCollection) return;
        const drafts = buildCollectionPromptDrafts();
        if (drafts.length === 0) {
            showToast('No prompt text found in this collection.', 'error');
            return;
        }

        const confirmed = await confirm({
            title: 'Move Collection Prompts To Staging',
            description: `Create ${drafts.length} new Prompt Manager staging draft${drafts.length === 1 ? '' : 's'} from "${activeCollection.name}" using prompt text only? Images, thumbnails, titles, labels, tags, notes, and item metadata will not be moved.`,
            confirmLabel: 'Move Prompts',
            tone: 'primary'
        });
        if (!confirmed) return;

        setCollectionPromptAction('staging');
        try {
            const response = await api.settings.appendPromptManagerDrafts(drafts);
            window.dispatchEvent(new CustomEvent('aimana-prompt-drafts-updated'));
            showToast(`Moved ${response.count || drafts.length} collection prompt${drafts.length === 1 ? '' : 's'} to Prompt Manager staging.`);
        } catch (error: any) {
            showToast(error?.message || 'Failed to move collection prompts to staging.', 'error');
        } finally {
            setCollectionPromptAction(null);
        }
    }, [activeCollection, buildCollectionPromptDrafts, confirm, showToast]);

    const handleMoveCollectionPromptsToQueueAssetIngestion = useCallback(async () => {
        if (!activeCollection) return;
        const drafts = buildCollectionPromptDrafts();
        if (drafts.length === 0) {
            showToast('No prompt text found in this collection.', 'error');
            return;
        }

        const confirmed = await confirm({
            title: 'Move Collection Prompts To Queue Asset Ingestion',
            description: `Create a Queue Asset Ingestion collection named "${activeCollection.name}" and add ${drafts.length} prompt-only item${drafts.length === 1 ? '' : 's'}? No images, thumbnails, labels, notes, or item files will be moved.`,
            confirmLabel: 'Move To Queue',
            tone: 'primary'
        });
        if (!confirmed) return;

        setCollectionPromptAction('queue');
        try {
            const assetIngestionProject = await api.projects.getAssetIngestion();
            if (!assetIngestionProject?.id) throw new Error('Asset Ingestion project could not be resolved.');
            const createdCollection = await api.collections.create(assetIngestionProject.id, {
                name: activeCollection.name,
                description: activeCollection.description || 'Prompt-only copy from a project collection.'
            });
            const response = await api.items.createFromPrompts(
                assetIngestionProject.id,
                assetIngestionProject.defaultEngine || DEFAULT_GOOGLE_TEXT_MODEL,
                drafts.map((draft) => ({ title: draft.title, prompt: draft.prompt, source: 'manual' })),
                true,
                createdCollection.id,
                'suffix'
            );
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: assetIngestionProject.id, reason: 'collection-prompts-to-queue-asset-ingestion' }
            }));
            window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
                detail: {
                    projectId: assetIngestionProject.id,
                    collectionId: createdCollection.id,
                    reason: 'collection-prompts-to-queue-asset-ingestion'
                }
            }));
            showToast(`Moved ${response.created || drafts.length} prompt${drafts.length === 1 ? '' : 's'} to Queue Asset Ingestion collection "${createdCollection.name}".`);
        } catch (error: any) {
            showToast(error?.message || 'Failed to move collection prompts to Queue Asset Ingestion.', 'error');
        } finally {
            setCollectionPromptAction(null);
        }
    }, [activeCollection, buildCollectionPromptDrafts, confirm, showToast]);

    const handleMoveCollectionPromptsToPromptCollection = useCallback(async () => {
        if (!activeCollection || !project) return;
        const drafts = buildCollectionPromptDrafts();
        if (drafts.length === 0) {
            showToast('No prompt text found in this collection.', 'error');
            return;
        }

        const confirmed = await confirm({
            title: 'Move Collection Prompts To Prompt Collection',
            description: `Create a new Prompt Manager prompt collection named "${activeCollection.name}" and add ${drafts.length} prompt-only item${drafts.length === 1 ? '' : 's'}? Only prompt text will be moved.`,
            confirmLabel: 'Move To Prompt Collection',
            tone: 'primary'
        });
        if (!confirmed) return;

        setCollectionPromptAction('prompt');
        try {
            const promptProject = await api.projects.create({
                name: activeCollection.name,
                description: activeCollection.description || 'Prompt-only copy from a project collection.',
                storageType: project.storageType || ProjectStorageType.LOCAL_DRIVE,
                projectType: 'prompt',
                color: project.color || '#6366f1',
                defaultEngine: DEFAULT_GOOGLE_TEXT_MODEL
            });
            const response = await api.items.createFromPrompts(
                promptProject.id,
                promptProject.defaultEngine || DEFAULT_GOOGLE_TEXT_MODEL,
                drafts.map((draft) => ({ title: draft.title, prompt: draft.prompt, source: 'manual' })),
                true,
                null,
                'suffix'
            );
            window.dispatchEvent(new CustomEvent('aimana-prompt-projects-updated'));
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: promptProject.id, reason: 'collection-prompts-to-prompt-collection' }
            }));
            showToast(`Moved ${response.created || drafts.length} prompt${drafts.length === 1 ? '' : 's'} to Prompt Collection "${promptProject.name}".`);
        } catch (error: any) {
            showToast(error?.message || 'Failed to move collection prompts to a Prompt Collection.', 'error');
        } finally {
            setCollectionPromptAction(null);
        }
    }, [activeCollection, buildCollectionPromptDrafts, confirm, project, showToast]);

    const openLab = (mode: LabMode) => {
        setRemixRevision(null); setLabMode(mode); setIsAiLabOpen(true);
    };

    const handlePromptImportComplete = async (result: { total: number; created: number; skipped: number; inputDuplicates?: number }) => {
        await refresh();
        const details = result.skipped > 0 ? ` (${result.skipped} skipped)` : '';
        showToast(`Imported ${result.created}/${result.total} prompt drafts${details}.`);
    };

    const handleOpenChatItem = useCallback(async (chatItemId: string) => {
        setIsChatItemDetailLoading(true);
        try {
            const detail = await api.chatItems.get(chatItemId);
            setSelectedChatItem(detail);
            setIsChatItemDetailOpen(true);
        } catch (e) {
            showToast('Failed to load chat capture.', 'error');
        } finally {
            setIsChatItemDetailLoading(false);
        }
    }, [showToast]);

    const handleArchiveChatItem = useCallback(async (item: ChatItemDetail) => {
        const ok = await confirm({
            title: 'Move chat capture to Deleted?',
            description: 'You can restore it later from the Deleted section.',
            confirmLabel: 'Move to Deleted',
            tone: 'danger'
        });
        if (!ok) return;
        setIsChatItemArchiving(true);
        try {
            await api.chatItems.update(item.id, { isArchived: true });
            setIsChatItemDetailOpen(false);
            setSelectedChatItem(null);
            await refreshChatItems();
            showToast('Chat capture moved to Deleted.');
        } catch (e) {
            showToast('Failed to move chat capture.', 'error');
        } finally {
            setIsChatItemArchiving(false);
        }
    }, [confirm, refreshChatItems, showToast]);

    const handleChatMoveInitiate = useCallback((item: ChatItem | ChatItemDetail) => {
        setIsBulkChatMove(false);
        setMovingChatItem(item as ChatItemDetail);
        setTargetChatProjectId((prev) => prev || availableChatMoveProjects[0]?.id || '');
        setShowChatProjectSelector(true);
    }, [availableChatMoveProjects]);

    const handleBulkChatMoveInitiate = useCallback(() => {
        if (selectedChatItemIds.size === 0) {
            showToast('Select one or more chat captures first.', 'error');
            return;
        }
        setIsBulkChatMove(true);
        setMovingChatItem(null);
        setTargetChatProjectId((prev) => prev || availableChatMoveProjects[0]?.id || '');
        setShowChatProjectSelector(true);
    }, [availableChatMoveProjects, selectedChatItemIds.size, showToast]);

    const handleConfirmChatMove = useCallback(async () => {
        if (!targetChatProjectId) return;
        setIsChatMoving(true);
        try {
            const targetProjectName = allProjects.find((entry) => entry.id === targetChatProjectId)?.name || 'the selected project';
            if (isBulkChatMove) {
                const ids = Array.from(selectedChatItemIds);
                await Promise.all(ids.map((chatItemId) => (
                    api.chatItems.update(chatItemId, { projectId: targetChatProjectId, isArchived: false })
                )));
                setSelectedChatItemIds(new Set());
                showToast(`Moved ${ids.length} chat capture${ids.length === 1 ? '' : 's'} to ${targetProjectName}.`);
            } else if (movingChatItem) {
                await api.chatItems.update(movingChatItem.id, { projectId: targetChatProjectId, isArchived: false });
                if (selectedChatItem?.id === movingChatItem.id) {
                    setIsChatItemDetailOpen(false);
                    setSelectedChatItem(null);
                }
                showToast(`Chat capture moved to ${targetProjectName}.`);
            }
            window.dispatchEvent(new CustomEvent('chat-captures-updated', { detail: { projectId: id } }));
            window.dispatchEvent(new CustomEvent('chat-captures-updated', { detail: { projectId: targetChatProjectId } }));
            setShowChatProjectSelector(false);
            setMovingChatItem(null);
            setIsBulkChatMove(false);
        } catch (e: any) {
            showToast(e?.message || 'Failed to move chat capture.', 'error');
        } finally {
            setIsChatMoving(false);
        }
    }, [allProjects, id, isBulkChatMove, movingChatItem, selectedChatItem?.id, selectedChatItemIds, showToast, targetChatProjectId]);

    useEffect(() => {
        setSelectedChatItemIds((prev) => {
            if (prev.size === 0) return prev;
            const validIds = new Set(chatItems.map((item) => item.id));
            const next = new Set(Array.from(prev).filter((entry) => validIds.has(entry)));
            return next.size === prev.size ? prev : next;
        });
    }, [chatItems]);

    useEffect(() => {
        if (!showChatProjectSelector) return;
        if (availableChatMoveProjects.length === 0) {
            if (targetChatProjectId) setTargetChatProjectId('');
            return;
        }
        const hasSelectedProject = availableChatMoveProjects.some((project) => project.id === targetChatProjectId);
        if (!hasSelectedProject) {
            setTargetChatProjectId(availableChatMoveProjects[0].id);
        }
    }, [availableChatMoveProjects, showChatProjectSelector, targetChatProjectId]);

    const isFileDrag = (e: React.DragEvent) => {
        const isInternal = e.dataTransfer.types.includes('application/x-aimana-asset');
        return !isInternal && e.dataTransfer.types.includes('Files');
    };

    const isInternalAssetDrag = (e: React.DragEvent) => {
        return e.dataTransfer.types.includes('application/x-aimana-asset');
    };

    if (loading) return (
        <div className="flex flex-col h-full items-center justify-center text-slate-400 gap-4">
            <Loader2 className="animate-spin" size={48} />
            <p className="font-medium animate-pulse uppercase tracking-[0.4em] text-[10px]">Syncing Topology...</p>
        </div>
    );
    if (!project) return <div className="text-white p-8">Project not found</div>;

    const visibleRootCollectionIds = activeTab === 'active' && !activeCollectionId ? visibleCollections.map((collection) => collection.id) : [];
    const allVisibleItemsSelected = currentTabItems.length > 0 && currentTabItems.every(i => selectedItemIds.has(i.id));
    const allVisibleCollectionsSelected = visibleRootCollectionIds.length === 0 || visibleRootCollectionIds.every((collectionId) => selectedCollectionIds.has(collectionId));
    const allVisibleSelected = (currentTabItems.length > 0 || visibleRootCollectionIds.length > 0) && allVisibleItemsSelected && allVisibleCollectionsSelected;
    const activeLightboxItem = activeLightboxIndex !== null ? currentTabItems[activeLightboxIndex] : null;
    const isAssetIngestionProject =
        project.systemKey === 'asset-ingestion' || project.name === 'Asset Ingestion';
    const hasChatBulkSelection = selectedChatItemIds.size > 0;
    const hasAssetBulkSelection = selectedItemIds.size > 0 || selectedCollectionIds.size > 0;
    const totalBulkSelectionCount = hasChatBulkSelection
        ? selectedChatItemIds.size
        : selectedItemIds.size + selectedCollectionIds.size;
    const activeCollectionVisibleCount = activeCollection ? activeCollectionItems.length : 0;
    const activeCollectionUpdatedLabel = activeCollection
        ? new Date(activeCollection.updatedAt || activeCollection.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
        : '';

    return (
        <div className="flex flex-col h-full relative" 
            onDragOver={(e) => {
                e.preventDefault();
                if (!selectedItem && (isFileDrag(e) || (activeCollectionId && isInternalAssetDrag(e)))) setIsDragging(true);
            }} 
            onDragLeave={() => setIsDragging(false)} 
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (selectedItem) return;
                if (activeCollectionId && isInternalAssetDrag(e)) {
                    const itemId = e.dataTransfer.getData('application/x-aimana-asset');
                    if (itemId) handleDropItemIntoCollection(itemId, activeCollectionId);
                    return;
                }
                if (isFileDrag(e) && e.dataTransfer.files?.length > 0) {
                    handleFileUpload(e.dataTransfer.files, activeCollectionId);
                }
            }}>
            
            {isDragging && !selectedItem && (
                <div className="fixed inset-0 z-[200] bg-indigo-600/20 backdrop-blur-sm border-4 border-indigo-500 border-dashed m-4 rounded-[3rem] flex flex-col items-center justify-center pointer-events-none animate-in fade-in zoom-in-95">
                    <div className="p-10 bg-indigo-600 rounded-[2.5rem] animate-bounce shadow-2xl border-2 border-indigo-400">
                        <Loader2 size={64} className="text-white animate-spin-slow" />
                    </div>
                    <h2 className="text-3xl font-black text-white mt-8 tracking-tighter uppercase">Injesting External Assets</h2>
                </div>
            )}

            {activeCollection ? (
                <div className="mb-5 shrink-0 rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4 shadow-xl shadow-slate-950/20">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveCollectionId(null);
                                    setSelectedItemIds(new Set());
                                    setSelectedCollectionIds(new Set());
                                }}
                                className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
                            >
                                <ArrowLeft size={14} />
                                Back To Project
                            </button>
                            <div className="flex min-w-0 flex-wrap items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                                    <Folder size={22} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">Collection View</div>
                                    <h1 className="truncate text-3xl font-black tracking-tight text-white sm:text-4xl">{activeCollection.name}</h1>
                                    {activeCollection.description && (
                                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 line-clamp-3">
                                            {activeCollection.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                <span className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
                                    {activeCollectionVisibleCount} Visible
                                </span>
                                <span className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
                                    {activeCollection.itemCount} Total
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
                                    <Clock size={12} />
                                    Updated {activeCollectionUpdatedLabel}
                                </span>
                            </div>
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
                            <button
                                type="button"
                                onClick={() => setEditingCollection(activeCollection)}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 shadow-md transition-all hover:border-indigo-500/40 hover:bg-slate-700 hover:text-white"
                                title="Collection settings"
                            >
                                <Settings size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsCollectionThumbnailPickerOpen(true)}
                                className="flex min-w-[190px] flex-1 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-200 shadow-md transition-all hover:bg-cyan-500/20 sm:flex-none sm:min-w-0"
                            >
                                <ImageIcon size={18} className="mr-2" />
                                Set Main Thumbnail
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateBlankItem}
                                className="flex min-w-[140px] flex-1 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-md transition-all hover:bg-slate-700 sm:flex-none sm:min-w-0"
                            >
                                <Plus size={18} className="mr-2 text-indigo-400" />
                                New Item
                            </button>
                            <button
                                type="button"
                                onClick={() => document.getElementById('file-upload-input')?.click()}
                                className="flex min-w-[140px] flex-1 items-center justify-center rounded-xl border border-indigo-500/50 bg-indigo-600 px-6 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-indigo-700 sm:flex-none sm:min-w-0"
                            >
                                <UploadCloud size={18} className="mr-2" />
                                Upload
                            </button>
                            <div className="relative" ref={collectionPromptMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setIsCollectionPromptMenuOpen((current) => !current)}
                                    disabled={!!collectionPromptAction}
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-md transition-all disabled:cursor-wait disabled:opacity-60 ${
                                        isCollectionPromptMenuOpen
                                            ? 'border-emerald-500/50 bg-slate-700 text-white'
                                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-emerald-500/40 hover:bg-slate-700 hover:text-white'
                                    }`}
                                    title="Collection prompt actions"
                                >
                                    {collectionPromptAction ? <Loader2 size={18} className="animate-spin" /> : <MoreVertical size={18} />}
                                </button>
                                {isCollectionPromptMenuOpen && (
                                    <div className="absolute right-0 top-full z-[70] mt-2 w-72 overflow-hidden rounded-[1.25rem] border border-slate-700 border-t-emerald-500 bg-slate-800 py-1 shadow-2xl animate-in slide-in-from-top-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsCollectionPromptMenuOpen(false);
                                                void handleMoveCollectionPromptsToQueueAssetIngestion();
                                            }}
                                            disabled={!!collectionPromptAction}
                                            className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-xs font-bold text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
                                        >
                                            {collectionPromptAction === 'queue' ? <Loader2 size={16} className="animate-spin text-emerald-300" /> : <Folder size={16} className="text-emerald-300" />}
                                            Move Prompts To Queue Asset Ingestion
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsCollectionPromptMenuOpen(false);
                                                void handleMoveCollectionPromptsToPromptCollection();
                                            }}
                                            disabled={!!collectionPromptAction}
                                            className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-xs font-bold text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
                                        >
                                            {collectionPromptAction === 'prompt' ? <Loader2 size={16} className="animate-spin text-indigo-300" /> : <Folder size={16} className="text-indigo-300" />}
                                            Move Prompts To Prompt Collection
                                        </button>
                                        <div className="mx-2 my-1 h-px bg-slate-700" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsCollectionPromptMenuOpen(false);
                                                void handleMoveCollectionPromptsToStaging();
                                            }}
                                            disabled={!!collectionPromptAction}
                                            className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:cursor-wait disabled:opacity-60"
                                        >
                                            {collectionPromptAction === 'staging' ? <Loader2 size={16} className="animate-spin" /> : <SendToBack size={16} />}
                                            Move Collection Prompts To Staging
                                        </button>
                                        <div className="mx-2 my-1 h-px bg-slate-700" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsCollectionPromptMenuOpen(false);
                                                void handleMoveActiveCollectionToRecycleBin();
                                            }}
                                            disabled={!!collectionPromptAction}
                                            className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:opacity-60"
                                        >
                                            {collectionPromptAction === 'recycle' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            Delete Collection / Move To Recycle Bin
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <ProjectHeader 
                    project={project} engines={engines} onPinToggle={handleProjectPinToggle} onShare={() => setIsShareModalOpen(true)}
                    onImport={() => setIsImportModalOpen(true)} onImportPrompt={() => setIsImportPromptOpen(true)}
                    onMovePromptsToStaging={handleMovePromptsToStaging}
                    isMovingPromptsToStaging={isMovingPromptsToStaging}
                    onExport={() => handleProjectExport(items)}
                    onUploadClick={() => document.getElementById('file-upload-input')?.click()} onNewItem={handleCreateBlankItem}
                    onArchive={() => api.projects.archive(project.id).then(() => navigate('/'))}
                    onCheckPromptDuplicates={handleCheckPromptDuplicates}
                    isCheckingPromptDuplicates={isCheckingPromptDuplicates}
                    onEngineChange={handleEngineChange} onUpdateProject={handleUpdateProject} onViewChange={setViewType}
                />
            )}
            
            {!activeCollection && !isAssetIngestionProject && (
                <ProjectQuickLab
                    onOpenLab={openLab}
                    onOpenChat={() => navigate(`/chat?from=project&projectId=${id || ''}`)}
                />
            )}

            <input id="file-upload-input" type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files, activeCollectionId)} />
            <input
                id="collection-thumbnail-upload-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    void handleUploadActiveCollectionThumbnail(e.target.files);
                    e.currentTarget.value = '';
                }}
            />

            {activeCollection && isCollectionThumbnailPickerOpen && (
                <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
                    <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
                                    <ImageIcon size={14} />
                                    Main Thumbnail
                                </div>
                                <h2 className="mt-2 truncate text-2xl font-black tracking-tight text-white">{activeCollection.name}</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCollectionThumbnailPickerOpen(false)}
                                disabled={isUploadingCollectionThumbnail}
                                className="rounded-xl border border-slate-700 p-2 text-slate-500 transition-colors hover:text-white disabled:cursor-wait disabled:opacity-60"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                                <div>
                                    <div className="text-sm font-semibold text-white">Upload thumbnail</div>
                                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Adds an image to this collection and uses it as the main thumbnail</div>
                                </div>
                                <button
                                    type="button"
                                    disabled={isUploadingCollectionThumbnail}
                                    onClick={() => document.getElementById('collection-thumbnail-upload-input')?.click()}
                                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60"
                                >
                                    {isUploadingCollectionThumbnail ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                                    {isUploadingCollectionThumbnail ? 'Uploading...' : 'Upload Image'}
                                </button>
                            </div>

                            {activeCollectionAllItems.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                    {activeCollectionAllItems.map((item) => {
                                        const revision = item.currentRevision;
                                        const previewUrl = revision?.thumbnailLink || revision?.fileUrl || '';
                                        const isCurrentThumbnail = activeCollection.thumbnailItemId === item.id;
                                        const isVideo = revision?.mimeType?.startsWith('video/');
                                        const thumbnailBlurClass = hasThumbnailBlur(revision) ? 'blur-md' : '';

                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => void handleSetActiveCollectionThumbnail(item)}
                                                disabled={isUploadingCollectionThumbnail}
                                                className={`group overflow-hidden rounded-xl border bg-slate-900 text-left transition-all disabled:cursor-wait disabled:opacity-60 ${
                                                    isCurrentThumbnail
                                                        ? 'border-cyan-400 ring-2 ring-cyan-400/25'
                                                        : 'border-slate-700 hover:border-cyan-500/50'
                                                }`}
                                            >
                                                <div className="relative aspect-square bg-slate-950">
                                                    {previewUrl ? (
                                                        isVideo ? (
                                                            <video src={previewUrl} className={`h-full w-full object-cover ${thumbnailBlurClass}`} muted playsInline preload="metadata" />
                                                        ) : (
                                                            <img src={previewUrl} alt="" className={`h-full w-full object-cover ${thumbnailBlurClass}`} loading="lazy" />
                                                        )
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-slate-600">
                                                            <ImageIcon size={28} />
                                                        </div>
                                                    )}
                                                    {isCurrentThumbnail && (
                                                        <div className="absolute right-2 top-2 rounded-full bg-cyan-400 p-1.5 text-slate-950 shadow-lg">
                                                            <Check size={14} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3">
                                                    <div className="truncate text-sm font-semibold text-slate-100">
                                                        {revision?.title || revision?.originalFilename || 'Untitled asset'}
                                                    </div>
                                                    <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                                        {isCurrentThumbnail ? 'Current thumbnail' : 'Use as thumbnail'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 py-16 text-center">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-500">
                                        <ImageIcon size={26} />
                                    </div>
                                    <p className="mt-4 text-sm font-semibold text-slate-300">No collection assets yet.</p>
                                    <p className="mt-1 text-sm text-slate-500">Upload an image to create the first thumbnail.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ProjectToolbar 
                searchTerm={searchTerm} onSearchChange={setSearchTerm} allVisibleSelected={allVisibleSelected}
                onToggleSelectAll={() => {
                    setSelectedChatItemIds(new Set());
                    const visibleIds = currentTabItems.map(i => i.id);
                    const nextItems = new Set(selectedItemIds);
                    const nextCollections = new Set(selectedCollectionIds);
                    if (allVisibleSelected) {
                        visibleIds.forEach(id => nextItems.delete(id));
                        visibleRootCollectionIds.forEach(id => nextCollections.delete(id));
                    } else {
                        visibleIds.forEach(id => nextItems.add(id));
                        visibleRootCollectionIds.forEach(id => nextCollections.add(id));
                    }
                    setSelectedItemIds(nextItems);
                    setSelectedCollectionIds(nextCollections);
                }}
                sortType={sortType} onSortChange={setSortType} viewType={activeCollection && viewType === 'group' ? 'grid' : viewType} onViewChange={setViewType} projectType={project.projectType}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                mediaFilter={mediaFilter}
                onMediaFilterChange={setMediaFilter}
                allowGroupView={!activeCollection}
                showGallery={!!activeCollection}
            />

            {!activeCollection && (
                <ProjectTabs activeTab={activeTab} onTabChange={setActiveTab} counts={{ active: activeItems.filter(i => !linkedArtifactItemIds.has(i.id)).length, linked_artifacts: linkedArtifactItemIds.size, pinned: activeItems.filter(i => i.isPinned).length, reference: referenceItems.length, forge_reference: forgeReferenceItems.length }} />
            )}

            <div className="flex-1 pb-24">
                {activeTab === 'active' && (!activeCollection && allowGroupedView && viewType === 'group'
                    ? renderGrouped(filteredActiveItemsWithoutLinked, true, visibleChatItems)
                    : <ActiveAssetsTab collections={activeCollection ? collections : visibleCollections} items={currentTabItems} chatItems={visibleChatItems} viewType={assetPanelViewType} activeCollectionId={activeCollectionId} onOpenCollection={setActiveCollectionId} onCloseCollection={() => setActiveCollectionId(null)} onNewItem={handleCreateBlankItem} onCreateCollection={() => setIsCreateCollectionOpen(true)} onEditCollection={setEditingCollection} hideCollectionHeader={!!activeCollection} onCollectionItemDrop={handleDropItemIntoCollection} onMoveToCollection={handleCollectionMoveInitiate} onSetCollectionThumbnail={handleSetCollectionThumbnail} getCollectionVisibleItemCount={(collectionId) => filteredCollectionItemsById.get(collectionId)?.length || 0} selectedCollectionIds={selectedCollectionIds} selectedItemIds={selectedItemIds} selectedChatItemIds={selectedChatItemIds} onItemClick={(item, index) => assetPanelViewType === 'gallery' ? setActiveLightboxIndex(index) : setSelectedItem(item)} onChatItemClick={(item) => handleOpenChatItem(item.id)} onPinToggle={handlePinToggle} onArchive={handleArchiveRequest} onMove={handleMoveInitiate} onMoveChat={handleChatMoveInitiate} onBulkMoveChat={handleBulkChatMoveInitiate} isBulkChatMoveDisabled={isChatMoving} onToggleChatSelect={(item) => { setSelectedItemIds(new Set()); setSelectedCollectionIds(new Set()); setSelectedChatItemIds((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }} onToggleAllChatSelect={() => { setSelectedItemIds(new Set()); setSelectedCollectionIds(new Set()); setSelectedChatItemIds((prev) => { const visibleIds = visibleChatItems.map((item) => item.id); const allSelected = visibleIds.length > 0 && visibleIds.every((entry) => prev.has(entry)); if (allSelected) { const next = new Set(prev); visibleIds.forEach((entry) => next.delete(entry)); return next; } return new Set(visibleIds); }); }} chatRegistry={inspectorRegistry} onRemixToBulk={handleRemixToBulk} onInspectInfo={handleInspectItemInfo} getContextBadges={getMainViewContextBadges} isItemReferencedIn={isReferencedInItem} onToggleCollectionSelect={(e, id) => { e.stopPropagation(); setSelectedChatItemIds(new Set()); const next = new Set(selectedCollectionIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedCollectionIds(next); }} onToggleSelect={(e, id) => { e.stopPropagation(); setSelectedChatItemIds(new Set()); const next = new Set(selectedItemIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedItemIds(next); }} />
                )}
                {activeTab === 'linked_artifacts' && (allowGroupedView && viewType === 'group'
                    ? renderGrouped(linkedArtifactItems)
                    : <ActiveAssetsTab items={linkedArtifactItems} viewType={assetPanelViewType} selectedItemIds={selectedItemIds} onItemClick={(item, index) => assetPanelViewType === 'gallery' ? setActiveLightboxIndex(index) : setSelectedItem(item)} onPinToggle={handlePinToggle} onArchive={handleArchiveRequest} onMove={handleMoveInitiate} onRemixToBulk={handleRemixToBulk} onInspectInfo={handleInspectItemInfo} getContextBadges={getMainViewContextBadges} onToggleSelect={(e, id) => { e.stopPropagation(); const next = new Set(selectedItemIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedItemIds(next); }} />
                )}
                {activeTab === 'pinned' && (allowGroupedView && viewType === 'group'
                    ? renderGrouped(filteredPinnedItems)
                    : <PinnedAssetsTab items={filteredPinnedItems} viewType={assetPanelViewType} selectedItemIds={selectedItemIds} onItemClick={(item, index) => assetPanelViewType === 'gallery' ? setActiveLightboxIndex(index) : setSelectedItem(item)} onPinToggle={handlePinToggle} onArchive={handleArchiveRequest} onMove={handleMoveInitiate} onRemixToBulk={handleRemixToBulk} onInspectInfo={handleInspectItemInfo} getContextBadges={getMainViewContextBadges} onToggleSelect={(e, id) => { e.stopPropagation(); const next = new Set(selectedItemIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedItemIds(next); }} />
                )}
                {activeTab === 'reference' && (allowGroupedView && viewType === 'group'
                    ? renderGrouped(filteredReferenceItems)
                    : <ReferenceAssetsTab items={filteredReferenceItems} viewType={assetPanelViewType} selectedItemIds={selectedItemIds} onItemClick={(item, index) => assetPanelViewType === 'gallery' ? setActiveLightboxIndex(index) : setSelectedItem(item)} onPinToggle={handlePinToggle} onArchive={handleArchiveRequest} onMove={handleMoveInitiate} onRemixToBulk={handleRemixToBulk} onInspectInfo={handleInspectItemInfo} getContextBadges={getMainViewContextBadges} onToggleSelect={(e, id) => { e.stopPropagation(); const next = new Set(selectedItemIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedItemIds(next); }} onMergeUploadedReferences={handleMergeDuplicateReferences} isMergingUploadedReferences={isMergingReferences} />
                )}
                {activeTab === 'forge_reference' && (allowGroupedView && viewType === 'group'
                    ? renderGrouped(filteredForgeReferenceItems)
                    : <ActiveAssetsTab items={filteredForgeReferenceItems} viewType={assetPanelViewType} selectedItemIds={selectedItemIds} onItemClick={(item, index) => assetPanelViewType === 'gallery' ? setActiveLightboxIndex(index) : setSelectedItem(item)} onPinToggle={handlePinToggle} onArchive={handleArchiveRequest} onMove={handleMoveInitiate} onRemixToBulk={handleRemixToBulk} onInspectInfo={handleInspectItemInfo} getContextBadges={getMainViewContextBadges} onToggleSelect={(e, id) => { e.stopPropagation(); const next = new Set(selectedItemIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedItemIds(next); }} />
                )}
            </div>

            {activeLightboxIndex !== null && activeLightboxItem && (
                <ProjectLightboxOverlay 
                    item={activeLightboxItem} project={project} index={activeLightboxIndex} total={currentTabItems.length}
                    zoomScale={zoomScale} setZoomScale={setZoomScale} isAutoPlaying={isAutoPlaying} setIsAutoPlaying={setIsAutoPlaying}
                    onClose={() => { setActiveLightboxIndex(null); setIsAutoPlaying(false); }}
                    onNext={handleNext} onPrev={handlePrev} 
                    onInspect={() => { setSelectedItem(activeLightboxItem); setActiveLightboxIndex(null); setIsAutoPlaying(false); }}
                    onDragStart={(e) => handleLightboxDragStart(e, activeLightboxItem)}
                />
            )}

            <BulkActionBar
                selectedCount={totalBulkSelectionCount}
                isZipping={isZipping}
                isMerging={isBulkMerging}
                canBulkMerge={!hasChatBulkSelection && canOpenBulkMerge}
                canDownload={!hasChatBulkSelection && selectedCollectionIds.size === 0}
                canMoveToCollection={!hasChatBulkSelection && selectedItemIds.size > 0 && selectedCollectionIds.size === 0}
                showDownload={!hasChatBulkSelection}
                showMoveToCollection={!hasChatBulkSelection}
                showMerge={!hasChatBulkSelection}
                onCancel={() => { setSelectedItemIds(new Set()); setSelectedCollectionIds(new Set()); setSelectedChatItemIds(new Set()); }}
                onBulkArchive={hasChatBulkSelection ? async () => {
                    const count = selectedChatItemIds.size;
                    const ok = await confirm({
                        title: 'Move Chat Selection To Deleted',
                        description: `Move ${count} chat capture${count === 1 ? '' : 's'} to Deleted?`,
                        confirmLabel: 'Move To Deleted',
                        tone: 'danger'
                    });
                    if (!ok) return;
                    try {
                        await Promise.all(Array.from(selectedChatItemIds).map((chatItemId) => (
                            api.chatItems.update(chatItemId, { isArchived: true })
                        )));
                        setSelectedChatItemIds(new Set());
                        window.dispatchEvent(new CustomEvent('chat-captures-updated', { detail: { projectId: id } }));
                        showToast(`Moved ${count} chat capture${count === 1 ? '' : 's'} to Deleted.`);
                    } catch (e: any) {
                        showToast(e?.message || 'Failed to move chat captures.', 'error');
                    }
                } : handleBulkArchiveMixed}
                onBulkDownload={hasChatBulkSelection ? undefined : () => handleBulkDownload(selectedItemIds, items, () => setSelectedItemIds(new Set()))}
                onBulkMove={hasChatBulkSelection ? handleBulkChatMoveInitiate : handleBulkMoveInitiate}
                onBulkMoveToCollection={hasChatBulkSelection ? undefined : handleBulkMoveToCollectionInitiate}
                onBulkMerge={hasChatBulkSelection ? undefined : handleBulkMergeInitiate}
            />

            <BulkMergeModal
                isOpen={isBulkMergeModalOpen}
                items={bulkMergeCandidates}
                mainItemId={bulkMergeMainItemId}
                onSelectMain={setBulkMergeMainItemId}
                onClose={() => {
                    if (isBulkMerging) return;
                    setIsBulkMergeModalOpen(false);
                    setBulkMergeCandidateIds([]);
                    setBulkMergeMainItemId('');
                }}
                onConfirm={handleConfirmBulkMerge}
                isProcessing={isBulkMerging}
            />

            <ProjectCollectionModal
                isOpen={isCreateCollectionOpen}
                isSubmitting={isCreatingCollection}
                onClose={() => {
                    if (isCreatingCollection) return;
                    setIsCreateCollectionOpen(false);
                }}
                onSubmit={handleCreateCollection}
            />

            <ProjectCollectionModal
                isOpen={!!editingCollection}
                mode="edit"
                initialName={editingCollection?.name || ''}
                initialDescription={editingCollection?.description || ''}
                isSubmitting={isUpdatingCollectionName}
                onClose={() => {
                    if (isUpdatingCollectionName) return;
                    setEditingCollection(null);
                }}
                onSubmit={handleUpdateCollectionSettings}
            />

            <ProjectCollectionAssignModal
                isOpen={!!collectionTargetItem || isBulkCollectionAssign}
                collections={collections}
                itemCount={isBulkCollectionAssign ? selectedItemIds.size : 1}
                initialCollectionId={selectedCollectionId}
                isSubmitting={isCollectionAssigning}
                onClose={() => {
                    if (isCollectionAssigning) return;
                    setCollectionTargetItem(null);
                    setIsBulkCollectionAssign(false);
                    setSelectedCollectionId(null);
                }}
                onConfirm={handleAssignCollection}
            />

            <ProjectModalsOrchestrator 
                project={project} items={items} selectedItem={selectedItem} setSelectedItem={setSelectedItem}
                onUpdateItems={syncItemAcrossViews}
                onRefresh={refresh} onDelete={refresh} 
                onImportPromptsComplete={handlePromptImportComplete}
                isImportModalOpen={isImportModalOpen} setIsImportModalOpen={setIsImportModalOpen}
                isImportPromptOpen={isImportPromptOpen} setIsImportPromptOpen={setIsImportPromptOpen}
                isShareModalOpen={isShareModalOpen} setIsShareModalOpen={setIsShareModalOpen}
                isAiLabOpen={isAiLabOpen} setIsAiLabOpen={setIsAiLabOpen}
                labMode={labMode} onLabModeChange={setLabMode} remixRevision={remixRevision} onAddAiImage={handleAddAiImage}
                showProjectSelector={showProjectSelector} setShowProjectSelector={setShowProjectSelector}
                allProjects={allProjects} selectedProjectId={targetProjectId} setSelectedProjectId={setTargetProjectId}
                handleConfirmMove={handleConfirmMove} isMoving={isMoving} movingItem={movingItem}
                selectedItemIds={selectedItemIds} totalBulkSelectionCount={selectedItemIds.size + selectedCollectionIds.size} isBulkMove={isBulkMove} onMoveInitiate={handleMoveInitiate}
                onRemixToBulk={handleRemixToBulk}
                onRemix={(rev) => { setSelectedItem(null); handleRemix(rev); }}
            />

            {inspectedItemTask && (
                <ArtifactInspector
                    key={`artifact-inspector-${inspectedItemTask.id}-${String(inspectedItemTask.result?.mimeType || inspectedItemTask.archivedItem?.currentRevision?.mimeType || '').toLowerCase()}`}
                    task={inspectedItemTask}
                    onClose={() => setInspectedItemTask(null)}
                    onUpdate={(_, updates) => {
                        const archivedItem = updates.archivedItem || inspectedItemTask.archivedItem;
                        const currentRevision = archivedItem?.currentRevision;
                        if (!archivedItem || !currentRevision) return;
                        syncItemAcrossViews({
                            ...archivedItem,
                            currentRevision: {
                                ...currentRevision,
                                title: updates.title ?? currentRevision.title,
                                prompt: updates.prompt ?? currentRevision.prompt
                            }
                        });
                    }}
                    onDelete={(id) => {
                        setItems(prev => prev.filter(item => item.id !== id));
                        setSelectedItem(prev => prev?.id === id ? null : prev);
                        setInspectedItemTask(prev => prev?.archivedItem?.id === id ? null : prev);
                    }}
                    onRemix={(task) => {
                        if (task.archivedItem?.currentRevision) {
                            setInspectedItemTask(null);
                            handleRemix(task.archivedItem.currentRevision);
                        }
                    }}
                    registry={inspectorRegistry}
                />
            )}

            <ItemArchiveConfirmModal
                isOpen={!!pendingArchiveItem}
                itemTitle={pendingArchiveItem?.currentRevision?.title?.trim() || pendingArchiveItem?.currentRevision?.originalFilename || pendingArchiveItem?.id}
                onCancel={() => { if (!isArchiveProcessing) setPendingArchiveItem(null); }}
                onConfirm={handleConfirmArchive}
                isProcessing={isArchiveProcessing}
            />

            <ChatItemDetailModal
                isOpen={isChatItemDetailOpen}
                item={selectedChatItem}
                onOpenChat={(item) => {
                    setIsChatItemDetailOpen(false);
                    setSelectedChatItem(null);
                    navigate(`/chat?from=project&projectId=${item.projectId}&chatItemId=${item.id}`);
                }}
                onClose={() => {
                    setIsChatItemDetailOpen(false);
                    setSelectedChatItem(null);
                }}
                onMove={handleChatMoveInitiate}
                onArchive={handleArchiveChatItem}
                moveDisabled={isChatMoving}
                archiveDisabled={isChatItemArchiving}
                registry={inspectorRegistry}
            />

            {showChatProjectSelector && (
                <ProjectReassignModal
                    projects={availableChatMoveProjects}
                    selectedProjectId={targetChatProjectId}
                    onSelectProject={setTargetChatProjectId}
                    onConfirm={handleConfirmChatMove}
                    onCancel={() => {
                        if (isChatMoving) return;
                        setShowChatProjectSelector(false);
                        setMovingChatItem(null);
                        setIsBulkChatMove(false);
                    }}
                    isMoving={isChatMoving}
                    title={isBulkChatMove ? `Move ${selectedChatItemIds.size} Chat Captures` : 'Move Chat Capture'}
                    description="Select a destination project workspace for this saved chat capture."
                    confirmLabel={isBulkChatMove ? 'Move Selected' : 'Move Capture'}
                />
            )}

            {confirmDialog}

            <UploadManager uploads={uploads} onClose={() => setUploads([])} onViewItem={handleViewMetadataFromManager} />
            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-2xl text-white text-sm font-medium animate-in fade-in slide-in-from-bottom-4 z-50 ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
};

export default ProjectDashboard;
