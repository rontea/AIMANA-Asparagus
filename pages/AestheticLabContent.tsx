
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, LayoutGrid, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { api } from '../services/api';
import { Project, ItemWithCurrentRevision, Revision } from '../types';
import { ManifestGallery } from '../components/project/lab/workspace/ManifestGallery';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import ItemDetailModal from '../components/item/ItemDetailModal';
import { LabTask } from '../hooks/useAiGeneration';
import { useModalDialogs } from '../hooks/useModalDialogs';

const isCaptureDestinationProject = (project: Project) => (
    project.projectType !== 'prompt' && !project.isArchived
);

const AestheticLabContent: React.FC = () => {
    const navigate = useNavigate();
    const { alert, alertDialog } = useModalDialogs();
    const [archiveItems, setArchiveItems] = useState<ItemWithCurrentRevision[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [archiveProject, setArchiveProject] = useState<Project | null>(null);
    const [inspectedItem, setInspectedItem] = useState<ItemWithCurrentRevision | null>(null);
    const [activeTab, setActiveTab] = useState<'lab' | 'uploads'>('lab');

    // Migration state
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [movingItems, setMovingItems] = useState<ItemWithCurrentRevision[]>([]);
    const [isMoving, setIsMoving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const captureProjects = React.useMemo(
        () => allProjects.filter(isCaptureDestinationProject),
        [allProjects]
    );

    const loadHistory = useCallback(async () => {
        setIsLoading(true);
        try {
            const archive = await fetch('/api/projects/archive', { 
                headers: api.auth.getAuthHeaders()
            }).then(r => r.json());
            
            if (archive?.id) {
                setArchiveProject(archive);
                const items = await api.items.list(archive.id);
                setArchiveItems(items.sort((a, b) => b.createdAt - a.createdAt));
            }
            
            const projectsList = await api.projects.list();
            setAllProjects(projectsList);
            const destinations = projectsList.filter(isCaptureDestinationProject);
            if (destinations.length > 0 && !selectedProjectId) setSelectedProjectId(destinations[0].id);

        } catch (e) { console.error("Content sync failed", e); }
        finally { setIsLoading(false); }
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

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    useEffect(() => {
        const handleProjectsUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ project?: Project }>).detail || {};
            if (detail.project) mergeProjectListEntry(detail.project);
            void loadHistory();
        };

        window.addEventListener('aimana-projects-updated', handleProjectsUpdated);
        return () => window.removeEventListener('aimana-projects-updated', handleProjectsUpdated);
    }, [loadHistory, mergeProjectListEntry]);

    useEffect(() => {
        if (!showProjectSelector) return;
        if (captureProjects.length === 0) return;
        if (!captureProjects.some(project => project.id === selectedProjectId)) {
            setSelectedProjectId(captureProjects[0].id);
        }
    }, [captureProjects, selectedProjectId, showProjectSelector]);

    const handleConfirmSelection = async () => {
        if (!selectedProjectId) return;
        setIsMoving(true);
        try {
            const sourceProjectIds = new Set<string>();
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
            await loadHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));
            setSuccessMsg(`Successfully migrated ${movingItems.length} artifact(s).`);
            setTimeout(() => setSuccessMsg(null), 3000);
            setShowProjectSelector(false);
            setMovingItems([]);
        } catch (err) {
            await alert({
                title: 'Migration Failed',
                description: 'Migration failed.',
                tone: 'danger'
            });
        } finally {
            setIsMoving(false);
        }
    };

    const handleSoftDelete = async (id: string) => {
        try {
            await api.items.update({ id, isArchived: true, isPinned: false });
            await loadHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));
        } catch (e) {
            console.error("Failed to archive lab item", e);
        }
    };

    const handlePublishToSource = async (task: LabTask) => {
        const stagedItem = task.archivedItem;
        const stagedRevision = stagedItem?.currentRevision;
        if (!stagedItem || !stagedRevision?.fileUrl) {
            await alert({
                title: 'Binary Unavailable',
                description: 'Staged artifact binary is unavailable.',
                tone: 'danger'
            });
            return;
        }

        let sourceItemId: string | null = null;
        try {
            const params = stagedRevision.aiParameters ? JSON.parse(stagedRevision.aiParameters) : {};
            sourceItemId = params.sourceItemId || null;
        } catch (e) {
            sourceItemId = null;
        }

        if (!sourceItemId) {
            await alert({
                title: 'Missing Source Item',
                description: 'No source item is linked to this staged artifact.',
                tone: 'danger'
            });
            return;
        }

        try {
            const sourceItem = await api.items.get(sourceItemId);
            if (!sourceItem) {
                await alert({
                    title: 'Source Missing',
                    description: 'Source item no longer exists.',
                    tone: 'danger'
                });
                return;
            }

            const response = await fetch(stagedRevision.fileUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const filename = stagedRevision.originalFilename || `lab_publish_${Date.now()}.png`;
            const file = new File([blob], filename, {
                type: stagedRevision.mimeType || blob.type || 'application/octet-stream'
            });

            await api.revisions.add(sourceItem.id, file, {
                title: stagedRevision.title,
                label: stagedRevision.label || '',
                prompt: stagedRevision.prompt || '',
                note: stagedRevision.note || '',
                engine: stagedRevision.engine || sourceItem.currentRevision?.engine || 'default-placeholder',
                aiParameters: stagedRevision.aiParameters || ''
            });

            // Remove staged lab artifact from archive manifests after successful publish to source.
            await api.items.update({ id: stagedItem.id, isArchived: true, isPinned: false });
            await loadHistory();
            window.dispatchEvent(new CustomEvent('neural-history-updated'));

            setSuccessMsg("Published to source item and removed from Lab Content.");
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (e) {
            console.error("Failed to publish staged artifact to source", e);
            await alert({
                title: 'Save Failed',
                description: 'Failed to save new version to source item.',
                tone: 'danger'
            });
        }
    };

    const getItemMetadata = (item: ItemWithCurrentRevision) => {
        const raw = item.currentRevision?.aiParameters;
        if (!raw) return {};
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    };

    const isAestheticLabItem = (item: ItemWithCurrentRevision) => {
        const params = getItemMetadata(item);
        return params?.source === 'aesthetic_lab';
    };

    const isLabContentUpload = (item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (rev?.engine === 'reference' || rev?.engine === 'reference-upload') return true;
        if (rev?.fileUrl?.includes('/Neural_Reference/')) return true;
        const params = getItemMetadata(item);
        const adv = params?.advanced_params || params || {};
        const source = typeof adv.source === 'string' ? adv.source : (typeof params?.source === 'string' ? params.source : '');
        return !!(
            params.labContentUpload === true ||
            adv.labContentUpload === true ||
            adv.isReference ||
            adv.referenceAsset === true ||
            adv.source === 'reference_upload' ||
            adv.source === 'reference_drop' ||
            (typeof source === 'string' && source.startsWith('selector_ingest'))
        );
    };

    const uploadItems = archiveItems.filter(isLabContentUpload);
    const labItems = archiveItems.filter((item) => isAestheticLabItem(item) && !isLabContentUpload(item));
    const visibleItems = activeTab === 'uploads' ? uploadItems : labItems;

    const historyTasks = visibleItems.map(item => {
        const isUpload = isLabContentUpload(item);
        const titleFallback = item.currentRevision?.title || 'Lab content upload';
        return ({
            id: item.id,
            prompt: item.currentRevision?.prompt || titleFallback,
            modelId: isUpload ? 'lab-content-upload' : 'lab',
            modelLabel: isUpload ? 'Lab Content Upload' : 'Aesthetic Lab',
            status: 'success' as const,
            progress: 100,
            result: null,
            error: null,
            timestamp: item.createdAt,
            aspectRatio: '1:1',
            archivedItem: item
        });
    });

    return (
        <div className="max-w-[1760px] mx-auto space-y-10 min-h-[calc(100vh-4rem)] pb-24 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
                        <Archive size={36} className="text-indigo-500" />
                        Aesthetic Lab Content
                    </h1>
                    <p className="text-slate-400 font-medium">
                        {activeTab === 'uploads'
                            ? 'Uploads captured via Studio Ingest and staged in Lab Content.'
                            : 'Recently synthesized results and manifest compositions.'}
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-1">
                    <button
                        onClick={() => setActiveTab('lab')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'lab' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Lab Content
                        <span className="ml-2 text-[9px] font-black text-indigo-200/80">{labItems.length}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('uploads')}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'uploads' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Lab Content Uploads
                        <span className="ml-2 text-[9px] font-black text-cyan-200/80">{uploadItems.length}</span>
                    </button>
                </div>
                <button 
                    onClick={() => navigate('/extensions/image-editor')}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all border border-slate-700"
                >
                    <ArrowLeft size={18} /> Open Lab
                </button>
            </div>

            {isLoading ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4 text-slate-700">
                    <Loader2 className="animate-spin text-indigo-500" size={48} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Synchronizing Lab Vault...</span>
                </div>
            ) : visibleItems.length === 0 ? (
                <div className="py-40 flex flex-col items-center justify-center text-center opacity-30">
                    <LayoutGrid size={80} strokeWidth={1} />
                    <p className="text-xl font-black uppercase tracking-widest mt-6">
                        {activeTab === 'uploads' ? 'No Lab Content Uploads' : 'Vault is Empty'}
                    </p>
                    <p className="text-xs mt-3 max-w-xs leading-relaxed">
                        {activeTab === 'uploads'
                            ? 'Uploads added from Studio Ingest will appear here for capture.'
                            : 'Saved lab results and matrix compositions will appear here for capture.'}
                    </p>
                </div>
            ) : (
                <ManifestGallery 
                    tasks={[]} 
                    historyTasks={historyTasks} 
                    onRemoveTask={handleSoftDelete} 
                    onSave={(res, p, m, meta, title, archivedItem) => {
                        if (archivedItem) {
                            setMovingItems([archivedItem]);
                            setShowProjectSelector(true);
                        }
                    }}
                    onBulkSave={(tasks) => {
                        const items = tasks.map(t => t.archivedItem).filter(Boolean) as ItemWithCurrentRevision[];
                        if (items.length > 0) {
                            setMovingItems(items);
                            setShowProjectSelector(true);
                        }
                    }}
                    onInspectTask={(task) => setInspectedItem(task.archivedItem!)}
                    onRemixTask={async (task) => {
                        if (task.archivedItem?.id) {
                            navigate(`/extensions/image-editor?itemId=${task.archivedItem.id}`);
                        }
                    }}
                    onPublishToSource={activeTab === 'lab' ? handlePublishToSource : undefined}
                    registry={[]}
                />
            )}

            {successMsg && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 animate-in slide-in-from-bottom-4 z-50">
                    <CheckCircle size={18} /> {successMsg}
                </div>
            )}

            {showProjectSelector && (
                <ProjectReassignModal 
                    projects={captureProjects}
                    selectedProjectId={captureProjects.some(project => project.id === selectedProjectId) ? selectedProjectId : ''}
                    onSelectProject={setSelectedProjectId}
                    onConfirm={handleConfirmSelection}
                    onCancel={() => { setShowProjectSelector(false); setMovingItems([]); }}
                    isMoving={isMoving}
                    title={movingItems.length > 1 ? `Capture ${movingItems.length} Artifacts` : "Capture Artifact"}
                />
            )}

            {inspectedItem && archiveProject && (
                <ItemDetailModal 
                    isOpen={!!inspectedItem}
                    onClose={() => setInspectedItem(null)}
                    item={inspectedItem}
                    project={archiveProject}
                    onUpdate={(u) => { if (!u.isArchived) loadHistory(); setInspectedItem(u); }}
                    onOpenItem={setInspectedItem}
                    onRefreshHistory={loadHistory}
                    onDelete={() => { setInspectedItem(null); loadHistory(); }}
                    onMove={(item) => {
                        setInspectedItem(null);
                        setMovingItems([item]);
                        setShowProjectSelector(true);
                    }}
                />
            )}

            {alertDialog}
        </div>
    );
};

export default AestheticLabContent;

