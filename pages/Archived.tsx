
import React, { useEffect, useState, useMemo } from 'react';
import { Trash2, Loader2, AlertCircle, CheckCircle, Box, Archive } from 'lucide-react';
import { api } from '../services/api';
import { ItemWithCurrentRevision, Project, User, Revision } from '../types';
import { ProjectCollection } from '../types';
import { ChatItem } from '../types/chatItems';
import type { PromptDraft } from '../components/prompt-manager/types';
import type { ArchivedRegistryVariable, RegistryVariable, SavedRegistryList } from '../utils/variableRegistryStorage';
import {
  readArchivedRegistryVariables,
  readSavedRegistryLists
} from '../utils/variableRegistryStorage';

// Sub-components
import { ArchiveProjectGrid } from '../components/archive/ArchiveProjectGrid';
import { ArchiveAssetGrid } from '../components/archive/ArchiveAssetGrid';
import { ArchiveVersionList } from '../components/archive/ArchiveVersionList';
import { ArchiveDeleteSecurityModal } from '../components/archive/ArchiveDeleteSecurityModal';
import { ArchiveBulkBar } from '../components/archive/ArchiveBulkBar';
import { ArchiveChatGrid } from '../components/archive/ArchiveChatGrid';
import { ArchivePromptDraftGrid } from '../components/archive/ArchivePromptDraftGrid';
import { ArchiveVariableRegistryGrid } from '../components/archive/ArchiveVariableRegistryGrid';
import { ArchiveCollectionGrid } from '../components/archive/ArchiveCollectionGrid';

const Archived: React.FC = () => {
  const [items, setItems] = useState<ItemWithCurrentRevision[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [collections, setCollections] = useState<ProjectCollection[]>([]);
  const [archivedRevisions, setArchivedRevisions] = useState<Revision[]>([]);
  const [archivedChatItems, setArchivedChatItems] = useState<ChatItem[]>([]);
  const [archivedPromptDrafts, setArchivedPromptDrafts] = useState<PromptDraft[]>([]);
  const [archivedRegistryVariables, setArchivedRegistryVariables] = useState<ArchivedRegistryVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectMap, setProjectMap] = useState<Record<string, Project>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Bulk Selection State
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedRevIds, setSelectedRevIds] = useState<Set<string>>(new Set());
  const [selectedPromptDraftIds, setSelectedPromptDraftIds] = useState<Set<string>>(new Set());
  const [selectedRegistryVariableIds, setSelectedRegistryVariableIds] = useState<Set<string>>(new Set());

  // Action States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteType, setDeleteType] = useState<'project' | 'collection' | 'item' | 'revision' | 'chat' | 'promptDraft' | 'registryVariable'>('project');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadArchivedPromptDrafts = async () => {
    try {
      const drafts = await api.settings.listPromptManagerDrafts();
      const archived = drafts
        .filter((draft) => draft.status === 'deleted')
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setArchivedPromptDrafts(archived);
    } catch {
      setArchivedPromptDrafts([]);
    }
  };

  const loadArchivedRegistryEntries = async () => {
    try {
      const entries = await api.settings.getArchivedVariableRegistry();
      setArchivedRegistryVariables(entries);
    } catch {
      setArchivedRegistryVariables(readArchivedRegistryVariables());
    }
  };

  const replacePromptDrafts = async (updater: (drafts: PromptDraft[]) => PromptDraft[]) => {
    const currentDrafts = await api.settings.listPromptManagerDrafts();
    const nextDrafts = updater(currentDrafts);
    const nextIds = new Set(nextDrafts.map((draft) => draft.id));
    const deletedIds = currentDrafts
      .filter((draft) => !nextIds.has(draft.id))
      .map((draft) => draft.id);
    if (nextDrafts.length > 0) {
      await api.settings.appendPromptManagerDrafts(nextDrafts);
    }
    if (deletedIds.length > 0) {
      await api.settings.deletePromptManagerDrafts(deletedIds);
    }
    const nextArchived = nextDrafts
      .filter((draft) => draft.status === 'deleted')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setArchivedPromptDrafts(nextArchived);
    return nextArchived;
  };

  const replaceArchivedRegistryEntries = async (updater: (entries: ArchivedRegistryVariable[]) => ArchivedRegistryVariable[]) => {
    const currentEntries = await api.settings.getArchivedVariableRegistry();
    const nextEntries = updater(currentEntries);
    await api.settings.replaceArchivedVariableRegistry(nextEntries);
    setArchivedRegistryVariables(nextEntries);
    return nextEntries;
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const syncPrompts = () => { void loadArchivedPromptDrafts(); };
    const syncVariables = () => { void loadArchivedRegistryEntries(); };
    window.addEventListener('focus', syncPrompts);
    window.addEventListener('focus', syncVariables);
    window.addEventListener('aimana-prompt-drafts-updated', syncPrompts);
    syncPrompts();
    syncVariables();
    return () => {
      window.removeEventListener('focus', syncPrompts);
      window.removeEventListener('focus', syncVariables);
      window.removeEventListener('aimana-prompt-drafts-updated', syncPrompts);
    };
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [archivedItems, archivedProjs, activeProjs, archivedCollections, globalArchivedRevs, archivedChats] = await Promise.all([
          api.items.listArchived(),
          api.projects.listArchived(),
          api.projects.list(),
          api.collections.listArchived(),
          api.revisions.listGlobalArchived(),
          api.chatItems.listArchived()
      ]);

      setItems(archivedItems);
      setProjects(archivedProjs);
      setCollections(archivedCollections);
      setArchivedRevisions(globalArchivedRevs);
      setArchivedChatItems(archivedChats);
      await Promise.all([
        loadArchivedPromptDrafts(),
        loadArchivedRegistryEntries()
      ]);

      const map: Record<string, Project> = {};
      [...activeProjs, ...archivedProjs].forEach(p => map[p.id] = p);
      setProjectMap(map);
    } catch (e) {
      showToast("Failed to synchronize recycle bin.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePromptDraftPermanently = (draftId: string) => {
    initiateDelete([draftId], 'promptDraft');
  };

  const handleRestorePromptDraft = async (draftId: string) => {
    await replacePromptDrafts((drafts) => drafts.map((draft) => (
      draft.id === draftId
        ? { ...draft, status: 'staging' as const, updatedAt: Date.now() }
        : draft
    )));
    setSelectedPromptDraftIds((previous) => {
      const next = new Set(previous);
      next.delete(draftId);
      return next;
    });
    showToast('Prompt draft restored to Prompt Manager.');
  };

  const handleBulkDeletePromptDrafts = () => {
    if (selectedPromptDraftIds.size === 0) return;
    initiateDelete(Array.from(selectedPromptDraftIds), 'promptDraft');
  };

  const handleBulkRestorePromptDrafts = async () => {
    if (selectedPromptDraftIds.size === 0) return;
    const toRestore = new Set(selectedPromptDraftIds);
    await replacePromptDrafts((drafts) => drafts.map((draft) => (
      toRestore.has(draft.id)
        ? { ...draft, status: 'staging' as const, updatedAt: Date.now() }
        : draft
    )));
    setSelectedPromptDraftIds(new Set());
    showToast('Selected prompt drafts restored to Prompt Manager.');
  };

  const handleDeleteRegistryVariablePermanently = (entryId: string) => {
    initiateDelete([entryId], 'registryVariable');
  };

  const restoreRegistryVariables = async (entryIds: string[]) => {
    const currentArchived = await api.settings.getArchivedVariableRegistry();
    const targets = currentArchived.filter((entry) => entryIds.includes(entry.id));
    if (targets.length === 0) return;

    let activeVariables = await api.settings.getActiveVariableRegistry();
    let savedLists = readSavedRegistryLists();

    const upsertVariableByKey = (variables: RegistryVariable[], incoming: RegistryVariable) => {
      const normalizedKey = incoming.key.trim().toLowerCase();
      const next = [...variables];
      const existingIndex = normalizedKey
        ? next.findIndex((variable) => variable.key.trim().toLowerCase() === normalizedKey)
        : -1;

      if (existingIndex >= 0) {
        next[existingIndex] = { ...next[existingIndex], key: incoming.key, value: incoming.value };
      } else {
        next.push({ ...incoming });
      }
      return next;
    };

    for (const entry of targets) {
      const restoredVariable: RegistryVariable = {
        id: entry.variable.id,
        key: entry.variable.key,
        value: entry.variable.value
      };

      if (entry.source === 'active') {
        activeVariables = upsertVariableByKey(activeVariables, restoredVariable);
        continue;
      }

      const collectionId = entry.collectionId || '';
      const collectionName = entry.collectionName?.trim() || 'Restored Variable Collection';
      const existingCollection = savedLists.find((list) => list.id === collectionId)
        || savedLists.find((list) => list.name.trim().toLowerCase() === collectionName.toLowerCase());

      if (existingCollection) {
        const nextVariables = upsertVariableByKey(existingCollection.variables, restoredVariable);
        await api.settings.updateVariableRegistryList(existingCollection.id, existingCollection.name.trim(), nextVariables);
        savedLists = savedLists
          .map((list) => (
            list.id === existingCollection.id
              ? { ...list, variables: nextVariables, updatedAt: Date.now() }
              : list
          ))
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      } else {
        const created = await api.settings.saveVariableRegistryList(collectionName, [restoredVariable]) as SavedRegistryList;
        savedLists = [created, ...savedLists].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
    }

    await api.settings.replaceActiveVariableRegistry(activeVariables);
    await replaceArchivedRegistryEntries((entries) => entries.filter((entry) => !entryIds.includes(entry.id)));
    setSelectedRegistryVariableIds((previous) => {
      const next = new Set(previous);
      entryIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleRestoreRegistryVariable = async (entryId: string) => {
    await restoreRegistryVariables([entryId]);
    showToast('Registry variable restored from Neural Recycle Bin.');
  };

  const handleBulkDeleteRegistryVariables = () => {
    if (selectedRegistryVariableIds.size === 0) return;
    initiateDelete(Array.from(selectedRegistryVariableIds), 'registryVariable');
  };

  const handleBulkRestoreRegistryVariables = async () => {
    if (selectedRegistryVariableIds.size === 0) return;
    await restoreRegistryVariables(Array.from(selectedRegistryVariableIds));
    setSelectedRegistryVariableIds(new Set());
    showToast('Selected registry variables restored.');
  };

  // Logic to separate standard items from reference items/mosaic children
  const archivedCollectionIds = useMemo(() => new Set(collections.map((collection) => collection.id)), [collections]);

  const { standardItems, referenceItems } = useMemo(() => {
      const standard: ItemWithCurrentRevision[] = [];
      const reference: ItemWithCurrentRevision[] = [];

      items.forEach(item => {
          if (item.collectionId && archivedCollectionIds.has(item.collectionId)) return;
          const rev = item.currentRevision;
          let isReference = rev?.engine === 'reference';

          // Check metadata for parent link context or storage path hint
          if (!isReference && rev?.aiParameters) {
              try {
                  const params = JSON.parse(rev.aiParameters);
                  const adv = params.advanced_params || params;
                  // Support for deep reference isolation paths (/reference/ITEM_ID/)
                  if (adv.parentItemId || adv.isReference || adv.source === 'manifest_link' || rev.fileUrl?.includes('/reference/')) {
                      isReference = true;
                  }
              } catch(e) {}
          }

          if (isReference) reference.push(item);
          else standard.push(item);
      });

      return { standardItems: standard, referenceItems: reference };
  }, [archivedCollectionIds, items]);

  const { archivedPromptCollections, archivedStandardProjects } = useMemo(() => {
      const prompt = projects.filter((project) => String(project.projectType || '').toLowerCase() === 'prompt');
      const standard = projects.filter((project) => String(project.projectType || '').toLowerCase() !== 'prompt');
      return { archivedPromptCollections: prompt, archivedStandardProjects: standard };
  }, [projects]);

  const handleBulkRestore = async (type: 'project' | 'collection' | 'item' | 'revision') => {
      setIsRestoring(true);
      try {
          if (type === 'project') {
              const ids = Array.from(selectedProjectIds);
              for (const id of ids) await api.projects.restore(id);
              setProjects(prev => prev.filter(p => !selectedProjectIds.has(p.id)));
              setSelectedProjectIds(new Set());
          } else if (type === 'collection') {
              const ids = Array.from(selectedCollectionIds);
              for (const id of ids) {
                const collection = collections.find((entry) => entry.id === id);
                if (collection) await api.collections.update(collection.projectId, id, { isArchived: false });
              }
              setCollections(prev => prev.filter(collection => !selectedCollectionIds.has(collection.id)));
              setItems(prev => prev.filter(item => !item.collectionId || !selectedCollectionIds.has(item.collectionId)));
              setSelectedCollectionIds(new Set());
          } else if (type === 'item') {
              const ids = Array.from(selectedItemIds);
              for (const id of ids) await api.items.update({ id: id, isArchived: false });
              setItems(prev => prev.filter(i => !selectedItemIds.has(i.id)));
              setSelectedItemIds(new Set());
          } else {
              const ids = Array.from(selectedRevIds);
              for (const id of ids) await api.revisions.restore(id);
              setArchivedRevisions(prev => prev.filter(r => !selectedRevIds.has(r.id)));
              setSelectedRevIds(new Set());
          }
          showToast(`Successfully restored ${type}s.`);
      } catch (e) {
          showToast("Bulk restore failed", "error");
      } finally {
          setIsRestoring(false);
      }
  };

  const initiateDelete = (ids: string[], type: 'project' | 'collection' | 'item' | 'revision' | 'chat' | 'promptDraft' | 'registryVariable') => {
      setPendingDeleteIds(ids);
      setDeleteType(type);
      setIsDeleteModalOpen(true);
  };

  const handleFinalPurge = async (deleteVerificationToken?: string) => {
      setIsProcessing(true);
      try {
          if (deleteType === 'project') {
              for (const id of pendingDeleteIds) await api.projects.delete(id, deleteVerificationToken);
              setProjects(prev => prev.filter(p => !pendingDeleteIds.includes(p.id)));
              setSelectedProjectIds(new Set());
          } else if (deleteType === 'collection') {
              for (const id of pendingDeleteIds) await api.collections.delete(id, deleteVerificationToken);
              setCollections(prev => prev.filter(collection => !pendingDeleteIds.includes(collection.id)));
              setItems(prev => prev.filter(item => !item.collectionId || !pendingDeleteIds.includes(item.collectionId)));
              setSelectedCollectionIds(new Set());
          } else if (deleteType === 'item') {
              for (const id of pendingDeleteIds) await api.items.delete(id, deleteVerificationToken);
              setItems(prev => prev.filter(i => !pendingDeleteIds.includes(i.id)));
              setSelectedItemIds(new Set());
          } else if (deleteType === 'revision') {
              for (const id of pendingDeleteIds) await api.revisions.delete(id, deleteVerificationToken);
              setArchivedRevisions(prev => prev.filter(r => !pendingDeleteIds.includes(r.id)));
              setSelectedRevIds(new Set());
          } else if (deleteType === 'promptDraft') {
              const toDelete = new Set(pendingDeleteIds);
              await replacePromptDrafts((drafts) => drafts.filter((draft) => !toDelete.has(draft.id)));
              setSelectedPromptDraftIds(new Set());
          } else if (deleteType === 'registryVariable') {
              const toDelete = new Set(pendingDeleteIds);
              await replaceArchivedRegistryEntries((entries) => entries.filter((entry) => !toDelete.has(entry.id)));
              setSelectedRegistryVariableIds(new Set());
          } else {
              for (const id of pendingDeleteIds) await api.chatItems.delete(id, deleteVerificationToken);
              setArchivedChatItems(prev => prev.filter(c => !pendingDeleteIds.includes(c.id)));
          }
          showToast("Permanent purge complete.");
          setIsDeleteModalOpen(false);
      } catch (err: any) {
          showToast(err.message || "Delete failed", "error");
      } finally {
          setIsProcessing(false);
      }
  };

  if (loading) return (
      <div className="flex flex-col h-full items-center justify-center text-slate-400 gap-4">
          <Loader2 className="animate-spin" size={48} />
          <p className="font-bold uppercase tracking-[0.4em] text-[10px]">Syncing Bin...</p>
      </div>
  );

  return (
    <div className="space-y-12 max-w-7xl mx-auto min-h-[calc(100vh-4rem)] pb-40 animate-in fade-in duration-500">
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3 uppercase">
            <Trash2 className="text-rose-500" /> Neural Recycle Bin
        </h1>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Management of decommissioned projects, assets, and historical snapshots.</p>
      </div>

      <ArchivePromptDraftGrid
        drafts={archivedPromptDrafts}
        selectedIds={selectedPromptDraftIds}
        onToggleSelection={(id) => {
            const next = new Set(selectedPromptDraftIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedPromptDraftIds(next);
        }}
        onToggleAll={() => setSelectedPromptDraftIds(
            selectedPromptDraftIds.size === archivedPromptDrafts.length
              ? new Set()
              : new Set(archivedPromptDrafts.map((draft) => draft.id))
        )}
        onRestore={handleRestorePromptDraft}
        onDelete={handleDeletePromptDraftPermanently}
      />

      <ArchiveVariableRegistryGrid
        entries={archivedRegistryVariables}
        selectedIds={selectedRegistryVariableIds}
        onToggleSelection={(id) => {
            const next = new Set(selectedRegistryVariableIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedRegistryVariableIds(next);
        }}
        onToggleAll={() => setSelectedRegistryVariableIds(
            selectedRegistryVariableIds.size === archivedRegistryVariables.length
              ? new Set()
              : new Set(archivedRegistryVariables.map((entry) => entry.id))
        )}
        onRestore={(id) => { void handleRestoreRegistryVariable(id); }}
        onDelete={handleDeleteRegistryVariablePermanently}
      />

      <ArchiveProjectGrid 
        title="Archived Prompt Collections"
        emptyText="No prompt collections in bin."
        projects={archivedPromptCollections} 
        selectedIds={selectedProjectIds} 
        onToggleSelection={(id) => {
            const next = new Set(selectedProjectIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedProjectIds(next);
        }}
        onRestore={(id) => api.projects.restore(id).then(loadData)}
        onDelete={(id) => initiateDelete([id], 'project')}
        onToggleAll={() => {
            const sectionIds = archivedPromptCollections.map((project) => project.id);
            const allSelected = sectionIds.length > 0 && sectionIds.every((id) => selectedProjectIds.has(id));
            const next = new Set(selectedProjectIds);
            if (allSelected) {
                sectionIds.forEach((id) => next.delete(id));
            } else {
                sectionIds.forEach((id) => next.add(id));
            }
            setSelectedProjectIds(next);
        }}
      />

      <ArchiveProjectGrid 
        title="Archived Projects"
        emptyText="No projects in bin."
        projects={archivedStandardProjects} 
        selectedIds={selectedProjectIds} 
        onToggleSelection={(id) => {
            const next = new Set(selectedProjectIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedProjectIds(next);
        }}
        onRestore={(id) => api.projects.restore(id).then(loadData)}
        onDelete={(id) => initiateDelete([id], 'project')}
        onToggleAll={() => {
            const sectionIds = archivedStandardProjects.map((project) => project.id);
            const allSelected = sectionIds.length > 0 && sectionIds.every((id) => selectedProjectIds.has(id));
            const next = new Set(selectedProjectIds);
            if (allSelected) {
                sectionIds.forEach((id) => next.delete(id));
            } else {
                sectionIds.forEach((id) => next.add(id));
            }
            setSelectedProjectIds(next);
        }}
      />

      <ArchiveCollectionGrid
        collections={collections}
        projectMap={projectMap}
        selectedIds={selectedCollectionIds}
        onToggleSelection={(id) => {
            const next = new Set(selectedCollectionIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedCollectionIds(next);
        }}
        onRestore={(id) => {
            const collection = collections.find((entry) => entry.id === id);
            if (!collection) return Promise.resolve();
            return api.collections.update(collection.projectId, id, { isArchived: false }).then(loadData);
        }}
        onDelete={(id) => initiateDelete([id], 'collection')}
        onToggleAll={() => setSelectedCollectionIds(selectedCollectionIds.size === collections.length ? new Set() : new Set(collections.map((collection) => collection.id)))}
      />

      <ArchiveAssetGrid 
        title="Archived Workspace Assets"
        icon={<Archive size={20} className="text-emerald-400" />}
        items={standardItems} 
        projectMap={projectMap} 
        selectedIds={selectedItemIds}
        onToggleSelection={(id) => {
            const next = new Set(selectedItemIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedItemIds(next);
        }}
        onRestore={(id) => api.items.update({ id, isArchived: false }).then(loadData)}
        onDelete={(id) => initiateDelete([id], 'item')}
        onToggleAll={() => setSelectedItemIds(selectedItemIds.size === standardItems.length ? new Set() : new Set(standardItems.map(i => i.id)))}
      />

      <ArchiveAssetGrid 
        title="Archived Reference Artifacts"
        icon={<Box size={20} className="text-indigo-400" />}
        items={referenceItems} 
        projectMap={projectMap} 
        selectedIds={selectedItemIds}
        onToggleSelection={(id) => {
            const next = new Set(selectedItemIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedItemIds(next);
        }}
        onRestore={(id) => api.items.update({ id, isArchived: false }).then(loadData)}
        onDelete={(id) => initiateDelete([id], 'item')}
        onToggleAll={() => setSelectedItemIds(selectedItemIds.size === referenceItems.length ? new Set() : new Set(referenceItems.map(i => i.id)))}
      />

      <ArchiveChatGrid
        items={archivedChatItems}
        projectMap={projectMap}
        onRestore={(id) => api.chatItems.update(id, { isArchived: false }).then(loadData)}
        onDelete={(id) => initiateDelete([id], 'chat')}
      />

      <ArchiveVersionList 
        revisions={archivedRevisions} 
        selectedIds={selectedRevIds}
        onToggleSelection={(id) => {
            const next = new Set(selectedRevIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedRevIds(next);
        }}
        onRestore={(id) => api.revisions.restore(id).then(loadData)}
        onDelete={(id) => initiateDelete([id], 'revision')}
        onToggleAll={() => setSelectedRevIds(selectedRevIds.size === archivedRevisions.length ? new Set() : new Set(archivedRevisions.map(r => r.id)))}
      />

      <ArchiveBulkBar 
        selectedCounts={{ projects: selectedProjectIds.size, collections: selectedCollectionIds.size, items: selectedItemIds.size, revisions: selectedRevIds.size, promptDrafts: selectedPromptDraftIds.size, registryVariables: selectedRegistryVariableIds.size }}
        onCancel={() => { setSelectedProjectIds(new Set()); setSelectedCollectionIds(new Set()); setSelectedItemIds(new Set()); setSelectedRevIds(new Set()); setSelectedPromptDraftIds(new Set()); setSelectedRegistryVariableIds(new Set()); }}
        onRestore={(type) => handleBulkRestore(type)}
        onDelete={() => {
            if (selectedPromptDraftIds.size > 0) {
                handleBulkDeletePromptDrafts();
                return;
            }
            if (selectedRegistryVariableIds.size > 0) {
                handleBulkDeleteRegistryVariables();
                return;
            }
            const type = selectedProjectIds.size > 0 ? 'project' : (selectedCollectionIds.size > 0 ? 'collection' : (selectedItemIds.size > 0 ? 'item' : 'revision'));
            const ids = (selectedProjectIds.size > 0 ? Array.from(selectedProjectIds) : (selectedCollectionIds.size > 0 ? Array.from(selectedCollectionIds) : (selectedItemIds.size > 0 ? Array.from(selectedItemIds) : Array.from(selectedRevIds))));
            initiateDelete(ids, type);
        }}
        onRestorePromptDrafts={handleBulkRestorePromptDrafts}
        onRestoreRegistryVariables={() => { void handleBulkRestoreRegistryVariables(); }}
        isRestoring={isRestoring}
      />

      <ArchiveDeleteSecurityModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleFinalPurge}
        isProcessing={isProcessing}
      />

      {toast && (
          <div className={`fixed bottom-12 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl text-white text-[10px] font-black uppercase tracking-[0.2em] animate-in fade-in slide-in-from-bottom-8 z-[2000] flex items-center gap-3 border border-white/5 ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
              {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              {toast.message}
          </div>
      )}
    </div>
  );
};

export default Archived;
