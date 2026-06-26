
import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { generateMediaWithPollinations, getResolvedDimensions } from '../services/pollinationsService';
import { RATIO_CONFIG } from '../components/project/lab/LabSidebar';
import { ItemWithCurrentRevision, Project } from '../types';
import { BulkVariable, BulkTask, BulkPreset } from '../pages/BulkStudio';
import { loadDynamicRegistry } from '../components/project/lab/ModelSelector/registry/index';
import { consumePollenCredit } from '../utils/pollenCreditBalance';
import { resolvePollenCharge } from '../utils/pollenCredits';
import { readRegistryVariables } from '../utils/variableRegistryStorage';
import { normalizeUserFacingError } from '../utils/userFacingErrors';

const dispatchBulkNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('aimana-notification', {
        detail: {
            type,
            title: 'Bulk Studio',
            message,
            source: 'bulk-synthesis'
        }
    }));
};

const MAX_CONSECUTIVE_BULK_FAILURES = 2;

const resolveBulkReferenceImage = async (labState: any): Promise<string | null> => {
    const directImage = typeof labState?.inputImage === 'string' ? labState.inputImage.trim() : '';
    if (directImage) return directImage;

    const dynamicImage = typeof labState?.dynamicParams?.image === 'string'
        ? labState.dynamicParams.image.trim()
        : '';
    if (dynamicImage) return dynamicImage;

    const referenceItemId = typeof labState?.referenceItemId === 'string'
        ? labState.referenceItemId.trim()
        : '';
    if (!referenceItemId) return null;

    try {
        const item = await api.items.get(referenceItemId);
        const fileUrl = String(item?.currentRevision?.fileUrl || item?.currentRevision?.thumbnailLink || '').trim();
        return fileUrl || null;
    } catch {
        return null;
    }
};

export const useBulkStudio = (labState: any) => {
    const isMounted = useRef(true);
    const loopActiveRef = useRef(false); 
    const stopRequested = useRef(false);
    const abortControllers = useRef<Map<string, AbortController>>(new Map());
    const bulkStateLoadedRef = useRef(false);
    const bulkStateSaveTimerRef = useRef<number | null>(null);
    const tasksRef = useRef<BulkTask[]>([]);
    const failedTasksRef = useRef<BulkTask[]>([]);
    const archivedTasksRef = useRef<BulkTask[]>([]);
    const variablesRef = useRef<BulkVariable[]>([]);
    const isProcessingAllRef = useRef(false);
    const batchModelIdRef = useRef<string | null>(null);
    
    // 1. Persistent Task States
    const [variables, setVariables] = useState<BulkVariable[]>(() => {
        const activeRegistry = readRegistryVariables();
        if (activeRegistry.length > 0) {
            return activeRegistry.map((variable) => ({
                id: variable.id,
                key: variable.key,
                value: variable.value
            }));
        }
        const saved = localStorage.getItem('aimana_bulk_variables');
        return saved ? JSON.parse(saved) : [{ id: 'v1', key: 'name', value: '' }];
    });
    
    const [tasks, setTasks] = useState<BulkTask[]>(() => {
        const saved = localStorage.getItem('aimana_bulk_tasks');
        const parsed = saved ? JSON.parse(saved) : [];
        return parsed.map((t: BulkTask) => 
            t.status === 'generating' ? { ...t, status: 'pending' as const, progress: 0 } : t
        );
    });

    const [failedTasks, setFailedTasks] = useState<BulkTask[]>(() => {
        const saved = localStorage.getItem('aimana_bulk_failed_tasks');
        return saved ? JSON.parse(saved) : [];
    });

    const [archivedTasks, setArchivedTasks] = useState<BulkTask[]>(() => {
        const saved = localStorage.getItem('aimana_bulk_archived_tasks');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

    // 2. Control States
    const [isProcessingAll, setIsProcessingAll] = useState(() => {
        return localStorage.getItem('aimana_bulk_is_active') === 'true';
    });
    const [isCoolingDown, setIsCoolingDown] = useState(false);
    const [cooldownProgress, setCooldownProgress] = useState(0);
    const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
    const [batchModelId, setBatchModelId] = useState<string | null>(() => {
        return localStorage.getItem('aimana_bulk_batch_model');
    });

    const [presets, setPresets] = useState<BulkPreset[]>([]);
    const [bulkLimit, setBulkLimit] = useState(8);
    const [archiveProject, setArchiveProject] = useState<Project | null>(null);
    const [historyItems, setHistoryItems] = useState<ItemWithCurrentRevision[]>([]);
    const [allProjects, setAllProjects] = useState<Project[]>([]);

    const mergeProjectListEntry = useCallback((project: Project) => {
        setAllProjects(prev => {
            if (project.isArchived) {
                return prev.filter(entry => entry.id !== project.id);
            }
            const exists = prev.some(entry => entry.id === project.id);
            if (exists) {
                return prev.map(entry => entry.id === project.id ? { ...entry, ...project } : entry);
            }
            return [project, ...prev];
        });
    }, []);

    const refreshProjects = useCallback(async () => {
        const projectsList = await api.projects.list();
        if (isMounted.current) setAllProjects(projectsList);
        return projectsList;
    }, []);

    useEffect(() => {
        isMounted.current = true;
        stopRequested.current = false;
        return () => { 
            isMounted.current = false;
            stopRequested.current = true;
            abortControllers.current.forEach(c => c.abort());
            abortControllers.current.clear();
            loopActiveRef.current = false;
            if (bulkStateSaveTimerRef.current) {
                window.clearTimeout(bulkStateSaveTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('aimana_bulk_is_active', String(isProcessingAll));
        window.dispatchEvent(new CustomEvent('aimana-bulk-status-changed', { detail: { active: isProcessingAll } }));
    }, [isProcessingAll]);

    useEffect(() => {
        if (batchModelId) localStorage.setItem('aimana_bulk_batch_model', batchModelId);
        else localStorage.removeItem('aimana_bulk_batch_model');
    }, [batchModelId]);

    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { failedTasksRef.current = failedTasks; }, [failedTasks]);
    useEffect(() => { archivedTasksRef.current = archivedTasks; }, [archivedTasks]);
    useEffect(() => { variablesRef.current = variables; }, [variables]);
    useEffect(() => { isProcessingAllRef.current = isProcessingAll; }, [isProcessingAll]);
    useEffect(() => { batchModelIdRef.current = batchModelId; }, [batchModelId]);

    const loadBulkStudioState = useCallback(async () => {
        try {
            let remote = await api.settings.getBulkStudioState();
            const localTasks = JSON.parse(localStorage.getItem('aimana_bulk_tasks') || '[]');
            const localFailedTasks = JSON.parse(localStorage.getItem('aimana_bulk_failed_tasks') || '[]');
            const localArchivedTasks = JSON.parse(localStorage.getItem('aimana_bulk_archived_tasks') || '[]');
            const localVariables = JSON.parse(localStorage.getItem('aimana_bulk_variables') || 'null');
            const shouldMigrate = (
                (!Array.isArray(remote.tasks) || remote.tasks.length === 0) && Array.isArray(localTasks) && localTasks.length > 0
            ) || (
                (!Array.isArray(remote.failedTasks) || remote.failedTasks.length === 0) && Array.isArray(localFailedTasks) && localFailedTasks.length > 0
            ) || (
                (!Array.isArray(remote.archivedTasks) || remote.archivedTasks.length === 0) && Array.isArray(localArchivedTasks) && localArchivedTasks.length > 0
            );

            if (shouldMigrate || ((!Array.isArray(remote.variables) || remote.variables.length === 0) && Array.isArray(localVariables) && localVariables.length > 0)) {
                const migratedState = {
                    variables: Array.isArray(localVariables) && localVariables.length > 0 ? localVariables : remote.variables || [],
                    tasks: Array.isArray(localTasks) ? localTasks : [],
                    failedTasks: Array.isArray(localFailedTasks) ? localFailedTasks : [],
                    archivedTasks: Array.isArray(localArchivedTasks) ? localArchivedTasks : [],
                    isActive: localStorage.getItem('aimana_bulk_is_active') === 'true',
                    batchModelId: localStorage.getItem('aimana_bulk_batch_model')
                };
                await api.settings.replaceBulkStudioState(migratedState);
                remote = { ...migratedState, updatedAt: Date.now() };
            }

            const normalizedTasks = Array.isArray(remote.tasks) ? remote.tasks.map((t: BulkTask) =>
                t.status === 'generating' ? { ...t, status: 'pending' as const, progress: 0 } : t
            ) : [];
            if (!isMounted.current) return;
            setVariables(Array.isArray(remote.variables) && remote.variables.length > 0 ? remote.variables : variablesRef.current);
            setTasks(normalizedTasks);
            setFailedTasks(Array.isArray(remote.failedTasks) ? remote.failedTasks : []);
            setArchivedTasks(Array.isArray(remote.archivedTasks) ? remote.archivedTasks : []);
            setIsProcessingAll(Boolean(remote.isActive));
            setBatchModelId(remote.batchModelId || null);
        } catch {
            // fall back to local state already initialized above
        } finally {
            bulkStateLoadedRef.current = true;
        }
    }, []);

    useEffect(() => {
        void loadBulkStudioState();
    }, [loadBulkStudioState]);

    useEffect(() => {
        if (!bulkStateLoadedRef.current) return;
        if (bulkStateSaveTimerRef.current) {
            window.clearTimeout(bulkStateSaveTimerRef.current);
        }
        bulkStateSaveTimerRef.current = window.setTimeout(() => {
            bulkStateSaveTimerRef.current = null;
            void api.settings.replaceBulkStudioState({
                variables,
                tasks,
                failedTasks,
                archivedTasks,
                isActive: isProcessingAll,
                batchModelId
            }).catch(() => {
                // local cache remains as fallback
            });
        }, 700);
    }, [variables, tasks, failedTasks, archivedTasks, isProcessingAll, batchModelId]);

    useEffect(() => {
        const syncBulkStudioState = () => {
            void loadBulkStudioState();
        };
        window.addEventListener('aimana-bulk-tasks-updated', syncBulkStudioState);
        return () => window.removeEventListener('aimana-bulk-tasks-updated', syncBulkStudioState);
    }, [loadBulkStudioState]);

    // 4. Selection Logic
    const toggleSelectAll = useCallback((viewMode: 'queue' | 'failure-lab' | 'archived') => {
        const currentList = viewMode === 'queue' ? tasks : viewMode === 'failure-lab' ? failedTasks : archivedTasks;
        const allSelected = currentList.length > 0 && currentList.every(t => selectedTaskIds.has(t.id));
        
        if (allSelected) {
            const next = new Set(selectedTaskIds);
            currentList.forEach(t => next.delete(t.id));
            setSelectedTaskIds(next);
        } else {
            const next = new Set(selectedTaskIds);
            currentList.forEach(t => next.add(t.id));
            setSelectedTaskIds(next);
        }
    }, [tasks, failedTasks, archivedTasks, selectedTaskIds]);

    // 5. Task Orchestration
    const moveToFailureLab = useCallback((taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            const updatedTask: BulkTask = { 
                ...task, 
                // @ts-ignore - adding temporary field for UI feedback
                isManualTriage: true 
            };
            setFailedTasks(prev => [updatedTask, ...prev]);
            setTasks(prev => prev.filter(t => t.id !== taskId));
            setSelectedTaskIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
        }
    }, [tasks]);

    const moveAllFailedToLab = useCallback(() => {
        const errored = tasks.filter(t => t.status === 'error');
        if (errored.length === 0) return;
        setFailedTasks(prev => [...errored, ...prev]);
        setTasks(prev => prev.filter(t => t.status !== 'error'));
        setSelectedTaskIds(new Set());
    }, [tasks]);

    const bulkMoveToFailureLab = useCallback((source: 'queue' | 'archived') => {
        if (selectedTaskIds.size === 0) return;
        const list = source === 'queue' ? tasks : archivedTasks;
        const itemsToMove = list.filter(t => selectedTaskIds.has(t.id)).map(t => ({
            ...t,
            // @ts-ignore - adding temporary field for UI feedback
            isManualTriage: source === 'queue'
        }));
        
        setFailedTasks(prev => [...itemsToMove, ...prev]);
        if (source === 'queue') {
            setTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        } else {
            setArchivedTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        }
        setSelectedTaskIds(new Set());
    }, [tasks, archivedTasks, selectedTaskIds]);

    const bulkArchiveTasks = useCallback((source: 'queue' | 'failure-lab') => {
        if (selectedTaskIds.size === 0) return;
        const sourceList = source === 'queue' ? tasks : failedTasks;
        const itemsToArchive = sourceList.filter(t => selectedTaskIds.has(t.id));
        
        setArchivedTasks(prev => [...itemsToArchive, ...prev]);
        if (source === 'queue') {
            setTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        } else {
            setFailedTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        }
        setSelectedTaskIds(new Set());
    }, [tasks, failedTasks, selectedTaskIds]);

    const restoreToQueue = useCallback((taskId: string, source: 'lab' | 'archive') => {
        const list = source === 'lab' ? failedTasks : archivedTasks;
        const task = list.find(t => t.id === taskId);
        if (task) {
            const restored: BulkTask = { ...task, status: 'pending', progress: 0, error: undefined };
            setTasks(prev => [...prev, restored]);
            if (source === 'lab') setFailedTasks(prev => prev.filter(t => t.id !== taskId));
            else setArchivedTasks(prev => prev.filter(t => t.id !== taskId));
            setSelectedTaskIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
        }
    }, [failedTasks, archivedTasks]);

    const bulkRestoreToQueue = useCallback((source: 'lab' | 'archive') => {
        if (selectedTaskIds.size === 0) return;
        const list = source === 'lab' ? failedTasks : archivedTasks;
        const itemsToRestore = list.filter(t => selectedTaskIds.has(t.id)).map(t => ({
            ...t, status: 'pending' as const, progress: 0, error: undefined
        }));
        
        setTasks(prev => [...prev, ...itemsToRestore]);
        if (source === 'lab') setFailedTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        else setArchivedTasks(prev => prev.filter(t => !selectedTaskIds.has(t.id)));
        setSelectedTaskIds(new Set());
    }, [failedTasks, archivedTasks, selectedTaskIds]);

    // 6. External Data Sync
    useEffect(() => {
        const initializeConfig = async () => {
            try {
                const settings = await api.settings.get();
                if (isMounted.current && settings.bulkLimit) setBulkLimit(settings.bulkLimit);
                await refreshProjects();
            } catch (e) { console.warn("[BULK_INIT_ERR] Failed to load configuration."); }
        };
        initializeConfig();
    }, [refreshProjects]);

    useEffect(() => {
        const handleProjectsUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ project?: Project }>).detail || {};
            if (detail.project) mergeProjectListEntry(detail.project);
            void refreshProjects().catch(() => {
                // The event payload keeps the modal responsive even if the background refresh fails.
            });
        };

        window.addEventListener('aimana-projects-updated', handleProjectsUpdated);
        return () => window.removeEventListener('aimana-projects-updated', handleProjectsUpdated);
    }, [mergeProjectListEntry, refreshProjects]);

    const fetchHistory = useCallback(async () => {
        try {
            const archive = await fetch('/api/projects/archive', { 
                headers: api.auth.getAuthHeaders()
            }).then(r => r.json());
            if (archive?.id) {
                if (isMounted.current) setArchiveProject(archive);
                const items = await api.items.list(archive.id);
                if (isMounted.current) setHistoryItems(items.sort((a, b) => b.createdAt - a.createdAt));
            }
        } catch (e) { console.warn("History sync failed."); }
    }, []);

    const fetchPresets = useCallback(async () => {
        try {
            const list = await api.settings.listPresets();
            if (isMounted.current) setPresets(list);
        } catch (e) { console.warn("Failed to load presets."); }
    }, []);

    const processTask = async (taskId: string, modelIdToUse: string): Promise<'success' | 'failed' | 'stopped' | 'skipped'> => {
        const currentTasks = tasksRef.current;
        const taskSnapshot = currentTasks.find((t: BulkTask) => t.id === taskId);
        
        if (!taskSnapshot || taskSnapshot.status === 'success' || taskSnapshot.status === 'generating') return 'skipped';
        if (stopRequested.current) return 'stopped';

        const markGenerating = (prev: BulkTask[]): BulkTask[] => prev.map(t => t.id === taskId ? { ...t, status: 'generating' as const, progress: 10 } : t);
        if (isMounted.current) setTasks(markGenerating);
        
        const controller = new AbortController();
        abortControllers.current.set(taskId, controller);

        try {
            const registry = await loadDynamicRegistry();
            const modelData = registry.find((m) => m.id === modelIdToUse);
            const apiRatio = RATIO_CONFIG[labState.selectedRatio].apiValue;
            const { width, height } = getResolvedDimensions(apiRatio, labState.customWidth, labState.customHeight);
            const resolvedReferenceImage = await resolveBulkReferenceImage(labState);
            const dynamicQuality = labState?.dynamicParams?.quality;
            const resolvedQuality = dynamicQuality === undefined || dynamicQuality === null || dynamicQuality === ''
                ? undefined
                : String(dynamicQuality);
            const dynamicTransparent = labState?.dynamicParams?.transparent;
            const resolvedTransparent = typeof dynamicTransparent === 'boolean' ? dynamicTransparent : undefined;
            const dynamicGuidance = labState?.dynamicParams?.guidance_scale;
            const resolvedGuidance = typeof dynamicGuidance === 'number'
                ? dynamicGuidance
                : Number.isFinite(Number(dynamicGuidance))
                    ? Number(dynamicGuidance)
                    : undefined;
            
            const res = await generateMediaWithPollinations(
                taskSnapshot.prompt, labState.selectedRatio as any, modelIdToUse, 
                width, height, labState.seed ? parseInt(labState.seed) : undefined, 
                labState.negativePrompt, 
                {
                    enhance: labState.enhance, nologo: labState.nologo, 
                    safe: labState.safe, private: labState.isPrivate, 
                    duration: labState.duration, audio: labState.audio, 
                    image: resolvedReferenceImage, nofeed: labState.nofeed,
                    quality: resolvedQuality,
                    transparent: resolvedTransparent,
                    guidance_scale: resolvedGuidance,
                    signal: controller.signal
                }
            );

            if (stopRequested.current) return 'stopped';
            const resolvedCharge = resolvePollenCharge({
                model: modelData,
                pollenUsed: res?.pollenUsed,
                promptText: taskSnapshot.prompt,
                durationSeconds: labState.duration
            });
            if (!res?.pollenUsed && resolvedCharge.amount !== null) {
                res.pollenUsed = String(resolvedCharge.amount);
            }
            if (res?.pollenUsed) {
                consumePollenCredit(
                    res.pollenUsed,
                    resolvedCharge.isEstimated ? 'Bulk Studio (estimated)' : 'Bulk Studio'
                );
            }
            await persistToArchive(res, taskSnapshot.prompt, taskSnapshot.title, modelIdToUse);
            
            const finalizedTasks = tasksRef.current.filter((t: BulkTask) => t.id !== taskId);
            
            if (isMounted.current) {
                setTasks(finalizedTasks);
                setSelectedTaskIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
                await fetchHistory();
            }
            return 'success';
        } catch (e: any) {
            if (stopRequested.current) return 'stopped';
            const isAbort = e.name === 'AbortError';
            const registry = await loadDynamicRegistry();
            const modelData = registry.find(m => m.id === modelIdToUse);
            const label = modelData?.label || modelIdToUse;
            const errorMessage = normalizeUserFacingError(e?.message || 'Bulk synthesis failed.');

            const failTasks = (prev: BulkTask[]): BulkTask[] => prev.map(t => t.id === taskId ? { 
                ...t, status: (isAbort ? 'pending' : 'error') as "pending" | "error", 
                error: isAbort ? undefined : errorMessage, progress: 0,
                modelId: modelIdToUse, modelLabel: label
            } : t);
            if (isMounted.current) setTasks(failTasks);
            if (!isAbort) {
                const promptSnippet = taskSnapshot?.prompt ? `Prompt: ${taskSnapshot.prompt}` : '';
                const detailMessage = promptSnippet ? `${errorMessage}\n${promptSnippet}` : errorMessage;
                dispatchBulkNotification(detailMessage, 'error');
            }
            return isAbort ? 'stopped' : 'failed';
        } finally { abortControllers.current.delete(taskId); }
    };

    const persistToArchive = async (res: any, prompt: string, title?: string, modelId?: string) => {
        let activeArchive = archiveProject;
        if (!activeArchive?.id) {
             const resp = await fetch('/api/projects/archive', { headers: api.auth.getAuthHeaders() }).then(r => r.json());
             activeArchive = resp;
        }
        if (!activeArchive?.id) return null;
        try {
            const byteCharacters = atob(res.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], {type: res.mimeType});
            const ext = res.mimeType.startsWith('video/') ? 'mp4' : 'png';
            const file = new File([blob], `bulk_${Date.now()}.${ext}`, {type: res.mimeType});
            const itemWithRev = await api.items.create(activeArchive.id, file, () => {});
            if (itemWithRev.currentRevision) {
                const metadata = { 
                    bulk: true, 
                    engine_id: modelId || labState.model, 
                    timestamp: Date.now(), 
                    prompt, 
                    advanced_params: { 
                        seed: res.seedUsed, 
                        negativePrompt: labState.negativePrompt, 
                        ratio: labState.selectedRatio, 
                        enhance: labState.enhance, 
                        nologo: labState.nologo, 
                        pollenUsed: res.pollenUsed,
                        referenceItemId: res.referenceItemId || labState.referenceItemId || null,
                        referenceHash: res.referenceHash || null
                    } 
                };
                await api.revisions.update({ ...itemWithRev.currentRevision, prompt, engine: modelId || labState.model, title: title || `Bulk: ${prompt.substring(0, 30)}...`, aiParameters: JSON.stringify(metadata, null, 2) });
            }
            return itemWithRev;
        } catch (e) { return null; }
    };

    const handleRunAll = async () => {
        if (loopActiveRef.current) return;
        const currentTasks = tasksRef.current;
        const pending = currentTasks.filter((t: BulkTask) => t.status === 'pending');
        if (pending.length === 0) { setIsProcessingAll(false); setBatchModelId(null); return; }

        loopActiveRef.current = true;
        const modelToLock = batchModelId || labState.model;
        setBatchModelId(modelToLock);
        setIsProcessingAll(true);
        setIsCoolingDown(false);
        setCooldownProgress(0);
        setGenerationProgress({ current: 0, total: pending.length });
        stopRequested.current = false;

        let completed = 0;
        let failed = 0;
        let consecutiveFailures = 0;
        let wasStopped = false;
        let wasStoppedDueToConsecutiveFailures = false;

        try {
            for (let i = 0; i < pending.length; i++) {
                if (stopRequested.current || !loopActiveRef.current) {
                    wasStopped = true;
                    break;
                }
                if (i > 0) {
                    setIsCoolingDown(true);
                    setCooldownProgress(0);
                    let step = 0; 
                    const aborted = await new Promise<boolean>(resolve => {
                        const timer = setInterval(() => {
                            if (stopRequested.current || !loopActiveRef.current) { clearInterval(timer); resolve(true); return; }
                            step++; setCooldownProgress((step / 50) * 100);
                            if (step >= 50) { clearInterval(timer); resolve(false); }
                        }, 100);
                    });
                    setIsCoolingDown(false);
                    setCooldownProgress(0);
                    if (aborted) {
                        wasStopped = true;
                        break;
                    }
                }
                if (stopRequested.current || !loopActiveRef.current) {
                    wasStopped = true;
                    break;
                }

                const task = pending[i];
                setGenerationProgress({ current: completed + failed + 1, total: pending.length });
                dispatchBulkNotification(
                    `Generating sample ${i + 1} of ${pending.length}: ${task.title || 'Untitled Prompt'}`,
                    'info'
                );

                const result = await processTask(task.id, modelToLock);
                if (result === 'success') {
                    completed += 1;
                    consecutiveFailures = 0;
                } else if (result === 'failed') {
                    failed += 1;
                    consecutiveFailures += 1;
                    if (consecutiveFailures >= MAX_CONSECUTIVE_BULK_FAILURES) {
                        wasStopped = true;
                        wasStoppedDueToConsecutiveFailures = true;
                        loopActiveRef.current = false;
                        stopRequested.current = true;
                        break;
                    }
                } else if (result === 'stopped') {
                    wasStopped = true;
                    break;
                }
            }

            if (wasStoppedDueToConsecutiveFailures) {
                dispatchBulkNotification(`Generation has been stopped due to ${MAX_CONSECUTIVE_BULK_FAILURES} consecutive failures.`, 'error');
            } else if (wasStopped) {
                dispatchBulkNotification(`Stopped after ${completed} artifact(s).`, completed > 0 ? 'info' : 'error');
            } else if (completed > 0 && failed === 0) {
                dispatchBulkNotification(`Generated ${completed} bulk artifact(s).`, 'success');
            } else if (completed > 0) {
                dispatchBulkNotification(`Generated ${completed} artifact(s). ${failed} prompt(s) failed.`, 'info');
            } else {
                dispatchBulkNotification('Bulk generation failed for all pending prompts.', 'error');
            }
        } finally {
            loopActiveRef.current = false;
            const stillPending = tasksRef.current.some((t: BulkTask) => t.status === 'pending');
            if (!stillPending || stopRequested.current) {
                setIsProcessingAll(false); 
                setBatchModelId(null); 
                stopRequested.current = false;
            }
            setIsCoolingDown(false);
            setCooldownProgress(0);
            setGenerationProgress({ current: 0, total: 0 });
        }
    };

    const handleStopAll = useCallback(() => {
        stopRequested.current = true;
        loopActiveRef.current = false;
        
        // Abort all active network requests
        abortControllers.current.forEach(c => c.abort());
        abortControllers.current.clear();
        
        // CRITICAL: Revert stuck 'generating' UI states back to 'pending'
        setTasks(prev => prev.map(t => t.status === 'generating' ? { ...t, status: 'pending' as const, progress: 0 } : t));
        
        setIsProcessingAll(false);
        setIsCoolingDown(false);
        setCooldownProgress(0);
    }, []);

    // 7. Global Stop Listener
    useEffect(() => {
        const handleGlobalStop = () => {
            handleStopAll();
        };
        window.addEventListener('aimana-bulk-stop-request', handleGlobalStop);
        return () => window.removeEventListener('aimana-bulk-stop-request', handleGlobalStop);
    }, [handleStopAll]);

    const cancelTask = useCallback((taskId: string) => {
        const controller = abortControllers.current.get(taskId);
        if (controller) {
            controller.abort();
        }
    }, []);

    return {
        variables, setVariables, tasks, setTasks, failedTasks, setFailedTasks, archivedTasks, setArchivedTasks,
        selectedTaskIds, setSelectedTaskIds, isProcessingAll, isCoolingDown, cooldownProgress, generationProgress, presets, bulkLimit, archiveProject,
        historyItems, allProjects, fetchHistory, fetchPresets, handleRunAll, handleStopAll, cancelTask, processTask, 
        moveToFailureLab, bulkMoveToFailureLab, restoreToQueue, bulkRestoreToQueue, moveAllFailedToLab, bulkArchiveTasks, toggleSelectAll
    };
};
