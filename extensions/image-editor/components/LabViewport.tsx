import React, { useState, useEffect, useCallback } from 'react';
import { ImageIcon, MonitorSmartphone, ZoomIn, ZoomOut, Check, Sparkles, Database, UploadCloud, Aperture } from 'lucide-react';

interface LabViewportProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    imageLoaded: boolean;
    isGridMode: boolean;
    loading: boolean;
    zoom: number;
    setZoom: (z: number | ((prev: number) => number)) => void;
    panOffset: { x: number, y: number };
    isPanning: boolean;
    dimensions: { width: number, height: number };
    isCropping: boolean;
    isTransforming?: boolean;
    isResizingImage?: boolean;
    isInpainting?: boolean;
    brushSize?: number;
    onCancelCrop: () => void;
    onApplyCrop: () => void;
    onOpenProject: () => void;
    onUploadLocal: () => void;
    onSwitchToEditor: () => void;
    onSwitchToMatrix: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    isIngest?: boolean;
    view?: 'ingest' | 'editor' | 'matrix';
    isSelectorOpen?: boolean;
    activeHandle?: string | null;
    isSpaceHeld?: boolean;
}

const getCursorStyle = (handle: string | null | undefined, isInpainting: boolean, isPanning: boolean, isCropping: boolean, isTransforming: boolean, isResizingImage: boolean, zoom: number, isSpaceHeld: boolean): string => {
    if (isSpaceHeld || isPanning) return 'grabbing';
    if (isInpainting) return 'none';
    if (isTransforming) {
        if (!handle) return 'default';
        if (handle === 'move') return 'move';
        if (handle === 'tl' || handle === 'br') return 'nwse-resize';
        if (handle === 'tr' || handle === 'bl') return 'nesw-resize';
        if (handle === 't' || handle === 'b') return 'ns-resize';
        if (handle === 'l' || handle === 'r') return 'ew-resize';
        return 'move';
    }
    if (isCropping || isResizingImage) {
        if (!handle) return 'crosshair';
        switch (handle) {
            case 'move': return 'move';
            case 'tl':
            case 'br': return 'nwse-resize';
            case 'tr':
            case 'bl': return 'nesw-resize';
            case 't':
            case 'b': return 'ns-resize';
            case 'l':
            case 'r': return 'ew-resize';
            default: return 'crosshair';
        }
    }
    if (zoom > 1) return 'grab';
    return 'default';
};

export const LabViewport: React.FC<LabViewportProps> = ({
    canvasRef, imageLoaded, isGridMode, loading, zoom, setZoom, panOffset, isPanning, dimensions, isCropping, isTransforming = false, isResizingImage = false, isInpainting = false, brushSize = 40,
    onCancelCrop, onApplyCrop, onOpenProject, onUploadLocal, onSwitchToEditor, onSwitchToMatrix,
    onMouseDown, onMouseMove, onMouseUp, onDragOver, onDragLeave, onDrop,
    isIngest, view, isSelectorOpen, activeHandle, isSpaceHeld = false
}) => {
    const hasActiveCanvas = imageLoaded || isGridMode;
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
        onMouseMove(e);
    };

    const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!hasActiveCanvas || loading) return;
        e.preventDefault();
        const step = e.deltaY < 0 ? 0.1 : -0.1;
        setZoom(prev => Math.max(0.1, Math.min(4, prev + step)));
    };

    return (
        <div
            data-lab-viewport-root="true"
            onWheel={handleWheelZoom}
            className="flex-1 relative bg-[#0a0a0a] flex items-center justify-center overflow-auto p-12 custom-scrollbar"
        >
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
            
            {/* Custom Brush Cursor */}
            {isInpainting && imageLoaded && !isSpaceHeld && (
                <div 
                    className="fixed pointer-events-none z-[100] rounded-full border border-white/50 bg-indigo-500/20 backdrop-blur-[1px] shadow-2xl"
                    style={{
                        left: mousePos.x,
                        top: mousePos.y,
                        width: brushSize * zoom,
                        height: brushSize * zoom,
                        transform: 'translate(-50%, -50%)'
                    }}
                />
            )}

            {/* Quick Actions Bar - Top HUD */}
            {view === 'editor' && !imageLoaded && !loading && !isSelectorOpen && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-30 animate-in slide-in-from-top-4 duration-700">
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-2 rounded-3xl flex items-center gap-2 shadow-2xl ring-1 ring-white/5">
                        <button 
                            onClick={onOpenProject}
                            className="flex items-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 border border-indigo-400/20"
                        >
                            <Database size={16} /> Import from Project
                        </button>
                        <div className="w-px h-6 bg-white/10 mx-1" />
                        <button 
                            onClick={onUploadLocal}
                            className="flex items-center gap-3 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-white/5"
                        >
                            <UploadCloud size={16} /> Upload Binary
                        </button>
                    </div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] animate-pulse">Awaiting Source Material</p>
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center gap-6 text-slate-700">
                    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Syncing Neural Artifact...</span>
                </div>
            ) : isIngest ? (
                <div className="max-w-2xl w-full text-center space-y-8 animate-in zoom-in-95 duration-700">
                    <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mx-auto text-indigo-400 shadow-2xl border border-indigo-500/20">
                        <Sparkles size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-[0.2em]">Studio Ingest</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] leading-relaxed max-w-sm mx-auto mt-2">
                            Initialize operation mode from the central console.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                        <button 
                            onClick={onOpenProject}
                            className="w-full p-6 bg-slate-900 hover:bg-indigo-600/10 border border-slate-800 hover:border-indigo-500/30 rounded-[1.5rem] transition-all group flex flex-col gap-3"
                        >
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform w-fit"><Database size={24} /></div>
                            <div className="min-w-0">
                                <div className="text-xs font-black text-white uppercase tracking-widest">Studio Ingest</div>
                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Import from project registry</p>
                            </div>
                        </button>
                        <button 
                            onClick={onSwitchToEditor}
                            className="w-full p-6 bg-slate-900 hover:bg-indigo-600/10 border border-slate-800 hover:border-indigo-500/30 rounded-[1.5rem] transition-all group flex flex-col gap-3"
                        >
                            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform w-fit"><Sparkles size={24} /></div>
                            <div className="min-w-0">
                                <div className="text-xs font-black text-white uppercase tracking-widest">Refine Artifact</div>
                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Single high-fidelity editing</p>
                            </div>
                        </button>

                        <button 
                            onClick={onSwitchToMatrix}
                            className="w-full p-6 bg-slate-900 hover:bg-emerald-600/10 border border-slate-800 hover:border-emerald-500/30 rounded-[1.5rem] transition-all group flex flex-col gap-3"
                        >
                            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:scale-110 transition-transform w-fit"><Aperture size={24} /></div>
                            <div className="min-w-0">
                                <div className="text-xs font-black text-white uppercase tracking-widest">Compose Matrix</div>
                                <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Multi-asset grid studio</p>
                            </div>
                        </button>
                    </div>
                </div>
            ) : hasActiveCanvas ? (
                <div className="flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500 max-w-full">
                    <div
                        className={`relative shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg border border-white/5 bg-slate-900 checkerboard-bg overflow-hidden ${isPanning ? 'transition-none' : 'transition-transform duration-200'}`}
                        style={{
                            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                            transformOrigin: 'center center'
                        }}
                    >
                        <canvas 
                            ref={canvasRef} 
                            onMouseDown={onMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            className="max-w-full max-h-[75vh]" 
                            style={{ 
                                cursor: getCursorStyle(activeHandle, isInpainting, isPanning, isCropping, isTransforming, isResizingImage, zoom, isSpaceHeld)
                            }} 
                        />
                        
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-2xl pointer-events-none">
                             <MonitorSmartphone size={12} className="text-indigo-400" />
                             <span className="text-[9px] font-mono font-black text-white tracking-tighter">
                                 {dimensions.width} × {dimensions.height} px
                             </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 z-40">
                         {isCropping ? (
                            <div className="flex items-center gap-1.5 bg-[#0c0c0c] backdrop-blur-2xl border border-indigo-500/30 p-1.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4">
                                <button onClick={onCancelCrop} className="px-5 py-2.5 text-slate-400 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">Discard</button>
                                <div className="w-px h-4 bg-white/5" />
                                <button onClick={onApplyCrop} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2">
                                    <Check size={14} /> Commit Crop
                                </button>
                            </div>
                         ) : (
                            <div className="flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-2xl border border-white/10 p-1.5 rounded-2xl shadow-2xl">
                                <button onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))} className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all"><ZoomOut size={16} /></button>
                                <div className="px-4 min-w-[80px] text-center font-mono text-[10px] font-black text-indigo-400 uppercase tracking-tighter">
                                    {Math.round(zoom * 100)}%
                                </div>
                                <button onClick={() => setZoom(prev => Math.min(4, prev + 0.1))} className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all"><ZoomIn size={16} /></button>
                            </div>
                         )}
                    </div>
                </div>
            ) : (
                <div className="max-w-md w-full text-center space-y-10 animate-in zoom-in-95 duration-500 opacity-20">
                    <div className="w-24 h-24 bg-slate-900/40 border border-white/5 rounded-3xl flex items-center justify-center mx-auto text-slate-700 shadow-2xl">
                        <ImageIcon size={40} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white uppercase tracking-[0.2em]">Laboratory Console Empty</h3>
                        <p className="text-[11px] text-slate-500 mt-3 font-bold uppercase tracking-widest leading-relaxed max-w-xs mx-auto">
                            Import an artifact from your projects or upload a local file to initialize the workspace.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
