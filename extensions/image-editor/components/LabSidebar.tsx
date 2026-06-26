import React from 'react';
import { Wand2, LayoutGrid, Sparkles } from 'lucide-react';
import { AestheticTab } from './tabs/AestheticTab';
import { SpatialTab } from './tabs/SpatialTab';
import { MatrixTab } from './tabs/MatrixTab';
import { ForgeTab } from './tabs/ForgeTab';
import { HistoryTab } from './tabs/HistoryTab';
import { ItemWithCurrentRevision } from '../../../types';
import { GridItem } from '../hooks/useImageCanvas';

interface LabSidebarProps {
    view: 'ingest' | 'editor' | 'matrix';
    activeTab: 'aesthetic' | 'spatial' | 'forge' | 'history';
    setActiveTab: (tab: 'aesthetic' | 'spatial' | 'forge' | 'history') => void;
    activeItem: ItemWithCurrentRevision | null;
    setView: (view: 'ingest' | 'editor' | 'matrix') => void;
    setIsGridMode: (mode: boolean) => void;
    snapshotHistory: Array<{ id: string; label: string; createdAt: number }>;
    onRestoreSnapshot: (id: string) => void;
    // Context Actions
    filters: any;
    updateFilter: (key: any, val: number) => void;
    rotate: (angle: number) => void;
    toggleFlip: (dir: 'h' | 'v') => void;
    flipH: boolean;
    flipV: boolean;
    isTransforming: boolean;
    imageTransform: { x: number, y: number, scale: number };
    startTransform: () => void;
    onSetTransformX: (x: number) => void;
    onSetTransformY: (y: number) => void;
    onSetTransformScale: (s: number) => void;
    onResetTransform: () => void;
    isCropping: boolean;
    cropRect: { width: number, height: number } | null;
    startCrop: (ratio?: number) => void;
    onSetCropWidth: (w: number) => void;
    onSetCropHeight: (h: number) => void;
    onApplyCrop: () => void;
    onCancelCrop: () => void;
    isResizingImage: boolean;
    resizeRect: { width: number, height: number } | null;
    startResize: () => void;
    onSetResizeWidth: (w: number) => void;
    onSetResizeHeight: (h: number) => void;
    onApplyResize: () => void;
    onCancelResize: () => void;
    // Inpaint Actions
    isInpainting: boolean;
    setIsInpainting: (v: boolean) => void;
    brushSize: number;
    setBrushSize: (v: number) => void;
    isEraser: boolean;
    setIsEraser: (v: boolean) => void;
    onClearMask: () => void;
    // Matrix Actions
    gridProps: any;
    onRemoveMatrixItem: (idx: number) => void;
    onAddAtSlot: (idx: number) => void;
    onRefineItem: (item: GridItem) => void;
}

export const LabSidebar: React.FC<LabSidebarProps> = ({
    view, activeTab, setActiveTab, activeItem, setView, setIsGridMode,
    snapshotHistory, onRestoreSnapshot,
    filters, updateFilter, rotate, toggleFlip, flipH, flipV, 
    isTransforming, imageTransform, startTransform, onSetTransformX, onSetTransformY, onSetTransformScale, onResetTransform,
    isCropping, cropRect, startCrop, onSetCropWidth, onSetCropHeight, onApplyCrop, onCancelCrop,
    isResizingImage, resizeRect, startResize, onSetResizeWidth, onSetResizeHeight, onApplyResize, onCancelResize,
    isInpainting, setIsInpainting, brushSize, setBrushSize, isEraser, setIsEraser, onClearMask,
    gridProps, onRemoveMatrixItem, onAddAtSlot, onRefineItem
}) => {
    return (
        <div className="h-full w-full bg-[#111] border-l border-white/5 flex flex-col shrink-0 z-40 shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-slate-900/20 shrink-0">
                <div className={`p-2 rounded-lg ${view === 'editor' ? 'bg-indigo-500/10 text-indigo-400' : view === 'matrix' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                    {view === 'editor' ? <Wand2 size={16} /> : view === 'matrix' ? <LayoutGrid size={16} /> : <Sparkles size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest truncate">
                        {view === 'editor' ? (activeItem?.currentRevision?.title || 'Refinement') : view === 'matrix' ? 'Matrix Composition' : 'Studio Ingest'}
                    </h4>
                    <p className="text-[8px] text-slate-500 font-bold uppercase mt-0.5 tracking-tighter">
                        {view === 'ingest' ? 'Select Operation Mode' : 'Active Session'}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {view === 'editor' && (
                    <>
                        <div className="flex border-b border-white/5 bg-black/20 sticky top-0 z-10 backdrop-blur-md">
                            <button onClick={() => setActiveTab('aesthetic')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'aesthetic' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-600 hover:text-slate-400'}`}>Aesthetic</button>
                            <button onClick={() => setActiveTab('spatial')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'spatial' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-600 hover:text-slate-400'}`}>Spatial</button>
                            <button onClick={() => setActiveTab('forge')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'forge' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-600 hover:text-slate-400'}`}>Forge</button>
                            <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'history' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-600 hover:text-slate-400'}`}>History</button>
                        </div>
                        <div>
                            {activeTab === 'aesthetic' && (
                                <AestheticTab filters={filters} onUpdateFilter={updateFilter} onRotate={rotate} onToggleFlip={toggleFlip} flipH={flipH} flipV={flipV} />
                            )}
                            {activeTab === 'spatial' && (
                                <SpatialTab
                                    onStartTransform={startTransform}
                                    isTransforming={isTransforming}
                                    imageTransform={imageTransform}
                                    onSetTransformX={onSetTransformX}
                                    onSetTransformY={onSetTransformY}
                                    onSetTransformScale={onSetTransformScale}
                                    onResetTransform={onResetTransform}
                                    onStartCrop={startCrop}
                                    isCropping={isCropping}
                                    cropRect={cropRect}
                                    onSetWidth={onSetCropWidth}
                                    onSetHeight={onSetCropHeight}
                                    onApplyCrop={onApplyCrop}
                                    onCancelCrop={onCancelCrop}
                                    onStartResize={startResize}
                                    isResizing={isResizingImage}
                                    resizeRect={resizeRect}
                                    onSetResizeWidth={onSetResizeWidth}
                                    onSetResizeHeight={onSetResizeHeight}
                                    onApplyResize={onApplyResize}
                                    onCancelResize={onCancelResize}
                                />
                            )}
                            {activeTab === 'forge' && (
                                <ForgeTab 
                                    onApplyAction={() => alert("Action triggered")} 
                                    isInpainting={isInpainting}
                                    setIsInpainting={setIsInpainting}
                                    brushSize={brushSize}
                                    setBrushSize={setBrushSize}
                                    isEraser={isEraser}
                                    setIsEraser={setIsEraser}
                                    onClearMask={onClearMask}
                                />
                            )}
                            {activeTab === 'history' && (
                                <HistoryTab
                                    snapshotHistory={snapshotHistory}
                                    onRestoreSnapshot={onRestoreSnapshot}
                                />
                            )}
                        </div>
                    </>
                )}

                {view === 'matrix' && (
                    <MatrixTab {...gridProps} onRemoveItem={onRemoveMatrixItem} onAddAtSlot={onAddAtSlot} onRefineItem={onRefineItem} />
                )}

                {view === 'ingest' && (
                    <div className="p-4 space-y-3">
                        <button 
                            onClick={() => { setView('editor'); }} 
                            className="w-full p-6 bg-slate-900 hover:bg-indigo-600/10 border border-slate-800 hover:border-indigo-500/30 rounded-[1.5rem] text-left transition-all group flex flex-col gap-3"
                        >
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform w-fit"><Wand2 size={24} /></div>
                            <div className="min-w-0">
                                <div className="text-xs font-black text-white uppercase tracking-widest">Refine Artifact</div>
                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Single high-fidelity editing</p>
                            </div>
                        </button>

                        <button 
                            onClick={() => { setView('matrix'); setIsGridMode(true); }}
                            className="w-full p-6 bg-slate-900 hover:bg-emerald-600/10 border border-slate-800 hover:border-emerald-500/30 rounded-[1.5rem] text-left transition-all group flex flex-col gap-3"
                        >
                            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:scale-110 transition-transform w-fit"><LayoutGrid size={24} /></div>
                            <div className="min-w-0">
                                <div className="text-xs font-black text-white uppercase tracking-widest">Compose Matrix</div>
                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Multi-asset grid studio</p>
                            </div>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
