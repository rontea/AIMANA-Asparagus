
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { X, LayoutGrid, Download, Maximize2, FileIcon, Sparkles, ChevronLeft, ChevronRight, ZoomIn, ShieldCheck, Info, AudioLines, FolderPlus, CheckSquare, Square } from 'lucide-react';
import { determineAssetType } from '../../services/db';
import { AssetType } from '../../types';

interface MosaicFile {
    id: string;
    url: string;
    mimeType: string;
    isMain?: boolean;
    projectName?: string;
    projectId?: string;
}

interface MosaicViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    files: MosaicFile[];
    title: string;
    initialIndex?: number | null;
    onInspect?: (id: string) => void;
    onMoveToProject?: (id: string) => void;
    onBulkMoveToProject?: (ids: string[]) => void;
    onBulkMoveToCollection?: (ids: string[], projectId: string) => void;
    enableSelection?: boolean;
}

export const MosaicViewerModal: React.FC<MosaicViewerModalProps> = ({ isOpen, onClose, files, title, initialIndex, onInspect, onMoveToProject, onBulkMoveToProject, onBulkMoveToCollection, enableSelection = false }) => {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setActiveIndex(initialIndex ?? null);
            setSelectedIds(new Set());
        }
    }, [isOpen, initialIndex]);

    const selectableFiles = useMemo(
        () => enableSelection ? files.filter((file) => !file.isMain) : [],
        [enableSelection, files]
    );
    const allSelected = selectableFiles.length > 0 && selectableFiles.every((file) => selectedIds.has(file.id));
    const selectedFiles = useMemo(
        () => selectableFiles.filter((file) => selectedIds.has(file.id)),
        [selectableFiles, selectedIds]
    );
    const selectedProjectIds = useMemo(
        () => Array.from(new Set(selectedFiles.map((file) => file.projectId).filter((value): value is string => !!value))),
        [selectedFiles]
    );
    const canBulkMoveToCollection = selectedIds.size > 0 && selectedProjectIds.length === 1;
    const bulkMoveToCollectionProjectId = canBulkMoveToCollection ? selectedProjectIds[0] : '';
    const bulkMoveToCollectionTitle = canBulkMoveToCollection
        ? `Move ${selectedIds.size} to Collection`
        : 'Move to Collection is available only when all selected items belong to the same project';

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleToggleAll = useCallback(() => {
        setSelectedIds(allSelected ? new Set() : new Set(selectableFiles.map((file) => file.id)));
    }, [allSelected, selectableFiles]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (activeIndex === null) return;
        if (e.key === 'ArrowRight') {
            setActiveIndex((activeIndex + 1) % files.length);
        } else if (e.key === 'ArrowLeft') {
            setActiveIndex((activeIndex - 1 + files.length) % files.length);
        } else if (e.key === 'Escape') {
            if (initialIndex !== null && initialIndex !== undefined) {
                onClose();
            } else {
                setActiveIndex(null);
            }
        }
    }, [activeIndex, files.length, initialIndex, onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    if (!isOpen) return null;

    const activeFile = activeIndex !== null ? files[activeIndex] : null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/98 backdrop-blur-3xl animate-in fade-in duration-300">
            <div className="absolute top-0 left-0 right-0 h-20 border-b border-white/5 flex items-center justify-between px-8 bg-black/50 z-50">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-600/20 rounded-xl text-indigo-400">
                        <LayoutGrid size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.3em]">{title}</h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Full Manifest Gallery • {files.length} Total Nodes</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {enableSelection && selectableFiles.length > 0 && (
                        <>
                            <button
                                onClick={handleToggleAll}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                            >
                                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                {allSelected ? 'Deselect All' : 'Select All'}
                            </button>
                            {onBulkMoveToProject && selectedIds.size > 0 && (
                                <button
                                    onClick={() => onBulkMoveToProject(Array.from(selectedIds))}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
                                >
                                    <FolderPlus size={14} />
                                    Move {selectedIds.size} to Project
                                </button>
                            )}
                            {onBulkMoveToCollection && selectedIds.size > 0 && (
                                <button
                                    onClick={() => {
                                        if (!canBulkMoveToCollection) return;
                                        onBulkMoveToCollection(Array.from(selectedIds), bulkMoveToCollectionProjectId);
                                    }}
                                    disabled={!canBulkMoveToCollection}
                                    title={bulkMoveToCollectionTitle}
                                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                                        canBulkMoveToCollection
                                            ? 'border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                                            : 'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600'
                                    }`}
                                >
                                    <FolderPlus size={14} />
                                    Move {selectedIds.size} to Collection
                                </button>
                            )}
                        </>
                    )}
                    <button 
                        onClick={onClose}
                        className="p-3 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all border border-white/5"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            <div className="w-full h-full pt-20 overflow-y-auto custom-scrollbar overflow-x-hidden">
                <div className="max-w-[1600px] mx-auto p-8 md:p-16">
                    {files.length === 0 ? (
                        <div className="h-[60vh] flex flex-col items-center justify-center opacity-20 text-center space-y-4">
                            <Sparkles size={64} strokeWidth={1} />
                            <p className="text-xl font-black uppercase tracking-widest">No Manifest Nodes</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 shadow-2xl bg-white/5 p-2 rounded-sm">
                            {files.map((file, idx) => {
                                const type = determineAssetType(file.mimeType);
                                const isImage = type === AssetType.IMAGE;
                                const isVideo = type === AssetType.VIDEO;
                                const isAudio = type === AssetType.AUDIO;
                                const canMoveFileToProject = !!onMoveToProject || (enableSelection && !!onBulkMoveToProject);
                                const handleMoveFileToProject = () => {
                                    if (enableSelection && onBulkMoveToProject && !file.isMain) {
                                        onBulkMoveToProject([file.id]);
                                    } else {
                                        onMoveToProject?.(file.id);
                                    }
                                };

                                return (
                                    <div 
                                        key={file.id} 
                                        onClick={() => setActiveIndex(idx)}
                                        className={`relative group bg-[#080808] overflow-hidden aspect-[3/4] animate-in fade-in slide-in-from-bottom-8 duration-700 cursor-zoom-in ${file.isMain ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
                                        style={{ animationDelay: `${idx * 100}ms` }}
                                    >
                                        {enableSelection && !file.isMain && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleSelection(file.id); }}
                                                className={`absolute left-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                                                    selectedIds.has(file.id)
                                                        ? 'border-indigo-400 bg-indigo-600 text-white'
                                                        : 'border-white/15 bg-black/50 text-slate-200 hover:border-indigo-400'
                                                }`}
                                                title={selectedIds.has(file.id) ? 'Deselect item' : 'Select item'}
                                            >
                                                {selectedIds.has(file.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </button>
                                        )}
                                        {isImage ? (
                                            <img src={file.url} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="" />
                                        ) : isVideo ? (
                                            <video src={file.url} className="w-full h-full object-cover" autoPlay loop muted />
                                        ) : isAudio ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-cyan-300 bg-slate-950 px-6 text-center">
                                                <AudioLines size={48} strokeWidth={1.5} />
                                                <audio src={file.url} controls className="w-full max-w-[280px]" onClick={(e) => e.stopPropagation()} />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-slate-800 bg-slate-100">
                                                <FileIcon size={48} strokeWidth={1} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">{file.mimeType}</span>
                                            </div>
                                        )}

                                        {file.isMain && (
                                            <div className="absolute top-6 left-6 z-10">
                                                <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center gap-1.5 border border-indigo-400/30">
                                                    <ShieldCheck size={10} /> Primary Asset
                                                </div>
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-between p-8">
                                            <div className="flex justify-end gap-2">
                                                {canMoveFileToProject && (
                                                    enableSelection && !file.isMain && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleSelection(file.id); }}
                                                            className={`p-3 backdrop-blur-md rounded-full transition-all border ${
                                                                selectedIds.has(file.id)
                                                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                                                    : 'bg-white/10 text-white hover:bg-white/20 border-white/10'
                                                            }`}
                                                            title={selectedIds.has(file.id) ? 'Remove from bulk selection' : 'Add to bulk selection'}
                                                            aria-label={selectedIds.has(file.id) ? 'Remove from bulk selection' : 'Add to bulk selection'}
                                                        >
                                                            {selectedIds.has(file.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                                        </button>
                                                    )
                                                )}
                                                {canMoveFileToProject && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleMoveFileToProject(); }}
                                                        className="p-3 bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all border border-white/10"
                                                        title={enableSelection && onBulkMoveToProject ? 'Move to Project or Collection' : 'Move to Project'}
                                                    >
                                                        <FolderPlus size={18} />
                                                    </button>
                                                )}
                                                {onInspect && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onInspect(file.id); }}
                                                        className="p-3 bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all border border-white/10"
                                                        title="Inspect Manifest Details"
                                                    >
                                                        <Info size={18} />
                                                    </button>
                                                )}
                                                <button className="p-3 bg-white/10 backdrop-blur-md text-white rounded-full hover:bg-white/20 transition-all border border-white/10">
                                                    <ZoomIn size={18} />
                                                </button>
                                                <a href={file.url} download className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform shadow-2xl" onClick={e => e.stopPropagation()}>
                                                    <Download size={18} />
                                                </a>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black text-white uppercase tracking-[0.4em] mb-2 block opacity-60">{file.isMain ? 'Root Archetype' : 'Artifact Node'}</span>
                                                <h4 className="text-xl font-black text-white uppercase tracking-tight truncate">{file.isMain ? 'MASTER_NODE' : `NODE_${file.id.substring(0, 8)}`}</h4>
                                                {file.projectName && (
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mt-2 truncate">{file.projectName}</p>
                                                )}
                                                <div className={`h-px w-12 mt-4 ${file.isMain ? 'bg-indigo-500' : 'bg-white/20'}`} />
                                            </div>
                                        </div>

                                        <div className="absolute bottom-6 right-8 pointer-events-none">
                                            <span className="text-4xl font-black text-white/10 italic">{idx + 1}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="mt-20 mb-32 text-center">
                        <div className="h-px w-24 bg-white/10 mx-auto mb-8" />
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.5em]">Neural Manifest End of Stream</p>
                    </div>
                </div>
            </div>
            
            <div className="fixed bottom-8 left-8 pointer-events-none opacity-20">
                <span className="text-xs font-black text-white uppercase tracking-[0.8em] vertical-text">AIMANA LABORATORIES</span>
            </div>

            {activeFile && (
                <div className="fixed inset-0 z-[1100] bg-black/92 backdrop-blur-2xl animate-in fade-in duration-300" onClick={() => setActiveIndex(null)}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setActiveIndex(null); }}
                        className="absolute top-6 right-6 z-50 p-3 rounded-full bg-slate-900/80 border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                    >
                        <X size={22} />
                    </button>

                    {files.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveIndex((activeIndex! - 1 + files.length) % files.length); }}
                                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-2xl"
                            >
                                <ChevronLeft size={26} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveIndex((activeIndex! + 1) % files.length); }}
                                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-2xl"
                            >
                                <ChevronRight size={26} />
                            </button>
                        </>
                    )}

                    <div className="flex h-full w-full items-center justify-center px-6 pb-8 pt-20 md:px-20 md:pb-10 md:pt-24" onClick={e => e.stopPropagation()}>
                        <div className="w-full max-w-[1200px]">
                            <div className="rounded-[2.5rem] border border-white/10 bg-[#05070d]/92 p-4 md:p-6 shadow-[0_30px_120px_rgba(0,0,0,0.58)]">
                                <div className="flex min-h-[50vh] max-h-[72vh] items-center justify-center overflow-hidden rounded-[2rem] bg-black/70 px-4 py-4 md:px-8 md:py-8">
                                    {determineAssetType(activeFile.mimeType) === AssetType.IMAGE ? (
                                        <img
                                            src={activeFile.url}
                                            className="max-h-[calc(72vh-4rem)] max-w-full object-contain rounded-[1.75rem] shadow-[0_0_100px_rgba(99,102,241,0.12)] animate-in zoom-in-95 duration-500"
                                            alt=""
                                        />
                                    ) : determineAssetType(activeFile.mimeType) === AssetType.VIDEO ? (
                                        <video
                                            src={activeFile.url}
                                            className="max-h-[calc(72vh-4rem)] max-w-full rounded-[1.75rem] shadow-[0_0_100px_rgba(99,102,241,0.12)] animate-in zoom-in-95 duration-500"
                                            controls
                                            autoPlay
                                            loop
                                        />
                                    ) : determineAssetType(activeFile.mimeType) === AssetType.AUDIO ? (
                                        <div className="flex min-h-[320px] w-full max-w-xl flex-col items-center justify-center gap-6 rounded-[2rem] border border-cyan-500/20 bg-slate-950/80 p-12 text-center">
                                            <AudioLines size={72} className="text-cyan-400" />
                                            <audio src={activeFile.url} controls preload="metadata" className="w-full" />
                                            <span className="text-xs font-black text-cyan-100 uppercase tracking-widest">{activeFile.mimeType}</span>
                                        </div>
                                    ) : (
                                        <div className="flex min-h-[320px] w-full max-w-xl flex-col items-center justify-center gap-6 rounded-[2rem] border border-white/5 bg-slate-950/80 p-12 text-center">
                                            <FileIcon size={72} className="text-indigo-500" />
                                            <span className="text-xs font-black text-white uppercase tracking-widest">{activeFile.mimeType}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 flex flex-col gap-5 px-2 md:mt-6 md:flex-row md:items-end md:justify-between md:px-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
                                                <LayoutGrid size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-indigo-300">
                                                    {activeFile.isMain ? 'Primary Preview' : 'Manifest Preview'}
                                                </p>
                                                <h4 className="truncate text-2xl font-black uppercase tracking-tight text-white md:text-4xl">
                                                    {title || (activeFile.isMain ? 'Primary Asset' : `Node ${activeFile.id.substring(0, 8)}`)}
                                                </h4>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-[3.75rem] text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <span>{activeFile.projectName || 'Manifest Viewer'}</span>
                                            <span>{activeFile.mimeType}</span>
                                            <span>{activeIndex! + 1} / {files.length}</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 md:justify-end">
                                        {(() => {
                                            const canMoveActiveFileToProject = !!onMoveToProject || (enableSelection && !!onBulkMoveToProject);
                                            const handleMoveActiveFileToProject = () => {
                                                if (enableSelection && onBulkMoveToProject && !activeFile.isMain) {
                                                    onBulkMoveToProject([activeFile.id]);
                                                } else {
                                                    onMoveToProject?.(activeFile.id);
                                                }
                                            };

                                            return canMoveActiveFileToProject ? (
                                                <>
                                        {enableSelection && !activeFile.isMain && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleSelection(activeFile.id); }}
                                                className={`flex items-center gap-2 rounded-2xl border px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    selectedIds.has(activeFile.id)
                                                        ? 'border-indigo-400 bg-indigo-600 text-white'
                                                        : 'border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                                                }`}
                                            >
                                                {selectedIds.has(activeFile.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                                                Bulk Select
                                            </button>
                                        )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleMoveActiveFileToProject(); }}
                                                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
                                            >
                                                <FolderPlus size={14} />
                                                Move to Project
                                            </button>
                                                </>
                                            ) : null;
                                        })()}
                                        {onInspect && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onInspect(activeFile.id); }}
                                                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:bg-slate-800 hover:text-white"
                                            >
                                                <Info size={14} />
                                                Inspect
                                            </button>
                                        )}
                                        <a
                                            href={activeFile.url}
                                            download
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-indigo-500"
                                        >
                                            <Download size={14} />
                                            Download
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
