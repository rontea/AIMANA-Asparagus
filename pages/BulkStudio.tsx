
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Lock, AlertTriangle, X, ShieldAlert, Zap, Cpu, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../services/api';
import { LabSidebar } from '../components/project/lab/LabSidebar';
import { loadDynamicRegistry, ModelOption } from '../components/project/lab/ModelSelector/registry/index';
import { ModelSelectorModal } from '../components/project/lab/ModelSelectorModal';
import { LoraSelectorModal } from '../components/project/lab/LoraSelectorModal';
import { EmbeddingSelectorModal } from '../components/project/lab/EmbeddingSelectorModal';
import { ControlNetSelectorModal } from '../components/project/lab/ControlNetSelectorModal';
import { ItemWithCurrentRevision, Project } from '../types';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import { ArtifactInspector } from '../components/project/lab/workspace/ArtifactInspector';
import ItemDetailModal from '../components/item/ItemDetailModal';
import { extractPollenUsed, formatPollenAmount, getPrimaryModelCreditRate } from '../utils/pollenCredits';
import { type RegistryVariable, type SavedRegistryList } from '../utils/variableRegistryStorage';
import { clearPollenCreditContext, dispatchPollenCreditContext } from '../utils/pollenCreditChannel';
import { checkPromptImportJsonInput, parsePromptImportInput, resolvePromptImportVariables } from '../components/prompt-manager/utils';

// New Architecture Hooks & Components
import { BulkHeader, BulkViewMode } from '../components/bulk/BulkHeader';
import { BulkQueueSidebar } from '../components/bulk/BulkQueueSidebar';
import { BulkHistoryTray } from '../components/bulk/BulkHistoryTray';
import { BulkWorkspace } from '../components/bulk/BulkWorkspace';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { useBulkStudioContext } from '../hooks/useBulkStudioContext';

export interface BulkVariable { id: string; key: string; value: string; }
export interface BulkPreset { id: string; name: string; variables: BulkVariable[]; manifest?: string; inputMode?: 'text' | 'json'; }
export interface BulkTask { 
    id: string; 
    title?: string; 
    prompt: string; 
    modelId?: string;
    modelLabel?: string;
    status: 'pending' | 'generating' | 'success' | 'error'; 
    result?: string; 
    error?: string; 
    progress: number; 
    archivedItem?: ItemWithCurrentRevision; 
}

const BULK_MODEL_CACHE_KEY = 'aimana_bulk_last_model';
const isBulkCompatibleModel = (model?: ModelOption) => (
    !!model && (model.category === 'Visual' || model.category === 'Motion')
);

const readBulkScopedModel = (): string | null => {
    try {
        return localStorage.getItem(BULK_MODEL_CACHE_KEY);
    } catch {
        return null;
    }
};

const writeBulkScopedModel = (modelId: string) => {
    try {
        localStorage.setItem(BULK_MODEL_CACHE_KEY, modelId);
    } catch {
        // ignore storage errors in private/sandboxed contexts
    }
};

const createId = () => Math.random().toString(36).slice(2, 10);

const toBulkVariables = (variables: RegistryVariable[]): BulkVariable[] => (
    variables.map((variable) => ({
        id: variable.id || createId(),
        key: variable.key,
        value: variable.value
    }))
);

const getAdvancedParams = (raw?: string) => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return (parsed as any).advanced_params || parsed;
    } catch {
        return null;
    }
};

const isUploadedReferenceItem = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return false;
    if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
    if (rev.fileUrl?.includes('/Neural_Reference/')) return true;

    const adv = getAdvancedParams(rev.aiParameters);
    if (!adv) return false;
    const source = typeof adv.source === 'string' ? adv.source : '';
    return !!(
        adv.isReference ||
        adv.referenceAsset === true ||
        adv.reference_artifact === true ||
        adv.referenceArtifact === true ||
        source === 'reference_upload' ||
        source === 'reference_drop' ||
        source.startsWith('selector_ingest')
    );
};

const isCaptureDestinationProject = (project: Project) => (
    project.projectType !== 'prompt' && !project.isArchived
);

const BulkStudio: React.FC = () => {
    const { confirm, alert, confirmDialog, alertDialog } = useModalDialogs();
    const { labState, bulkStudio } = useBulkStudioContext();
    const { 
        variables, setVariables, tasks, setTasks, failedTasks, setFailedTasks, archivedTasks, setArchivedTasks,
        selectedTaskIds, setSelectedTaskIds, isProcessingAll, isCoolingDown, cooldownProgress, generationProgress, presets, fetchPresets,
        bulkLimit, fetchHistory, historyItems, allProjects, archiveProject,
        handleRunAll, handleStopAll, cancelTask, processTask, moveToFailureLab, bulkMoveToFailureLab, restoreToQueue, 
        bulkRestoreToQueue, moveAllFailedToLab, bulkArchiveTasks, toggleSelectAll
    } = bulkStudio;

    const [registry, setRegistry] = useState<ModelOption[]>([]);
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [isLoraSelectorOpen, setIsLoraSelectorOpen] = useState(false);
    const [isEmbeddingSelectorOpen, setIsEmbeddingSelectorOpen] = useState(false);
    const [isControlNetSelectorOpen, setIsControlNetSelectorOpen] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);

    const [viewType, setViewType] = useState<'grid' | 'list'>(() => (localStorage.getItem('aimana_bulk_view') as 'grid' | 'list') || 'grid');
    const [viewMode, setViewMode] = useState<BulkViewMode>('queue');
    const [isQueueSidebarOpen, setIsQueueSidebarOpen] = useState(false);
    const [inputMode, setInputMode] = useState<'text' | 'json'>('text');
    const [bulkInput, setBulkInput] = useState('');
    const [inspectedTask, setInspectedTask] = useState<BulkTask | null>(null);
    const [detailTask, setDetailTask] = useState<BulkTask | null>(null);
    const [detailItem, setDetailItem] = useState<ItemWithCurrentRevision | null>(null);
    const [isArchiveTrayOpen, setIsArchiveTrayOpen] = useState(false);
    
    const [showSamples, setShowSamples] = useState(false);
    const [copiedSample, setCopiedSample] = useState(false);

    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [movingItems, setMovingItems] = useState<ItemWithCurrentRevision[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [isMigrating, setIsMigrating] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [remixContextNotice, setRemixContextNotice] = useState<string | null>(null);
    const [isQueueingCollection, setIsQueueingCollection] = useState(false);
    const [registryCollections, setRegistryCollections] = useState<SavedRegistryList[]>([]);

    useEffect(() => {
        loadDynamicRegistry().then(setRegistry);
        fetchHistory();
        fetchPresets();
        api.settings.listVariableRegistryLists()
            .then((lists) => setRegistryCollections(lists as SavedRegistryList[]))
            .catch(() => setRegistryCollections([]));
        const checkKey = async () => {
            // @ts-ignore
            if (window.aistudio) { const has = await window.aistudio.hasSelectedApiKey(); setHasApiKey(has); }
        };
        checkKey();
    }, [fetchHistory, fetchPresets]);

    useEffect(() => {
        if (registry.length === 0) return;
        const selectedModel = registry.find((m) => m.id === labState.model);
        if (isBulkCompatibleModel(selectedModel)) {
            writeBulkScopedModel(String(labState.model));
            return;
        }

        const cachedModelId = readBulkScopedModel();
        const cachedModel = cachedModelId ? registry.find((m) => m.id === cachedModelId) : undefined;
        const fallback = isBulkCompatibleModel(cachedModel)
            ? cachedModel
            : registry.find((m) => isBulkCompatibleModel(m));
        if (fallback && fallback.id !== labState.model) {
            labState.setModel(fallback.id);
        }
    }, [registry, labState.model, labState.setModel]);

    useEffect(() => { if (isProcessingAll) setIsArchiveTrayOpen(true); }, [isProcessingAll]);
    useEffect(() => {
        if (!remixContextNotice) return;
        const timer = setTimeout(() => setRemixContextNotice(null), 2200);
        return () => clearTimeout(timer);
    }, [remixContextNotice]);

    const handleCopySample = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSample(true);
        setTimeout(() => setCopiedSample(false), 2000);
    };

    const handleInject = () => {
        setParseError(null);
        let newTasks: BulkTask[] = [];
        const resolvePrompt = (raw: string) => {
            return resolvePromptImportVariables(raw, variables);
        };

        try {
            if (inputMode === 'json') {
                const resolvedInput = resolvePromptImportVariables(bulkInput, variables);
                const jsonCheck = checkPromptImportJsonInput(resolvedInput);
                if (!jsonCheck.ok) throw new Error(jsonCheck.message);
                const data = parsePromptImportInput(resolvedInput);
                newTasks = data.map((item) => ({
                    id: Math.random().toString(36).substring(7),
                    title: item.title,
                    prompt: item.prompt,
                    status: 'pending',
                    progress: 0
                }));
            } else {
                const lines = bulkInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                newTasks = lines.map(p => ({ id: Math.random().toString(36).substring(7), prompt: resolvePrompt(p), status: 'pending', progress: 0 }));
            }
            if (tasks.length + newTasks.length > bulkLimit) throw new Error(`Queue capacity exceeded. Max: ${bulkLimit}.`);
            setTasks(prev => [...prev, ...newTasks]);
            setBulkInput('');
            setIsQueueSidebarOpen(false);
        } catch (e: any) { setParseError(e.message); }
    };

    const promptCollections = useMemo(
        () => allProjects.filter((project) => project.projectType === 'prompt' && !project.isArchived),
        [allProjects]
    );
    const captureProjects = useMemo(
        () => allProjects.filter(isCaptureDestinationProject),
        [allProjects]
    );

    useEffect(() => {
        if (!showProjectSelector) return;
        if (captureProjects.length === 0) return;
        if (!captureProjects.some(project => project.id === selectedProjectId)) {
            setSelectedProjectId(captureProjects[0].id);
        }
    }, [captureProjects, selectedProjectId, showProjectSelector]);

    const handleQueuePromptCollection = async (collectionId: string) => {
        if (!collectionId) return;
        setParseError(null);
        setIsQueueingCollection(true);
        try {
            const collection = promptCollections.find((entry) => entry.id === collectionId);
            const items = await api.items.list(collectionId);
            const promptItems = items.filter((item) => String(item.currentRevision?.prompt || '').trim().length > 0);
            if (promptItems.length === 0) {
                throw new Error('The selected collection has no prompts ready for bulk queueing.');
            }

            if (tasks.length + promptItems.length > bulkLimit) {
                throw new Error(`Queue capacity exceeded. Collection has ${promptItems.length} prompt(s) and max queue is ${bulkLimit}.`);
            }

            const queuedTasks: BulkTask[] = promptItems.map((item, index) => ({
                id: `bulk-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
                title: item.currentRevision?.title || undefined,
                prompt: item.currentRevision?.prompt || '',
                status: 'pending',
                progress: 0
            }));

            setTasks(prev => [...prev, ...queuedTasks]);
            window.dispatchEvent(new CustomEvent('aimana-notification', {
                detail: {
                    title: 'Bulk Synthesis',
                    message: `Queued ${queuedTasks.length} prompt${queuedTasks.length === 1 ? '' : 's'} from ${collection?.name || 'the selected collection'}.`,
                    type: 'success'
                }
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to queue the selected prompt collection.';
            setParseError(message);
            window.dispatchEvent(new CustomEvent('aimana-notification', {
                detail: {
                    title: 'Bulk Synthesis',
                    message,
                    type: 'error'
                }
            }));
        } finally {
            setIsQueueingCollection(false);
        }
    };

    const handleLoadActiveRegistry = async () => {
        const activeVariables = toBulkVariables(await api.settings.getActiveVariableRegistry());
        setVariables(activeVariables);
        window.dispatchEvent(new CustomEvent('aimana-notification', {
            detail: {
                title: 'Bulk Synthesis',
                message: activeVariables.length === 0
                    ? 'Loaded active registry. No variables were defined.'
                    : `Loaded ${activeVariables.length} active variable${activeVariables.length === 1 ? '' : 's'} from Neural Variable Registry.`,
                type: 'success'
            }
        }));
    };

    const handleLoadRegistryCollection = (collectionId: string) => {
        const selected = registryCollections.find((entry) => entry.id === collectionId);
        if (!selected) {
            setParseError('Selected registry collection was not found.');
            return;
        }

        const nextVariables = toBulkVariables(selected.variables || []);
        setVariables(nextVariables);
        window.dispatchEvent(new CustomEvent('aimana-notification', {
            detail: {
                title: 'Bulk Synthesis',
                message: nextVariables.length === 0
                    ? `Loaded "${selected.name}". The collection is empty.`
                    : `Loaded ${nextVariables.length} variable${nextVariables.length === 1 ? '' : 's'} from "${selected.name}".`,
                type: 'success'
            }
        }));
    };

    const handleConfirmMigration = async () => {
        if (movingItems.length === 0 || !selectedProjectId) return;
        setIsMigrating(true);
        try {
            const sourceProjectIds = new Set<string>();
            const movedCount = movingItems.length;
            for (const item of movingItems) {
                if (item.projectId) sourceProjectIds.add(item.projectId);
                await api.items.update({ id: item.id, projectId: selectedProjectId, collectionId: null, isArchived: false });
            }
            sourceProjectIds.forEach((projectId) => {
                window.dispatchEvent(new CustomEvent('project-items-updated', {
                    detail: { projectId, reason: 'project-move-source' }
                }));
            });
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: selectedProjectId, reason: 'project-move-target' }
            }));
            await fetchHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));
            const movedIds = new Set(movingItems.map(m => m.id));
            setTasks(prev => prev.map(t => t.archivedItem && movedIds.has(t.archivedItem.id) ? { ...t, archivedItem: { ...t.archivedItem!, projectId: selectedProjectId } } : t));
            setSuccessMsg(movedCount > 1 ? `Successfully moved ${movedCount} artifacts to project.` : 'Successfully moved artifact to project.');
            setTimeout(() => setSuccessMsg(null), 3000);
            setShowProjectSelector(false);
            setMovingItems([]);
        } catch (e) {
            await alert({
                title: 'Migration Failed',
                description: 'Migration failed.',
                tone: 'danger'
            });
        }
        finally { setIsMigrating(false); }
    };

    const handleHistoryRemix = (task: any) => {
        const newTaskId = Math.random().toString(36).substring(7);
        const newTask: BulkTask = { id: newTaskId, prompt: task.prompt, status: 'pending', progress: 0, title: task.archivedItem?.currentRevision?.title || `Remix: ${task.prompt.substring(0, 20)}...` };
        setTasks(prev => [...prev, newTask]);
        setRemixContextNotice(newTask.title || 'Remix manifest');
    };

    const handleSoftDeleteHistory = async (id: string) => {
        try {
            await api.items.update({ id, isArchived: true, isPinned: false });
            await fetchHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));
        } catch (e) {
            console.error("Failed to archive bulk history item", e);
        }
    };

    const handleClearAll = async () => {
        const ok = await confirm({
            title: 'Purge View',
            description: 'Purge entire view?',
            confirmLabel: 'Purge',
            tone: 'danger'
        });
        if (!ok) return;
        if (viewMode === 'queue') setTasks([]);
        else if (viewMode === 'failure-lab') setFailedTasks([]);
        else setArchivedTasks([]);
        setSelectedTaskIds(new Set());
    };

    const handleDeleteSelected = async () => {
        if (selectedTaskIds.size === 0) return;
        const ok = await confirm({
            title: 'Purge Selected',
            description: `Purge ${selectedTaskIds.size} selected entries?`,
            confirmLabel: 'Purge',
            tone: 'danger'
        });
        if (!ok) return;
        if (viewMode === 'queue') setTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        else if (viewMode === 'failure-lab') setFailedTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        else setArchivedTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        setSelectedTaskIds(new Set());
    };

    const handleDeletePreset = async (id: string) => {
        const ok = await confirm({
            title: 'Delete Preset',
            description: 'Delete this preset?',
            confirmLabel: 'Delete Preset',
            tone: 'danger'
        });
        if (!ok) return;
        await api.settings.deletePreset(id);
        fetchPresets();
    };

    const currentViewList = viewMode === 'queue' ? tasks : viewMode === 'failure-lab' ? failedTasks : archivedTasks;
    const allSelected = currentViewList.length > 0 && currentViewList.every(t => selectedTaskIds.has(t.id));

    const bulkHistoryItems = useMemo(() => {
        return historyItems.filter(item => {
            const rev = item.currentRevision;
            if (!rev) return false;

            if (rev.secondaryFiles && rev.secondaryFiles.length > 0) return false;
            const isReferenceUpload = isUploadedReferenceItem(item);
            if (isReferenceUpload) return true;

            try {
                if (rev.aiParameters) {
                    const parsed = JSON.parse(rev.aiParameters);
                    const adv = parsed.advanced_params || parsed;
                    const isRefTag = !!(
                        adv.isReference ||
                        adv.source === 'reference_upload' ||
                        adv.source === 'manifest_link' ||
                        (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
                    );
                    const isChild = !!adv.parentItemId;
                    if (isRefTag || isChild) return false;
                }
            } catch (e) {}

            // Bulk history should represent generated manifests (plus reference uploads).
            if (!rev.prompt || !rev.prompt.trim()) return false;

            return true;
        });
    }, [historyItems]);

    const historyTasks = useMemo(() => bulkHistoryItems.map(item => {
        const rev = item.currentRevision;
        const isReferenceUpload = isUploadedReferenceItem(item);
        const prompt = rev?.prompt?.trim()
            ? rev.prompt
            : (isReferenceUpload ? (rev?.title || 'Uploaded Reference Image') : '');

        return ({
            id: item.id,
            prompt,
            modelId: rev?.engine || '',
            modelLabel: rev?.engine || '',
            status: 'success' as const,
            progress: 100,
            result: null,
            error: null,
            timestamp: item.createdAt,
            aspectRatio: '1:1',
            archivedItem: item
        });
    }), [bulkHistoryItems]);

    const activeModel = useMemo(
        () => registry.find((entry) => entry.id === labState.model),
        [registry, labState.model]
    );
    const activeModelRate = useMemo(
        () => getPrimaryModelCreditRate(activeModel),
        [activeModel]
    );
    const latestPollenHistoryTask = useMemo(
        () => historyTasks.find((task) => (
            !!extractPollenUsed(task, task.archivedItem?.currentRevision?.aiParameters || null)
        )) || null,
        [historyTasks]
    );
    const latestPollenUsed = useMemo(
        () => latestPollenHistoryTask
            ? extractPollenUsed(latestPollenHistoryTask, latestPollenHistoryTask.archivedItem?.currentRevision?.aiParameters || null)
            : null,
        [latestPollenHistoryTask]
    );
    const latestPollenUsedLabel = latestPollenUsed ? `${formatPollenAmount(latestPollenUsed)} pollen` : null;

    useEffect(() => {
        dispatchPollenCreditContext({
            visible: true,
            mode: activeModel?.category === 'Motion' ? 'video' : 'image',
            provider: activeModel?.provider || null,
            activeModelLabel: activeModel?.label || String(labState.model),
            creditRate: activeModelRate?.displayValue || null,
            creditRateDetail: activeModelRate?.detail || null,
            lastPollenUsed: latestPollenUsedLabel,
            isGenerating: isProcessingAll
        });
    }, [
        activeModel?.category,
        activeModel?.label,
        activeModel?.provider,
        activeModelRate?.detail,
        activeModelRate?.displayValue,
        isProcessingAll,
        labState.model,
        latestPollenUsedLabel
    ]);

    useEffect(() => {
        return () => {
            clearPollenCreditContext();
        };
    }, []);

    const syncTaskWithItem = (task: BulkTask, updatedItem: ItemWithCurrentRevision): BulkTask => ({
        ...task,
        archivedItem: updatedItem,
        title: updatedItem.currentRevision?.title || task.title,
        prompt: updatedItem.currentRevision?.prompt || task.prompt,
        result: updatedItem.currentRevision?.fileUrl || updatedItem.currentRevision?.thumbnailLink || task.result
    });

    const syncCollectionsWithItem = (updatedItem: ItemWithCurrentRevision) => {
        const applySync = (task: BulkTask) => (
            task.archivedItem?.id === updatedItem.id ? syncTaskWithItem(task, updatedItem) : task
        );
        setTasks(prev => prev.map(applySync));
        setFailedTasks(prev => prev.map(applySync));
        setArchivedTasks(prev => prev.map(applySync));
    };

    const handleInspectTask = (task: BulkTask) => {
        if (task.archivedItem) {
            setDetailTask(task);
            setDetailItem(task.archivedItem);
            return;
        }
        setInspectedTask(task);
    };

    const detailProject = detailItem
        ? allProjects.find(project => project.id === detailItem.projectId) || archiveProject
        : null;

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-[#050505] -m-4 sm:-m-6 lg:-m-8 overflow-hidden relative flex-col md:flex-row">
            <div className={`relative h-full flex flex-col transition-all duration-500 ${isProcessingAll ? 'grayscale-[0.3]' : ''}`}>
                <LabSidebar 
                    {...labState} hasApiKey={hasApiKey} registry={registry} 
                    onSelectKey={() => { // @ts-ignore
                        window.aistudio?.openSelectKey().then(() => setHasApiKey(true));
                    }} 
                    isGenerating={isProcessingAll} onGenerate={handleRunAll} 
                    onOpenModelSelector={() => setIsModelSelectorOpen(true)} onOpenLoraSelector={() => setIsLoraSelectorOpen(true)} onOpenEmbeddingSelector={() => setIsEmbeddingSelectorOpen(true)} onOpenControlNetSelector={() => setIsControlNetSelectorOpen(true)} 
                    onAddTriggerWord={() => {}} onSetVae={labState.setVae}
                />
                {isProcessingAll && (
                    <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                        <div className="p-4 bg-indigo-600 rounded-3xl shadow-2xl mb-4 animate-pulse"><Zap size={32} className="text-white fill-current" /></div>
                        <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Neural Link Active</h4>
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                <BulkHeader 
                    isProcessingAll={isProcessingAll} isCoolingDown={isCoolingDown} cooldownProgress={cooldownProgress} generationProgress={generationProgress}
                    tasksCount={tasks.length} pendingCount={tasks.filter(t => t.status === 'pending').length} errorCount={tasks.filter(t => t.status === 'error').length}
                    selectedCount={selectedTaskIds.size} failedCount={failedTasks.length} archivedCount={archivedTasks.length} bulkLimit={bulkLimit} viewType={viewType} onViewChange={setViewType} 
                    viewMode={viewMode} onViewModeChange={setViewMode}
                    activeModelLabel={activeModel?.label || String(labState.model)}
                    activeModelRate={activeModelRate?.displayValue || null}
                    onClearFinished={() => {
                        if (viewMode === 'queue') setTasks(prev => prev.filter(t => t.status !== 'success'));
                        else if (viewMode === 'failure-lab') setFailedTasks([]);
                        else setArchivedTasks([]);
                    }} 
                    onClearAll={handleClearAll}
                    onDeleteSelected={handleDeleteSelected}
                    onRunAll={handleRunAll} onStopAll={handleStopAll} onRetryFailed={() => setTasks(prev => prev.map(t => t.status === 'error' ? { ...t, status: 'pending', progress: 0, error: undefined, result: undefined } : t))}
                    onMoveAllToLab={moveAllFailedToLab} 
                    onBulkMoveToLab={() => bulkMoveToFailureLab(viewMode === 'queue' ? 'queue' : 'archived')} 
                    onBulkArchive={() => bulkArchiveTasks(viewMode as any)} 
                    onBulkRestore={() => bulkRestoreToQueue(viewMode === 'failure-lab' ? 'lab' : 'archive')}
                    onToggleSelectAll={() => toggleSelectAll(viewMode)} allSelected={allSelected}
                />

                <div className={`flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar relative transition-all duration-700 ${isArchiveTrayOpen ? 'pb-[62vh]' : 'pb-[80px]'}`}>
                    <BulkWorkspace 
                        viewType={viewType} 
                        viewMode={viewMode}
                        tasks={currentViewList} 
                        selectedTaskIds={selectedTaskIds}
                        toggleTaskSelection={(id) => { const next = new Set(selectedTaskIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedTaskIds(next); }}
                        onInspect={handleInspectTask}
                        onRemix={(id) => {
                            if (viewMode === 'queue') {
                                setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'pending', progress: 0, error: undefined, result: undefined } : t));
                            } else {
                                restoreToQueue(id, viewMode === 'failure-lab' ? 'lab' : 'archive');
                            }
                        }}
                        onCapture={(item) => { setMovingItems([item]); setShowProjectSelector(true); }}
                        onRemove={(id) => {
                            if (viewMode === 'queue') setTasks(prev => prev.filter(t => t.id !== id));
                            else if (viewMode === 'failure-lab') setFailedTasks(prev => prev.filter(t => t.id !== id));
                            else setArchivedTasks(prev => prev.filter(t => t.id !== id));
                        }}
                        onUpdatePrompt={(id, updates) => {
                            if (viewMode === 'queue') setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
                            else if (viewMode === 'failure-lab') setFailedTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
                            else setArchivedTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
                        }}
                        onCancel={cancelTask} 
                        onMoveToLab={viewMode === 'queue' ? moveToFailureLab : undefined} 
                        isBatchRunning={isProcessingAll}
                    />
                </div>

                <BulkHistoryTray 
                    isOpen={isArchiveTrayOpen} onToggle={() => setIsArchiveTrayOpen(!isArchiveTrayOpen)} 
                    historyItems={bulkHistoryItems} historyTasks={historyTasks} 
                    onRemove={handleSoftDeleteHistory} 
                    onSave={(res, prompt, modelId, metadata, userTitle, archivedItem) => { if (archivedItem) { setMovingItems([archivedItem]); setShowProjectSelector(true); } }} 
                    onBulkSave={(ts) => { setMovingItems(ts.map(t => t.archivedItem).filter(Boolean) as any); setShowProjectSelector(true); }}
                    onInspectTask={(task) => handleInspectTask(task as unknown as BulkTask)} 
                    onRemixTask={handleHistoryRemix} 
                    registry={registry} 
                />
            </div>

            <button 
                onClick={() => setIsQueueSidebarOpen(!isQueueSidebarOpen)} 
                className={`fixed right-0 top-1/2 -translate-y-1/2 z-[110] bg-indigo-600 text-white p-2 rounded-l-2xl shadow-2xl transition-all border border-indigo-400/50 hover:pr-4 group ${isQueueSidebarOpen ? 'translate-x-full' : 'translate-x-0'} ${isProcessingAll ? 'opacity-40 grayscale pointer-events-none' : ''}`}
            >
                <ChevronLeft size={24} />
            </button>

            <BulkQueueSidebar 
                isOpen={isQueueSidebarOpen} onClose={() => setIsQueueSidebarOpen(false)} 
                inputMode={inputMode} setInputMode={setInputMode} bulkInput={bulkInput} setBulkInput={setBulkInput} 
                variables={variables} setVariables={setVariables} presets={presets}
                onSavePreset={async (n) => { if (!n.trim()) return; await api.settings.savePreset(n, variables, bulkInput, inputMode); fetchPresets(); }}
                onUpdatePreset={async (id, n) => { await api.settings.updatePreset(id, n, variables, bulkInput, inputMode); fetchPresets(); }}
                onDeletePreset={handleDeletePreset}
                onSyncFromQueue={() => { if (tasks.length === 0) return; if (inputMode === 'json') setBulkInput(JSON.stringify(tasks.map(t => ({ title: t.title, prompt: t.prompt })), null, 2)); else setBulkInput(tasks.map(t => t.prompt).join('\n')); }}
                parseError={parseError} onInject={handleInject} 
                showSamples={showSamples} setShowSamples={setShowSamples} 
                copyToClipboard={handleCopySample} copiedSample={copiedSample} 
                isBatchRunning={isProcessingAll}
                promptCollections={promptCollections}
                onQueueCollection={handleQueuePromptCollection}
                isQueueingCollection={isQueueingCollection}
                registryCollections={registryCollections}
                onLoadActiveRegistry={() => { void handleLoadActiveRegistry(); }}
                onLoadRegistryCollection={handleLoadRegistryCollection}
            />

            {showProjectSelector && (
                <ProjectReassignModal 
                    projects={captureProjects} selectedProjectId={captureProjects.some(project => project.id === selectedProjectId) ? selectedProjectId : ''} onSelectProject={setSelectedProjectId}
                    onConfirm={handleConfirmMigration} onCancel={() => { setShowProjectSelector(false); setMovingItems([]); }}
                    isMoving={isMigrating} title={movingItems.length > 1 ? `Capture ${movingItems.length} Artifacts` : "Capture Bulk Artifact"}
                />
            )}

            {successMsg && (
                <div className="fixed top-20 right-6 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 animate-in slide-in-from-top-4 z-[220]">
                    <CheckCircle size={18} /> {successMsg}
                </div>
            )}

            {remixContextNotice && (
                <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" onClick={() => setRemixContextNotice(null)}>
                    <div className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.8)] p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start gap-4">
                            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                                <CheckCircle size={20} />
                            </div>
                            <div className="min-w-0">
                                <h4 className="text-sm font-black text-white uppercase tracking-wider">Added to Context Area</h4>
                                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                                    <span className="font-bold text-emerald-300">{remixContextNotice}</span> was added to the context area.
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end">
                            <button onClick={() => setRemixContextNotice(null)} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-colors">
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {detailItem && detailProject && (
                <ItemDetailModal
                    isOpen={!!detailItem}
                    onClose={() => {
                        setDetailItem(null);
                        setDetailTask(null);
                    }}
                    item={detailItem}
                    project={detailProject}
                    onUpdate={(updatedItem) => {
                        setDetailItem(updatedItem);
                        setDetailTask(prev => (
                            prev?.archivedItem?.id === updatedItem.id ? syncTaskWithItem(prev, updatedItem) : prev
                        ));
                        syncCollectionsWithItem(updatedItem);
                        void fetchHistory();
                    }}
                    onOpenItem={(item) => {
                        setDetailItem(item);
                        setDetailTask(prev => prev ? syncTaskWithItem(prev, item) : prev);
                    }}
                    onDelete={(itemId) => {
                        setTasks(prev => prev.filter(task => task.archivedItem?.id !== itemId));
                        setFailedTasks(prev => prev.filter(task => task.archivedItem?.id !== itemId));
                        setArchivedTasks(prev => prev.filter(task => task.archivedItem?.id !== itemId));
                        if (detailItem.id === itemId) {
                            setDetailItem(null);
                            setDetailTask(null);
                        }
                        if (inspectedTask?.archivedItem?.id === itemId) {
                            setInspectedTask(null);
                        }
                        void fetchHistory();
                    }}
                    onMove={(item) => {
                        setMovingItems([item]);
                        setShowProjectSelector(true);
                    }}
                    onRefreshHistory={fetchHistory}
                />
            )}

            {inspectedTask && (
                <ArtifactInspector 
                    task={inspectedTask as any} onClose={() => setInspectedTask(null)} 
                    onUpdate={(id, updates) => {
                        const applyUpdate = (task: BulkTask) => {
                            if (task.id !== id) return task;
                            const nextArchivedItem = updates.archivedItem
                                ? updates.archivedItem
                                : task.archivedItem?.currentRevision
                                    ? {
                                        ...task.archivedItem,
                                        currentRevision: {
                                            ...task.archivedItem.currentRevision,
                                            title: updates.title ?? task.archivedItem.currentRevision.title,
                                            prompt: updates.prompt ?? task.archivedItem.currentRevision.prompt
                                        }
                                    }
                                    : task.archivedItem;
                            return {
                                ...task,
                                title: updates.title ?? task.title,
                                prompt: updates.prompt ?? task.prompt,
                                archivedItem: nextArchivedItem
                            };
                        };
                        setTasks(prev => prev.map(applyUpdate));
                        setFailedTasks(prev => prev.map(applyUpdate));
                        setArchivedTasks(prev => prev.map(applyUpdate));
                        setInspectedTask(prev => prev && prev.id === id ? applyUpdate(prev) : prev);
                        if (detailTask?.id === id && detailItem?.currentRevision) {
                            setDetailTask(prev => prev && prev.id === id ? applyUpdate(prev) : prev);
                            setDetailItem(prev => prev?.currentRevision
                                ? {
                                    ...prev,
                                    currentRevision: {
                                        ...prev.currentRevision,
                                        title: updates.title ?? prev.currentRevision.title,
                                        prompt: updates.prompt ?? prev.currentRevision.prompt
                                    }
                                }
                                : prev
                            );
                        }
                        void fetchHistory();
                    }}
                    onDelete={(id) => {
                        if (viewMode === 'queue') setTasks(prev => prev.filter(t => t.id !== id));
                        else if (viewMode === 'failure-lab') setFailedTasks(prev => prev.filter(t => t.id !== id));
                        else setArchivedTasks(prev => prev.filter(t => t.id !== id));
                        if (detailTask?.id === id) {
                            setDetailItem(null);
                            setDetailTask(null);
                        }
                    }}
                    onRemix={(t) => {
                        if (viewMode === 'queue') {
                            setTasks(prev => prev.map(item => item.id === t.id ? { ...item, status: 'pending', progress: 0, error: undefined, result: undefined } : item));
                        } else {
                            restoreToQueue(t.id, viewMode === 'failure-lab' ? 'lab' : 'archive');
                        }
                    }}
                    registry={registry}
                />
            )}

            <ModelSelectorModal
                isOpen={isModelSelectorOpen}
                onClose={() => setIsModelSelectorOpen(false)}
                currentModel={labState.model}
                onSelect={(id) => { labState.setModel(id); setIsModelSelectorOpen(false); }}
                forcedCategories={['Visual', 'Motion']}
            />
            <LoraSelectorModal isOpen={isLoraSelectorOpen} onClose={() => setIsLoraSelectorOpen(false)} />
            <EmbeddingSelectorModal isOpen={isEmbeddingSelectorOpen} onClose={() => setIsEmbeddingSelectorOpen(false)} />
            <ControlNetSelectorModal isOpen={isControlNetSelectorOpen} onClose={() => setIsControlNetSelectorOpen(false)} />

            {confirmDialog}
            {alertDialog}
        </div>
    );
};

export default BulkStudio;
