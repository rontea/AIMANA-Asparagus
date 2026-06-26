
import React, { useState } from 'react';
import { Plus, X, Image as ImageIcon, FileIcon, Film, UploadCloud, Link2, Box, Maximize2, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { determineAssetType } from '../../services/db';
import { AssetType } from '../../types';

interface MosaicFile {
    id: string;
    url: string;
    mimeType: string;
}

interface MosaicManagerProps {
    secondaryFiles: MosaicFile[];
    onAdd: () => void;
    onRemove: (id: string) => void;
    onView?: (index: number) => void;
    onDrop?: (e: React.DragEvent) => void;
    onExpand?: () => void;
    viewMode?: 'strip' | 'list';
    resetKey?: string;
}

type ExpansionState = 'collapsed' | 'strip' | 'expanded';

export const MosaicManager: React.FC<MosaicManagerProps> = ({ 
    secondaryFiles, onAdd, onRemove, onView, onDrop, onExpand, viewMode = 'strip', resetKey
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [expansion, setExpansion] = useState<ExpansionState>('strip');
    const [isListCollapsed, setIsListCollapsed] = useState(true);

    React.useEffect(() => {
        setIsListCollapsed(true);
    }, [resetKey]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-aimana-asset')) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleLocalDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (onDrop) onDrop(e);
    };

    const cycleExpansion = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (expansion === 'expanded') {
            setExpansion('strip');
        } else {
            setExpansion('expanded');
        }
    };

    const toggleCollapse = () => {
        if (expansion === 'collapsed') {
            setExpansion('strip');
        } else {
            setExpansion('collapsed');
        }
    };

    if (viewMode === 'list') {
        return (
            <section 
                className="space-y-4"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleLocalDrop}
            >
                <div className="flex items-center justify-between px-1">
                    <button 
                        onClick={() => setIsListCollapsed(!isListCollapsed)}
                        className="flex items-center gap-2.5 group/listhead cursor-pointer"
                    >
                        <Box size={18} className={secondaryFiles.length > 0 ? "text-indigo-400" : "text-slate-500"} />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 group-hover/listhead:text-white transition-colors">Linked Artifacts ({secondaryFiles.length})</h3>
                        {secondaryFiles.length > 0 && (
                            <span
                                className="inline-flex items-center justify-center p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50"
                                title="Has Linked Artifacts"
                            >
                                <Box size={10} />
                            </span>
                        )}
                        <ChevronDown 
                            size={14} 
                            className={`text-slate-600 transition-transform duration-500 ${isListCollapsed ? '-rotate-90' : ''}`} 
                        />
                    </button>
                    {secondaryFiles.length > 0 && onExpand && !isListCollapsed && (
                        <button 
                            onClick={onExpand}
                            className="text-[10px] font-black uppercase text-indigo-400 hover:text-white flex items-center gap-1.5 transition-colors group px-2 py-1 bg-indigo-500/5 rounded-lg border border-indigo-500/10"
                        >
                            <Maximize2 size={12} className="group-hover:scale-110 transition-transform" /> Expand Manifest
                        </button>
                    )}
                </div>
                
                <div className={`space-y-3 rounded-2xl transition-all duration-500 overflow-hidden ${isListCollapsed ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[2000px] opacity-100'} ${isDragOver ? 'bg-indigo-600/10 p-3 ring-2 ring-indigo-500/30' : ''}`}>
                    {secondaryFiles.map((file, idx) => (
                        <div key={file.id} className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-2xl group hover:border-indigo-500/30 transition-all shadow-sm">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-16 h-16 rounded-xl bg-black border border-white/5 flex items-center justify-center shrink-0 overflow-hidden shadow-inner relative">
                                    {determineAssetType(file.mimeType) === AssetType.IMAGE ? (
                                        <img src={file.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
                                    ) : (
                                        <FileIcon size={24} className="text-slate-600" />
                                    )}
                                    <div className="absolute top-1 left-1 bg-black/60 px-1 py-0.5 rounded text-[7px] font-black text-white/50">{idx + 1}</div>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black text-slate-200 truncate uppercase tracking-widest">NODE_{file.id.substring(0, 8)}</p>
                                    <p className="text-[9px] text-slate-500 font-bold uppercase truncate mt-0.5 tracking-tighter bg-slate-900 px-1.5 py-0.5 rounded w-fit">{file.mimeType.split('/')[1]}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all pr-1">
                                <button 
                                    onClick={() => onView?.(idx)}
                                    className="p-2.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-md"
                                    title="View larger"
                                >
                                    <Maximize2 size={16} />
                                </button>
                                <button 
                                    onClick={() => onRemove(file.id)}
                                    className="p-2.5 bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-md"
                                    title="Unlink and archive artifact"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                    
                    <button 
                        onClick={onAdd}
                        className={`w-full py-8 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center gap-2 group/btn ${
                            isDragOver 
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 scale-[0.98]' 
                            : 'border-slate-800 bg-black/20 text-slate-600 hover:border-indigo-500/40 hover:bg-indigo-500/5'
                        }`}
                    >
                        {isDragOver ? (
                            <>
                                <UploadCloud size={32} className="animate-bounce text-indigo-400" />
                                <span className="text-xs font-black uppercase tracking-widest">Release to Link Binary</span>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover/btn:scale-110 transition-transform">
                                        <Plus size={20} />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover/btn:text-indigo-300 transition-colors">Add Reference Node</span>
                                </div>
                                <span className="text-[9px] font-bold text-slate-700 uppercase tracking-tighter">Browse Registry or Drop Artifact</span>
                            </>
                        )}
                    </button>
                </div>
            </section>
        );
    }

    const heightClass = expansion === 'collapsed' ? 'h-12' : expansion === 'expanded' ? 'h-[50vh]' : 'h-44 md:h-52';

    return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleLocalDrop}
            className={`relative shrink-0 overflow-x-hidden border-t border-white/5 transition-all duration-500 ease-in-out z-30 group/tray bg-[#0c0c0cc0] backdrop-blur-2xl shadow-[0_-20px_50px_rgba(0,0,0,0.8)] ${heightClass} ${isDragOver ? 'bg-indigo-600/20' : ''}`}
        >
            {/* Multi-stage Expansion Handle */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-40">
                <button 
                    onClick={cycleExpansion}
                    className={`flex items-center justify-center w-14 h-7 bg-slate-900/95 border border-indigo-500/30 rounded-xl transition-all hover:bg-slate-800 hover:border-indigo-400 shadow-2xl group/handle ${expansion === 'collapsed' ? 'translate-y-1' : ''}`}
                    title={expansion === 'expanded' ? "Contract View" : "Expand Overlay"}
                >
                    <ChevronUp 
                        size={16} 
                        className={`text-indigo-300 group-handle/handle:text-white transition-transform duration-500 ${expansion === 'expanded' ? 'rotate-180' : ''}`} 
                    />
                </button>
            </div>

            <div className="absolute top-0 left-0 right-0 h-12 px-6 flex justify-between items-center z-20 bg-black/20">
                <div className="flex items-center gap-3">
                    <span 
                        className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] cursor-pointer select-none hover:text-white transition-colors" 
                        onClick={toggleCollapse}
                    >
                        Linked Artifacts
                    </span>
                    {expansion === 'expanded' && (
                        <div className="px-2 py-0.5 bg-indigo-600/20 rounded border border-indigo-500/30 text-[8px] font-black text-indigo-400 uppercase tracking-widest animate-in fade-in">
                            Matrix Overlay Active
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-3">
                    {expansion !== 'collapsed' && secondaryFiles.length > 0 && onExpand && (
                        <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onExpand(); }}
                            className="pointer-events-auto text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest flex items-center gap-1.5 transition-all bg-indigo-600/10 px-3 py-1 rounded-full border border-indigo-500/20"
                        >
                            <Maximize2 size={12} /> Full Gallery
                        </button>
                    )}
                </div>
            </div>

            <div className={`h-full min-h-0 flex items-start gap-5 px-6 pt-16 pb-14 overflow-y-auto custom-scrollbar transition-all duration-300 ${expansion === 'collapsed' ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${expansion === 'expanded' ? 'flex-wrap content-start' : 'overflow-x-auto flex-nowrap'}`}>
                {secondaryFiles.map((file, idx) => (
                    <div key={file.id} className={`${expansion === 'expanded' ? 'h-32 md:h-40' : 'h-24 md:h-28'} aspect-square rounded-2xl border border-white/5 bg-black relative group/item shrink-0 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all hover:border-indigo-500/50 hover:scale-105 active:scale-95`}>
                        {determineAssetType(file.mimeType) === AssetType.IMAGE ? (
                            <img src={file.url} className="w-full h-full object-cover opacity-70 group-hover/item:opacity-100 transition-all duration-700" alt="" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900/40">
                                <FileIcon size={32} />
                            </div>
                        )}
                        <div className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-black text-white/50">{idx + 1}</div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onView?.(idx)}
                                    className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 shadow-2xl transition-all active:scale-90 border border-indigo-400/20"
                                    title="View larger"
                                >
                                    <Maximize2 size={18} />
                                </button>
                                <button 
                                    onClick={() => onRemove(file.id)}
                                    className="p-2.5 bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all active:scale-90 border border-red-400/20"
                                    title="Unlink artifact"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                
                <button 
                    onClick={onAdd}
                    className={`${expansion === 'expanded' ? 'h-32 md:h-40' : 'h-24 md:h-28'} aspect-square rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 transition-all shrink-0 active:scale-95 shadow-inner hover:border-indigo-500/40 hover:bg-indigo-500/5 hover:text-indigo-400 text-slate-600`}
                >
                    {isDragOver ? <UploadCloud size={32} className="animate-bounce" /> : <Plus size={24} />}
                    <span className="text-[9px] font-black uppercase tracking-widest text-center px-2 leading-tight">
                        {isDragOver ? 'Link Node' : 'Add Node'}
                    </span>
                </button>
            </div>

            {isDragOver && (
                <div className="absolute inset-0 border-4 border-indigo-500/20 pointer-events-none animate-pulse rounded-lg z-30" />
            )}
        </div>
    );
};
