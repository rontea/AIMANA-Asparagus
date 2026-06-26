import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useBlocker } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useImageCanvas, GridItem } from './hooks/useImageCanvas';
import { ArtifactSelectorModal } from './components/ArtifactSelectorModal';
import { ItemWithCurrentRevision } from '../../types';
import { useModalDialogs } from '../../hooks/useModalDialogs';

// Modular Components
import { LabHeader } from './components/LabHeader';
import { LabViewport } from './components/LabViewport';
import { LabSidebar } from './components/LabSidebar';

type LabView = 'ingest' | 'editor' | 'matrix';
type EditorTab = 'aesthetic' | 'spatial' | 'forge' | 'history';

const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_MAX_VIEWPORT_RATIO = 0.45;
const MIN_WORKSPACE_WIDTH = 540;

const AestheticLab: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const targetItemId = searchParams.get('itemId');
    const { confirm, confirmDialog } = useModalDialogs();

    const [loading, setLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [selectorMode, setSelectorMode] = useState<'main' | 'matrix'>('main');
    const [activeMatrixSlot, setActiveMatrixSlot] = useState<number | null>(null);
    const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
    const isSidebarResizingRef = useRef(false);
    
    // Core view state
    const [view, setView] = useState<LabView>(targetItemId ? 'editor' : 'ingest');
    const [activeTab, setActiveTab] = useState<EditorTab>('aesthetic');
    
    const [activeItem, setActiveItem] = useState<ItemWithCurrentRevision | null>(null);
    const [sessionArtifact, setSessionArtifact] = useState<ItemWithCurrentRevision | null>(null);

    const localUploadRef = useRef<HTMLInputElement>(null);
    const singleUploadRef = useRef<HTMLInputElement>(null);

    const clampSidebarWidth = useCallback((nextWidth: number) => {
        const viewportWidth = window.innerWidth || 1280;
        const maxByViewport = Math.floor(viewportWidth * SIDEBAR_MAX_VIEWPORT_RATIO);
        const maxByWorkspace = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - MIN_WORKSPACE_WIDTH);
        const maxAllowed = Math.max(
            SIDEBAR_MIN_WIDTH,
            Math.min(SIDEBAR_MAX_WIDTH, maxByViewport, maxByWorkspace)
        );
        return Math.max(SIDEBAR_MIN_WIDTH, Math.min(nextWidth, maxAllowed));
    }, []);

    const { 
        canvasElRef, image, loadImage, filters, updateFilter, resetAll,
        rotation, rotate, flipH, flipV, toggleFlip, zoom, setZoom, panOffset, isPanning, isSpaceHeld,
        currentDimensions, isCropping, cropRect, isResizingImage, resizeRect, isTransforming, imageTransform, startTransform, setTransformScale, setTransformX, setTransformY, resetTransform, getExportBlob, startCrop, setCropWidth, setCropHeight, applyCrop, cancelCrop, startResize, setResizeWidth, setResizeHeight, applyResize, cancelResize,
        canUndo, canRedo, undo, redo,
        snapshotHistory, restoreSnapshot,
        isGridMode, setIsGridMode, gridCols, setGridCols, gridRows, setGridRows,
        gridGutter, setGridGutter, gridCellWidth, setGridCellWidth, gridCellHeight, setGridCellHeight,
        gridItems, addGridItem, addGridItemsBatch, removeGridItem, hoveredSlot, setHoveredSlot, getSlotAt,
        handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp,
        activeHandle,
        isInpainting, setIsInpainting, brushSize, setBrushSize, isEraser, setIsEraser, clearMask
    } = useImageCanvas();

    const currentStateHash = useMemo(() => {
        if (view === 'editor') {
            return JSON.stringify({ filters, rotation, flipH, flipV, image: image?.src });
        }
        if (view === 'matrix') {
            return JSON.stringify({ 
                gridItemIds: Object.keys(gridItems), 
                gridCols, 
                gridRows, 
                gridCellWidth, 
                gridCellHeight 
            });
        }
        return '';
    }, [view, filters, rotation, flipH, flipV, image, gridItems, gridCols, gridRows, gridCellWidth, gridCellHeight]);

    const isDirty = useMemo(() => {
        if (view === 'ingest' || loading) return false;
        if (view === 'editor' && image) {
            const hasFilterChanges = filters.brightness !== 100 || filters.contrast !== 100 || 
                                   filters.saturate !== 100 || filters.grayscale !== 0 || 
                                   filters.invert !== 0 || filters.sepia !== 0 || 
                                   filters.blur !== 0 || filters.hueRotate !== 0 ||
                                   filters.temperature !== 0 || filters.tint !== 0 ||
                                   filters.vibrance !== 0 || filters.highlights !== 0 ||
                                   filters.shadows !== 0 || filters.clarity !== 0 ||
                                   filters.vignette !== 0 || filters.grain !== 0;
            const hasGeometryChanges = rotation !== 0 || flipH || flipV;
            return hasFilterChanges || hasGeometryChanges;
        }
        if (view === 'matrix') return Object.keys(gridItems).length > 0;
        return false;
    }, [view, filters, rotation, flipH, flipV, gridItems, image, loading]);

    // Closing the active lab session without committing should always warn.
    const hasActiveSession = useMemo(() => {
        if (view === 'ingest' || loading) return false;
        return image !== null || Object.keys(gridItems).length > 0;
    }, [view, loading, image, gridItems]);

    const pendingConfirmRef = useRef(false);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasActiveSession && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state !== 'blocked') return;
        if (pendingConfirmRef.current) return;
        pendingConfirmRef.current = true;
        let cancelled = false;

        (async () => {
            const confirmed = await confirm({
                title: 'Discard unsaved laboratory progress?',
                description: 'Any uncommitted edits in the lab will be lost.',
                confirmLabel: 'Discard Changes',
                cancelLabel: 'Keep Editing',
                tone: 'danger'
            });
            if (cancelled) return;
            pendingConfirmRef.current = false;
            if (confirmed) blocker.proceed(); else blocker.reset();
        })();

        return () => {
            cancelled = true;
            pendingConfirmRef.current = false;
        };
    }, [blocker, confirm]);

    const handleSafeBack = async () => {
        if (hasActiveSession) {
            const confirmed = await confirm({
                title: 'Close without saving?',
                description: 'If you close now, your lab progress will be lost.',
                confirmLabel: 'Close Lab',
                cancelLabel: 'Keep Working',
                tone: 'danger'
            });
            if (!confirmed) return;
        }
        if (view === 'ingest') navigate('/extensions');
        else {
            resetAll();
            setSessionArtifact(null); 
            setActiveItem(null);
            setView('ingest');
            setSearchParams({});
        }
    };

    useEffect(() => {
        const loadAsset = async () => {
            if (!targetItemId) return;
            setLoading(true);
            setView('editor');
            setIsGridMode(false);
            try {
                const item = await api.items.get(targetItemId);
                if (item?.currentRevision?.fileUrl) {
                    setActiveItem(item);
                    await loadImage(item.currentRevision.fileUrl, true);
                }
            } catch (e) {
                console.error("Artifact sync failure");
            } finally {
                setLoading(false);
            }
        };
        loadAsset();
    }, [targetItemId, loadImage, setIsGridMode]);

    const handleArtifactSelect = async (itemIds: string[]) => {
        setIsSelectorOpen(false);
        setLoading(true);
        try {
            if (selectorMode === 'main' && itemIds[0]) {
                const item = await api.items.get(itemIds[0]);
                if (item?.currentRevision?.fileUrl) {
                    setSearchParams({ itemId: itemIds[0] });
                    setActiveItem(item);
                    await loadImage(item.currentRevision.fileUrl, true);
                    setView('editor');
                    setIsGridMode(false);
                    setSessionArtifact(null); 
                }
            } else if (selectorMode === 'matrix') {
                const resolvedItems = [];
                // Fixed: Corrected malformed for-of loop (id of id of itemIds) by removing redundant 'id of'
                for (const id of itemIds) {
                    const item = await api.items.get(id);
                    if (item?.currentRevision?.fileUrl) {
                        resolvedItems.push({ id, url: item.currentRevision.fileUrl });
                    }
                }
                if (activeMatrixSlot !== null && resolvedItems[0]) {
                    await addGridItem(activeMatrixSlot, resolvedItems[0].id, resolvedItems[0].url);
                } else {
                    await addGridItemsBatch(resolvedItems);
                }
                setView('matrix');
                setIsGridMode(true);
            }
        } catch (e) {
            console.error("Selection processing error");
        } finally {
            setLoading(false);
        }
    };

    const handleRefineMatrixItem = async (item: GridItem) => {
        if (!item.id || item.id.startsWith('local-')) {
            setLoading(true);
            await loadImage(item.url, true);
            setView('editor');
            setIsGridMode(false);
            setSearchParams({});
            setLoading(false);
            return;
        }
        setSearchParams({ itemId: item.id });
    };

    const handleCommitResult = async () => {
        if (!canvasElRef.current) return;
        setCommitting(true);
        try {
            const blob = await getExportBlob();
            if (!blob) throw new Error('Export rendering failed.');
            const file = new File([blob], `aesthetic_${Date.now()}.png`, { type: 'image/png' });
            const isMatrix = view === 'matrix' || (isGridMode && Object.keys(gridItems).length > 0);
            const matrixLabel = isMatrix ? 'Lab content MC ' : undefined;
            
            const metadata = {
                source: 'aesthetic_lab', 
                appliedFilters: filters,
                geometry: { rotation, flipH, flipV, transform: imageTransform },
                gridTopology: view === 'matrix' ? { cols: gridCols, rows: gridRows, gutter: gridGutter } : null,
                sourceItemId: targetItemId || activeItem?.id || null,
                matrixComposition: isMatrix,
                matrixLabel: matrixLabel || undefined
            };
            // Always stage commits in Lab Content (archive project), never write directly to source project artifacts.
            const revisionId = sessionArtifact?.currentRevisionId || sessionArtifact?.currentRevision?.id;
            if (sessionArtifact && revisionId) {
                await api.revisions.replaceFile(revisionId, file);
                await api.revisions.update({ 
                    id: revisionId, 
                    aiParameters: JSON.stringify(metadata, null, 2),
                    ...(isMatrix ? { label: matrixLabel } : {})
                });
                setSaveSuccess("Lab manifest updated.");
            } else {
                const archive = await fetch('/api/projects/archive', { headers: api.auth.getAuthHeaders() }).then(r => r.json());
                if (!archive?.id) throw new Error("Archive unavailable.");
                const newItem = await api.items.create(archive.id, file, () => {}, {
                    title: view === 'matrix'
                        ? `Matrix ${gridCols}x${gridRows}`
                        : `Refined: ${activeItem?.currentRevision?.title || `Lab Artifact ${Date.now()}`}`,
                    label: matrixLabel || '',
                    aiParameters: JSON.stringify(metadata, null, 2)
                });
                setSessionArtifact(newItem);
                setSaveSuccess("Saved to Lab Content.");
            }
            setTimeout(() => setSaveSuccess(null), 3000);
        } catch (e) {
            console.error("Save failure", e);
        } finally {
            setCommitting(false);
        }
    };

    const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
        if (!isGridMode || !canvasElRef.current) return;
        e.preventDefault();
        const canvas = canvasElRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        const slotIdx = getSlotAt(mouseX, mouseY);
        setHoveredSlot(slotIdx);
    }, [isGridMode, getSlotAt, setHoveredSlot]);

    const handleCanvasDragLeave = useCallback(() => {
        setHoveredSlot(null);
    }, [setHoveredSlot]);

    const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
        if (!isGridMode || !canvasElRef.current) return;
        e.preventDefault();
        setHoveredSlot(null);
        
        const canvas = canvasElRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        const slotIdx = getSlotAt(mouseX, mouseY);
        if (slotIdx === null) return;

        setLoading(true);
        try {
            // Case 1: Internal App Asset
            const internalId = e.dataTransfer.getData('application/x-aimana-asset');
            if (internalId) {
                const item = await api.items.get(internalId);
                if (item?.currentRevision?.fileUrl) {
                    await addGridItem(slotIdx, internalId, item.currentRevision.fileUrl);
                    setLoading(false);
                    return;
                }
            }

            // Case 2: External File
            const files = e.dataTransfer.files;
            if (files && files[0] && files[0].type.startsWith('image/')) {
                const url = URL.createObjectURL(files[0]);
                await addGridItem(slotIdx, `local-${Date.now()}`, url);
            }
        } catch (e) {
            console.error("Drop processing failed");
        } finally {
            setLoading(false);
        }
    }, [isGridMode, getSlotAt, addGridItem]);

    const beginSidebarResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isSidebarResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const handlePointerMove = (e: MouseEvent) => {
            if (!isSidebarResizingRef.current) return;
            const nextWidth = window.innerWidth - e.clientX;
            setSidebarWidth(clampSidebarWidth(nextWidth));
        };

        const stopResize = () => {
            if (!isSidebarResizingRef.current) return;
            isSidebarResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        const handleWindowResize = () => {
            setSidebarWidth(prev => clampSidebarWidth(prev));
        };

        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', stopResize);
        window.addEventListener('resize', handleWindowResize);
        return () => {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('mouseup', stopResize);
            window.removeEventListener('resize', handleWindowResize);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [clampSidebarWidth]);

    return (
        <div className="flex flex-col h-full bg-[#050505] -m-4 sm:-m-6 lg:-m-8">
            <LabHeader 
                onBack={handleSafeBack}
                onReset={() => { resetAll(); setSessionArtifact(null); setActiveItem(null); setView('ingest'); setSearchParams({}); }}
                onCommit={handleCommitResult}
                onUndo={() => void undo()}
                onRedo={() => void redo()}
                canUndo={canUndo}
                canRedo={canRedo}
                isCommitting={committing}
                canCommit={image !== null || Object.keys(gridItems).length > 0}
                view={view}
            />

            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    <LabViewport 
                        canvasRef={canvasElRef}
                        imageLoaded={image !== null}
                        isGridMode={isGridMode}
                        loading={loading}
                        zoom={zoom}
                        setZoom={setZoom}
                        panOffset={panOffset}
                        isPanning={isPanning}
                        isSpaceHeld={isSpaceHeld}
                        dimensions={currentDimensions}
                        isCropping={isCropping}
                        isTransforming={isTransforming}
                        isResizingImage={isResizingImage}
                        isInpainting={isInpainting}
                        brushSize={brushSize}
                        onCancelCrop={cancelCrop}
                        onApplyCrop={applyCrop}
                        onOpenProject={() => { setSelectorMode('main'); setIsSelectorOpen(true); }}
                        onUploadLocal={() => singleUploadRef.current?.click()}
                        onSwitchToEditor={() => { setView('editor'); setIsGridMode(false); }}
                        onSwitchToMatrix={() => { setView('matrix'); setIsGridMode(true); setSessionArtifact(null); }}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseMove={handleCanvasMouseMove}
                        onMouseUp={handleCanvasMouseUp}
                        onDragOver={handleCanvasDragOver}
                        onDragLeave={handleCanvasDragLeave}
                        onDrop={handleCanvasDrop}
                        isIngest={view === 'ingest'}
                        view={view}
                        isSelectorOpen={isSelectorOpen}
                        activeHandle={activeHandle}
                    />

                    {isSelectorOpen && (
                        <ArtifactSelectorModal 
                            isOpen={isSelectorOpen}
                            onClose={() => setIsSelectorOpen(false)}
                            ingestContext={selectorMode === 'matrix' ? 'matrix' : 'main'}
                            onSelect={handleArtifactSelect}
                        />
                    )}

            {saveSuccess && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 animate-in slide-in-from-top-4 z-50">
                    <CheckCircle size={18} /> {saveSuccess}
                </div>
            )}
                </div>

                {view !== 'ingest' && (
                    <div className="relative h-full shrink-0" style={{ width: sidebarWidth }}>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            title="Resize panel"
                            onMouseDown={beginSidebarResize}
                            className="absolute left-0 top-0 z-50 h-full w-2 -translate-x-1/2 cursor-col-resize bg-transparent"
                        />
                        <LabSidebar 
                            view={view}
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                            activeItem={activeItem}
                            setView={setView}
                            setIsGridMode={setIsGridMode}
                            snapshotHistory={snapshotHistory}
                            onRestoreSnapshot={(id) => void restoreSnapshot(id)}
                            filters={filters}
                            updateFilter={updateFilter}
                            rotate={rotate}
                            toggleFlip={toggleFlip}
                            flipH={flipH}
                            flipV={flipV}
                        isTransforming={isTransforming}
                        imageTransform={imageTransform}
                        startTransform={startTransform}
                        onSetTransformX={setTransformX}
                        onSetTransformY={setTransformY}
                        onSetTransformScale={setTransformScale}
                        onResetTransform={resetTransform}
                        isCropping={isCropping}
                        cropRect={cropRect}
                        startCrop={startCrop}
                        onSetCropWidth={setCropWidth}
                        onSetCropHeight={setCropHeight}
                        onApplyCrop={applyCrop}
                        onCancelCrop={cancelCrop}
                        isResizingImage={isResizingImage}
                        resizeRect={resizeRect}
                        startResize={startResize}
                        onSetResizeWidth={setResizeWidth}
                        onSetResizeHeight={setResizeHeight}
                        onApplyResize={applyResize}
                        onCancelResize={cancelResize}
                            isInpainting={isInpainting}
                            setIsInpainting={setIsInpainting}
                            brushSize={brushSize}
                            setBrushSize={setBrushSize}
                            isEraser={isEraser}
                            setIsEraser={setIsEraser}
                            onClearMask={clearMask}
                            gridProps={{
                                gridCols, setGridCols, gridRows, setGridRows, gridGutter, setGridGutter,
                                gridCellWidth, setGridCellWidth, gridCellHeight, setGridCellHeight,
                                gridItems, onImportProject: () => { setSelectorMode('matrix'); setActiveMatrixSlot(null); setIsSelectorOpen(true); },
                                onUploadLocal: () => localUploadRef.current?.click()
                            }}
                            onRemoveMatrixItem={removeGridItem}
                            onAddAtSlot={(idx) => { setSelectorMode('matrix'); setActiveMatrixSlot(idx); setIsSelectorOpen(true); }}
                            onRefineItem={handleRefineMatrixItem}
                        />
                    </div>
                )}
            </div>

            {confirmDialog}

            <input type="file" ref={singleUploadRef} className="hidden" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    setLoading(true);
                    const url = URL.createObjectURL(file);
                    await loadImage(url);
                    setView('editor'); setIsGridMode(false); setSessionArtifact(null); setActiveItem(null);
                    setLoading(false);
                }
            }} />
            <input type="file" ref={localUploadRef} multiple accept="image/*" className="hidden" onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                setLoading(true);
                try {
                    const resolvedItems = [];
                    for (let i = 0; i < files.length; i++) {
                        const url = URL.createObjectURL(files[i]);
                        resolvedItems.push({ id: `local-${Date.now()}-${i}`, url });
                    }
                    await addGridItemsBatch(resolvedItems);
                } finally { setLoading(false); e.target.value = ''; }
            }} />
        </div>
    );
};

export default AestheticLab;
