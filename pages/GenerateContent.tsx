import React, { useState, useEffect, useCallback, useMemo } from 'react';
/* Importing useNavigate from core package to fix named export issue */
import { useNavigate, useLocation } from 'react-router';
import { LayoutGrid, Sparkles, CheckCircle } from 'lucide-react';
import { api } from '../services/api';
import { Project, ItemWithCurrentRevision, Revision } from '../types';
import ItemDetailModal from '../components/item/ItemDetailModal';
import GenerateImageModal, { LabMode } from '../components/project/lab/GenerateImageModal';
import { GeneratedImageResult } from '../services/geminiService';
import { LabTask } from '../hooks/useAiGeneration';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { isMusicAudioModel, isTranscriptionAudioModel } from '../components/project/lab/ModelSelector/audioModelUtils';
import { ModelOption } from '../components/project/lab/ModelSelectorModal';
import { loadDynamicRegistry } from '../components/project/lab/ModelSelector/registry/index';
import { createGeneratedAssetFile } from '../utils/generatedAssetFile';
import { extractAutoReferenceImageTag, mergeRevisionTags } from '../utils/revisionTags';

// Sub-component Imports
import { LabHistoryHeader } from '../components/lab/history/LabHistoryHeader';
import { LabActionCards } from '../components/lab/history/LabActionCards';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import { ManifestGallery } from '../components/project/lab/workspace/ManifestGallery';

interface PendingCapture {
    res: GeneratedImageResult;
    prompt: string;
    modelId: string;
    metadata: any;
    userTitle?: string;
    archivedItem?: ItemWithCurrentRevision;
}

type ArchiveManifestFilter = 'all' | 'image' | 'video' | 'audio' | 'text';

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

const GenerateContent: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { alert, alertDialog } = useModalDialogs();
    
    // States
    const [archiveProject, setArchiveProject] = useState<Project | null>(null);
    const [inspectedItem, setInspectedItem] = useState<ItemWithCurrentRevision | null>(null);
    const [isLabOpen, setIsLabOpen] = useState(false);
    const [labMode, setLabMode] = useState<LabMode>('image');
    const [remixRevision, setRemixRevision] = useState<Revision | null>(null);
    const [history, setHistory] = useState<ItemWithCurrentRevision[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [movingItems, setMovingItems] = useState<ItemWithCurrentRevision[]>([]);
    const [pendingCaptures, setPendingCaptures] = useState<PendingCapture[]>([]);
    const [isMoving, setIsMoving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [manifestFilter, setManifestFilter] = useState<ArchiveManifestFilter>('all');
    const [inspectorRegistry, setInspectorRegistry] = useState<ModelOption[]>([]);
    const captureProjects = useMemo(
        () => allProjects.filter(isCaptureDestinationProject),
        [allProjects]
    );

    // Initial load logic
    const loadHistory = useCallback(async () => {
        setIsHistoryLoading(true);
        try {
            const archive = await fetch('/api/projects/archive', { 
                headers: api.auth.getAuthHeaders()
            }).then(r => r.json());
            
            if (archive?.id) {
                setArchiveProject(archive);
                const items = await api.items.list(archive.id);
                setHistory(items.sort((a, b) => b.createdAt - a.createdAt));
            }
        } catch (e) { console.error("History load failed", e); }
        finally { setIsHistoryLoading(false); }
    }, []);

    const fetchProjects = useCallback(async () => {
        try {
            const list = await api.projects.list();
            setAllProjects(list);
            const destinations = list.filter(isCaptureDestinationProject);
            if (destinations.length > 0 && !selectedProjectId) setSelectedProjectId(destinations[0].id);
        } catch (e) {}
    }, [selectedProjectId]);

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
        if (isCaptureDestinationProject(project)) {
            setSelectedProjectId(prev => prev || project.id);
        }
    }, []);

    const ensureProjectsLoaded = useCallback(async () => {
        const currentDestinations = allProjects.filter(isCaptureDestinationProject);
        if (currentDestinations.length > 0) return currentDestinations;
        try {
            const list = await api.projects.list();
            setAllProjects(list);
            const destinations = list.filter(isCaptureDestinationProject);
            if (destinations.length > 0 && !selectedProjectId) setSelectedProjectId(destinations[0].id);
            return destinations;
        } catch (_e) {
            return [];
        }
    }, [allProjects, selectedProjectId]);

    const openProjectSelector = useCallback(async (options: {
        moving?: ItemWithCurrentRevision[];
        captures?: PendingCapture[];
    }) => {
        const moving = options.moving || [];
        const captures = options.captures || [];
        if (moving.length === 0 && captures.length === 0) return;

        await ensureProjectsLoaded();
        setMovingItems(moving);
        setPendingCaptures(captures);
        setShowProjectSelector(true);
    }, [ensureProjectsLoaded]);

    useEffect(() => {
        fetchProjects();
        loadHistory();
        window.addEventListener('neural-history-updated', loadHistory);
        return () => window.removeEventListener('neural-history-updated', loadHistory);
    }, [loadHistory, fetchProjects]);

    useEffect(() => {
        const handleProjectsUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ project?: Project }>).detail || {};
            if (detail.project) mergeProjectListEntry(detail.project);
            void fetchProjects();
        };

        window.addEventListener('aimana-projects-updated', handleProjectsUpdated);
        return () => window.removeEventListener('aimana-projects-updated', handleProjectsUpdated);
    }, [fetchProjects, mergeProjectListEntry]);

    useEffect(() => {
        if (!showProjectSelector) return;
        if (captureProjects.length === 0) return;
        if (!captureProjects.some(project => project.id === selectedProjectId)) {
            setSelectedProjectId(captureProjects[0].id);
        }
    }, [captureProjects, selectedProjectId, showProjectSelector]);

    useEffect(() => {
        loadDynamicRegistry().then(setInspectorRegistry).catch(() => {});
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const modeParam = params.get('mode');
        if (!modeParam) return;
        const normalized = modeParam.toLowerCase();
        if (normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'music' || normalized === 'transcribe' || normalized === 'text') {
            setRemixRevision(null);
            setLabMode(normalized as LabMode);
            setIsLabOpen(true);
        }
    }, [location.search]);

    // Filter logic: Only include items that have explicit AI provenance
    // Excludes items acting as pure references or linked orchestrations
    const manifestHistory = useMemo(() => {
        return history.filter(item => {
            const rev = item.currentRevision;
            if (!rev) return false;
            if (rev.secondaryFiles && rev.secondaryFiles.length > 0) return false;
            const isReferenceUpload = isUploadedReferenceItem(item);
            if (isReferenceUpload) return true;

            // Check for explicit AI generator flags
            if (rev.aiParameters) {
                try {
                    const params = JSON.parse(rev.aiParameters);
                    const adv = params.advanced_params || params;
                    
                    // CRITICAL: Exclude explicit references and manifest components
                    const isRef = !!(
                        adv.isReference ||
                        adv.source === 'reference_upload' ||
                        adv.source === 'manifest_link' ||
                        (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
                    );
                    const hasParent = !!adv.parentItemId;
                    const hasReferenceManifest = Array.isArray(adv.referenceItemIds) && adv.referenceItemIds.length > 0;
                    if (isRef || hasParent || hasReferenceManifest) {
                        return false;
                    }

                    if (params.aimana_lab || params.bulk || params.refinement || params.auto_saved || params.source === 'aimana_lab') {
                        return true;
                    }
                } catch (e) {}
            }

            // Heuristic: Non-placeholder engine + real prompt = AI Manifest
            const isRefEngine = rev.engine === 'reference';
            const isPlaceholderEngine = rev.engine === 'default-placeholder' || rev.engine === 'other-model';
            const hasSubstantialPrompt = rev.prompt && rev.prompt.trim().length > 3;

            return !isRefEngine && !isPlaceholderEngine && hasSubstantialPrompt;
        });
    }, [history]);

    const syncHistoryItem = useCallback((updatedItem: ItemWithCurrentRevision) => {
        setHistory(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
        setInspectedItem(prev => prev?.id === updatedItem.id ? updatedItem : prev);
    }, []);

    // Action handlers
    const handleConfirmSelection = async () => {
        if (!selectedProjectId) return;
        setIsMoving(true);
        try {
            const sourceProjectIds = new Set<string>();
            let movedCount = 0;
            let failedCount = 0;
            if (movingItems.length > 0) {
                for (const item of movingItems) {
                    try {
                        if (item.projectId) sourceProjectIds.add(item.projectId);
                        await api.items.update({ id: item.id, projectId: selectedProjectId, collectionId: null, isArchived: false });
                        movedCount++;
                    } catch (e) {
                        failedCount++;
                    }
                }
            } 
            if (pendingCaptures.length > 0) {
                for (const capture of pendingCaptures) {
                    const { res, prompt, modelId, metadata, userTitle, archivedItem } = capture;
                    const finalTitle = userTitle?.trim() || `Captured: ${prompt.substring(0, 20)}...`;
                    
                    try {
                        if (archivedItem) {
                            if (archivedItem.projectId) sourceProjectIds.add(archivedItem.projectId);
                            await api.items.update({ id: archivedItem.id, projectId: selectedProjectId, collectionId: null, isArchived: false });
                            if (archivedItem.currentRevision) {
                                await api.revisions.update({ 
                                    id: archivedItem.currentRevision.id, 
                                    prompt, 
                                    engine: modelId, 
                                    aiParameters: JSON.stringify(metadata, null, 2), 
                                    title: finalTitle 
                                });
                            }
                            movedCount++;
                        } else if (res) {
                            const file = createGeneratedAssetFile(res, {
                                baseName: userTitle || metadata?.sourceFileName || `captured-${Date.now()}`,
                                formatHint: metadata?.dynamicParams?.response_format
                            });
                            const itemWithRev = await api.items.create(selectedProjectId, file, () => {});
                            if (itemWithRev.currentRevision) {
                                const nextTags = mergeRevisionTags(
                                    itemWithRev.currentRevision.tags,
                                    extractAutoReferenceImageTag(metadata)
                                );
                                await api.revisions.update({ ...itemWithRev.currentRevision, prompt, engine: modelId, aiParameters: JSON.stringify(metadata, null, 2), title: finalTitle, tags: nextTags });
                            }
                            movedCount++;
                        }
                    } catch (e) {
                        failedCount++;
                    }
                }
            }
            sourceProjectIds.forEach((projectId) => {
                window.dispatchEvent(new CustomEvent('project-items-updated', {
                    detail: { projectId, reason: 'project-move-source' }
                }));
            });
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: selectedProjectId, reason: 'project-move-target' }
            }));
            await loadHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));
            if (movedCount > 0 && failedCount === 0) {
                setSuccessMsg(movedCount > 1 ? `Successfully moved ${movedCount} artifacts to project.` : 'Successfully moved artifact to project.');
            } else if (movedCount > 0 && failedCount > 0) {
                setSuccessMsg(`Moved ${movedCount} artifact(s), ${failedCount} failed.`);
            }
            setTimeout(() => setSuccessMsg(null), 3000);
            setShowProjectSelector(false);
            setMovingItems([]);
            setPendingCaptures([]);
        } catch (err) {
            await alert({
                title: 'Capture Failed',
                description: 'Capture failed.',
                tone: 'danger'
            });
        }
        finally { setIsMoving(false); }
    };

    const handleRemixAction = (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        if (!rev) return;
        if (rev.mimeType.startsWith('text/') && isTranscriptionAudioModel({ id: rev.engine, label: rev.title, desc: rev.prompt })) {
            return;
        }
        setRemixRevision(rev);
        const mode: LabMode = rev.mimeType.startsWith('video/')
            ? 'video'
            : rev.mimeType.startsWith('audio/')
                ? (isMusicAudioModel({ id: rev.engine, label: rev.title, desc: rev.prompt }) ? 'music' : 'audio')
                : 'image';
        setLabMode(mode);
        setIsLabOpen(true);
    };

    const handleSoftDeleteHistory = async (id: string) => {
        try {
            await api.items.update({ id, isArchived: true, isPinned: false });
            await loadHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));
        } catch (e) {
            console.error("Failed to archive item", e);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#050505] -m-4 sm:-m-6 lg:-m-8 animate-in fade-in duration-500 overflow-hidden relative">
            <LabHistoryHeader onBack={() => navigate('/')} />

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 pb-40">
                <LabActionCards
                    onOpenLab={(mode) => { setRemixRevision(null); setLabMode(mode); setIsLabOpen(true); }}
                    onOpenChat={() => navigate('/chat?from=generate')}
                />

                <div className="max-w-[1760px] mx-auto">
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        {([
                            { value: 'all', label: 'All' },
                            { value: 'image', label: 'Image' },
                            { value: 'video', label: 'Video' },
                            { value: 'audio', label: 'Audio' },
                            { value: 'text', label: 'Text' }
                        ] as const).map((option) => {
                            const isActive = manifestFilter === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setManifestFilter(option.value)}
                                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] transition-colors ${
                                        isActive
                                            ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    {isHistoryLoading ? (
                        <div className="py-32 flex flex-col items-center justify-center gap-4 text-slate-700">
                            <div className="w-16 h-16 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Synchronizing Neural Saved...</span>
                        </div>
                    ) : manifestHistory.length === 0 ? (
                        <div className="py-40 flex flex-col items-center justify-center text-center opacity-30">
                            <Sparkles size={80} strokeWidth={1} className="text-indigo-500" />
                            <p className="text-xl font-black uppercase tracking-widest mt-6">Manifest History Empty</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">AI-Generated artifacts will stage here automatically.</p>
                        </div>
                    ) : (
                        <ManifestGallery 
                            tasks={[]} 
                            historyTasks={manifestHistory.map(item => {
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
                            })} 
                            onRemoveTask={handleSoftDeleteHistory} 
                            onSave={(res, p, m, meta, title, archivedItem) => {
                                if (archivedItem) {
                                    void openProjectSelector({ moving: [archivedItem] });
                                } else if (res) {
                                    void openProjectSelector({
                                        captures: [{ res, prompt: p, modelId: m, metadata: meta, userTitle: title }]
                                    });
                                }
                            }}
                            onBulkSave={(tasks) => {
                                const items = tasks.map(t => t.archivedItem).filter(Boolean) as ItemWithCurrentRevision[];
                                if (items.length > 0) {
                                    void openProjectSelector({ moving: items });
                                }
                            }}
                            onInspectTask={(task) => {
                                const item = task.archivedItem || null;
                                if (!item?.currentRevision) return;
                                setInspectedItem(item);
                            }}
                            onRemixTask={handleRemixAction}
                            registry={inspectorRegistry}
                            excludeLabContentUploads
                            manifestType={manifestFilter}
                        />
                    )}
                </div>
            </div>

            {isLabOpen && (
                <GenerateImageModal 
                    key={`generate-lab-${labMode}`}
                    isOpen={isLabOpen} 
                    onClose={() => setIsLabOpen(false)} 
                    onBack={() => setIsLabOpen(false)}
                    backLabel="Generate Content"
                    onModeChange={setLabMode}
                    onAddAsAsset={async (res, prompt, modelId, metadata, title, archivedItem) => {
                        await openProjectSelector({
                            captures: [{ res, prompt, modelId, metadata, userTitle: title, archivedItem }]
                        });
                    }}
                    onBulkAddAsAssets={async (captures) => {
                        const normalized: PendingCapture[] = (captures || []).map((c: any) => ({
                            res: c.res,
                            prompt: c.prompt,
                            modelId: c.modelId,
                            metadata: c.metadata,
                            userTitle: c.userTitle,
                            archivedItem: c.archivedItem
                        }));
                        if (normalized.length > 0) {
                            await openProjectSelector({
                                captures: normalized
                            });
                        }
                    }}
                    mode={labMode}
                    remixRevision={remixRevision}
                />
            )}

            {showProjectSelector && (
                <ProjectReassignModal 
                    projects={captureProjects} 
                    selectedProjectId={captureProjects.some(project => project.id === selectedProjectId) ? selectedProjectId : ''} 
                    onSelectProject={setSelectedProjectId}
                    onConfirm={handleConfirmSelection} 
                    onCancel={() => { setShowProjectSelector(false); setMovingItems([]); setPendingCaptures([]); }}
                    isMoving={isMoving} 
                    title={movingItems.length + pendingCaptures.length > 1 ? `Capture ${movingItems.length + pendingCaptures.length} Artifacts` : "Capture Artifact"}
                />
            )}

            {successMsg && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 animate-in slide-in-from-bottom-4 z-50">
                    <CheckCircle size={18} /> {successMsg}
                </div>
            )}

            {inspectedItem && archiveProject && (
                <ItemDetailModal 
                    isOpen={!!inspectedItem} 
                    onClose={() => setInspectedItem(null)} 
                    item={inspectedItem} 
                    project={archiveProject} 
                    onUpdate={syncHistoryItem}
                    onOpenItem={setInspectedItem}
                    onDelete={() => { setInspectedItem(null); loadHistory(); }}
                    onMove={(item) => {
                        setInspectedItem(null);
                        void openProjectSelector({ moving: [item] });
                    }}
                />
            )}

            {alertDialog}
        </div>
    );
};

export default GenerateContent;

