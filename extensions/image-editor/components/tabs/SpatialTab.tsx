import React, { useState } from 'react';
import { Crop, Square, Smartphone, Monitor, Maximize2, MoveHorizontal, MoveVertical } from 'lucide-react';
import { EditorCollapsible } from '../ui/EditorCollapsible';

interface SpatialTabProps {
    onStartTransform: () => void;
    isTransforming: boolean;
    imageTransform: { x: number, y: number, scale: number };
    onSetTransformX: (x: number) => void;
    onSetTransformY: (y: number) => void;
    onSetTransformScale: (s: number) => void;
    onResetTransform: () => void;
    onStartCrop: (ratio?: number) => void;
    isCropping: boolean;
    cropRect: { width: number, height: number } | null;
    onSetWidth: (w: number) => void;
    onSetHeight: (h: number) => void;
    onApplyCrop: () => void;
    onCancelCrop: () => void;
    onStartResize: () => void;
    isResizing: boolean;
    resizeRect: { width: number, height: number } | null;
    onSetResizeWidth: (w: number) => void;
    onSetResizeHeight: (h: number) => void;
    onApplyResize: () => void;
    onCancelResize: () => void;
}

export const SpatialTab: React.FC<SpatialTabProps> = ({ 
    onStartTransform, isTransforming, imageTransform, onSetTransformX, onSetTransformY, onSetTransformScale, onResetTransform,
    onStartCrop, isCropping, cropRect, onSetWidth, onSetHeight, onApplyCrop, onCancelCrop,
    onStartResize, isResizing, resizeRect, onSetResizeWidth, onSetResizeHeight, onApplyResize, onCancelResize
}) => {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="flex flex-col h-full bg-[#111]">
            <EditorCollapsible 
                title="Canvas Tools" 
                isOpen={isOpen} 
                onToggle={() => setIsOpen(!isOpen)}
            >
                <div className="space-y-6">
                    <button
                        onClick={onStartTransform}
                        className={`w-full py-2.5 px-3 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all ${isTransforming ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' : 'bg-amber-700 hover:bg-amber-600 text-white shadow-amber-900/20'}`}
                    >
                        <MoveHorizontal size={14} /> {isTransforming ? 'Transform Active (T)' : 'Initialize Transform (T)'}
                    </button>

                    {isTransforming && (
                        <div className="space-y-3 p-4 bg-black/40 border border-amber-500/20 rounded-xl animate-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-black text-amber-300 uppercase tracking-widest">Image Transform</span>
                                <span className="text-[9px] font-mono text-slate-500 italic">Layer Space</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                        <MoveHorizontal size={10} /> Offset X
                                    </label>
                                    <input
                                        type="number"
                                        value={Math.round(imageTransform.x)}
                                        onChange={(e) => onSetTransformX(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-amber-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                        <MoveVertical size={10} /> Offset Y
                                    </label>
                                    <input
                                        type="number"
                                        value={Math.round(imageTransform.y)}
                                        onChange={(e) => onSetTransformY(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-amber-500 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                    <Maximize2 size={10} /> Scale (%)
                                </label>
                                <input
                                    type="number"
                                    value={Math.round(imageTransform.scale * 100)}
                                    onChange={(e) => onSetTransformScale((parseInt(e.target.value) || 100) / 100)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-amber-500 transition-all"
                                />
                            </div>
                            <button
                                onClick={onResetTransform}
                                className="w-full py-2 rounded-lg border border-slate-700 text-slate-300 text-[9px] font-black uppercase tracking-widest hover:text-white hover:bg-slate-800 transition-all"
                            >
                                Reset Transform
                            </button>
                            <p className="text-[8px] text-slate-600 italic px-1 mt-2">Drag directly on canvas to move image layer. Use T to toggle mode.</p>
                        </div>
                    )}

                    <button 
                        onClick={() => onStartCrop()}
                        className={`w-full py-2.5 px-3 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all ${isCropping ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20'}`}
                    >
                        <Crop size={14} /> {isCropping ? 'Cropping Active' : 'Initialize Crop'}
                    </button>

                    <button 
                        onClick={isResizing ? onApplyResize : onStartResize}
                        className={`w-full py-2.5 px-3 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all ${isResizing ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30' : 'bg-cyan-700 hover:bg-cyan-600 text-white shadow-cyan-900/20'}`}
                    >
                        <Maximize2 size={14} /> {isResizing ? 'Apply Resize' : 'Initialize Resize'}
                    </button>
                    
                    {isCropping && cropRect && (
                        <div className="space-y-3 p-4 bg-black/40 border border-white/5 rounded-xl animate-in slide-in-from-top-2">
                             <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Dimensions</span>
                                <span className="text-[9px] font-mono text-slate-500 italic">Pixels</span>
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                        <MoveHorizontal size={10} /> Width
                                    </label>
                                    <input 
                                        type="number" 
                                        value={Math.round(cropRect.width)}
                                        onChange={(e) => onSetWidth(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-indigo-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                        <MoveVertical size={10} /> Height
                                    </label>
                                    <input 
                                        type="number" 
                                        value={Math.round(cropRect.height)}
                                        onChange={(e) => onSetHeight(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-indigo-500 transition-all"
                                    />
                                </div>
                             </div>
                             <div className="flex gap-2">
                                <button
                                    onClick={onCancelCrop}
                                    className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 text-[9px] font-black uppercase tracking-widest hover:text-white hover:bg-slate-800 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={onApplyCrop}
                                    className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                >
                                    Apply
                                </button>
                             </div>
                             <p className="text-[8px] text-slate-600 italic px-1 mt-2">Drag crop handles directly on canvas. Press Enter to apply, Esc to cancel.</p>
                        </div>
                    )}

                    {isResizing && resizeRect && (
                        <div className="space-y-3 p-4 bg-black/40 border border-cyan-500/20 rounded-xl animate-in slide-in-from-top-2">
                             <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] font-black text-cyan-300 uppercase tracking-widest">Resize Image</span>
                                <span className="text-[9px] font-mono text-slate-500 italic">Pixels</span>
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                        <MoveHorizontal size={10} /> Width
                                    </label>
                                    <input 
                                        type="number" 
                                        value={Math.round(resizeRect.width)}
                                        onChange={(e) => onSetResizeWidth(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                        <MoveVertical size={10} /> Height
                                    </label>
                                    <input 
                                        type="number" 
                                        value={Math.round(resizeRect.height)}
                                        onChange={(e) => onSetResizeHeight(parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-cyan-500 transition-all"
                                    />
                                </div>
                             </div>
                             <div className="flex gap-2">
                                <button
                                    onClick={onCancelResize}
                                    className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-300 text-[9px] font-black uppercase tracking-widest hover:text-white hover:bg-slate-800 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={onApplyResize}
                                    className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                >
                                    Apply
                                </button>
                             </div>
                             <p className="text-[8px] text-slate-600 italic px-1 mt-2">Drag left/right/top/bottom handles on canvas for interactive resize.</p>
                        </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-white/5">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">Ratio Presets</span>
                        <div className="grid grid-cols-2 gap-1.5">
                            <CompactRatioBtn label="1:1" sub="Square" icon={Square} onClick={() => onStartCrop(1)} />
                            <CompactRatioBtn label="3:4" sub="Portrait" icon={Smartphone} onClick={() => onStartCrop(3/4)} />
                            <CompactRatioBtn label="4:3" sub="Landscape" icon={Monitor} onClick={() => onStartCrop(4/3)} />
                            <CompactRatioBtn label="16:9" sub="Wide" icon={Maximize2} onClick={() => onStartCrop(16/9)} />
                        </div>
                    </div>
                </div>
            </EditorCollapsible>
        </div>
    );
};

const CompactRatioBtn: React.FC<{ label: string, sub: string, icon: any, onClick: () => void }> = ({ label, sub, icon: Icon, onClick }) => (
    <button 
        onClick={onClick}
        className="flex items-center gap-2.5 p-2 bg-[#050505] border border-white/5 hover:border-indigo-500/50 rounded-md transition-all group"
    >
        <Icon size={12} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
        <div className="text-left">
            <div className="text-[9px] font-black text-white leading-none">{label}</div>
            <div className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter mt-0.5">{sub}</div>
        </div>
    </button>
);
