import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Database, Plus, RefreshCw, Save, Tag, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import {
  readArchivedRegistryVariables,
  readRegistryVariables,
  readSavedRegistryLists,
  type ArchivedRegistryVariable,
  type RegistryVariable,
  type SavedRegistryList
} from '../utils/variableRegistryStorage';

const VAULT_AUTOSAVE_DELAY_MS = 700;
const REGISTRY_AUTOSAVE_DELAY_MS = 700;

const createId = () => Math.random().toString(36).slice(2, 10);

const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
  window.dispatchEvent(new CustomEvent('aimana-notification', {
    detail: {
      title: 'Neural Variable Registry',
      message,
      type
    }
  }));
};

const cloneVariables = (variables: RegistryVariable[]) => (
  variables.map((variable) => ({
    id: createId(),
    key: variable.key,
    value: variable.value
  }))
);

const normalizeRegistryKey = (key: string) => key.trim().toLowerCase();

const getDuplicateRegistryKeys = (variables: RegistryVariable[]) => {
  const keyCounts = variables.reduce<Record<string, number>>((counts, variable) => {
    const normalizedKey = normalizeRegistryKey(variable.key);
    if (!normalizedKey) return counts;
    counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
    return counts;
  }, {});

  return new Set(
    Object.entries(keyCounts)
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  );
};

const mergeRegistryVariables = (activeVariables: RegistryVariable[], incomingVariables: RegistryVariable[]) => {
  const mergedByKey = new Map<string, RegistryVariable>();

  activeVariables.forEach((variable) => {
    const normalizedKey = normalizeRegistryKey(variable.key);
    mergedByKey.set(normalizedKey || `active:${variable.id}`, {
      id: createId(),
      key: variable.key,
      value: variable.value
    });
  });

  incomingVariables.forEach((variable) => {
    const normalizedKey = normalizeRegistryKey(variable.key);
    mergedByKey.set(normalizedKey || `incoming:${variable.id}`, {
      id: createId(),
      key: variable.key,
      value: variable.value
    });
  });

  return Array.from(mergedByKey.values());
};

const NeuralVariableRegistry: React.FC = () => {
  const { confirm, confirmDialog } = useModalDialogs();
  const [variables, setVariables] = useState<RegistryVariable[]>(() => readRegistryVariables());
  const [archivedVariables, setArchivedVariables] = useState<ArchivedRegistryVariable[]>(() => readArchivedRegistryVariables());
  const [savedLists, setSavedLists] = useState<SavedRegistryList[]>([]);
  const [listName, setListName] = useState('');
  const [copiedKeys, setCopiedKeys] = useState(false);
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [isLoadingSavedLists, setIsLoadingSavedLists] = useState(true);
  const [isSavingList, setIsSavingList] = useState(false);
  const [savingListId, setSavingListId] = useState<string | null>(null);
  const [expandedListIds, setExpandedListIds] = useState<Set<string>>(new Set());
  const [isMoveActiveModalOpen, setIsMoveActiveModalOpen] = useState(false);
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState('');
  const savedListsRef = useRef<SavedRegistryList[]>([]);
  const autosaveTimersRef = useRef<Record<string, number>>({});
  const registryLoadedRef = useRef(false);
  const archivedRegistryLoadedRef = useRef(false);
  const registryAutosaveTimerRef = useRef<number | null>(null);
  const archivedRegistryAutosaveTimerRef = useRef<number | null>(null);
  const activeKeyCount = useMemo(
    () => variables.filter((variable) => variable.key.trim()).length,
    [variables]
  );
  const hasActiveRegistryContent = useMemo(
    () => variables.some((variable) => variable.key.trim() || variable.value.trim()),
    [variables]
  );
  const activeDuplicateKeys = useMemo(() => getDuplicateRegistryKeys(variables), [variables]);
  const savedListDuplicateKeys = useMemo(() => (
    savedLists.reduce<Record<string, Set<string>>>((acc, entry) => {
      acc[entry.id] = getDuplicateRegistryKeys(entry.variables);
      return acc;
    }, {})
  ), [savedLists]);

  useEffect(() => {
    savedListsRef.current = savedLists;
    setSelectedMoveTargetId((current) => {
      if (current && savedLists.some((entry) => entry.id === current)) return current;
      return savedLists[0]?.id || '';
    });
  }, [savedLists]);

  useEffect(() => () => {
    Object.values(autosaveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    if (registryAutosaveTimerRef.current) window.clearTimeout(registryAutosaveTimerRef.current);
    if (archivedRegistryAutosaveTimerRef.current) window.clearTimeout(archivedRegistryAutosaveTimerRef.current);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadActiveRegistry = async () => {
      try {
        let remoteVariables = await api.settings.getActiveVariableRegistry();
        const localVariables = readRegistryVariables();
        if (remoteVariables.length === 0 && localVariables.length > 0) {
          await api.settings.replaceActiveVariableRegistry(localVariables);
          remoteVariables = localVariables;
          notify(`Migrated ${localVariables.length} active variable${localVariables.length === 1 ? '' : 's'} to the database.`);
        }
        if (isMounted) setVariables(remoteVariables);
      } catch {
        if (isMounted) setVariables(readRegistryVariables());
        notify('Unable to load the active registry from the database. Showing local fallback data.', 'info');
      } finally {
        registryLoadedRef.current = true;
      }
    };

    void loadActiveRegistry();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadArchivedRegistry = async () => {
      try {
        let remoteEntries = await api.settings.getArchivedVariableRegistry();
        const localEntries = readArchivedRegistryVariables();
        if (remoteEntries.length === 0 && localEntries.length > 0) {
          await api.settings.replaceArchivedVariableRegistry(localEntries);
          remoteEntries = localEntries;
        }
        if (isMounted) setArchivedVariables(remoteEntries);
      } catch {
        if (isMounted) setArchivedVariables(readArchivedRegistryVariables());
      } finally {
        archivedRegistryLoadedRef.current = true;
      }
    };

    void loadArchivedRegistry();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!registryLoadedRef.current || activeDuplicateKeys.size > 0) return;
    if (registryAutosaveTimerRef.current) window.clearTimeout(registryAutosaveTimerRef.current);
    registryAutosaveTimerRef.current = window.setTimeout(() => {
      registryAutosaveTimerRef.current = null;
      void api.settings.replaceActiveVariableRegistry(variables).catch(() => {
        notify('Unable to save the active registry to the database. Local cache was kept.', 'error');
      });
    }, REGISTRY_AUTOSAVE_DELAY_MS);
  }, [variables, activeDuplicateKeys]);

  useEffect(() => {
    if (!archivedRegistryLoadedRef.current) return;
    if (archivedRegistryAutosaveTimerRef.current) window.clearTimeout(archivedRegistryAutosaveTimerRef.current);
    archivedRegistryAutosaveTimerRef.current = window.setTimeout(() => {
      archivedRegistryAutosaveTimerRef.current = null;
      void api.settings.replaceArchivedVariableRegistry(archivedVariables).catch(() => {
        notify('Unable to save archived registry entries to the database. Local cache was kept.', 'error');
      });
    }, REGISTRY_AUTOSAVE_DELAY_MS);
  }, [archivedVariables]);

  useEffect(() => {
    let isMounted = true;

    const loadSavedLists = async () => {
      setIsLoadingSavedLists(true);
      try {
        let remoteLists = await api.settings.listVariableRegistryLists() as SavedRegistryList[];
        const localLists = readSavedRegistryLists();

        if (remoteLists.length === 0 && localLists.length > 0) {
          const migratedLists: SavedRegistryList[] = [];
          for (const entry of localLists) {
            const created = await api.settings.saveVariableRegistryList(entry.name, entry.variables);
            migratedLists.push(created as SavedRegistryList);
          }
          remoteLists = migratedLists;
          notify(`Migrated ${migratedLists.length} saved list${migratedLists.length === 1 ? '' : 's'} to the database.`);
        }

        if (isMounted) {
          setSavedLists(
            [...remoteLists].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          );
        }
      } catch {
        if (isMounted) {
          setSavedLists(readSavedRegistryLists());
        }
        notify('Unable to load saved lists from the database. Showing local fallback data.', 'info');
      } finally {
        if (isMounted) {
          setIsLoadingSavedLists(false);
        }
      }
    };

    void loadSavedLists();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddVariable = () => {
    setVariables((previous) => [
      ...previous,
      { id: createId(), key: '', value: '' }
    ]);
  };

  const handleUpdateVariable = (id: string, updates: Partial<RegistryVariable>) => {
    setVariables((previous) => previous.map((variable) => (
      variable.id === id ? { ...variable, ...updates } : variable
    )));
  };

  const handleRemoveVariable = async (id: string) => {
    const target = variables.find((variable) => variable.id === id);
    if (!target) return;

    const variableLabel = target.key.trim() || 'Untitled Variable';
    const approved = await confirm({
      title: 'Move Variable To Recycle Bin',
      description: `Move "${variableLabel}" to Neural Recycle Bin?`,
      confirmLabel: 'Move To Recycle Bin',
      cancelLabel: 'Cancel',
      tone: 'danger'
    });
    if (!approved) return;

    setVariables((previous) => {
      const target = previous.find((variable) => variable.id === id);
      if (!target) return previous;

      const archivedEntry: ArchivedRegistryVariable = {
        id: createId(),
        variable: {
          id: target.id,
          key: target.key,
          value: target.value
        },
        deletedAt: Date.now(),
        source: 'active'
      };

      setArchivedVariables((previous) => [archivedEntry, ...previous]);
      notify('Variable moved to Neural Recycle Bin.');
      return previous.filter((variable) => variable.id !== id);
    });
  };

  const handleCopyKeys = async () => {
    const payload = variables
      .filter((variable) => variable.key.trim())
      .map((variable) => `{{ ${variable.key.trim()} }}`)
      .join(' ');

    if (!payload) return;

    await navigator.clipboard.writeText(payload);
    setCopiedKeys(true);
    window.setTimeout(() => setCopiedKeys(false), 1800);
  };

  const handleSaveList = async () => {
    const trimmedName = listName.trim();
    if (!trimmedName || isSavingList) return;

    setIsSavingList(true);
    try {
      const created = await api.settings.saveVariableRegistryList(trimmedName, []) as SavedRegistryList;
      setSavedLists((previous) => [created, ...previous].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      setListName('');
      notify(`Created vault collection "${trimmedName}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save list.';
      notify(message, 'error');
    } finally {
      setIsSavingList(false);
    }
  };

  const handleApplyList = (entry: SavedRegistryList) => {
    const activeByKey = new Map(
      variables
        .filter((variable) => variable.key.trim())
        .map((variable) => [normalizeRegistryKey(variable.key), variable] as const)
    );

    const duplicateKeys = Array.from(new Set(
      entry.variables
        .map((variable) => normalizeRegistryKey(variable.key))
        .filter((key) => key && activeByKey.has(key))
    ));

    const applyMerge = () => {
      setVariables((previous) => mergeRegistryVariables(previous, entry.variables));
      notify(
        duplicateKeys.length > 0
          ? `Loaded "${entry.name}" into the active registry and merged duplicate keys.`
          : `Loaded "${entry.name}" into the active registry without removing existing variables.`
      );
    };

    if (duplicateKeys.length === 0) {
      applyMerge();
      return;
    }

    void (async () => {
      const approved = await confirm({
        title: 'Merge Duplicate Keys?',
        description: `This collection contains ${duplicateKeys.length} key(s) that already exist in the active registry: ${duplicateKeys.join(', ')}. Continue only if you want the collection values to replace those active values during merge.`,
        confirmLabel: 'Merge And Overwrite',
        cancelLabel: 'Cancel Merge',
        tone: 'primary'
      });

      if (!approved) {
        notify('Collection load canceled. Active registry was left unchanged.', 'info');
        return;
      }

      applyMerge();
    })();
  };

  const queuePersistList = (entryId: string) => {
    const existingTimer = autosaveTimersRef.current[entryId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    autosaveTimersRef.current[entryId] = window.setTimeout(() => {
      delete autosaveTimersRef.current[entryId];
      const target = savedListsRef.current.find((entry) => entry.id === entryId);
      if (!target || !target.name.trim()) return;
      void handlePersistList(entryId);
    }, VAULT_AUTOSAVE_DELAY_MS);
  };

  const handleUpdateListName = (entryId: string, name: string) => {
    setSavedLists((previous) => previous.map((entry) => (
      entry.id === entryId ? { ...entry, name } : entry
    )));
    queuePersistList(entryId);
  };

  const handleAddVariableToList = (entryId: string) => {
    setSavedLists((previous) => previous.map((entry) => (
      entry.id === entryId
        ? {
            ...entry,
            variables: [
              ...entry.variables,
              { id: createId(), key: '', value: '' }
            ]
          }
        : entry
    )));
    queuePersistList(entryId);
  };

  const handleUpdateListVariable = (entryId: string, variableId: string, updates: Partial<RegistryVariable>) => {
    setSavedLists((previous) => previous.map((entry) => (
      entry.id === entryId
        ? {
            ...entry,
            variables: entry.variables.map((variable) => (
              variable.id === variableId ? { ...variable, ...updates } : variable
            ))
          }
        : entry
    )));
    queuePersistList(entryId);
  };

  const handleRemoveListVariable = async (entryId: string, variableId: string) => {
    const entry = savedLists.find((savedList) => savedList.id === entryId);
    const targetVariable = entry?.variables.find((variable) => variable.id === variableId);
    if (!entry || !targetVariable) return;

    const variableLabel = targetVariable.key.trim() || 'Untitled Variable';
    const approved = await confirm({
      title: 'Move Variable To Recycle Bin',
      description: `Move "${variableLabel}" from "${entry.name}" to Neural Recycle Bin?`,
      confirmLabel: 'Move To Recycle Bin',
      cancelLabel: 'Cancel',
      tone: 'danger'
    });
    if (!approved) return;

    setSavedLists((previous) => previous.map((entry) => {
      if (entry.id !== entryId) return entry;
      const target = entry.variables.find((variable) => variable.id === variableId);
      if (!target) return entry;

      const archivedEntry: ArchivedRegistryVariable = {
        id: createId(),
        variable: {
          id: target.id,
          key: target.key,
          value: target.value
        },
        deletedAt: Date.now(),
        source: 'vault',
        collectionId: entry.id,
        collectionName: entry.name
      };

      setArchivedVariables((previous) => [archivedEntry, ...previous]);
      notify(`Variable moved from "${entry.name}" to Neural Recycle Bin.`);
      return { ...entry, variables: entry.variables.filter((variable) => variable.id !== variableId) };
    }));
    queuePersistList(entryId);
  };

  const handlePersistList = async (entryId: string, successMessage?: string) => {
    const target = savedListsRef.current.find((entry) => entry.id === entryId);
    if (!target) return;

    const trimmedName = target.name.trim();
    if (!trimmedName) {
      notify('Vault collection name is required before saving.', 'error');
      return;
    }

    if (getDuplicateRegistryKeys(target.variables).size > 0) {
      notify('Duplicate keys detected in this collection. Rename the red entries before saving.', 'error');
      return;
    }

    setSavingListId(entryId);
    try {
      const response = await api.settings.updateVariableRegistryList(entryId, trimmedName, target.variables);
      setSavedLists((previous) => previous
        .map((entry) => (
          entry.id === entryId
            ? { ...entry, name: trimmedName, updatedAt: response.updatedAt }
            : entry
        ))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      notify(successMessage || `Saved "${trimmedName}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save list.';
      notify(message, 'error');
    } finally {
      setSavingListId((current) => current === entryId ? null : current);
    }
  };

  const handleMoveActiveToList = async (entryId: string) => {
    const target = savedLists.find((entry) => entry.id === entryId);
    if (!target) return false;

    const activeVariables = variables.filter((variable) => variable.key.trim() || variable.value.trim());
    const movedActiveVariableIds = new Set(activeVariables.map((variable) => variable.id));
    if (activeVariables.length === 0) {
      notify('Active registry is empty. Nothing was moved into the vault collection.', 'info');
      return false;
    }

    const existingByKey = new Map(
      target.variables
        .filter((variable) => variable.key.trim())
        .map((variable) => [normalizeRegistryKey(variable.key), variable] as const)
    );

    const duplicateKeys = Array.from(new Set(
      activeVariables
        .map((variable) => normalizeRegistryKey(variable.key))
        .filter((key) => key && existingByKey.has(key))
    ));

    let shouldOverwriteDuplicates = false;
    if (duplicateKeys.length > 0) {
      shouldOverwriteDuplicates = await confirm({
        title: 'Overwrite Duplicate Keys?',
        description: `This collection already has ${duplicateKeys.length} duplicate key(s): ${duplicateKeys.join(', ')}. Continue only if you want the active registry values to overwrite those collection keys.`,
        confirmLabel: 'Overwrite And Move',
        cancelLabel: 'Cancel Move',
        tone: 'primary'
      });
      if (!shouldOverwriteDuplicates) {
        notify('Move canceled. Active registry was left unchanged.', 'info');
        return false;
      }
    }

    const mergedByKey = new Map<string, RegistryVariable>();
    target.variables.forEach((variable) => {
      const normalizedKey = normalizeRegistryKey(variable.key);
      mergedByKey.set(normalizedKey || `existing:${variable.id}`, {
        id: createId(),
        key: variable.key,
        value: variable.value
      });
    });

    activeVariables.forEach((variable) => {
      const normalizedKey = normalizeRegistryKey(variable.key);
      const fallbackKey = normalizedKey || `active:${variable.id}`;
      if (normalizedKey && existingByKey.has(normalizedKey) && !shouldOverwriteDuplicates) {
        return;
      }

      mergedByKey.set(fallbackKey, {
        id: createId(),
        key: variable.key,
        value: variable.value
      });
    });

    const nextVariables = Array.from(mergedByKey.values());
    setSavedLists((previous) => previous.map((entry) => (
      entry.id === entryId ? { ...entry, variables: nextVariables } : entry
    )));

    try {
      const response = await api.settings.updateVariableRegistryList(entryId, target.name.trim(), nextVariables);
      setSavedLists((previous) => previous
        .map((entry) => (
          entry.id === entryId
            ? { ...entry, variables: nextVariables, updatedAt: response.updatedAt }
            : entry
        ))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      setVariables((previous) => previous.filter((variable) => !movedActiveVariableIds.has(variable.id)));
      notify(
        duplicateKeys.length > 0
          ? `Moved active registry into "${target.name}" and overwrote duplicate keys.`
          : `Moved active registry into "${target.name}".`
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to move active registry into the vault collection.';
      notify(message, 'error');
      return false;
    }
  };

  const handleDeleteList = async (entryId: string) => {
    const target = savedLists.find((entry) => entry.id === entryId);
    if (!target) return;

    const approved = await confirm({
      title: 'Delete Vault Collection',
      description: `Delete "${target.name}" forever? This collection will not be moved to Neural Recycle Bin.`,
      confirmLabel: 'Delete Forever',
      cancelLabel: 'Cancel',
      tone: 'danger'
    });
    if (!approved) return;

    try {
      await api.settings.deleteVariableRegistryList(entryId);
      setSavedLists((previous) => previous.filter((entry) => entry.id !== entryId));
      notify(`Deleted "${target.name}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete list.';
      notify(message, 'error');
    }
  };

  const handleCopyListKeys = async (entry: SavedRegistryList) => {
    const payload = entry.variables
      .filter((variable) => variable.key.trim())
      .map((variable) => `{{ ${variable.key.trim()} }}`)
      .join(' ');

    if (!payload) return;

    await navigator.clipboard.writeText(payload);
    setCopiedListId(entry.id);
    window.setTimeout(() => {
      setCopiedListId((current) => current === entry.id ? null : current);
    }, 1800);
  };

  const toggleListExpanded = (entryId: string) => {
    setExpandedListIds((previous) => {
      const next = new Set(previous);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  return (
    <div className="mx-auto flex h-full max-w-[1750px] flex-col gap-6 pb-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-[#1E2335] bg-[#05060A] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
          <div className="border-b border-[#1E2335] pb-6">
            <div className="text-[#8B9AF0] text-[10px] font-black uppercase tracking-[0.22em]">Prompt Infrastructure</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Neural Variable Registry</h1>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-[#94A3B8] sm:text-[15px]">
              Manage the active variable registry used by Prompt Manager imports and maintain saved vault collections for reusable prompt manifests.
            </p>
          </div>

          <div className="mt-8 space-y-8">
            <section className="grid gap-4 md:grid-cols-3 md:gap-6">
              <div className="rounded-xl border border-[#1E2335] bg-[#0A0C14] p-5 sm:pl-7">
                <div className="text-[#8B9AF0] text-[10px] font-black uppercase tracking-[0.15em]">Active Variables</div>
                <div className="mt-4 text-4xl font-black tracking-tighter text-white">{variables.length}</div>
              </div>
              <div className="rounded-xl border border-[#1E2335] bg-[#0A0C14] p-5 sm:pl-7">
                <div className="text-[#8B9AF0] text-[10px] font-black uppercase tracking-[0.15em]">Resolved Keys</div>
                <div className="mt-4 text-4xl font-black tracking-tighter text-white">{activeKeyCount}</div>
              </div>
              <div className="rounded-xl border border-[#1E2335] bg-[#0A0C14] p-5 sm:pl-7">
                <div className="text-[#8B9AF0] text-[10px] font-black uppercase tracking-[0.15em]">Vault Collections</div>
                <div className="mt-4 text-4xl font-black tracking-tighter text-white">{savedLists.length}</div>
              </div>
            </section>

            <section className="w-full">
              <div className="flex flex-col gap-4 border-b border-[#1E2335] px-0 py-5 lg:flex-row lg:items-center lg:justify-between">
                <label className="flex items-center gap-3 text-[#8B9AF0] text-[11px] font-black uppercase tracking-[0.2em]">
                  <Tag size={14} className="-rotate-45" />
                  Active Neural Variable Registry
                </label>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={handleCopyKeys}
                    disabled={activeKeyCount === 0}
                    className={`inline-flex items-center gap-2 rounded-[6px] border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      copiedKeys
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : 'border-[#232940] bg-[#141724] text-[#8B9AF0] hover:bg-[#1A1E2E]'
                    }`}
                  >
                    {copiedKeys ? <Check size={13} /> : <Copy size={13} />}
                    {copiedKeys ? 'Copied' : 'Copy Keys'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMoveActiveModalOpen(true)}
                    disabled={savedLists.length === 0 || !hasActiveRegistryContent}
                    className="inline-flex items-center gap-2 rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RefreshCw size={13} />
                    Move To Collection
                  </button>
                  <button
                    type="button"
                    onClick={handleAddVariable}
                    className="inline-flex items-center gap-2 rounded-[6px] border border-[#29315A] bg-[#191D32] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#A5B4FC] transition-colors hover:bg-[#202540]"
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4 px-0 py-6">
                {variables.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#1E2335] px-4 py-8 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                    No variables defined
                  </div>
                ) : (
                  variables.map((variable) => {
                    const isDuplicate = activeDuplicateKeys.has(normalizeRegistryKey(variable.key));
                    return (
                      <div key={variable.id} className="space-y-2">
                        {isDuplicate && (
                          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-red-300">
                            Duplicate key
                          </p>
                        )}
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                          <div className={`flex min-w-0 items-center justify-between rounded-xl border px-4 py-3.5 transition-colors lg:w-[320px] lg:shrink-0 ${isDuplicate ? 'border-red-500/60 bg-[#13090D]' : 'border-[#1E2335] bg-[#05060A] focus-within:border-[#3D4BFF]'}`}>
                            <span className={`font-mono text-[13px] font-bold tracking-widest ${isDuplicate ? 'text-red-300/80' : 'text-[#334155]'}`}>{'{{'}</span>
                            <input
                              type="text"
                              value={variable.key}
                              onChange={(event) => handleUpdateVariable(variable.id, { key: event.target.value.toLowerCase().replace(/\s/g, '_') })}
                              placeholder="key"
                              className={`w-full bg-transparent px-3 text-[13px] font-medium outline-none placeholder:text-[#334155] ${isDuplicate ? 'text-red-100' : 'text-[#E2E8F0]'}`}
                            />
                            <span className={`font-mono text-[13px] font-bold tracking-widest ${isDuplicate ? 'text-red-300/80' : 'text-[#334155]'}`}>{'}}'}</span>
                          </div>

                          <div className={`flex-1 rounded-xl border px-5 py-3.5 transition-colors ${isDuplicate ? 'border-red-500/60 bg-[#13090D]' : 'border-[#1E2335] bg-[#05060A] focus-within:border-[#3D4BFF]'}`}>
                            <input
                              type="text"
                              value={variable.value}
                              onChange={(event) => handleUpdateVariable(variable.id, { value: event.target.value })}
                              placeholder="replacement value..."
                              className={`w-full bg-transparent text-[13px] font-medium outline-none placeholder:text-[#334155] ${isDuplicate ? 'text-red-100' : 'text-[#E2E8F0]'}`}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleRemoveVariable(variable.id)}
                            className="shrink-0 rounded-lg p-3 text-[#475569] transition-colors hover:bg-[#1A1016] hover:text-[#FF8596]"
                            title="Remove variable"
                          >
                            <Trash2 size={18} className="opacity-80" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                <p className="pt-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                  Active changes are saved automatically and available inside import prompt drafts.
                </p>
                {activeDuplicateKeys.size > 0 && (
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">
                    Duplicate active keys must be fixed before registry changes can be saved.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#1E2335] bg-[#0A0C14] p-5 sm:p-6">
              <div className="mb-6 flex items-center gap-3">
                <Database size={14} className="text-emerald-400" />
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">Neural Variable Vault</h2>
              </div>

              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="flex-1 rounded-xl border border-[#1E2335] bg-[#05060A] px-5 py-4 transition-colors focus-within:border-[#3D4BFF]">
                  <input
                    type="text"
                    value={listName}
                    onChange={(event) => setListName(event.target.value)}
                    placeholder="List name"
                    className="w-full bg-transparent text-[13px] font-medium text-[#E2E8F0] outline-none placeholder:text-[#334155]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveList()}
                  disabled={!listName.trim() || isSavingList}
                  className="inline-flex h-[54px] shrink-0 items-center justify-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-6 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save size={14} />
                  {isSavingList ? 'Creating...' : 'Create Collection'}
                </button>
              </div>

              <p className="mb-8 text-[11.5px] font-medium leading-relaxed text-[#64748B]">
                Vault collections are editable variable groups. Create an empty collection here, add variables directly inside it, or move the current active registry into a collection when you want to preserve that working set.
              </p>

              <div className="space-y-3">
                {isLoadingSavedLists ? (
                  <div className="rounded-xl border border-dashed border-[#1E2335] px-4 py-8 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                    Loading saved lists...
                  </div>
                ) : savedLists.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#1E2335] px-4 py-8 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                    No vault collections yet
                  </div>
                ) : (
                  savedLists.map((entry) => {
                    const isExpanded = expandedListIds.has(entry.id);
                    const duplicateKeys = savedListDuplicateKeys[entry.id];
                    const hasDuplicates = Boolean(duplicateKeys?.size);

                    return (
                      <div key={entry.id} className={`rounded-xl border p-5 transition-colors ${hasDuplicates ? 'border-red-500/40 bg-[#120B10]' : 'border-[#1E2335] bg-[#05060A]'}`}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={entry.name}
                              onChange={(event) => handleUpdateListName(entry.id, event.target.value)}
                              className="w-full bg-transparent text-[15px] font-bold tracking-tight text-white outline-none placeholder:text-[#334155]"
                              placeholder="Collection name"
                            />
                            <p className="mt-2 text-[9.5px] font-black uppercase tracking-[0.15em] text-[#64748B]">
                              {entry.variables.length} variables / Updated {new Date(entry.updatedAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <button
                              type="button"
                              onClick={() => toggleListExpanded(entry.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#1E2335] text-slate-400 transition-colors hover:bg-[#1E2335] hover:text-white"
                              title={isExpanded ? 'Collapse collection' : 'Expand collection'}
                            >
                              <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopyListKeys(entry)}
                              className={`flex h-9 w-9 items-center justify-center rounded-[6px] border transition-colors ${
                                copiedListId === entry.id
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : 'border-[#1E2335] text-slate-400 hover:bg-[#1E2335] hover:text-white'
                              }`}
                              title={copiedListId === entry.id ? 'Keys copied' : 'Copy keys'}
                            >
                              {copiedListId === entry.id ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyList(entry)}
                              className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-indigo-500/30 text-[#8B9AF0] transition-colors hover:bg-indigo-500/10"
                              title="Load collection into active registry"
                            >
                              <RefreshCw size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePersistList(entry.id)}
                              disabled={hasDuplicates}
                              className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-emerald-500/30 text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
                              title="Save collection"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteList(entry.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-rose-500/30 text-rose-400 transition-colors hover:bg-rose-500/10"
                              title="Delete list"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className={`grid transition-all duration-300 ease-out ${isExpanded ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'}`}>
                          <div className="overflow-hidden">
                            <div className="space-y-4 border-t border-[#1E2335] pt-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleAddVariableToList(entry.id)}
                                  className="inline-flex items-center gap-2 rounded-[6px] border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/15"
                                >
                                  <Plus size={12} />
                                  Add Variable
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleMoveActiveToList(entry.id)}
                                  className="inline-flex items-center gap-2 rounded-[6px] border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#8B9AF0] transition-colors hover:bg-indigo-500/15"
                                >
                                  <RefreshCw size={12} />
                                  Move Active Here
                                </button>
                                {savingListId === entry.id && (
                                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">
                                    Saving...
                                  </span>
                                )}
                              </div>

                              {hasDuplicates && (
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">
                                  Duplicate collection keys must be fixed before this collection can be saved.
                                </p>
                              )}

                              {entry.variables.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-[#1E2335] px-4 py-6 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                                  No variables in this collection
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {entry.variables.map((variable) => {
                                    const isDuplicate = duplicateKeys?.has(normalizeRegistryKey(variable.key));
                                    return (
                                      <div key={variable.id} className="space-y-2">
                                        {isDuplicate && (
                                          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-red-300">
                                            Duplicate key
                                          </p>
                                        )}
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                                          <div className={`flex min-w-0 items-center justify-between rounded-xl border px-4 py-3.5 transition-colors lg:w-[320px] lg:shrink-0 ${isDuplicate ? 'border-red-500/60 bg-[#13090D]' : 'border-[#1E2335] bg-[#05060A] focus-within:border-[#3D4BFF]'}`}>
                                            <span className={`font-mono text-[13px] font-bold tracking-widest ${isDuplicate ? 'text-red-300/80' : 'text-[#334155]'}`}>{'{{'}</span>
                                            <input
                                              type="text"
                                              value={variable.key}
                                              onChange={(event) => handleUpdateListVariable(entry.id, variable.id, { key: event.target.value.toLowerCase().replace(/\s/g, '_') })}
                                              placeholder="key"
                                              className={`w-full bg-transparent px-3 text-[13px] font-medium outline-none placeholder:text-[#334155] ${isDuplicate ? 'text-red-100' : 'text-[#E2E8F0]'}`}
                                            />
                                            <span className={`font-mono text-[13px] font-bold tracking-widest ${isDuplicate ? 'text-red-300/80' : 'text-[#334155]'}`}>{'}}'}</span>
                                          </div>

                                          <div className={`flex-1 rounded-xl border px-5 py-3.5 transition-colors ${isDuplicate ? 'border-red-500/60 bg-[#13090D]' : 'border-[#1E2335] bg-[#05060A] focus-within:border-[#3D4BFF]'}`}>
                                            <input
                                              type="text"
                                              value={variable.value}
                                              onChange={(event) => handleUpdateListVariable(entry.id, variable.id, { value: event.target.value })}
                                              placeholder="replacement value..."
                                              className={`w-full bg-transparent text-[13px] font-medium outline-none placeholder:text-[#334155] ${isDuplicate ? 'text-red-100' : 'text-[#E2E8F0]'}`}
                                            />
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => void handleRemoveListVariable(entry.id, variable.id)}
                                            className="shrink-0 rounded-lg p-3 text-[#475569] transition-colors hover:bg-[#1A1016] hover:text-[#FF8596]"
                                            title="Remove variable"
                                          >
                                            <Trash2 size={18} className="opacity-80" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
      {isMoveActiveModalOpen && (
        <ProjectReassignModal
          projects={savedLists.map((entry, index) => ({
            id: entry.id,
            name: entry.name,
            color: ['#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#f87171', '#22d3ee'][index % 6]
          })) as any}
          selectedProjectId={selectedMoveTargetId}
          onSelectProject={setSelectedMoveTargetId}
          onConfirm={() => {
            void (async () => {
              const moved = await handleMoveActiveToList(selectedMoveTargetId);
              if (moved) setIsMoveActiveModalOpen(false);
            })();
          }}
          onCancel={() => setIsMoveActiveModalOpen(false)}
          isMoving={false}
          title="Move Active To Collection"
          description="Select a vault collection to receive the current active registry variables."
          emptyTitle="No vault collections detected."
          emptyDescription="Create a collection first."
          confirmLabel="Move To Collection"
        />
      )}
      {confirmDialog}
    </div>
  );
};

export default NeuralVariableRegistry;
