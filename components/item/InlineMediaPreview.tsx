import React, { useState, useEffect, useCallback } from 'react';
import { Eye, FileImage, FileVideo, FileAudio, File as FileIcon, X, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Revision, AssetType } from '../../types';
import { determineAssetType } from '../../services/db';

interface InlineMediaPreviewProps {
    revision: Revision | undefined;
    title?: string;
}

export const InlineMediaPreview: React.FC<InlineMediaPreviewProps> = ({ revision, title = "Quick Look" }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    const assetType = revision ? determineAssetType(revision.mimeType) : AssetType.UNKNOWN;
    const isLocalStorage = (storage?: string | null) => {
        const s = String(storage || '').trim().toLowerCase();
        return s === 'local' || s === 'local drive' || s === 'local-drive' || s === 'local_drive';
    };

    useEffect(() => {
        if (!revision) return;
        if (revision.storage === 'google-drive' && revision.thumbnailLink) {
            setUrl(revision.thumbnailLink.replace('=s220', '=s2048')); // Request higher resolution for lightbox
        } else if (isLocalStorage(revision.storage)) {
            if (revision.fileUrl) {
                setUrl(revision.fileUrl);
            } else if (revision.blob) {
                const u = URL.createObjectURL(revision.blob);
                setUrl(u);
                return () => URL.revokeObjectURL(u);
            }
        }
    }, [revision]);

    // Reset zoom when lightbox closes
    useEffect(() => {
        if (!isLightboxOpen) {
            setZoomScale(1);
        }
    }, [isLightboxOpen]);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        if (!revision || !url) return;
        
        // Construct absolute URL for external OS resolution
        const absoluteUrl = url.startsWith('http') 
            ? url 
            : window.location.origin + url;

        // 1. Browser link standard
        e.dataTransfer.setData('text/uri-list', absoluteUrl);
        e.dataTransfer.setData('text/plain', absoluteUrl);
        
        // 2. Desktop standard for drag-to-download (Chrome/Edge/Safari)
        const dragData = `${revision.mimeType}:${revision.originalFilename}:${absoluteUrl}`;
        e.dataTransfer.setData('DownloadURL', dragData);
    }, [revision, url]);

    if (!revision) return null;

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomScale(prev => Math.min(prev + 0.5, 5));
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomScale(prev => Math.max(prev - 0.5, 0.5));
    };

    const handleResetZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomScale(1);
    };

    const renderMedia = (className: string, controls: boolean = true, applyZoom: boolean = false) => {
        if (!url) return null;
        
        const zoomStyle: React.CSSProperties = (applyZoom && assetType === AssetType.IMAGE) ? { 
            width: zoomScale === 1 ? 'auto' : `${zoomScale * 100}%`,
            maxWidth: zoomScale === 1 ? '100%' : 'none',
            maxHeight: zoomScale === 1 ? '100%' : 'none',
            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'block',
            margin: 'auto'
        } : {};

        switch (assetType) {
            case AssetType.IMAGE:
                return (
                    <img 
                        src={url} 
                        alt="Preview" 
                        className={className} 
                        style={zoomStyle} 
                        draggable={true}
                        onDragStart={handleDragStart}
                        referrerPolicy="no-referrer" 
                    />
                );
            case AssetType.VIDEO:
                return (
                    revision.storage === 'google-drive' 
                        ? <img 
                            src={url} 
                            alt="Video Frame" 
                            className={className} 
                            draggable={true} 
                            onDragStart={handleDragStart} 
                            referrerPolicy="no-referrer" 
                          />
                        : <video src={url} controls={controls} className={className} draggable={false} />
                );
            case AssetType.AUDIO:
                return <audio src={url} controls={controls} className="w-full" />;
            default:
                return null;
        }
    };

    const hasPreview = url && assetType !== AssetType.UNKNOWN;

    return (
        <>
            <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <Eye size={14} className="text-indigo-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</h3>
                    </div>
                    {hasPreview && (
                        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter flex items-center gap-1">
                            <Maximize2 size={10} /> Click to expand
                        </span>
                    )}
                </div>
                
                <button 
                    onClick={() => hasPreview && setIsLightboxOpen(true)}
                    disabled={!hasPreview}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-center min-h-[140px] shadow-inner overflow-hidden group relative transition-all duration-300 ${
                        hasPreview ? 'hover:border-indigo-500/50 hover:ring-4 hover:ring-indigo-500/5 cursor-zoom-in' : 'cursor-default'
                    }`}
                >
                    {hasPreview ? (
                        <>
                            {renderMedia("max-w-full max-h-48 object-contain rounded shadow-lg transition-transform duration-500 group-hover:scale-[1.02]", false)}
                            <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 bg-slate-900/80 backdrop-blur-md p-2 rounded-full border border-indigo-500/50 text-white shadow-2xl transform translate-y-2 group-hover:translate-y-0 transition-all">
                                    <ZoomIn size={20} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                            <FileIcon size={32} strokeWidth={1} />
                            <span className="text-[10px] mt-2 font-bold uppercase tracking-tighter">No Preview Available</span>
                        </div>
                    )}
                </button>
            </div>

            {/* Lightbox Modal */}
            {isLightboxOpen && (
                <div 
                    className="fixed inset-0 z-[1000] flex flex-col bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-300"
                    onClick={() => setIsLightboxOpen(false)}
                >
                    {/* Header Controls */}
                    <div className="absolute top-6 right-6 flex items-center gap-4 z-[1010]">
                        <div className="hidden md:block text-right">
                            <p className="text-white font-bold text-sm">{revision.title}</p>
                            <p className="text-slate-500 text-[10px] uppercase tracking-widest">v{revision.versionNumber} • {revision.mimeType}</p>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsLightboxOpen(false); }}
                            className="p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full border border-slate-700 transition-colors shadow-2xl group"
                        >
                            <X size={24} className="group-hover:rotate-90 transition-transform" />
                        </button>
                    </div>

                    {/* Floating Zoom Controls (Images Only) */}
                    {assetType === AssetType.IMAGE && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1010] flex items-center gap-2 bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4" onClick={e => e.stopPropagation()}>
                            <button 
                                onClick={handleZoomOut}
                                className="p-2.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                                title="Zoom Out"
                            >
                                <ZoomOut size={20} />
                            </button>
                            <div className="w-16 text-center text-[10px] font-black text-indigo-400 font-mono tracking-tighter">
                                {Math.round(zoomScale * 100)}%
                            </div>
                            <button 
                                onClick={handleZoomIn}
                                className="p-2.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                                title="Zoom In"
                            >
                                <ZoomIn size={20} />
                            </button>
                            <div className="h-6 w-px bg-white/10 mx-1"></div>
                            <button 
                                onClick={handleResetZoom}
                                className="p-2.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                                title="Reset Zoom"
                            >
                                <RotateCcw size={18} />
                            </button>
                        </div>
                    )}

                    {/* Media Container */}
                    <div 
                        className="w-full h-full overflow-auto custom-scrollbar flex items-start justify-center p-4 md:p-12"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`relative group/media m-auto flex items-center justify-center ${zoomScale > 1 ? 'min-h-full min-w-full' : 'w-full h-full'}`}>
                            {renderMedia(
                                `${zoomScale > 1 ? '' : 'max-w-full max-h-full'} object-contain shadow-[0_0_100px_rgba(99,102,241,0.1)] rounded-lg`, 
                                true, 
                                true
                            )}
                            
                            {/* Metadata Overlay for Image */}
                            {assetType === AssetType.IMAGE && zoomScale === 1 && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 opacity-0 group-hover/media:opacity-100 transition-opacity text-[10px] text-white font-mono flex gap-4 pointer-events-none whitespace-nowrap">
                                    <span>{revision.originalFilename}</span>
                                    <span className="opacity-40">|</span>
                                    <span>{(revision.size / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {zoomScale === 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-500 text-[10px] font-bold uppercase tracking-widest animate-in slide-in-from-bottom-2 pointer-events-none">
                            Press Escape or Click background to close
                        </div>
                    )}
                </div>
            )}
        </>
    );
};
