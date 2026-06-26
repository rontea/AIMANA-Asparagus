import React, { useState, useEffect, useMemo } from 'react';
import { UploadCloud, Download, ExternalLink, Pin, PinOff, Archive, Maximize2, FileCode, Wand2, Clock, X, Loader2, Blend } from 'lucide-react';
import { Revision, ItemWithCurrentRevision, AssetType } from '../../types';
import { determineAssetType } from '../../services/db';
import { downloadRevisionArtifact } from '../../utils/downloadArtifact';

interface MainRevisionPreviewProps {
    item: ItemWithCurrentRevision;
    currentRev: Revision | undefined;
    previewUrl: string | null;
    isDragging: boolean;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onReplaceClick: () => void;
    onPinToggle: () => void;
    onArchiveVersion: () => void;
    onBlurVersion?: () => void;
    isBlurring?: boolean;
    isBlurEnabled?: boolean;
    onRemix?: () => void;
    onOpenFull?: () => void;
    onCancelDrag?: () => void;
    extraTopRightActions?: React.ReactNode;
}

export const MainRevisionPreview: React.FC<MainRevisionPreviewProps> = ({
    item, currentRev, previewUrl, isDragging, onDragEnter, onDragLeave, onDrop, onReplaceClick, onPinToggle, onArchiveVersion, onBlurVersion, isBlurring = false, isBlurEnabled = false, onRemix, onOpenFull, onCancelDrag, extraTopRightActions
}) => {
    const [dimensions, setDimensions] = useState<{ w: number, h: number } | null>(null);
    const assetType = currentRev ? determineAssetType(currentRev.mimeType) : AssetType.UNKNOWN;
    const canOpenFull = !!onOpenFull && !!currentRev && !!previewUrl;
    const canBlur = !!currentRev && (assetType === AssetType.IMAGE || assetType === AssetType.VIDEO) && !!onBlurVersion;
    const hasRemixableAiParams = useMemo(() => {
        if (!currentRev?.aiParameters) return false;
        try {
            const parsed = JSON.parse(currentRev.aiParameters);
            if (!parsed || typeof parsed !== 'object') return false;
            const root: Record<string, any> = { ...(parsed as Record<string, any>) };
            const adv = root.advanced_params && typeof root.advanced_params === 'object'
                ? { ...(root.advanced_params as Record<string, any>) }
                : null;

            delete root.thumbnailBlur;
            if (adv) {
                delete adv.thumbnailBlur;
                if (Object.keys(adv).length === 0) delete root.advanced_params;
                else root.advanced_params = adv;
            }
            return Object.keys(root).length > 0;
        } catch (e) {
            return true;
        }
    }, [currentRev?.aiParameters]);

    useEffect(() => {
        setDimensions(null);
    }, [previewUrl]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDownloadClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!currentRev) return;

        try {
            await downloadRevisionArtifact(currentRev, previewUrl || undefined);
        } catch (error) {
            console.error('Artifact download failed', error);
        }
    };

    const handlePreviewAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canOpenFull) return;
        const target = e.target;
        if (target instanceof Element) {
            const interactiveAncestor = target.closest('button, a, input, select, textarea, [role="button"], audio, video');
            if (interactiveAncestor && interactiveAncestor !== e.currentTarget) {
                return;
            }
        }
        onOpenFull?.();
    };

    const renderPreview = () => {
        if (!currentRev || !previewUrl) return <div className="text-slate-500 font-black uppercase tracking-widest opacity-20">No manifest binary</div>;
        
        switch (assetType) {
            case AssetType.IMAGE:
                return (
                    <img 
                        src={previewUrl} 
                        className="block h-auto w-auto max-h-full max-w-full object-contain shadow-[0_40px_100px_rgba(0,0,0,0.8)]" 
                        referrerPolicy="no-referrer"
                        onLoad={(e) => setDimensions({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    />
                );
            case AssetType.VIDEO:
                return currentRev.storage === 'google-drive' ? (
                    <img 
                        src={previewUrl} 
                        className="block h-auto w-auto max-h-full max-w-full object-contain shadow-[0_40px_100px_rgba(0,0,0,0.8)]" 
                        referrerPolicy="no-referrer"
                        onLoad={(e) => setDimensions({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    />
                ) : (
                    <video 
                        src={previewUrl} 
                        controls 
                        className="block h-auto w-auto max-h-full max-w-full shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
                        onLoadedMetadata={(e) => setDimensions({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                    />
                );
            case AssetType.AUDIO:
                return <audio src={previewUrl} controls className="w-full max-w-md" />;
            default:
                return <div className="text-slate-500">Unsupported preview</div>;
        }
    };

    return (
        <div 
            className="relative w-full md:w-auto h-64 md:h-auto md:flex-1 bg-black flex flex-col items-center justify-center p-6 md:p-12 min-h-0"
        >
            <div 
                className={`flex-1 w-full min-h-0 min-w-0 max-h-[55vh] md:max-h-[60vh] relative flex items-center justify-center overflow-hidden group ${canOpenFull ? 'cursor-zoom-in' : ''}`}
                onClick={handlePreviewAreaClick}
                onKeyDown={(e) => {
                    if (!canOpenFull) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenFull?.();
                    }
                }}
                role={canOpenFull ? 'button' : undefined}
                tabIndex={canOpenFull ? 0 : undefined}
            >
                {renderPreview()}
                
                {!isDragging && (assetType === AssetType.IMAGE || assetType === AssetType.VIDEO) && (
                    <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-700">
                        {dimensions && (
                            <div className="bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 flex items-center gap-2 shadow-2xl">
                                <Maximize2 size={12} className="text-indigo-400" />
                                <span className="font-bold">{dimensions.w} × {dimensions.h}</span>
                            </div>
                        )}
                        <div className="bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 flex items-center gap-2 shadow-2xl uppercase">
                            <FileCode size={12} className="text-indigo-400" />
                            <span className="font-bold">{currentRev?.mimeType.split('/')[1] || 'FILE'}</span>
                        </div>
                        {currentRev?.createdAt && (
                            <div className="bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 flex items-center gap-2 shadow-2xl">
                                <Clock size={12} className="text-indigo-400" />
                                <span className="font-bold">{new Date(currentRev.createdAt).toLocaleString(undefined, { 
                                    month: 'short', day: 'numeric', 
                                    hour: '2-digit', minute: '2-digit' 
                                })}</span>
                            </div>
                        )}
                    </div>
                )}

                {!isDragging && currentRev && (
                    <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onReplaceClick(); }}
                            className="p-3 rounded-full bg-indigo-600/80 border border-indigo-400/30 text-white hover:bg-indigo-500 transition-all shadow-xl"
                            title="Replace Main Item"
                        >
                            <UploadCloud size={18} />
                        </button>
                        {(currentRev.webContentLink || previewUrl) && (
                            <button
                                type="button"
                                onClick={(e) => { void handleDownloadClick(e); }}
                                className="p-3 rounded-full bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-xl"
                                title="Download"
                            >
                                {currentRev.storage === 'google-drive' ? <ExternalLink size={18} /> : <Download size={18} />}
                            </button>
                        )}
                        {extraTopRightActions}
                    </div>
                )}

            </div>

            <div
                className={`w-full mt-6 md:mt-8 border-2 border-dashed rounded-2xl px-6 py-4 flex items-center justify-between gap-4 transition-all ${
                    isDragging
                        ? 'border-indigo-400/80 bg-indigo-600/10 text-indigo-200'
                        : 'border-slate-800 bg-slate-950/40 text-slate-500'
                }`}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={handleDragOver}
                onDrop={onDrop}
            >
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest">
                        <UploadCloud size={18} className={isDragging ? 'text-indigo-300' : 'text-slate-600'} />
                        <span>{isDragging ? 'Release to update version' : 'Drop file here to update version'}</span>
                    </div>
                </div>
                {isDragging && onCancelDrag && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onCancelDrag(); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 border border-white/10 text-white hover:bg-slate-800 transition-all"
                    >
                        <X size={14} /> Cancel
                    </button>
                )}
            </div>

            <div className="w-full mt-8 md:mt-10 flex items-center justify-between gap-6 relative z-20">
                <div className="flex gap-3">
                    <button 
                        onClick={onReplaceClick} 
                        className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl shadow-xl transition-all active:scale-95 border border-indigo-400/20"
                        title="Update Version"
                        aria-label="Update Version"
                    >
                        <UploadCloud size={18} />
                    </button>
                    {onRemix && hasRemixableAiParams && (
                        <button 
                            onClick={onRemix}
                            className="flex items-center justify-center bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl shadow-xl transition-all active:scale-95 border border-amber-400/30"
                            title="Neural Remix"
                        >
                            <Wand2 size={18} />
                        </button>
                    )}
                    {currentRev && (
                        <div className="flex bg-slate-900/50 border border-white/5 rounded-xl p-1 shadow-lg backdrop-blur-md">
                            <button
                                type="button"
                                onClick={(e) => { void handleDownloadClick(e); }}
                                className="flex items-center gap-2 hover:bg-slate-800 text-slate-300 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                {currentRev.storage === 'google-drive' ? <ExternalLink size={14} /> : <Download size={14} />} Download
                            </button>
                            <div className="w-px h-4 bg-white/5 self-center mx-1" />
                            {canBlur && (
                                <>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onBlurVersion?.();
                                        }}
                                        disabled={isBlurring}
                                        className={`flex items-center justify-center px-4 py-1.5 rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                                            isBlurEnabled
                                                ? 'bg-indigo-600 text-white shadow-inner'
                                                : 'text-slate-500 hover:text-white hover:bg-slate-800'
                                        }`}
                                        title={isBlurEnabled ? 'Disable thumbnail blur' : 'Enable thumbnail blur'}
                                    >
                                        {isBlurring ? <Loader2 size={16} className="animate-spin" /> : <Blend size={16} />}
                                    </button>
                                    <div className="w-px h-4 bg-white/5 self-center mx-1" />
                                </>
                            )}
                            <button 
                                onClick={onPinToggle} 
                                className={`flex items-center justify-center px-4 py-1.5 rounded-lg transition-all ${item.isPinned ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                                title={item.isPinned ? "Unpin Manifest" : "Pin Manifest"}
                            >
                                {item.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                            </button>
                        </div>
                    )}
                </div>
                
                {currentRev && (
                    <button 
                        onClick={onArchiveVersion} 
                        className="flex items-center justify-center bg-red-900/10 hover:bg-red-600 border border-red-900/30 text-red-500 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg" 
                        title="Archive this version"
                    >
                        <Archive size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};
