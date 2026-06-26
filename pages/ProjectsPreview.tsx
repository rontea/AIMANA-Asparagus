import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { Project, ItemWithCurrentRevision } from '../types';
import { LayoutGrid, ChevronDown, Sparkles, Search, Maximize2, Loader2, ArrowLeft, ChevronLeft, ChevronRight, X, Info, ZoomIn, ZoomOut, RotateCcw, Play, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ItemDetailModal from '../components/item/ItemDetailModal';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';

const hasThumbnailBlur = (item: ItemWithCurrentRevision | null | undefined): boolean => {
    const raw = item?.currentRevision?.aiParameters;
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        const advancedParams = parsed?.advanced_params || parsed || {};
        return !!(advancedParams.thumbnailBlur || parsed?.thumbnailBlur);
    } catch {
        return false;
    }
};

const GALLERY_RENDER_BATCH_SIZE = 60;
const GALLERY_PRELOAD_AHEAD = 30;
const REVISION_FETCH_CONCURRENCY = 8;

const resolveGalleryPreviewUrl = (item: ItemWithCurrentRevision): string => (
    item.currentRevision?.thumbnailLink || item.currentRevision?.fileUrl || ''
);

const ProjectsPreview: React.FC = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [allItems, setAllItems] = useState<ItemWithCurrentRevision[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [inspectedItem, setInspectedItem] = useState<ItemWithCurrentRevision | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [movingItems, setMovingItems] = useState<ItemWithCurrentRevision[]>([]);
    const [targetProjectId, setTargetProjectId] = useState<string>('');
    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [visibleCount, setVisibleCount] = useState(GALLERY_RENDER_BATCH_SIZE);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const preloadedUrlsRef = useRef<Set<string>>(new Set());
    const preloaderRefs = useRef<HTMLImageElement[]>([]);
    
    // Lightbox State
    const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
    const [zoomScale, setZoomScale] = useState(1);
    const [isAutoPlaying, setIsAutoPlaying] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            setLoading(true);
            setAllItems([]);
            try {
                const [projList, itemsList] = await Promise.all([
                    api.projects.list(),
                    fetch('/api/items', { headers: api.auth.getAuthHeaders() }).then(r => r.json())
                ]);
                
                if (cancelled) return;
                setProjects(projList);

                const activeItems = itemsList.filter((i: any) => !i.isArchived);
                for (let start = 0; start < activeItems.length; start += REVISION_FETCH_CONCURRENCY) {
                    const batch = activeItems.slice(start, start + REVISION_FETCH_CONCURRENCY);
                    const populated = await Promise.all(batch.map(async (item: any) => {
                        if (item.currentRevisionId) {
                            try {
                                const rev = await fetch(`/api/revisions/${item.currentRevisionId}`, { headers: api.auth.getAuthHeaders() }).then(r => r.json());
                                return { ...item, currentRevision: rev };
                            } catch (e) { return item; }
                        }
                        return item;
                    }));

                    if (cancelled) return;
                    const withRevisions = populated.filter(i => i.currentRevision);
                    if (withRevisions.length > 0) {
                        setAllItems(prev => [...prev, ...withRevisions]);
                    }
                    if (start === 0) setLoading(false);
                }
            } catch (e) {
                console.error("Gallery sync failed", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        loadData();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!targetProjectId && projects.length > 0) {
            setTargetProjectId(projects[0].id);
        }
    }, [projects, targetProjectId]);

    const filteredItems = useMemo(() => {
        return allItems.filter(item => {
            const matchesProject = selectedProjectId === 'all' || item.projectId === selectedProjectId;
            const matchesSearch = !searchTerm || item.currentRevision?.prompt.toLowerCase().includes(searchTerm.toLowerCase()) || item.currentRevision?.title.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesProject && matchesSearch;
        }).sort((a, b) => b.updatedAt - a.updatedAt);
    }, [allItems, selectedProjectId, searchTerm]);

    useEffect(() => {
        setVisibleCount(GALLERY_RENDER_BATCH_SIZE);
        scrollContainerRef.current?.scrollTo({ top: 0 });
    }, [selectedProjectId, searchTerm]);

    useEffect(() => {
        if (!loadMoreRef.current || !scrollContainerRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            setVisibleCount((current) => Math.min(filteredItems.length, current + GALLERY_RENDER_BATCH_SIZE));
        }, {
            root: scrollContainerRef.current,
            rootMargin: '1200px 0px',
            threshold: 0.01
        });

        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [filteredItems.length]);

    const visibleItems = useMemo(
        () => filteredItems.slice(0, visibleCount),
        [filteredItems, visibleCount]
    );

    useEffect(() => {
        const nextUrls = filteredItems
            .slice(visibleCount, visibleCount + GALLERY_PRELOAD_AHEAD)
            .map(resolveGalleryPreviewUrl)
            .filter((url): url is string => Boolean(url) && !preloadedUrlsRef.current.has(url));

        if (nextUrls.length === 0) return;

        const preload = () => {
            const nextPreloaders: HTMLImageElement[] = [];
            nextUrls.forEach((url) => {
                preloadedUrlsRef.current.add(url);
                const img = new Image();
                img.decoding = 'async';
                img.loading = 'eager';
                img.src = url;
                nextPreloaders.push(img);
            });
            preloaderRefs.current = [...preloaderRefs.current.slice(-GALLERY_PRELOAD_AHEAD), ...nextPreloaders];
        };

        const idleHandle = 'requestIdleCallback' in window
            ? window.requestIdleCallback(preload, { timeout: 1200 })
            : globalThis.setTimeout(preload, 120);

        return () => {
            if ('cancelIdleCallback' in window && typeof idleHandle === 'number') {
                window.cancelIdleCallback(idleHandle);
            } else {
                globalThis.clearTimeout(idleHandle as number);
            }
        };
    }, [filteredItems, visibleCount]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (activeLightboxIndex === null) return;
        setActiveLightboxIndex((activeLightboxIndex + 1) % filteredItems.length);
        setZoomScale(1); // Reset zoom on nav
    }, [activeLightboxIndex, filteredItems.length]);

    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (activeLightboxIndex === null) return;
        setActiveLightboxIndex((activeLightboxIndex - 1 + filteredItems.length) % filteredItems.length);
        setZoomScale(1); // Reset zoom on nav
    }, [activeLightboxIndex, filteredItems.length]);

    // Neural Slideshow Effect
    useEffect(() => {
        let interval: any;
        if (isAutoPlaying && activeLightboxIndex !== null) {
            interval = setInterval(() => {
                handleNext();
            }, 4000); // 4 second delay
        }
        return () => clearInterval(interval);
    }, [isAutoPlaying, activeLightboxIndex, handleNext]);

    const handleZoomIn = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoomScale(prev => Math.min(prev + 0.5, 5));
    };

    const handleZoomOut = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoomScale(prev => Math.max(prev - 0.5, 0.5));
    };

    const handleResetZoom = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setZoomScale(1);
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (activeLightboxIndex === null) return;
        if (e.key === 'ArrowRight') handleNext();
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'Escape') { setActiveLightboxIndex(null); setIsAutoPlaying(false); }
        if (e.key === '=' || e.key === '+') handleZoomIn();
        if (e.key === '-') handleZoomOut();
        if (e.key === '0') handleResetZoom();
        if (e.key === ' ') { e.preventDefault(); setIsAutoPlaying(!isAutoPlaying); }
    }, [activeLightboxIndex, handleNext, handlePrev, isAutoPlaying]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleLightboxDragStart = (e: React.DragEvent, item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return;

        // Mark as internal app asset
        e.dataTransfer.setData('application/x-aimana-asset', item.id);

        const rawUrl = rev.fileUrl || (rev.blob ? URL.createObjectURL(rev.blob) : '');
        if (rawUrl) {
            // Absolute URL construction for external browser context
            const absoluteUrl = rawUrl.startsWith('http') 
                ? rawUrl 
                : window.location.origin + rawUrl;

            // 1. Cross-browser drag support (Link dragging)
            e.dataTransfer.setData('text/uri-list', absoluteUrl);
            e.dataTransfer.setData('text/plain', absoluteUrl);

            // 2. Desktop standard download protocol
            const dragData = `${rev.mimeType}:${rev.originalFilename}:${absoluteUrl}`;
            e.dataTransfer.setData('DownloadURL', dragData);
        }
    };

    const openLightbox = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveLightboxIndex(index);
        setZoomScale(1);
    };

    const activeLightboxItem = activeLightboxIndex !== null ? filteredItems[activeLightboxIndex] : null;

    const handleConfirmMove = async () => {
        if (!targetProjectId || movingItems.length === 0) return;
        setIsMoving(true);
        try {
            const sourceProjectIds = new Set<string>();
            for (const item of movingItems) {
                if (item.projectId) sourceProjectIds.add(item.projectId);
                await api.items.update({ id: item.id, projectId: targetProjectId, collectionId: null, isArchived: false });
            }

            sourceProjectIds.forEach((projectId) => {
                window.dispatchEvent(new CustomEvent('project-items-updated', {
                    detail: { projectId, reason: 'project-move-source' }
                }));
            });
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: targetProjectId, reason: 'project-move-target' }
            }));
            setAllItems(prev => prev.map(item => (
                movingItems.some(moving => moving.id === item.id)
                    ? { ...item, projectId: targetProjectId }
                    : item
            )));
            setInspectedItem(prev => (
                prev && movingItems.some(moving => moving.id === prev.id)
                    ? { ...prev, projectId: targetProjectId }
                    : prev
            ));
            setShowProjectSelector(false);
            setMovingItems([]);
        } catch (e) {
            console.error('Project move failed', e);
        } finally {
            setIsMoving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#050505] -m-4 sm:-m-6 lg:-m-8 animate-in fade-in duration-700">
            {/* Gallery Toolbar */}
            <div className="sticky top-0 z-40 bg-[#080808]/80 backdrop-blur-xl border-b border-white/5 px-6 md:px-10 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
                <div className="flex items-center gap-6 w-full md:w-auto">
                    <button onClick={() => navigate('/')} className="p-2 text-slate-500 hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="h-6 w-px bg-white/10 hidden md:block" />
                    <div className="relative group min-w-[240px]">
                        <select 
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="appearance-none w-full bg-slate-900 border border-slate-800 hover:border-indigo-500/50 text-white pl-10 pr-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest outline-none transition-all cursor-pointer shadow-lg shadow-black/40"
                        >
                            <option value="all">Entire Ecosystem</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none">
                            <LayoutGrid size={14} />
                        </div>
                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none group-hover:text-white transition-colors" />
                    </div>
                </div>

                <div className="relative w-full md:w-80 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={16} />
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search visual nodes..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-12 pr-4 text-xs text-white placeholder:text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all font-bold tracking-tight"
                    />
                </div>
            </div>

            {/* Neural Stream Container */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 relative">
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-700">
                        <Loader2 className="animate-spin text-indigo-500" size={48} />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">Calibrating Neural Stream...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4 py-40">
                        <Sparkles size={64} strokeWidth={1} />
                        <p className="text-xl font-black uppercase tracking-widest">Ecosystem Silent</p>
                        <p className="text-xs max-w-xs leading-relaxed">No artifacts match the current filter parameters.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
                        {visibleItems.map((item, index) => (
                            <div 
                                key={item.id}
                                onClick={() => setInspectedItem(item)}
                                className="group relative aspect-square bg-slate-900 rounded-[2rem] overflow-hidden border border-white/5 hover:border-indigo-500/40 hover:-translate-y-1 transition-all duration-500 cursor-pointer shadow-2xl"
                            >
                                <img 
                                    src={resolveGalleryPreviewUrl(item)} 
                                    className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105 ${hasThumbnailBlur(item) ? 'blur-md' : ''}`}
                                    alt="Artifact"
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority={index < 12 ? 'high' : 'low'}
                                    referrerPolicy="no-referrer"
                                />
                                
                                {/* Aesthetic Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-6">
                                    <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500 space-y-4">
                                        <p className="text-xs text-white font-bold line-clamp-2 italic drop-shadow-xl">
                                            "{item.currentRevision?.prompt}"
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full shadow-lg" style={{ backgroundColor: projects.find(p => p.id === item.projectId)?.color || '#6366f1' }} />
                                                <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">
                                                    {projects.find(p => p.id === item.projectId)?.name || 'Artifact'}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={(e) => openLightbox(index, e)}
                                                    className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white shadow-xl transition-transform active:scale-90"
                                                >
                                                    <Maximize2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {item.isPinned && (
                                    <div className="absolute top-4 right-4 p-1.5 bg-indigo-600 text-white rounded-full shadow-lg border border-white/10 animate-in zoom-in">
                                        <Sparkles size={10} className="fill-current" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {visibleCount < filteredItems.length && (
                            <div ref={loadMoreRef} className="col-span-full flex items-center justify-center py-10 text-slate-600">
                                <Loader2 className="mr-3 animate-spin text-indigo-500" size={18} />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">
                                    Loading {Math.min(GALLERY_RENDER_BATCH_SIZE, filteredItems.length - visibleCount)} more artifacts
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Lightbox Overlay */}
            {activeLightboxIndex !== null && activeLightboxItem && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300"
                    onClick={() => { setActiveLightboxIndex(null); setIsAutoPlaying(false); }}
                >
                    {/* Header Controls */}
                    <button 
                        onClick={(e) => { e.stopPropagation(); setActiveLightboxIndex(null); setIsAutoPlaying(false); }}
                        className="absolute top-8 right-8 p-3 text-white/40 hover:text-white transition-all hover:rotate-90 z-[110]"
                    >
                        <X size={32} />
                    </button>

                    {/* Nav Controls */}
                    <button 
                        onClick={handlePrev}
                        className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 md:p-6 text-white/20 hover:text-indigo-400 transition-all z-[110] group"
                    >
                        <ChevronLeft size={64} strokeWidth={1} className="group-hover:scale-110 transition-transform" />
                    </button>

                    <button 
                        onClick={handleNext}
                        className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 md:p-6 text-white/20 hover:text-indigo-400 transition-all z-[110] group"
                    >
                        <ChevronRight size={64} strokeWidth={1} className="group-hover:scale-110 transition-transform" />
                    </button>

                    {/* Floating Toolbar */}
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/5 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl z-[110] shadow-2xl animate-in slide-in-from-top-4" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsAutoPlaying(!isAutoPlaying); }}
                            className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${isAutoPlaying ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            title={isAutoPlaying ? "Stop Neural Slideshow" : "Start Neural Slideshow"}
                        >
                            {isAutoPlaying ? <Square size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}
                            {isAutoPlaying && <span className="text-[9px] font-black uppercase tracking-widest pr-1 animate-pulse">Live</span>}
                        </button>
                        <div className="w-px h-6 bg-white/10 mx-1" />
                        <button onClick={handleZoomOut} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><ZoomOut size={18} /></button>
                        <div className="px-3 min-w-[70px] text-center font-mono text-[10px] font-black text-indigo-400 uppercase tracking-tighter">
                            {Math.round(zoomScale * 100)}%
                        </div>
                        <button onClick={handleZoomIn} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><ZoomIn size={18} /></button>
                        <div className="w-px h-6 bg-white/10 mx-1" />
                        <button onClick={handleResetZoom} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all" title="Reset Zoom"><RotateCcw size={18} /></button>
                    </div>

                    {/* Image Container with Scroll Support for Pan */}
                    <div 
                        className="w-full h-full overflow-auto custom-scrollbar flex items-center justify-center select-none"
                        onClick={e => e.stopPropagation()}
                    >
                        <div 
                            className="relative transition-transform duration-200 ease-out flex items-center justify-center"
                            style={{ 
                                transform: `scale(${zoomScale})`,
                                cursor: zoomScale > 1 ? 'grab' : 'default',
                                minWidth: '100%',
                                minHeight: '100%'
                            }}
                        >
                            <img 
                                src={activeLightboxItem.currentRevision?.fileUrl || ''} 
                                className={`max-w-[90vw] max-h-[80vh] object-contain shadow-[0_0_100px_rgba(99,102,241,0.1)] rounded-2xl border border-white/5 ${zoomScale === 1 ? 'cursor-grab' : ''} ${hasThumbnailBlur(activeLightboxItem) ? 'blur-md' : ''}`}
                                alt="Full Preview"
                                draggable={true}
                                onDragStart={(e) => handleLightboxDragStart(e, activeLightboxItem)}
                            />
                        </div>
                    </div>

                    {/* Lightbox Footer Info */}
                    <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-[110] pointer-events-none" onClick={e => e.stopPropagation()}>
                        <div className="text-center space-y-1 pointer-events-auto">
                            <h4 className="text-white text-lg md:text-2xl font-black uppercase tracking-tight line-clamp-1 drop-shadow-2xl">
                                {activeLightboxItem.currentRevision?.title || "Untitled Artifact"}
                            </h4>
                            <p className="text-slate-400 text-xs md:text-sm max-w-2xl mx-auto line-clamp-2 leading-relaxed opacity-80 shadow-black drop-shadow-lg">
                                {activeLightboxItem.currentRevision?.prompt}
                            </p>
                        </div>
                        <div className="flex items-center justify-center gap-4 pt-2 pointer-events-auto">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 backdrop-blur-md rounded-full border border-white/10 shadow-xl">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: projects.find(p => p.id === activeLightboxItem.projectId)?.color }} />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {projects.find(p => p.id === activeLightboxItem.projectId)?.name}
                                </span>
                            </div>
                            <button 
                                onClick={() => {
                                    setInspectedItem(activeLightboxItem);
                                    setActiveLightboxIndex(null);
                                    setIsAutoPlaying(false);
                                }}
                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-white transition-colors bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20 shadow-xl"
                            >
                                <Info size={14} /> Inspect Metadata
                            </button>
                        </div>
                        {/* Counter */}
                        <div className="bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] shadow-xl mt-2">
                            {activeLightboxIndex + 1} / {filteredItems.length}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Registry */}
            {inspectedItem && (
                <ItemDetailModal 
                    isOpen={!!inspectedItem}
                    onClose={() => setInspectedItem(null)}
                    item={inspectedItem}
                    project={projects.find(p => p.id === inspectedItem.projectId) || ({} as Project)}
                    onUpdate={(u) => {
                        setAllItems(prev => prev.map(i => i.id === u.id ? u : i));
                        setInspectedItem(u);
                    }}
                    onOpenItem={setInspectedItem}
                    onDelete={(id) => {
                        setAllItems(prev => prev.filter(i => i.id !== id));
                        setInspectedItem(null);
                    }}
                    onRefreshHistory={() => {}}
                    onMove={(item) => {
                        setMovingItems([item]);
                        setTargetProjectId(item.projectId || projects[0]?.id || '');
                        setShowProjectSelector(true);
                    }}
                />
            )}

            {showProjectSelector && (
                <ProjectReassignModal
                    projects={projects}
                    selectedProjectId={targetProjectId}
                    onSelectProject={setTargetProjectId}
                    onConfirm={handleConfirmMove}
                    onCancel={() => { setShowProjectSelector(false); setMovingItems([]); }}
                    isMoving={isMoving}
                    title={movingItems.length > 1 ? `Move ${movingItems.length} Artifacts` : 'Move Artifact'}
                />
            )}
        </div>
    );
};

export default ProjectsPreview;

