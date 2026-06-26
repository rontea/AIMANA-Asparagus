import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PromptManagerBoard } from '../components/prompt-manager/PromptManagerBoard';
import { PromptCollectionModal } from '../components/prompt-manager/PromptCollectionModal';
import { PromptCollectionViewerModal } from '../components/prompt-manager/PromptCollectionViewerModal';
import { PromptDetailModal } from '../components/prompt-manager/PromptDetailModal';
import { PromptDuplicateMergeModal } from '../components/prompt-manager/PromptDuplicateMergeModal';
import { PromptManagerHeader } from '../components/prompt-manager/PromptManagerHeader';
import { PromptImportModal } from '../components/prompt-manager/PromptImportModal';
import { PromptManagerSidebar } from '../components/prompt-manager/PromptManagerSidebar';
import { ProjectCollectionModal } from '../components/project/ProjectCollectionModal';
import { ProjectCollectionAssignModal } from '../components/project/ProjectCollectionAssignModal';
import { LoraSelectorModal } from '../components/project/lab/LoraSelectorModal';
import { EmbeddingSelectorModal } from '../components/project/lab/EmbeddingSelectorModal';
import { ControlNetSelectorModal } from '../components/project/lab/ControlNetSelectorModal';
import { ModelSelectorModal } from '../components/project/lab/ModelSelectorModal';
import { usePromptManager } from '../hooks/usePromptManager';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { useToast } from '../hooks/useToast';
import { api } from '../services/api';
import { DEFAULT_GOOGLE_TEXT_MODEL } from '../utils/googleModelIds';
import { toPromptDraft } from '../components/prompt-manager/utils';
import type { PromptDraft, PromptIngestionState, PromptManagerTab } from '../components/prompt-manager/types';
import type { Project, ProjectCollection } from '../types';
import { clearPollenCreditContext, dispatchPollenCreditContext } from '../utils/pollenCreditChannel';
import { formatPollenAmount, getPrimaryModelCreditRate } from '../utils/pollenCredits';

const PromptManager: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [isQueueCollectionModalOpen, setIsQueueCollectionModalOpen] = useState(false);
  const [isCreatingQueueCollection, setIsCreatingQueueCollection] = useState(false);
  const [activeCollection, setActiveCollection] = useState<Project | null>(null);
  const [assetIngestionProject, setAssetIngestionProject] = useState<Project | null>(null);
  const [queueCollections, setQueueCollections] = useState<ProjectCollection[]>([]);
  const [isQueueCollectionsLoading, setIsQueueCollectionsLoading] = useState(false);
  const [selectedQueueCollectionId, setSelectedQueueCollectionId] = useState('');
  const [activeQueueCollectionId, setActiveQueueCollectionId] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isDuplicateMergeModalOpen, setIsDuplicateMergeModalOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PromptDraft | null>(null);
  const [singleExportDraftId, setSingleExportDraftId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isLoraSelectorOpen, setIsLoraSelectorOpen] = useState(false);
  const [isEmbeddingSelectorOpen, setIsEmbeddingSelectorOpen] = useState(false);
  const [isControlNetSelectorOpen, setIsControlNetSelectorOpen] = useState(false);
  const { confirm, confirmDialog } = useModalDialogs();
  const { toast, showToast, hideToast } = useToast();

  const {
    drafts,
    filteredDrafts,
    projects,
    projectThumbnails,
    activeTab,
    viewMode,
    searchQuery,
    selectedDraftIds,
    selectedDrafts,
    selectedProjectId,
    previewModel,
    modelRegistry,
    currentModelCategory,
    currentModelFeatures,
    currentModelSchema,
    selectedRatio,
    customWidth,
    customHeight,
    negativePrompt,
    seed,
    useSearch,
    enhance,
    nologo,
    safe,
    dynamicParams,
    duration,
    audio,
    isPrivate,
    nofeed,
    imageModelOptions,
    isImporting,
    isProjectsLoading,
    isGenerating,
    isCoolingDown,
    cooldownProgress,
    isExporting,
    isMergingDuplicates,
    latestPreviewPollenUsed,
    generationProgress,
    currentGeneratingDraftId,
    lastCopiedDraftId,
    stagingCount,
    readyCount,
    missingPreviewCount,
    queuedGenerationCount,
    setActiveTab,
    setViewMode,
    setSearchQuery,
    setSelectedProjectId,
    setPreviewModel,
    setSelectedRatio,
    setCustomWidth,
    setCustomHeight,
    setNegativePrompt,
    setSeed,
    setUseSearch,
    setEnhance,
    setNologo,
    setSafe,
    setDynamicParam,
    setDuration,
    setAudio,
    setIsPrivate,
    setNofeed,
    refreshProjects,
    updateDraft,
    removeDraft,
    removeSelectedDrafts,
    restoreDraft,
    restoreSelectedDrafts,
    restoreDraftRevision,
    duplicateDraft,
    duplicateSelectedDrafts,
    toggleSelectDraft,
    selectDrafts,
    clearSelection,
    selectPreviewDrafts,
    selectMissingPreviewDrafts,
    stopPreviewGeneration,
    copyPrompt,
    uploadPreviewImage,
    activeDuplicateGroups,
    mergeDuplicateDrafts,
    importDrafts,
    generatePreviewImages,
    exportReadyDrafts,
    exportDraftsToAssetIngestion
  } = usePromptManager({ confirm });

  const activeDraft = useMemo(
    () => pendingDraft || drafts.find((draft) => draft.id === activeDraftId) || null,
    [activeDraftId, drafts, pendingDraft]
  );
  const activeDraftIndex = useMemo(
    () => (activeDraftId ? filteredDrafts.findIndex((draft) => draft.id === activeDraftId) : -1),
    [activeDraftId, filteredDrafts]
  );
  const previousDraftId = activeDraftIndex > 0 ? filteredDrafts[activeDraftIndex - 1]?.id || null : null;
  const nextDraftId = activeDraftIndex >= 0 && activeDraftIndex < filteredDrafts.length - 1
    ? filteredDrafts[activeDraftIndex + 1]?.id || null
    : null;
  const activeDraftNavigationLabel = activeDraftIndex >= 0
    ? `${activeDraftIndex + 1} of ${filteredDrafts.length}`
    : null;

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => (
      String(project.name || '').toLowerCase().includes(query)
      || String(project.description || '').toLowerCase().includes(query)
    ));
  }, [projects, searchQuery]);
  const filteredQueueCollections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return queueCollections;
    return queueCollections.filter((collection) => (
      String(collection.name || '').toLowerCase().includes(query)
    ));
  }, [queueCollections, searchQuery]);
  const activeQueueCollection = useMemo(
    () => queueCollections.find((collection) => collection.id === activeQueueCollectionId) || null,
    [activeQueueCollectionId, queueCollections]
  );
  const queueAssetItemCount = useMemo(
    () => readyCount + queueCollections.reduce((total, collection) => total + Number(collection.itemCount || 0), 0),
    [queueCollections, readyCount]
  );
  const activePreviewModel = useMemo(
    () => modelRegistry.find((entry) => entry.id === previewModel),
    [modelRegistry, previewModel]
  );
  const activePreviewCreditRate = useMemo(
    () => getPrimaryModelCreditRate(activePreviewModel),
    [activePreviewModel]
  );
  const latestPreviewPollenUsedLabel = latestPreviewPollenUsed ? `${formatPollenAmount(latestPreviewPollenUsed)} pollen` : null;

  const handleDeleteDraft = useCallback((draftId: string) => {
    return removeDraft(draftId);
  }, [removeDraft]);

  useEffect(() => {
    dispatchPollenCreditContext({
      visible: true,
      mode: activePreviewModel?.category === 'Motion' ? 'video' : 'image',
      provider: activePreviewModel?.provider || null,
      activeModelLabel: activePreviewModel?.label || previewModel,
      creditRate: activePreviewCreditRate?.displayValue || null,
      creditRateDetail: activePreviewCreditRate?.detail || null,
      lastPollenUsed: latestPreviewPollenUsedLabel,
      isGenerating
    });
  }, [
    activePreviewCreditRate?.detail,
    activePreviewCreditRate?.displayValue,
    activePreviewModel?.category,
    activePreviewModel?.label,
    activePreviewModel?.provider,
    isGenerating,
    latestPreviewPollenUsedLabel,
    previewModel
  ]);

  useEffect(() => {
    return () => {
      clearPollenCreditContext();
    };
  }, []);

  const handleDeleteSelectedDrafts = useCallback(() => {
    return removeSelectedDrafts();
  }, [removeSelectedDrafts]);

  const handleIngestionStateChange = useCallback((draftId: string, state: PromptIngestionState) => {
    updateDraft(draftId, { ingestionState: state });
  }, [updateDraft]);

  const handleQueueIndexChange = useCallback((draftId: string, updates: Pick<PromptDraft, 'queueLetter' | 'queueNumber'>) => {
    updateDraft(draftId, updates);
  }, [updateDraft]);

  const refreshQueueCollections = useCallback(async () => {
    setIsQueueCollectionsLoading(true);
    try {
      const project = await api.projects.getAssetIngestion();
      setAssetIngestionProject(project);
      if (!project?.id) {
        setQueueCollections([]);
        setSelectedQueueCollectionId('');
        setActiveQueueCollectionId(null);
        return;
      }

      const collections = await api.collections.list(project.id);
      const sortedCollections = [...collections].sort((a, b) => {
        const pinnedDiff = Number(!!b.isPinned) - Number(!!a.isPinned);
        if (pinnedDiff !== 0) return pinnedDiff;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      setQueueCollections(sortedCollections);
      setSelectedQueueCollectionId((current) => (
        current && sortedCollections.some((collection) => collection.id === current)
          ? current
          : (sortedCollections[0]?.id || '')
      ));
      setActiveQueueCollectionId((current) => (
        current && sortedCollections.some((collection) => collection.id === current)
          ? current
          : current === null ? null : (sortedCollections[0]?.id || null)
      ));
    } catch {
      setQueueCollections([]);
      setSelectedQueueCollectionId('');
      setActiveQueueCollectionId(null);
    } finally {
      setIsQueueCollectionsLoading(false);
    }
  }, []);

  const handleArchivePromptCollection = async (projectId: string) => {
    const project = filteredProjects.find((entry) => entry.id === projectId);
    if (!project) return false;

    const confirmed = await confirm({
      title: 'Move Prompt Collection To Recycle Bin',
      description: `Move "${project.name}" to recycle bin?`,
      confirmLabel: 'Move To Recycle Bin',
      tone: 'danger'
    });
    if (!confirmed) return false;

    await api.projects.archive(projectId);
    if (activeCollection?.id === projectId) {
      setActiveCollection(null);
    }
    await refreshProjects();
    window.dispatchEvent(new CustomEvent('aimana-notification', {
      detail: {
        title: 'Prompt Manager',
        message: `Moved "${project.name}" to recycle bin.`,
        type: 'success'
      }
    }));
    return true;
  };

  const handleArchiveQueueCollection = useCallback(async (collectionId: string) => {
    if (!assetIngestionProject?.id) return false;
    const targetCollection = queueCollections.find((entry) => entry.id === collectionId);
    if (!targetCollection) return false;

    const confirmed = await confirm({
      title: 'Move Queue Asset Collection To Recycle Bin',
      description: `Move "${targetCollection.name}" to recycle bin?`,
      confirmLabel: 'Move To Recycle Bin',
      tone: 'danger'
    });
    if (!confirmed) return false;

    await api.collections.update(assetIngestionProject.id, collectionId, { isArchived: true });
    if (activeQueueCollectionId === collectionId) {
      setActiveQueueCollectionId(null);
    }
    setSelectedQueueCollectionId((current) => current === collectionId ? '' : current);
    await refreshQueueCollections();
    window.dispatchEvent(new CustomEvent('project-items-updated', {
      detail: { projectId: assetIngestionProject.id, reason: 'queue-collection-archived' }
    }));
    window.dispatchEvent(new CustomEvent('aimana-notification', {
      detail: {
        title: 'Queue Asset',
        message: `Moved "${targetCollection.name}" to recycle bin.`,
        type: 'success'
      }
    }));
    return true;
  }, [activeQueueCollectionId, assetIngestionProject?.id, confirm, queueCollections, refreshQueueCollections]);

  const handleTogglePromptCollectionPin = useCallback(async (projectId: string) => {
    const project = filteredProjects.find((entry) => entry.id === projectId);
    if (!project) return;

    await api.projects.update(projectId, { isPinned: !project.isPinned });
    await refreshProjects();
    window.dispatchEvent(new CustomEvent('project-pinned-updated'));
    window.dispatchEvent(new CustomEvent('aimana-notification', {
      detail: {
        title: 'Prompt Manager',
        message: `${project.name} ${project.isPinned ? 'unpinned' : 'pinned'}.`,
        type: 'success'
      }
    }));
  }, [filteredProjects, refreshProjects]);

  const handleToggleQueueCollectionPin = useCallback(async (collectionId: string) => {
    if (!assetIngestionProject?.id) return;
    const collection = queueCollections.find((entry) => entry.id === collectionId);
    if (!collection) return;

    await api.collections.update(assetIngestionProject.id, collectionId, { isPinned: !collection.isPinned });
    await refreshQueueCollections();
    window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated'));
    window.dispatchEvent(new CustomEvent('aimana-notification', {
      detail: {
        title: 'Queue Asset',
        message: `${collection.name} ${collection.isPinned ? 'unpinned' : 'pinned'}.`,
        type: 'success'
      }
    }));
  }, [assetIngestionProject?.id, queueCollections, refreshQueueCollections]);

  const handleQueueCollectionImageDrop = useCallback(async (collectionId: string, file: File) => {
    if (!assetIngestionProject?.id) return;
    const fileName = file.name || '';
    const isSupportedMedia = file.type.startsWith('image/')
      || file.type.startsWith('video/')
      || /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov)$/i.test(fileName);
    if (!isSupportedMedia) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: 'Drop an image or video file onto a Queue Prompt Collection.',
          type: 'info'
        }
      }));
      return;
    }

    const previewImageUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read dropped preview file.'));
      reader.readAsDataURL(file);
    });

    const previewMimeType = file.type || (/\.(mp4|webm|mov)$/i.test(fileName) ? 'video/mp4' : 'image/png');
    const baseTitle = fileName.replace(/\.[^.]+$/, '').trim() || `Dropped Preview ${new Date().toLocaleString()}`;
    try {
      const response = await api.items.createFromPrompts(
        assetIngestionProject.id,
        assetIngestionProject.defaultEngine || DEFAULT_GOOGLE_TEXT_MODEL,
        [{
          title: baseTitle,
          prompt: `Imported preview image: ${fileName || baseTitle}`,
          source: 'manual',
          previewImageUrl,
          previewMimeType,
          ingestionState: 'waiting',
          queueLetter: 'A-Z',
          queueNumber: '0-9'
        }],
        true,
        collectionId,
        'suffix'
      );
      await refreshQueueCollections();
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: { projectId: assetIngestionProject.id, reason: 'queue-collection-image-drop' }
      }));
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: response.renamed
            ? `Added "${baseTitle}" to the queue collection with a renamed title.`
            : `Added "${baseTitle}" to the queue collection.`,
          type: 'success'
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Queue Asset',
          message: error instanceof Error && error.message ? error.message : 'Failed to add dropped image to queue collection.',
          type: 'error'
        }
      }));
    }
  }, [assetIngestionProject, refreshQueueCollections]);

  useEffect(() => {
    void refreshQueueCollections();
  }, [refreshQueueCollections]);

  useEffect(() => {
    const handleProjectItemsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ projectId?: string }>;
      if (!assetIngestionProject?.id || customEvent.detail?.projectId !== assetIngestionProject.id) return;
      void refreshQueueCollections();
    };

    window.addEventListener('project-items-updated', handleProjectItemsUpdated as EventListener);
    return () => {
      window.removeEventListener('project-items-updated', handleProjectItemsUpdated as EventListener);
    };
  }, [assetIngestionProject?.id, refreshQueueCollections]);

  useEffect(() => {
    const handleCollectionsUpdated = () => {
      void refreshQueueCollections();
    };
    window.addEventListener('aimana-queue-collections-updated', handleCollectionsUpdated as EventListener);
    return () => {
      window.removeEventListener('aimana-queue-collections-updated', handleCollectionsUpdated as EventListener);
    };
  }, [refreshQueueCollections]);

  useEffect(() => {
    const handlePromptProjectsUpdated = () => {
      void refreshProjects();
    };
    window.addEventListener('aimana-prompt-projects-updated', handlePromptProjectsUpdated as EventListener);
    return () => {
      window.removeEventListener('aimana-prompt-projects-updated', handlePromptProjectsUpdated as EventListener);
    };
  }, [refreshProjects]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'staging' || tab === 'ready' || tab === 'projects') {
      setActiveTab(tab);
    }
  }, [location.search, setActiveTab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('projectId');
    if (!projectId) {
      setActiveCollection(null);
      return;
    }

    const project = projects.find((entry) => entry.id === projectId) || null;
    setActiveCollection((current) => current?.id === project?.id ? current : project);
  }, [location.search, projects]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const collectionId = params.get('collectionId');
    if (!collectionId) {
      setActiveQueueCollectionId(null);
      return;
    }

    if (queueCollections.some((collection) => collection.id === collectionId)) {
      setSelectedQueueCollectionId((current) => current === collectionId ? current : collectionId);
      setActiveQueueCollectionId((current) => current === collectionId ? current : collectionId);
    }
  }, [location.search, queueCollections]);

  const handleTabChange = (tab: PromptManagerTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  const handleOpenDuplicateMerge = useCallback(() => {
    if (activeTab !== 'staging') return false;
    if (activeDuplicateGroups.length === 0) {
      const message = 'No duplicate prompts found in this view.';
      window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
          title: 'Prompt Manager',
          message,
          type: 'info'
        }
      }));
      showToast(message, 'info');
      window.setTimeout(() => hideToast(), 3000);
      return false;
    }
    setIsDuplicateMergeModalOpen(true);
    return true;
  }, [activeDuplicateGroups.length, activeTab, hideToast, showToast]);

  return (
    <div className="mx-auto flex h-full max-w-[1750px] flex-col gap-6 pb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#050b18] shadow-[0_24px_80px_rgba(2,6,23,0.5)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.08),transparent_40%)]" />

        <PromptManagerHeader
          stagingCount={stagingCount}
          readyCount={queueAssetItemCount}
          projectCount={filteredProjects.length}
          missingPreviewCount={missingPreviewCount}
          onOpenImport={() => setIsImportOpen(true)}
          onOpenProjectModal={() => setIsCollectionModalOpen(true)}
          onCreateDraft={() => {
            setPendingDraft(toPromptDraft({ title: '', prompt: '', source: 'manual' }));
            setActiveDraftId(null);
          }}
        />

        <div className="relative flex min-h-0 flex-1">
          <main className="min-h-0 flex-1 overflow-hidden">
            <PromptManagerBoard
              activeTab={activeTab}
              viewMode={viewMode}
              searchQuery={searchQuery}
              drafts={filteredDrafts}
              projects={filteredProjects}
              queueCollections={filteredQueueCollections}
              projectThumbnails={projectThumbnails}
              stagingCount={stagingCount}
              readyCount={readyCount}
              queueAssetItemCount={queueAssetItemCount}
              selectedCount={selectedDrafts.length}
              selectedProjectId={selectedProjectId}
              selectedQueueCollectionId={selectedQueueCollectionId}
              isProjectsLoading={isProjectsLoading}
              isQueueCollectionsLoading={isQueueCollectionsLoading}
              isExporting={isExporting}
              selectedDraftIds={selectedDraftIds}
              currentGeneratingDraftId={currentGeneratingDraftId}
              copiedDraftId={lastCopiedDraftId}
              onTabChange={handleTabChange}
              onViewModeChange={setViewMode}
              onSearchChange={setSearchQuery}
              onProjectChange={setSelectedProjectId}
              onQueueCollectionChange={setSelectedQueueCollectionId}
              onImportOpen={() => setIsImportOpen(true)}
              onSelectAll={() => selectDrafts(filteredDrafts.map((draft) => draft.id))}
              onSelectByIngestionState={(state) => selectDrafts(
                filteredDrafts
                  .filter((draft) => (draft.ingestionState || 'waiting') === state)
                  .map((draft) => draft.id)
              )}
              onDeselectAll={clearSelection}
              onSelectAllWithImages={selectPreviewDrafts}
              onSelectAllMissing={selectMissingPreviewDrafts}
              onCheckAndMergeDuplicates={handleOpenDuplicateMerge}
              isCheckingDuplicates={isMergingDuplicates}
              onDeleteSelected={handleDeleteSelectedDrafts}
              onRestoreSelected={restoreSelectedDrafts}
              onExportReady={exportReadyDrafts}
              onExportToAssetIngestion={async (draftIds) => {
                await exportDraftsToAssetIngestion(draftIds, selectedQueueCollectionId || null);
              }}
              onOpenSingleExportToAssetIngestion={(draftId) => setSingleExportDraftId(draftId)}
              onOpenDraft={(draftId) => {
                setPendingDraft(null);
                setActiveDraftId(draftId);
              }}
              onToggleSelect={toggleSelectDraft}
              onCopy={copyPrompt}
              onDuplicate={(draftId) => {
                const nextDraftId = duplicateDraft(draftId);
                if (nextDraftId) setActiveDraftId(nextDraftId);
              }}
              onDuplicateSelected={duplicateSelectedDrafts}
              onDelete={handleDeleteDraft}
              onRestore={restoreDraft}
              onIngestionStateChange={handleIngestionStateChange}
              onOpenProject={(projectId) => {
                const project = filteredProjects.find((entry) => entry.id === projectId) || null;
                setActiveCollection(project);
              }}
              onOpenQueueCollection={(collectionId) => {
                setActiveQueueCollectionId(collectionId);
              }}
              onQueueCollectionImageDrop={handleQueueCollectionImageDrop}
              onToggleProjectPin={handleTogglePromptCollectionPin}
              onToggleQueueCollectionPin={handleToggleQueueCollectionPin}
              onCreateQueueCollection={() => setIsQueueCollectionModalOpen(true)}
              onArchiveQueueCollection={handleArchiveQueueCollection}
              onArchiveProject={handleArchivePromptCollection}
              onQueueIndexChange={handleQueueIndexChange}
              onToggleThumbnailBlur={(draftId, enabled) => {
                updateDraft(draftId, { thumbnailBlur: enabled });
              }}
            />
          </main>

          <PromptManagerSidebar
            isOpen={isSidebarOpen}
            previewModel={previewModel}
            modelRegistry={modelRegistry}
            currentModelCategory={currentModelCategory}
            currentModelFeatures={currentModelFeatures}
            currentModelSchema={currentModelSchema}
            selectedRatio={selectedRatio}
            customWidth={customWidth}
            customHeight={customHeight}
            negativePrompt={negativePrompt}
            seed={seed}
            useSearch={useSearch}
            enhance={enhance}
            nologo={nologo}
            safe={safe}
            dynamicParams={dynamicParams}
            duration={duration}
            audio={audio}
            isPrivate={isPrivate}
            nofeed={nofeed}
            modelOptions={imageModelOptions}
            missingPreviewCount={missingPreviewCount}
            queuedGenerationCount={queuedGenerationCount}
            isGenerating={isGenerating}
            isCoolingDown={isCoolingDown}
            cooldownProgress={cooldownProgress}
            generationProgress={generationProgress}
            onToggleOpen={() => setIsSidebarOpen((current) => !current)}
            onOpenCheckpointHub={() => setIsModelSelectorOpen(true)}
            onOpenLoraSelector={() => setIsLoraSelectorOpen(true)}
            onOpenEmbeddingSelector={() => setIsEmbeddingSelectorOpen(true)}
            onOpenControlNetSelector={() => setIsControlNetSelectorOpen(true)}
            onSelectedRatioChange={setSelectedRatio}
            onCustomWidthChange={setCustomWidth}
            onCustomHeightChange={setCustomHeight}
            onNegativePromptChange={setNegativePrompt}
            onSeedChange={setSeed}
            onToggleUseSearch={setUseSearch}
            onToggleEnhance={setEnhance}
            onToggleNologo={setNologo}
            onToggleSafe={setSafe}
            onSetDynamicParam={setDynamicParam}
            onSetDuration={setDuration}
            onSetAudio={setAudio}
            onSetIsPrivate={setIsPrivate}
            onSetNofeed={setNofeed}
            onGenerate={generatePreviewImages}
            onStopGeneration={stopPreviewGeneration}
          />
        </div>
      </section>
      <PromptImportModal
        isOpen={isImportOpen}
        isImporting={isImporting}
        onClose={() => setIsImportOpen(false)}
        onImport={async (resolvedInput, sourceInput) => {
          await importDrafts(resolvedInput, sourceInput);
        }}
      />

      <PromptDetailModal
        draft={activeDraft}
        onClose={() => {
          setActiveDraftId(null);
          setPendingDraft(null);
        }}
        onOpenPrevious={previousDraftId ? () => {
          setPendingDraft(null);
          setActiveDraftId(previousDraftId);
        } : undefined}
        onOpenNext={nextDraftId ? () => {
          setPendingDraft(null);
          setActiveDraftId(nextDraftId);
        } : undefined}
        onSave={(draftId, updates) => {
          updateDraft(draftId, updates);
          const isQueueDraft = (activeDraft?.status || updates.status) === 'ready';
          if (isQueueDraft) {
            return;
          }
          setPendingDraft(null);
          setActiveDraftId(null);
        }}
        onQueueMetaChange={(draftId, updates) => {
          updateDraft(draftId, updates);
        }}
        onReplacePreview={(draftId, updates) => {
          updateDraft(draftId, updates);
        }}
        onRemovePreview={async (draftId) => {
          const target = activeDraft?.id === draftId
            ? activeDraft
            : drafts.find((draft) => draft.id === draftId) || null;
          const confirmed = await confirm({
            title: 'Remove Prompt Image',
            description: `Remove the preview image from "${target?.title?.trim() || 'this prompt draft'}"? This keeps the prompt text and metadata.`,
            confirmLabel: 'Remove Image',
            tone: 'danger'
          });
          if (!confirmed) return false;
          updateDraft(draftId, {
            previewImageUrl: undefined,
            previewMimeType: undefined,
            previewError: undefined,
            previewErrorDetails: undefined
          });
          window.dispatchEvent(new CustomEvent('aimana-notification', {
            detail: {
              title: 'Prompt Manager',
              message: 'Preview image removed.',
              type: 'success'
            }
          }));
          return true;
        }}
        onDelete={handleDeleteDraft}
        onRestore={restoreDraft}
        onRestoreRevision={restoreDraftRevision}
        onDuplicate={(draftId) => {
          if (pendingDraft && pendingDraft.id === draftId) {
            const timestamp = Date.now();
            setPendingDraft({
              ...pendingDraft,
              id: toPromptDraft({ title: pendingDraft.title, prompt: pendingDraft.prompt }).id,
              title: `${pendingDraft.title || 'Untitled Prompt'} Copy`,
              status: 'staging',
              previewError: undefined,
              previewErrorDetails: undefined,
              revisionHistory: undefined,
              createdAt: timestamp,
              updatedAt: timestamp
            });
            return;
          }
          const nextDraftId = duplicateDraft(draftId);
          if (nextDraftId) setActiveDraftId(nextDraftId);
        }}
        onUploadPreview={uploadPreviewImage}
        onToggleThumbnailBlur={(draftId, enabled) => {
          updateDraft(draftId, { thumbnailBlur: enabled });
        }}
        usePermanentDelete={activeDraft?.status === 'deleted'}
        navigationLabel={pendingDraft ? null : activeDraftNavigationLabel}
      />

      <PromptDuplicateMergeModal
        isOpen={isDuplicateMergeModalOpen}
        groups={activeDuplicateGroups}
        isProcessing={isMergingDuplicates}
        onClose={() => setIsDuplicateMergeModalOpen(false)}
        onConfirm={async (selectedDuplicateIds) => {
          const merged = await mergeDuplicateDrafts(selectedDuplicateIds);
          if (merged) {
            setIsDuplicateMergeModalOpen(false);
          }
        }}
      />

      <PromptCollectionModal
        isOpen={isCollectionModalOpen}
        onClose={() => setIsCollectionModalOpen(false)}
        onCreate={async ({ name, description, storageType, color, driveFolderId }) => {
          await api.projects.create({
            name,
            description,
            storageType,
            projectType: 'prompt',
            color,
            driveFolderId,
            defaultEngine: DEFAULT_GOOGLE_TEXT_MODEL
          });
          await refreshProjects();
          setIsCollectionModalOpen(false);
        }}
      />

      <PromptCollectionViewerModal
        project={activeCollection}
        isOpen={!!activeCollection}
        onClose={() => setActiveCollection(null)}
        onArchiveProject={handleArchivePromptCollection}
        onProjectRenamed={(project) => {
          setActiveCollection(project);
          void refreshProjects();
        }}
        confirm={confirm}
      />

      <ProjectCollectionModal
        isOpen={isQueueCollectionModalOpen}
        isSubmitting={isCreatingQueueCollection}
        onClose={() => setIsQueueCollectionModalOpen(false)}
        onSubmit={async (name) => {
          if (!assetIngestionProject?.id) return;
          setIsCreatingQueueCollection(true);
          try {
            const created = await api.collections.create(assetIngestionProject.id, { name });
            setSelectedQueueCollectionId(created.id);
            setActiveQueueCollectionId(created.id);
            setIsQueueCollectionModalOpen(false);
            await refreshQueueCollections();
            window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated'));
            window.dispatchEvent(new CustomEvent('aimana-notification', {
              detail: {
                title: 'Prompt Manager',
                message: `Created queue collection "${created.name}".`,
                type: 'success'
              }
            }));
          } finally {
            setIsCreatingQueueCollection(false);
          }
        }}
      />

      <ProjectCollectionAssignModal
        isOpen={!!singleExportDraftId}
        collections={queueCollections}
        itemCount={1}
        initialCollectionId={selectedQueueCollectionId || queueCollections[0]?.id || null}
        isSubmitting={isExporting}
        includeRootOption={false}
        title="Move Prompt To Queue Collection"
        description="Select the Queue Asset collection that should receive this prompt."
        helperNote="If the selected collection already contains the same title, the export will keep going and automatically rename the new copy instead of skipping it."
        confirmLabel="Move"
        onClose={() => setSingleExportDraftId(null)}
        onConfirm={async (collectionId) => {
          if (!singleExportDraftId || !collectionId) return;
          const response = await exportDraftsToAssetIngestion([singleExportDraftId], collectionId);
          if (!response || response.created === 0) return;
          setSelectedQueueCollectionId(collectionId);
          setActiveQueueCollectionId(collectionId);
          setSingleExportDraftId(null);
        }}
      />

      <PromptCollectionViewerModal
        project={assetIngestionProject}
        collection={activeQueueCollection}
        isOpen={!!assetIngestionProject && !!activeQueueCollection}
        onClose={() => setActiveQueueCollectionId(null)}
        onArchiveProject={handleArchivePromptCollection}
        onArchiveQueueCollection={handleArchiveQueueCollection}
        onQueueCollectionRenamed={(collection) => {
          setQueueCollections((current) => current.map((entry) => entry.id === collection.id ? collection : entry));
        }}
        confirm={confirm}
      />

      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        currentModel={previewModel}
        onSelect={(modelId) => {
          setPreviewModel(modelId);
          setIsModelSelectorOpen(false);
        }}
        forcedCategories={['Visual', 'Motion']}
      />

      <LoraSelectorModal
        isOpen={isLoraSelectorOpen}
        onClose={() => setIsLoraSelectorOpen(false)}
      />

      <EmbeddingSelectorModal
        isOpen={isEmbeddingSelectorOpen}
        onClose={() => setIsEmbeddingSelectorOpen(false)}
      />

      <ControlNetSelectorModal
        isOpen={isControlNetSelectorOpen}
        onClose={() => setIsControlNetSelectorOpen(false)}
      />
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[1400] -translate-x-1/2 rounded-2xl border px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 ${
            toast.type === 'error'
              ? 'border-rose-400/40 bg-rose-600'
              : toast.type === 'info'
                ? 'border-cyan-400/40 bg-cyan-600'
                : 'border-emerald-400/40 bg-emerald-600'
          }`}
        >
          {toast.message}
        </div>
      )}
      {confirmDialog}
    </div>
  );
};

export default PromptManager;
