
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ItemWithCurrentRevision, Revision, Project } from '../types';
import { api } from '../services/api';
import { ChoiceConfig, ChoiceResult, ConfirmConfig } from './useModalDialogs';

interface UseItemDetailProps {
  item: ItemWithCurrentRevision;
  project: Project;
  onUpdate: (updatedItem: ItemWithCurrentRevision) => void;
  onDelete: (itemId: string) => void;
  onRefreshHistory?: () => void;
  confirm?: (config: ConfirmConfig) => Promise<boolean>;
  choose?: (config: ChoiceConfig) => Promise<ChoiceResult>;
}

export const useItemDetail = ({
  item,
  project,
  onUpdate,
  onDelete,
  onRefreshHistory,
  confirm,
  choose
}: UseItemDetailProps) => {
  const currentRev = item.currentRevision;
  const isLocalStorage = (storage?: string | null) => {
    const s = String(storage || '').trim().toLowerCase();
    return s === 'local' || s === 'local drive' || s === 'local-drive' || s === 'local_drive';
  };

  // --- Form & Asset State ---
  const [formData, setFormData] = useState({
    title: currentRev?.title || '',
    label: currentRev?.label || '',
    tags: currentRev?.tags || '',
    prompt: currentRev?.prompt || '',
    engine: currentRev?.engine || 'default-placeholder',
    note: currentRev?.note || '',
    aiParameters: currentRev?.aiParameters || '',
    originalFilename: currentRev?.originalFilename || ''
  });

  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [secondaryFiles, setSecondaryFiles] = useState<{ id: string, url: string, mimeType: string }[]>(currentRev?.secondaryFiles || []);
  const [engines, setEngines] = useState<string[]>(['default-placeholder']);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- UI Control State ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorMode, setSelectorMode] = useState<'swap' | 'reference' | 'mosaic'>('swap');
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [isMosaicViewerOpen, setIsMosaicViewerOpen] = useState(false);
  const [mosaicInitialIndex, setMosaicInitialIndex] = useState<number | null>(null);

  // --- Drag & Drop Interaction State ---
  const [isDragging, setIsDragging] = useState(false);
  const [isHistoryDragging, setIsHistoryDragging] = useState(false);
  const dragCounter = useRef(0);
  const historyDragCounter = useRef(0);

  // --- Refs ---
  const replaceMainInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // --- Derived Data ---
  const allManifestFiles = useMemo(() => {
    if (!currentRev) return secondaryFiles;
    const mainNode = {
      id: 'root-' + item.id,
      url: previewUrl || '',
      mimeType: currentRev.mimeType,
      isMain: true
    };
    return [mainNode, ...secondaryFiles];
  }, [currentRev, item.id, previewUrl, secondaryFiles]);

  // --- Data Loading ---
  const loadEngines = useCallback(async () => {
    try {
      const settings = await api.settings.get();
      if (settings.aiEngines?.length) setEngines(settings.aiEngines);
    } catch (e) { console.error("Engine registry sync failed"); }
  }, []);

  const loadRevisions = useCallback(async () => {
    try {
      const historyList = await api.revisions.list(item.id);
      setRevisions(historyList.filter(r => !r.isArchived));
    } catch (e) { console.error("Revision history fetch failed"); }
  }, [item.id]);

  const shouldArchiveLinkedItem = useCallback(async (linkedItemId: string) => {
    try {
      const linkedItem = await api.items.get(linkedItemId);
      if (!linkedItem) return false;
      return linkedItem.projectId === item.projectId;
    } catch (e) {
      console.error("Linked item ownership check failed", e);
      return false;
    }
  }, [item.projectId]);

  useEffect(() => {
    if (currentRev) {
      setFormData({
        title: currentRev.title,
        label: currentRev.label || '',
        tags: currentRev.tags || '',
        prompt: currentRev.prompt,
        engine: currentRev.engine,
        note: currentRev.note,
        aiParameters: currentRev.aiParameters || '',
        originalFilename: currentRev.originalFilename || ''
      });
      setSecondaryFiles(currentRev.secondaryFiles || []);
      loadRevisions();
      loadEngines();
    }
  }, [item.id, currentRev, loadRevisions, loadEngines]);

  useEffect(() => {
    if (!currentRev) {
      setPreviewUrl(null);
      return;
    }

    if (isLocalStorage(currentRev.storage)) {
      if (currentRev.fileUrl) setPreviewUrl(currentRev.fileUrl);
      else if (currentRev.blob) {
        const url = URL.createObjectURL(currentRev.blob);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    } else if (currentRev.storage === 'google-drive' && currentRev.thumbnailLink) {
      setPreviewUrl(currentRev.thumbnailLink.replace('=s220', '=s1024'));
    } else setPreviewUrl(null);
  }, [currentRev]);

  // --- Actions ---
  const handleSaveMeta = async () => {
    if (!currentRev) return;
    setIsSubmitting(true);
    try {
      const updatedRev = { ...currentRev, ...formData, secondaryFiles };
      await api.revisions.update(updatedRev);
      onUpdate({ ...item, currentRevision: updatedRev });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { } finally { setIsSubmitting(false); }
  };

  const handleAddSecondaryHeadless = async (files: FileList | File[]) => {
    setIsSubmitting(true);
    try {
      const targetProjectId = item.projectId;
      const newSecondary = [...secondaryFiles];
      const filesArray = files instanceof FileList ? Array.from(files) : files;

      for (const file of filesArray) {
        const newId = uuidv4();
        const itemWithRev = await api.items.create(targetProjectId, file, () => { }, {
          id: newId,
          engine: 'reference',
          title: `Source: ${file.name}`,
          note: `Linked artifact for manifest "${formData.title}"`,
          aiParameters: JSON.stringify({
            source: 'manifest_link',
            isReference: true,
            parentItemId: item.id,
            parentItemTitle: formData.title,
            parentItemThumbnail: previewUrl
          }, null, 2)
        });

        if (itemWithRev?.currentRevision?.fileUrl) {
          newSecondary.push({
            id: itemWithRev.id,
            url: itemWithRev.currentRevision.fileUrl,
            mimeType: file.type
          });
        }
      }

      setSecondaryFiles(newSecondary);

      if (currentRev) {
        const updatedRev = { ...currentRev, ...formData, secondaryFiles: newSecondary };
        await api.revisions.update(updatedRev);
        onUpdate({ ...item, currentRevision: updatedRev });
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
        window.dispatchEvent(new CustomEvent('neural-history-updated'));
        window.dispatchEvent(new CustomEvent('project-items-updated', {
          detail: { projectId: targetProjectId, reason: 'linked-artifact-upload' }
        }));
      }
    } catch (e) {
      console.error("Manifest ingest failed", e);
    } finally { setIsSubmitting(false); }
  };

  const handleRemoveSecondary = async (id: string) => {
    const canArchive = await shouldArchiveLinkedItem(id);
    const requestConfirm = confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
    const requestChoose = choose || (async (_config: ChoiceConfig) => {
      const archive = window.confirm('Remove linked artifact?\n\nOK = Unlink + Archive\nCancel = Unlink only');
      return archive ? 'confirm' : 'secondary';
    });
    let shouldArchive = false;
    if (canArchive) {
      const archiveChoice = await requestChoose({
        title: 'Remove Linked Artifact',
        description: 'Choose an action for this linked artifact.',
        confirmLabel: 'Unlink + Archive',
        secondaryLabel: 'Unlink only',
        cancelLabel: 'Cancel',
        tone: 'danger',
        secondaryTone: 'primary'
      });

      if (archiveChoice === 'cancel') return;
      if (archiveChoice === 'confirm') {
        shouldArchive = true;
      }
    } else {
      const unlinkOk = await requestConfirm({
        title: 'Remove Linked Artifact',
        description: 'This artifact belongs to another project. Remove link from this manifest only?',
        confirmLabel: 'Unlink',
        cancelLabel: 'Cancel',
        tone: 'primary'
      });
      if (!unlinkOk) return;
    }

    setIsSubmitting(true);
    try {
      if (shouldArchive) {
        await api.items.update({ id: id, isArchived: true, isPinned: false });
      }
      const next = secondaryFiles.filter(f => f.id !== id);
      setSecondaryFiles(next);
      if (currentRev) {
        const updatedRev = { ...currentRev, ...formData, secondaryFiles: next };
        await api.revisions.update(updatedRev);
        onUpdate({ ...item, currentRevision: updatedRev });
      }
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { } finally { setIsSubmitting(false); }
  };

  const handleLinkReference = async (ids: string[]) => {
    if (!currentRev) return;
    setIsSubmitting(true);
    try {
      const params = formData.aiParameters ? JSON.parse(formData.aiParameters) : {};
      const adv = params.advanced_params || params;
      const currentRefs = adv.referenceItemIds || [];
      const nextRefs = Array.from(new Set([...currentRefs, ...ids]));

      for (const childId of ids) {
        try {
          const childItem = await api.items.get(childId);
          if (childItem?.currentRevision) {
            const cParams = JSON.parse(childItem.currentRevision.aiParameters || '{}');
            await api.revisions.update({
              ...childItem.currentRevision,
              aiParameters: JSON.stringify({
                ...cParams,
                parentItemId: item.id,
                parentItemTitle: formData.title,
                parentItemThumbnail: previewUrl,
                isReference: true
              }, null, 2)
            });
          }
        } catch (e) { }
      }

      const updatedParams = { ...params, advanced_params: { ...(params.advanced_params || adv), referenceItemIds: nextRefs } };
      const newParamsStr = JSON.stringify(updatedParams, null, 2);
      setFormData(prev => ({ ...prev, aiParameters: newParamsStr }));
      await api.revisions.update({ ...currentRev, aiParameters: newParamsStr });
      
      const updatedRev = { ...currentRev, aiParameters: newParamsStr };
      onUpdate({ ...item, currentRevision: updatedRev });
      
      setIsSelectorOpen(false);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { } finally { setIsSubmitting(false); }
  };

  const handleUnlinkReference = async (idToRemove: string) => {
    if (!currentRev) return;
    const canArchive = await shouldArchiveLinkedItem(idToRemove);
    const requestConfirm = confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
    const requestChoose = choose || (async (_config: ChoiceConfig) => {
      const archive = window.confirm('Remove reference artifact?\n\nOK = Unlink + Archive\nCancel = Unlink only');
      return archive ? 'confirm' : 'secondary';
    });
    let shouldArchive = false;
    if (canArchive) {
      const archiveChoice = await requestChoose({
        title: 'Remove Reference Artifact',
        description: 'Choose an action for this linked reference.',
        confirmLabel: 'Unlink + Archive',
        secondaryLabel: 'Unlink only',
        cancelLabel: 'Cancel',
        tone: 'danger',
        secondaryTone: 'primary'
      });
      if (archiveChoice === 'cancel') return;
      if (archiveChoice === 'confirm') shouldArchive = true;
    } else {
      const ok = await requestConfirm({
        title: 'Remove Reference Artifact',
        description: 'Remove this reference from the current item only? The referenced asset itself will be kept.',
        confirmLabel: 'Unlink',
        cancelLabel: 'Cancel',
        tone: 'primary'
      });
      if (!ok) return;
    }
    
    setIsSubmitting(true);
    try {
        if (shouldArchive) {
          await api.items.update({ id: idToRemove, isArchived: true, isPinned: false });
        }
        const params = formData.aiParameters ? JSON.parse(formData.aiParameters) : {};
        const adv = params.advanced_params || params;
        const nextRefs = (adv.referenceItemIds || []).filter((id: string) => id !== idToRemove);
        const nextReferenceItemId = adv.referenceItemId === idToRemove ? null : (adv.referenceItemId || null);
        const updatedParams = {
          ...params,
          ...(params.referenceItemId === idToRemove ? { referenceItemId: null } : {}),
          advanced_params: {
            ...(params.advanced_params || adv),
            referenceItemIds: nextRefs,
            referenceItemId: nextReferenceItemId
          }
        };
        const newParamsStr = JSON.stringify(updatedParams, null, 2);
        
        setFormData(prev => ({ ...prev, aiParameters: newParamsStr }));
        const updatedRev = { ...currentRev, aiParameters: newParamsStr };
        await api.revisions.update(updatedRev);
        
        // Trigger real-time re-clustering in the parent component
        onUpdate({ ...item, currentRevision: updatedRev });
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) {
        console.error("Constituent purge failure", e);
    } finally { setIsSubmitting(false); }
  };

  const handleLinkMosaic = async (ids: string[]) => {
    if (!currentRev) return;
    setIsSubmitting(true);
    try {
      const dedupedMap = new Map<string, { id: string, url: string, mimeType: string }>();
      (secondaryFiles || []).forEach((entry) => {
        if (!entry?.id) return;
        if (!dedupedMap.has(entry.id)) dedupedMap.set(entry.id, entry);
      });
      const initialCount = dedupedMap.size;

      for (const id of ids) {
        if (!id || dedupedMap.has(id)) continue;
        const linkedItem = await api.items.get(id);
        if (linkedItem?.currentRevision?.fileUrl) {
          dedupedMap.set(linkedItem.id, {
            id: linkedItem.id,
            url: linkedItem.currentRevision.fileUrl,
            mimeType: linkedItem.currentRevision.mimeType
          });
        }
      }
      const newSecondary = Array.from(dedupedMap.values());
      const addedCount = Math.max(0, newSecondary.length - initialCount);
      const skippedCount = Math.max(0, (ids || []).filter(Boolean).length - addedCount);
      setSecondaryFiles(newSecondary);
      if (addedCount > 0) {
        const updatedRev = { ...currentRev, ...formData, secondaryFiles: newSecondary };
        await api.revisions.update(updatedRev);
        onUpdate({ ...item, currentRevision: updatedRev });
      }
      setIsSelectorOpen(false);
      if (addedCount > 0) {
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 2000);
      }
      return { addedCount, skippedCount };
    } catch (e) {
      return { addedCount: 0, skippedCount: 0 };
    } finally { setIsSubmitting(false); }
  };

  const handleReplaceMain = async (file: File) => {
    setIsSubmitting(true);
    try {
      if (currentRev) await api.revisions.update({ ...currentRev, ...formData, secondaryFiles });
      const newRev = await api.revisions.add(item.id, file, { ...formData, secondaryFiles });
      onUpdate({ ...item, currentRevisionId: newRev.id, currentRevision: newRev, updatedAt: Date.now() });
      await loadRevisions();
      onRefreshHistory?.();
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { } finally { setIsSubmitting(false); }
  };

  const handleMainDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) as File[] : [];
    if (files.length > 0) {
      await handleReplaceMain(files[0]);
      return;
    }

    const internalId = e.dataTransfer.getData('application/x-aimana-asset');
    if (!internalId || internalId === item.id) return;

    try {
      const selected = await api.items.get(internalId);
      const selectedRev = selected?.currentRevision;
      if (!selectedRev) return;

      if (selectedRev.blob) {
        const blobMime = selectedRev.blob.type || selectedRev.mimeType || 'application/octet-stream';
        const fileFromBlob = new File(
          [selectedRev.blob],
          selectedRev.originalFilename || `dropped-asset-${Date.now()}`,
          { type: blobMime }
        );
        await handleReplaceMain(fileFromBlob);
        return;
      }

      const sourceUrl = selectedRev.fileUrl || selectedRev.webContentLink || selectedRev.thumbnailLink;
      if (!sourceUrl) return;
      const res = await fetch(sourceUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      const fileFromUrl = new File(
        [blob],
        selectedRev.originalFilename || `dropped-asset-${Date.now()}`,
        { type: selectedRev.mimeType || blob.type || 'application/octet-stream' }
      );
      await handleReplaceMain(fileFromUrl);
    } catch (err) {
      console.error('Main replacement drop failed', err);
    }
  };

  const handleArchiveItem = async () => {
    try {
      await api.items.update({ ...item, isArchived: true, isPinned: false });
      window.dispatchEvent(new CustomEvent('project-items-updated', {
        detail: {
          projectId: item.projectId,
          reason: 'item-archived',
          itemIds: [item.id]
        }
      }));
      onDelete(item.id);
    } catch (e) { }
  };

  const handleRestorePromotion = async (rev?: Revision) => {
    setIsSubmitting(true);
    try {
      const targetRev = rev || selectedRevision;
      if (!targetRev) return;
      await api.items.restore(item.id, targetRev.id);
      await loadRevisions();
      const freshItem = await api.items.get(item.id);
      if (freshItem) {
        onUpdate(freshItem);
        onRefreshHistory?.();
      }
      setSelectedRevision(null);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { } finally { setIsSubmitting(false); }
  };

  const handleCommitRefinement = async (base64: string, mimeType: string, newPrompt: string, engine: string, metadata: any) => {
    setIsSubmitting(true);
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const subtype = mimeType.split('/')[1]?.split(';')[0] || '';
      const ext = subtype ? subtype.toLowerCase() : 'bin';
      const file = new File([blob], `Refinement_${Date.now()}.${ext}`, { type: mimeType });

      const newRev = await api.revisions.add(item.id, file, {
        ...formData, prompt: newPrompt, engine,
        aiParameters: JSON.stringify(metadata, null, 2),
        secondaryFiles
      });

      onUpdate({ ...item, currentRevisionId: newRev.id, currentRevision: newRev, updatedAt: Date.now() });
      await loadRevisions();
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) {
      console.error("Revision refinement commit failed", e);
      throw e;
    } finally { setIsSubmitting(false); }
  };

  const handleHistoryDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHistoryDragging(false);
    historyDragCounter.current = 0;
    if (e.dataTransfer.files?.[0]) {
      handleReplaceMain(e.dataTransfer.files[0]);
    }
  };

  const handleMosaicDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const internalId = e.dataTransfer.getData('application/x-aimana-asset');
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) as File[] : [];
    if (internalId) {
      handleLinkMosaic([internalId]);
    } else if (files.length > 0) {
      handleAddSecondaryHeadless(files);
    }
  };

  const handleReferenceDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const internalId = e.dataTransfer.getData('application/x-aimana-asset');
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) as File[] : [];

    if (internalId) {
      await handleLinkReference([internalId]);
    } else if (files.length > 0) {
      setIsSubmitting(true);
      try {
        const targetProjectId = item.projectId;
        const droppedIds: string[] = [];
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          const newId = uuidv4();
          const itemWithRev = await api.items.create(targetProjectId, file, () => { }, {
            id: newId,
            engine: 'reference',
            title: `Ref: ${file.name}`,
            aiParameters: JSON.stringify({ source: 'reference_drop', isReference: true, parentItemId: item.id }, null, 2)
          });
          if (itemWithRev) droppedIds.push(itemWithRev.id);
        }
        if (droppedIds.length > 0) await handleLinkReference(droppedIds);
      } catch (e) { console.error("Ref drop fail", e); }
      finally { setIsSubmitting(false); }
    }
  };

  return {
    formData, setFormData,
    revisions, secondaryFiles, engines, previewUrl,
    isSubmitting, showSaveSuccess, showParamsModal, setShowParamsModal,
    isSelectorOpen, setIsSelectorOpen, selectorMode, setSelectorMode,
    selectedRevision, setSelectedRevision, isMosaicViewerOpen, setIsMosaicViewerOpen,
    mosaicInitialIndex, setMosaicInitialIndex, allManifestFiles,
    isDragging, setIsDragging, isHistoryDragging, setIsHistoryDragging,
    dragCounter, historyDragCounter, replaceMainInputRef, galleryInputRef,
    handleSaveMeta, handleAddSecondaryHeadless, handleRemoveSecondary,
    handleLinkReference, handleUnlinkReference, handleLinkMosaic, handleReplaceMain, handleArchiveItem,
    handleRestorePromotion, handleCommitRefinement, handleHistoryDrop,
    handleMainDrop, handleMosaicDrop, handleReferenceDrop, loadRevisions
  };
};
