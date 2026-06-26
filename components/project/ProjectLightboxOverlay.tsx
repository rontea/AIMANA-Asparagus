
import React from 'react';
import { X, ChevronLeft, ChevronRight, Square, Play, ZoomOut, ZoomIn, RotateCcw, Info } from 'lucide-react';
import { ItemWithCurrentRevision, Project } from '../../types';

interface ProjectLightboxOverlayProps {
    item: ItemWithCurrentRevision;
    project: Project;
    index: number;
    total: number;
    zoomScale: number;
    setZoomScale: (val: number | ((v: number) => number)) => void;
    isAutoPlaying: boolean;
    setIsAutoPlaying: (val: boolean) => void;
    onClose: () => void;
    onNext: (e?: React.MouseEvent) => void;
    onPrev: (e?: React.MouseEvent) => void;
    onInspect: () => void;
    onDragStart: (e: React.DragEvent) => void;
}

export const ProjectLightboxOverlay: React.FC<ProjectLightboxOverlayProps> = ({
    item, project, index, total, zoomScale, setZoomScale, isAutoPlaying, setIsAutoPlaying,
    onClose, onNext, onPrev, onInspect, onDragStart
}) => {
    const rev = item.currentRevision;
    if (!rev) return null;

    return (
        <div 
            className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-300"
            onClick={onClose}
        >
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-8 right-8 p-3 text-white/40 hover:text-white transition-all hover:rotate-90 z-[110]"><X size={32} /></button>
            <button onClick={onPrev} className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-4 md:p-6 text-white/20 hover:text-indigo-400 transition-all z-[110] group"><ChevronLeft size={64} strokeWidth={1} className="group-hover:scale-110 transition-transform" /></button>
            <button onClick={onNext} className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-4 md:p-6 text-white/20 hover:text-indigo-400 transition-all z-[110] group"><ChevronRight size={64} strokeWidth={1} className="group-hover:scale-110 transition-transform" /></button>

            <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/5 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl z-[110] shadow-2xl" onClick={e => e.stopPropagation()}>
                <button onClick={(e) => { e.stopPropagation(); setIsAutoPlaying(!isAutoPlaying); }} className={`p-2.5 rounded-xl transition-all flex items-center gap-2 ${isAutoPlaying ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>{isAutoPlaying ? <Square size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}{isAutoPlaying && <span className="text-[9px] font-black uppercase tracking-widest pr-1 animate-pulse">Live</span>}</button>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <button onClick={(e) => { e.stopPropagation(); setZoomScale(prev => Math.max(prev - 0.5, 0.5)); }} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><ZoomOut size={18} /></button>
                <div className="px-3 min-w-[70px] text-center font-mono text-[10px] font-black text-indigo-400 uppercase tracking-tighter">{Math.round(zoomScale * 100)}%</div>
                <button onClick={(e) => { e.stopPropagation(); setZoomScale(prev => Math.min(prev + 0.5, 5)); }} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><ZoomIn size={18} /></button>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <button onClick={(e) => { e.stopPropagation(); setZoomScale(1); }} className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><RotateCcw size={18} /></button>
            </div>

            <div className="w-full h-full overflow-auto custom-scrollbar flex items-center justify-center select-none" onClick={e => e.stopPropagation()}>
                <div className="relative transition-transform duration-200 ease-out flex items-center justify-center" style={{ transform: `scale(${zoomScale})`, cursor: zoomScale > 1 ? 'grab' : 'default', minWidth: '100%', minHeight: '100%' }}>
                    {rev.mimeType.startsWith('video/') ? (
                        <video src={rev.fileUrl} className="max-w-[90vw] max-h-[80vh] rounded-2xl border border-white/5" controls={zoomScale === 1} autoPlay loop muted />
                    ) : (
                        <img src={rev.fileUrl || ''} className={`max-w-[90vw] max-h-[80vh] object-contain shadow-[0_0_100px_rgba(99,102,241,0.15)] rounded-2xl border border-white/5 ${zoomScale === 1 ? 'cursor-grab' : ''}`} alt="Full Preview" draggable={true} onDragStart={onDragStart} />
                    )}
                </div>
            </div>

            <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-[110] pointer-events-none" onClick={e => e.stopPropagation()}>
                <div className="text-center space-y-1 pointer-events-auto">
                    <h4 className="text-white text-lg md:text-2xl font-black uppercase tracking-tight line-clamp-1 drop-shadow-2xl">{rev.title || "Untitled Artifact"}</h4>
                    <p className="text-slate-400 text-xs md:text-sm max-w-2xl mx-auto line-clamp-2 leading-relaxed opacity-80 shadow-black drop-shadow-lg">{rev.prompt}</p>
                </div>
                <div className="flex items-center justify-center gap-4 pt-2 pointer-events-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 backdrop-blur-md rounded-full border border-white/10 shadow-xl">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{project.name}</span>
                    </div>
                    <button onClick={onInspect} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-white transition-colors bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20 shadow-xl"><div className="flex items-center justify-center"><Info size={14} /></div>Inspect Metadata</button>
                </div>
                <div className="bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] shadow-xl mt-2">{index + 1} / {total}</div>
            </div>
        </div>
    );
};
