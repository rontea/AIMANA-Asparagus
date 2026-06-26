
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Database, ChevronLeft, LayoutGrid, FileImage, AudioLines, Loader2, ArrowRight, Check, CheckSquare, Square, Info, UploadCloud, Pin, Plus, Link2 } from 'lucide-react';
import { api } from '../../../services/api';
import { Project, ItemWithCurrentRevision, ReferenceUsage } from '../../../types';
import { MosaicViewerModal } from '../../../components/item/MosaicViewerModal';

type SelectorMediaType = 'image' | 'audio';
export type IngestContext = 'reference' | 'mosaic' | 'main' | 'matrix' | 'transcription';

interface ArtifactSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (itemIds: string[]) => void;
    ingestContext?: IngestContext;
    mediaType?: SelectorMediaType;
    allowMultiple?: boolean;
    referencedInItemIds?: string[];
    sourceItemId?: string;
}

interface ReferenceImageUsageFile {
    id: string;
    url: string;
    mimeType: string;
    projectName?: string;
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.mp4', '.mpeg', '.mpga', '.aac', '.ogg', '.flac', '.webm', '.opus'];

const matchesMediaType = (mediaType: SelectorMediaType, mimeType?: string | null, fallbackName?: string | null) => {
    const mime = String(mimeType || '').toLowerCase().trim();
    if (mediaType === 'image') return mime.startsWith('image/');
    if (mime.startsWith('audio/')) return true;
    if (mime.startsWith('video/')) return false;
    const lowerName = String(fallbackName || '').toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

const parseAdvancedParams = (raw?: string | null) => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return (parsed as any).advanced_params || parsed;
    } catch {
        return null;
    }
};

const isNeuralReferenceItem = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return false;

    const adv = parseAdvancedParams(rev.aiParameters);
    if (adv?.source === 'manifest_link') return false;

    const source = typeof adv?.source === 'string' ? adv.source : '';
    const explicitReferenceImage = !!(
        (adv?.isReference && !adv?.parentItemId) ||
        adv?.referenceAsset === true ||
        source === 'reference_upload' ||
        source === 'reference_drop' ||
        source.startsWith('selector_ingest')
    );
    if (explicitReferenceImage) return true;

    if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
    if (rev.fileUrl?.includes('/Neural_Reference/')) return true;
    return false;
};

const isLinkedArtifactItem = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return false;
    const adv = parseAdvancedParams(rev.aiParameters);
    return adv?.source === 'manifest_link' || !!adv?.parentItemId;
};

const hasNeuralReferences = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return false;
    const adv = parseAdvancedParams(rev.aiParameters);
    const referenceItemIds = Array.isArray(adv?.referenceItemIds) ? adv.referenceItemIds : [];
    const referenceAudioItemIds = Array.isArray(adv?.referenceAudioItemIds) ? adv.referenceAudioItemIds : [];
    return referenceItemIds.length > 0 || referenceAudioItemIds.length > 0;
};

const hasNoLinkedArtifacts = (item: ItemWithCurrentRevision) => {
    const rev = item.currentRevision;
    if (!rev) return true;
    const hasAttachedLinkedArtifacts = Array.isArray(rev.secondaryFiles) && rev.secondaryFiles.length > 0;
    return !hasAttachedLinkedArtifacts && !isLinkedArtifactItem(item);
};

export const ArtifactSelectorModal: React.FC<ArtifactSelectorModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    ingestContext = 'main',
    mediaType = 'image',
    allowMultiple = true,
    referencedInItemIds = [],
    sourceItemId
}) => {
    const [step, setStep] = useState<'projects' | 'items'>('projects');
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [archiveProjectId, setArchiveProjectId] = useState<string | null>(null);
    const [items, setItems] = useState<ItemWithCurrentRevision[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const [ingestNotice, setIngestNotice] = useState<string | null>(null);
    const [scopeFilter, setScopeFilter] = useState<'all' | 'referencedIn' | 'neuralReferences' | 'linkedArtifacts' | 'hasNeuralReferences' | 'hasNoLinkedArtifacts'>('all');
    const [referencedInProjectIds, setReferencedInProjectIds] = useState<Set<string>>(new Set());
    const [fetchedReferencedInIds, setFetchedReferencedInIds] = useState<string[]>([]);
    const [referenceImageUsageCountByItemId, setReferenceImageUsageCountByItemId] = useState<Record<string, number>>({});
    const [referenceImageUsageFilesByItemId, setReferenceImageUsageFilesByItemId] = useState<Record<string, ReferenceImageUsageFile[]>>({});
    const [referenceImageUsageLoadingIds, setReferenceImageUsageLoadingIds] = useState<Set<string>>(new Set());
    const [activeReferenceImageUsageItemId, setActiveReferenceImageUsageItemId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const isAudioMode = mediaType === 'audio';
    const selectedMediaLabel = isAudioMode
        ? (allowMultiple ? 'Audio Files' : 'Audio File')
        : (allowMultiple ? 'Image Files' : 'Image File');
    const mediaAccept = isAudioMode
        ? 'audio/*,.mp3,.wav,.m4a,.mp4,.mpeg,.mpga,.aac,.ogg,.flac,.webm,.opus'
        : 'image/*';
    const mediaTagLabel = isAudioMode ? 'Audio Manifest' : 'Artifact Manifest';

    // CRITICAL: Studio-specific pinning stored in localStorage, separate from global pinned state
    const [studioPinnedIds, setStudioPinnedIds] = useState<Set<string>>(() => {
        const saved = localStorage.getItem('aimana_studio_selector_pins');
        return new Set(saved ? JSON.parse(saved) : []);
    });

    const isActiveProject = (project?: Partial<Project> | null) => !!project && !project.isArchived;
    const isActiveItem = (item?: Partial<ItemWithCurrentRevision> | null) => !!item && !item.isArchived;
    const propReferencedInIds = useMemo(
        () => Array.from(new Set((referencedInItemIds || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0))),
        [referencedInItemIds]
    );
    const normalizedReferencedInIds = useMemo(
        () => Array.from(new Set([...propReferencedInIds, ...fetchedReferencedInIds])),
        [propReferencedInIds, fetchedReferencedInIds]
    );
    const referencedInIdSet = useMemo(() => new Set(normalizedReferencedInIds), [normalizedReferencedInIds]);
    const hasReferencedInFilter = ingestContext === 'mosaic' || propReferencedInIds.length > 0 || !!sourceItemId;
    const hasRoleFilters = ingestContext === 'reference' && step === 'items';
    const showRefImageUsageBadge = ingestContext === 'reference' && step === 'items' && !isAudioMode;

    const referencedInItemCountInCurrentProject = useMemo(
        () => items.filter((item) => isActiveItem(item) && referencedInIdSet.has(item.id)).length,
        [items, referencedInIdSet]
    );
    const neuralReferenceCountInCurrentProject = useMemo(
        () => items.filter((item) => isActiveItem(item) && isNeuralReferenceItem(item)).length,
        [items]
    );
    const linkedArtifactCountInCurrentProject = useMemo(
        () => items.filter((item) => isActiveItem(item) && isLinkedArtifactItem(item)).length,
        [items]
    );
    const hasNeuralReferencesCountInCurrentProject = useMemo(
        () => items.filter((item) => isActiveItem(item) && hasNeuralReferences(item)).length,
        [items]
    );
    const hasNoLinkedArtifactsCountInCurrentProject = useMemo(
        () => items.filter((item) => isActiveItem(item) && hasNoLinkedArtifacts(item)).length,
        [items]
    );

    useEffect(() => {
        localStorage.setItem('aimana_studio_selector_pins', JSON.stringify(Array.from(studioPinnedIds)));
    }, [studioPinnedIds]);

    useEffect(() => {
        if (isOpen) {
            const loadProjects = async () => {
                setLoading(true);
                try {
                    // Include user projects plus Neural Archive so ingest uploads saved
                    // without explicit project selection remain discoverable.
                    const [projectsRes, archiveRes] = await Promise.all([
                        fetch('/api/projects', {
                            headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' })
                        }),
                        fetch('/api/projects/archive', {
                            headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' })
                        })
                    ]);
                    if (!projectsRes.ok) throw new Error("Registry fetch failed");
                    const [list, archive] = await Promise.all([
                        projectsRes.json(),
                        archiveRes.ok ? archiveRes.json() : Promise.resolve(null)
                    ]);
                    const merged = Array.isArray(list)
                        ? list.filter((p: Project) => isActiveProject(p))
                        : [];
                    if (archive?.id && !merged.some((p: Project) => p.id === archive.id)) {
                        merged.unshift(archive);
                        setArchiveProjectId(archive.id);
                    } else if (archive?.id) {
                        setArchiveProjectId(archive.id);
                    }
                    setProjects(merged);
                } catch (e) {
                    console.error("Failed to load project registry");
                } finally {
                    setLoading(false);
                }
            };
            loadProjects();
        } else {
            setStep('projects');
            setSelectedProject(null);
            setItems([]);
            setSearchTerm('');
            setSelectedIds(new Set());
            setIngestNotice(null);
            setArchiveProjectId(null);
            setScopeFilter('all');
            setReferencedInProjectIds(new Set());
            setFetchedReferencedInIds([]);
            setReferenceImageUsageCountByItemId({});
            setReferenceImageUsageFilesByItemId({});
            setReferenceImageUsageLoadingIds(new Set());
            setActiveReferenceImageUsageItemId(null);
        }
    }, [isOpen]);

    const toReferenceImageUsageFiles = (refs: ReferenceUsage[]): ReferenceImageUsageFile[] => {
        return refs
            .filter((ref) => ref.relationKind === 'reference_image')
            .map((ref) => ({
                id: ref.parentItemId,
                url: ref.parentPreviewUrl || '',
                mimeType: ref.parentPreviewUrl ? (ref.parentMimeType || 'image/png') : 'application/octet-stream',
                projectName: ref.parentProjectName
            }));
    };

    const fetchReferenceImageUsageForItem = async (itemId: string): Promise<ReferenceImageUsageFile[]> => {
        if (!itemId) return [];
        const cached = referenceImageUsageFilesByItemId[itemId];
        if (cached) return cached;

        setReferenceImageUsageLoadingIds((prev) => {
            const next = new Set(prev);
            next.add(itemId);
            return next;
        });

        try {
            const refs = await api.items.referencedBy(itemId);
            const files = toReferenceImageUsageFiles(refs);
            const count = files.length;
            setReferenceImageUsageFilesByItemId((prev) => ({ ...prev, [itemId]: files }));
            setReferenceImageUsageCountByItemId((prev) => ({ ...prev, [itemId]: count }));
            return files;
        } catch {
            setReferenceImageUsageFilesByItemId((prev) => ({ ...prev, [itemId]: [] }));
            setReferenceImageUsageCountByItemId((prev) => ({ ...prev, [itemId]: 0 }));
            return [];
        } finally {
            setReferenceImageUsageLoadingIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });
        }
    };

    useEffect(() => {
        let cancelled = false;
        const preloadReferenceImageUsageCounts = async () => {
            if (!showRefImageUsageBadge || items.length === 0) return;
            const unresolvedIds = items
                .filter((item) => isActiveItem(item))
                .map((item) => item.id)
                .filter((id) => referenceImageUsageCountByItemId[id] === undefined);
            if (unresolvedIds.length === 0) return;

            for (const itemId of unresolvedIds) {
                if (cancelled) return;
                await fetchReferenceImageUsageForItem(itemId);
            }
        };
        preloadReferenceImageUsageCounts();
        return () => {
            cancelled = true;
        };
    }, [showRefImageUsageBadge, items, referenceImageUsageCountByItemId]);

    const handleOpenReferenceImageUsage = async (e: React.MouseEvent, item: ItemWithCurrentRevision) => {
        e.stopPropagation();
        const files = await fetchReferenceImageUsageForItem(item.id);
        if (files.length === 0) {
            setIngestNotice('No Reference Image usage found for this artifact.');
            return;
        }
        setActiveReferenceImageUsageItemId(item.id);
    };

    const activeReferenceImageUsageFiles = useMemo(
        () => activeReferenceImageUsageItemId ? (referenceImageUsageFilesByItemId[activeReferenceImageUsageItemId] || []) : [],
        [activeReferenceImageUsageItemId, referenceImageUsageFilesByItemId]
    );
    const activeReferenceImageUsageTitle = useMemo(() => {
        if (!activeReferenceImageUsageItemId) return 'Ref Image Usage Gallery';
        const srcItem = items.find((entry) => entry.id === activeReferenceImageUsageItemId);
        const srcTitle = srcItem?.currentRevision?.title || srcItem?.currentRevision?.originalFilename || activeReferenceImageUsageItemId.slice(0, 8);
        return `Ref Image Usage • ${srcTitle}`;
    }, [activeReferenceImageUsageItemId, items]);

    useEffect(() => {
        let cancelled = false;
        const loadReferencedInIdsFromSource = async () => {
            if (!isOpen || !sourceItemId) {
                setFetchedReferencedInIds([]);
                return;
            }
            try {
                const refs = await api.items.referencedBy(sourceItemId);
                if (cancelled) return;
                setFetchedReferencedInIds(
                    Array.from(
                        new Set(
                            (refs || [])
                                .map((ref) => ref.parentItemId)
                                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                        )
                    )
                );
            } catch {
                if (!cancelled) setFetchedReferencedInIds([]);
            }
        };
        loadReferencedInIdsFromSource();
        return () => {
            cancelled = true;
        };
    }, [isOpen, sourceItemId]);

    useEffect(() => {
        let cancelled = false;
        const loadReferencedInProjects = async () => {
            if (!isOpen || normalizedReferencedInIds.length === 0) {
                setReferencedInProjectIds(new Set());
                return;
            }
            try {
                const resolvedItems = await api.items.resolve(normalizedReferencedInIds);
                if (cancelled) return;
                const nextProjectIds = new Set(
                    (resolvedItems || [])
                        .filter((entry) => isActiveItem(entry))
                        .map((entry) => entry.projectId)
                        .filter(Boolean)
                );
                setReferencedInProjectIds(nextProjectIds);
            } catch {
                if (!cancelled) {
                    setReferencedInProjectIds(new Set());
                }
            }
        };
        loadReferencedInProjects();
        return () => {
            cancelled = true;
        };
    }, [isOpen, normalizedReferencedInIds]);

    const handleProjectSelect = async (project: Project) => {
        setLoading(true);
        setSelectedProject(project);
        try {
            const projectItems = await api.items.list(project.id);
            const mediaItems = projectItems.filter(item =>
                isActiveItem(item) &&
                matchesMediaType(
                    mediaType,
                    item.currentRevision?.mimeType,
                    item.currentRevision?.originalFilename || item.currentRevision?.title
                )
            );
            setItems(mediaItems);
            setStep('items');
        } catch (e) {
            console.error("Failed to load project items");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStudioPin = (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation();
        const next = new Set(studioPinnedIds);
        if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
        setStudioPinnedIds(next);
    };

    const getIngestMetadata = (isSystemArchive: boolean) => {
        const shouldMarkReference =
            ingestContext === 'reference' ||
            ingestContext === 'mosaic' ||
            ingestContext === 'matrix' ||
            (isSystemArchive && ingestContext === 'main');

        if (!shouldMarkReference) return {};

        return {
            engine: 'reference',
            aiParameters: JSON.stringify(
                {
                    source: `selector_ingest_${ingestContext}`,
                    isReference: true,
                    labContentUpload: isSystemArchive
                },
                null,
                2
            )
        };
    };

    const processFiles = async (files: FileList | File[]) => {
        const filesArray = Array.isArray(files) ? files : Array.from(files || []);
        const mediaFiles = filesArray.filter((file) =>
            matchesMediaType(mediaType, file?.type, file?.name)
        );
        const skippedCount = filesArray.length - mediaFiles.length;
        const filesToProcess = allowMultiple ? mediaFiles : mediaFiles.slice(0, 1);
        const singleSelectExtraCount = allowMultiple ? 0 : Math.max(0, mediaFiles.length - filesToProcess.length);

        if (filesToProcess.length === 0) {
            setIngestNotice(`Only ${mediaType} files are supported in Neural Ingest Zone.`);
            return;
        }

        setLoading(true);
        try {
            let targetProjId = selectedProject?.id;
            let isSystemArchive = false;
            if (!targetProjId) {
                const archive = await fetch('/api/projects/archive', {
                    headers: api.auth.getAuthHeaders()
                }).then(r => r.json());
                targetProjId = archive.id;
                isSystemArchive = true;
                if (archive?.id) setArchiveProjectId(archive.id);
            } else if (archiveProjectId && targetProjId === archiveProjectId) {
                isSystemArchive = true;
            }

            if (!targetProjId) return;

            const metadata = getIngestMetadata(isSystemArchive);
            const createdIds: string[] = [];

            for (const file of filesToProcess) {
                const newItem = await api.items.create(targetProjId, file, () => {}, metadata);
                if (newItem?.id) createdIds.push(newItem.id);
            }

            if (createdIds.length > 0) onSelect(createdIds);
            if (singleSelectExtraCount > 0) {
                setIngestNotice(`Only one ${mediaType} file can be ingested here. Using the first supported file.`);
            } else if (skippedCount > 0) {
                setIngestNotice(`Skipped ${skippedCount} non-${mediaType} file${skippedCount > 1 ? 's' : ''}.`);
            } else {
                setIngestNotice(null);
            }
        } catch (e) {
            console.error("Neural drop ingest failed");
            setIngestNotice('Ingest failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        
        const internalId = e.dataTransfer.getData('application/x-aimana-asset');
        if (internalId) {
            const item = await api.items.get(internalId);
            const isAllowed = isActiveItem(item) && matchesMediaType(
                mediaType,
                item?.currentRevision?.mimeType,
                item?.currentRevision?.originalFilename || item?.currentRevision?.title
            );
            if (isAllowed) {
                onSelect([internalId]);
            } else {
                setIngestNotice(`Deleted or unsupported items cannot be ingested here.`);
            }
            return;
        }

        const files = e.dataTransfer.files;
        processFiles(files);
    };

    const filteredList = useMemo(() => {
        const query = searchTerm.toLowerCase();
        if (step === 'projects') {
            const filtered = projects
                .filter((p) => isActiveProject(p))
                .filter((p) => p.name.toLowerCase().includes(query))
                .filter((p) => scopeFilter === 'referencedIn' ? referencedInProjectIds.has(p.id) : true);
            // Sort by Studio Pin status, then by global pin status, then updated
            return [...filtered].sort((a, b) => {
                const aNeuralSaved = archiveProjectId && a.id === archiveProjectId ? 1 : 0;
                const bNeuralSaved = archiveProjectId && b.id === archiveProjectId ? 1 : 0;
                if (aNeuralSaved !== bNeuralSaved) return bNeuralSaved - aNeuralSaved;

                const aStudioPinned = studioPinnedIds.has(a.id) ? 1 : 0;
                const bStudioPinned = studioPinnedIds.has(b.id) ? 1 : 0;
                if (aStudioPinned !== bStudioPinned) return bStudioPinned - aStudioPinned;
                
                const aGlobalPinned = a.isPinned ? 1 : 0;
                const bGlobalPinned = b.isPinned ? 1 : 0;
                if (aGlobalPinned !== bGlobalPinned) return bGlobalPinned - aGlobalPinned;
                
                return b.updatedAt - a.updatedAt;
            });
        }
        return items
            .filter((item) => isActiveItem(item))
            .filter((item) => {
                const title = String(item.currentRevision?.title || item.currentRevision?.originalFilename || '').toLowerCase();
                return title.includes(query);
            })
            .filter((item) => scopeFilter === 'referencedIn' ? referencedInIdSet.has(item.id) : true)
            .filter((item) => {
                if (scopeFilter === 'neuralReferences') return isNeuralReferenceItem(item);
                if (scopeFilter === 'linkedArtifacts') return isLinkedArtifactItem(item);
                if (scopeFilter === 'hasNeuralReferences') return hasNeuralReferences(item);
                if (scopeFilter === 'hasNoLinkedArtifacts') return hasNoLinkedArtifacts(item);
                return true;
            });
    }, [archiveProjectId, projects, items, searchTerm, step, studioPinnedIds, scopeFilter, referencedInProjectIds, referencedInIdSet]);

    const toggleItemSelection = (id: string) => {
        if (!allowMultiple) {
            setSelectedIds((current) => (current.has(id) ? new Set() : new Set([id])));
            return;
        }
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (!allowMultiple) return;
        if (selectedIds.size === filteredList.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredList.map(i => i.id)));
        }
    };

    const handleConfirmSelection = () => {
        if (selectedIds.size > 0) {
            onSelect(Array.from(selectedIds));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-0 md:p-8 bg-black/95 backdrop-blur-xl animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-[#050505] border border-white/10 w-full h-full rounded-none shadow-[0_0_120px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden ring-1 ring-white/10 animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                <div 
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    className={`h-48 border-b transition-all flex flex-col items-center justify-center gap-4 relative overflow-hidden ${
                        isDragOver ? 'bg-indigo-600/20 border-indigo-500' : 'bg-slate-900/10 border-white/5'
                    }`}
                >
                    <div className={`p-4 rounded-[2rem] border-2 border-dashed transition-all ${isDragOver ? 'bg-indigo-600 border-white scale-110' : 'bg-black/40 border-slate-800 text-slate-700'}`}>
                        {isAudioMode
                            ? <AudioLines size={48} className={isDragOver ? 'text-white' : 'text-slate-700'} />
                            : <UploadCloud size={48} className={isDragOver ? 'text-white' : 'text-slate-700'} />}
                    </div>
                    <div className="text-center">
                        <h4 className={`text-lg font-black uppercase tracking-widest ${isDragOver ? 'text-indigo-400' : 'text-slate-500'}`}>Neural Ingest Zone</h4>
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter mt-1 mb-3">
                            Drop {isAudioMode ? 'audio files' : 'items'} here or use manual selector
                        </p>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 mx-auto transition-all"
                        >
                            <Plus size={12} /> {isAudioMode ? 'Browse Audio' : 'Browse Binary'}
                        </button>
                        {ingestNotice && (
                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-300 mt-2">
                                {ingestNotice}
                            </p>
                        )}
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple={allowMultiple}
                        accept={mediaAccept}
                        onChange={(e) => {
                            if (e.target.files) processFiles(e.target.files);
                            e.target.value = '';
                        }} 
                    />
                </div>

                <div className="p-4 border-b border-white/5 bg-slate-900/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        {step === 'items' ? (
                            <button 
                                onClick={() => setStep('projects')}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all shadow-lg active:scale-90"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        ) : (
                            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
                                <Database size={20} />
                            </div>
                        )}
                        <div>
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">
                                {step === 'projects' ? 'All Workspaces' : `Artifacts: ${selectedProject?.name}`}
                            </h3>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-all active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="px-6 py-4 bg-black/60 border-b border-white/5 shrink-0 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="relative group flex-1 w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={18} />
                        <input 
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={step === 'projects' ? "Filter full project registry..." : "Filter artifacts by title..."}
                            className="w-full bg-[#111] border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all font-medium shadow-inner"
                        />
                    </div>

                    {(hasReferencedInFilter || hasRoleFilters) && (
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <button
                                onClick={() => setScopeFilter('all')}
                                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    scopeFilter === 'all'
                                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setScopeFilter('referencedIn')}
                                disabled={normalizedReferencedInIds.length === 0}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    scopeFilter === 'referencedIn'
                                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                <Link2 size={12} />
                                Referenced In ({step === 'projects' ? referencedInProjectIds.size : referencedInItemCountInCurrentProject})
                            </button>
                            {hasRoleFilters && (
                                <button
                                    onClick={() => setScopeFilter('neuralReferences')}
                                    disabled={neuralReferenceCountInCurrentProject === 0}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        scopeFilter === 'neuralReferences'
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Neural References ({neuralReferenceCountInCurrentProject})
                                </button>
                            )}
                            {hasRoleFilters && (
                                <button
                                    onClick={() => setScopeFilter('linkedArtifacts')}
                                    disabled={linkedArtifactCountInCurrentProject === 0}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        scopeFilter === 'linkedArtifacts'
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Linked Artifacts ({linkedArtifactCountInCurrentProject})
                                </button>
                            )}
                            {hasRoleFilters && (
                                <button
                                    onClick={() => setScopeFilter('hasNeuralReferences')}
                                    disabled={hasNeuralReferencesCountInCurrentProject === 0}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        scopeFilter === 'hasNeuralReferences'
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Has Neural References ({hasNeuralReferencesCountInCurrentProject})
                                </button>
                            )}
                            {hasRoleFilters && (
                                <button
                                    onClick={() => setScopeFilter('hasNoLinkedArtifacts')}
                                    disabled={hasNoLinkedArtifactsCountInCurrentProject === 0}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        scopeFilter === 'hasNoLinkedArtifacts'
                                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Has No Linked Artifacts ({hasNoLinkedArtifactsCountInCurrentProject})
                                </button>
                            )}
                        </div>
                    )}
                    
                    {allowMultiple && step === 'items' && filteredList.length > 0 && (
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <button 
                                onClick={toggleSelectAll}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${selectedIds.size === filteredList.length ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}
                            >
                                {selectedIds.size === filteredList.length ? <CheckSquare size={14} className="text-white" /> : <Square size={14} />}
                                <span>{selectedIds.size === filteredList.length ? 'Deselect All' : 'Select All'}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 relative overflow-hidden bg-[#080808]">
                    <div className="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-6 text-slate-700">
                                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Syncing Registry...</span>
                            </div>
                        ) : filteredList.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-20 space-y-4">
                                <div className="p-6 bg-slate-900 rounded-[2rem] border border-slate-800">
                                    <LayoutGrid size={48} strokeWidth={1} />
                                </div>
                                <div>
                                    <p className="text-lg font-black uppercase tracking-[0.2em] text-white">Registry Empty</p>
                                    <p className="text-[10px] mt-2 max-w-xs leading-relaxed font-bold uppercase tracking-widest text-slate-500">No matches found in the current cluster.</p>
                                </div>
                            </div>
                        ) : step === 'projects' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                                {filteredList.map((project: any) => {
                                    const isStudioPinned = studioPinnedIds.has(project.id);
                                    const isNeuralSavedProject = !!archiveProjectId && project.id === archiveProjectId;
                                    return (
                                        <button
                                            key={project.id}
                                            onClick={() => handleProjectSelect(project)}
                                            className={`p-6 rounded-3xl bg-slate-900/40 border text-left transition-all group relative overflow-hidden active:scale-[0.98] shadow-2xl ${
                                                isStudioPinned ? 'border-indigo-500/40 ring-1 ring-indigo-500/10' : project.isArchived ? 'border-red-900/20 opacity-70' : 'border-white/5 hover:border-indigo-500/40'
                                            }`}
                                        >
                                            <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ backgroundColor: project.color }} />
                                            
                                            <div className="absolute top-4 right-4 z-20">
                                                <button 
                                                    onClick={(e) => handleToggleStudioPin(e, project.id)}
                                                    className={`p-2 rounded-xl transition-all ${
                                                        isStudioPinned 
                                                        ? 'bg-indigo-600 text-white shadow-lg' 
                                                        : 'bg-black/40 text-slate-600 hover:text-white hover:bg-slate-800 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                    title={isStudioPinned ? "Remove Studio Pin" : "Add Studio Pin"}
                                                >
                                                    <Pin size={14} className={isStudioPinned ? 'fill-current' : ''} />
                                                </button>
                                            </div>

                                            <div className="relative z-10 space-y-3">
                                                <div className="pr-8">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-md font-black text-white uppercase tracking-tight truncate leading-none">{project.name}</h4>
                                                        {isNeuralSavedProject && (
                                                            <span className="text-[7px] font-black bg-indigo-500/20 text-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wider border border-indigo-400/30">
                                                                Neural Saved
                                                            </span>
                                                        )}
                                                        {!!project.isArchived && <span className="text-[7px] font-black bg-red-900/40 text-red-500 px-1 rounded uppercase tracking-tighter border border-red-900/30">Archived</span>}
                                                    </div>
                                                    <p className="text-[8px] text-indigo-400/80 font-black uppercase tracking-[0.2em] mt-1">
                                                        {isNeuralSavedProject ? 'Neural Saved Archive' : project.storageType}
                                                    </p>
                                                </div>
                                                <p className="text-[10px] text-slate-500 line-clamp-2 italic leading-relaxed min-h-[30px] opacity-80">{project.description || 'No descriptive metadata.'}</p>
                                                <div className="pt-3 flex items-center justify-between border-t border-white/5">
                                                    <span className="text-[7px] font-black uppercase tracking-widest text-slate-600">Open cluster</span>
                                                    <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                                        <ArrowRight size={14} />
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
                                {filteredList.map((item: any) => {
                                    const isSelected = selectedIds.has(item.id);
                                    const fileUrl = String(item.currentRevision?.fileUrl || item.currentRevision?.thumbnailLink || '');
                                    const title = item.currentRevision?.title || item.currentRevision?.originalFilename || `Node ${String(item.id || '').substring(0, 6)}`;
                                    const mimeType = String(item.currentRevision?.mimeType || '').toLowerCase();
                                    const referenceImageUsageCount = referenceImageUsageCountByItemId[item.id] ?? 0;
                                    const isReferenceImageUsageLoading = referenceImageUsageLoadingIds.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleItemSelection(item.id)}
                                            className={`group relative aspect-square rounded-[1.5rem] overflow-hidden border transition-all cursor-pointer shadow-2xl ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/20 scale-[0.96]' : 'border-white/5 hover:border-indigo-500/40'}`}
                                        >
                                            {isAudioMode ? (
                                                <div className={`h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 p-4 transition-all duration-700 ${isSelected ? 'opacity-100 scale-100' : 'opacity-85 group-hover:opacity-100 group-hover:scale-105'}`}>
                                                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                                                        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-indigo-300">
                                                            <AudioLines size={26} />
                                                        </div>
                                                        <p className="line-clamp-2 text-[11px] font-semibold text-slate-200">{title}</p>
                                                        <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">{mimeType || 'audio'}</p>
                                                    </div>
                                                </div>
                                            ) : fileUrl ? (
                                                <img
                                                    src={fileUrl}
                                                    className={`w-full h-full object-cover transition-all duration-700 ${isSelected ? 'opacity-100 scale-100' : 'opacity-70 group-hover:opacity-100 group-hover:scale-105'}`}
                                                    alt={title}
                                                />
                                            ) : (
                                                <div className="h-full w-full bg-slate-900/70 flex items-center justify-center text-slate-500">
                                                    <FileImage size={28} />
                                                </div>
                                            )}
                                             
                                            {/* Manifest Title Label Bar - Permanently Visible */}
                                            <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-md px-3 py-2 border-t border-white/10 flex flex-col justify-center">
                                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate leading-tight">
                                                    {title}
                                                </span>
                                                <div className="flex items-center justify-between mt-0.5">
                                                    <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">{mediaTagLabel}</span>
                                                    <span className="text-[7px] font-mono text-slate-600">NODE_{item.id.substring(0, 6)}</span>
                                                </div>
                                            </div>

                                            <div className="absolute top-3 right-3">
                                                <div className={`p-1.5 rounded-lg border transition-all shadow-2xl ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white animate-in zoom-in' : 'bg-black/40 backdrop-blur-md border-white/10 text-transparent'}`}>
                                                    <Check size={12} strokeWidth={4} />
                                                </div>
                                            </div>

                                            {showRefImageUsageBadge && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { void handleOpenReferenceImageUsage(e, item); }}
                                                    className="absolute top-3 left-3 z-30 rounded-lg border border-emerald-400/60 bg-emerald-600/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-xl hover:bg-emerald-500 transition-all"
                                                    title="Open Reference Image usage"
                                                >
                                                    Ref Image (
                                                    <span className={
                                                        isReferenceImageUsageLoading
                                                            ? 'text-white'
                                                            : (referenceImageUsageCount > 0 ? 'text-amber-200' : 'text-slate-200')
                                                    }>
                                                        {isReferenceImageUsageLoading ? '...' : referenceImageUsageCount}
                                                    </span>
                                                    )
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-white/5 bg-slate-900/30 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 relative z-10">
                    <div className="flex items-center gap-3 text-slate-500">
                        <Info size={14} className="text-indigo-400" />
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                            {step === 'projects' ? 'Pins in this selector are separate from sidebar favorites.' : 'Confirm artifact selection for studio ingestion.'}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-4 animate-in slide-in-from-right-8 duration-500">
                                <div className="text-right">
                                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">{selectedIds.size} {selectedMediaLabel}</span>
                                </div>
                                <button 
                                    onClick={handleConfirmSelection}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95 border border-indigo-400/30"
                                >
                                    Confirm Ingest
                                </button>
                            </div>
                        )}
                        <button 
                            onClick={onClose}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>

            <MosaicViewerModal
                isOpen={!!activeReferenceImageUsageItemId}
                onClose={() => setActiveReferenceImageUsageItemId(null)}
                files={activeReferenceImageUsageFiles}
                title={activeReferenceImageUsageTitle}
                initialIndex={null}
            />
        </div>
    );
};
