
import React, { useState, useEffect } from 'react';
import { Link2, Plus, UploadCloud, X, ChevronUp, FileIcon, Maximize2, Trash2 } from 'lucide-react';
import { Revision, ItemWithCurrentRevision, AssetType } from '../../types';
import { api } from '../../services/api';
import { determineAssetType } from '../../services/db';
import { MosaicViewerModal } from './MosaicViewerModal';

interface ReferenceManifestProps {
    revision: Revision | undefined;
    onLinkRequested?: () => void;
    onUnlinkRequested?: (itemId: string) => void;
    onDropLink?: (itemId: string) => void;
    onViewItem?: (item: ItemWithCurrentRevision) => void;
    onMoveItemToProject?: (item: ItemWithCurrentRevision) => void;
    onDrop?: (e: React.DragEvent) => void;
}

export const ReferenceManifest: React.FC<ReferenceManifestProps> = ({ 
    revision, onLinkRequested, onUnlinkRequested, onDropLink, onViewItem, onMoveItemToProject, onDrop
}) => {
    const [referenceItems, setReferenceItems] = useState<ItemWithCurrentRevision[]>([]);
    const [referenceKind, setReferenceKind] = useState<'neural' | 'image'>('neural');
    const [isLoading, setIsLoading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    useEffect(() => {
        setReferenceItems([]);
        setReferenceKind('neural');
        if (!revision?.aiParameters) return;

        try {
            const params = JSON.parse(revision.aiParameters);
            const adv = params.advanced_params || params;

            const neuralIds: string[] = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds.filter(Boolean) : [];
            const imageId = typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()
                ? adv.referenceItemId.trim()
                : '';
            const sourceIds: string[] = neuralIds.length > 0
                ? neuralIds
                : (imageId ? [imageId] : []);

            if (sourceIds.length > 0) {
                setReferenceKind(neuralIds.length > 0 ? 'neural' : 'image');
            }

            if (sourceIds.length > 0) {
                setIsLoading(true);
                Promise.all(sourceIds.map(id => api.items.get(id)))
                    .then(items => {
                        setReferenceItems(items.filter((i): i is ItemWithCurrentRevision => i !== null));
                    })
                    .finally(() => setIsLoading(false));
            }
        } catch (e) {
            console.warn("Failed to parse reference metadata");
        }
    }, [revision]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Check if there are files or an internal asset being dragged
        if (e.dataTransfer.types.includes('application/x-aimana-asset') || e.dataTransfer.types.includes('Files')) {
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
        if (onDrop) {
            onDrop(e);
        } else {
            const internalId = e.dataTransfer.getData('application/x-aimana-asset');
            if (internalId && onDropLink) {
                onDropLink(internalId);
            }
        }
    };

    const handleOpenPreview = (index: number) => {
        setActiveIndex(index);
        setIsViewerOpen(true);
    };

    const handleInspectReference = async (id: string) => {
        setIsViewerOpen(false);
        const item = await api.items.get(id);
        if (item && onViewItem) {
            onViewItem(item);
        }
    };

    const handleMoveReferenceToProject = async (id: string) => {
        if (!onMoveItemToProject) return;
        setIsViewerOpen(false);
        const item = await api.items.get(id);
        if (item) {
            onMoveItemToProject(item);
        }
    };

    const viewerFiles = referenceItems.map(item => ({
        id: item.id,
        url: item.currentRevision?.fileUrl || '',
        mimeType: item.currentRevision?.mimeType || 'image/png'
    }));

    return (
        <section 
            className={`space-y-4 pt-4 border-t border-slate-800 transition-all duration-300 min-h-[120px] rounded-2xl ${isDragOver ? 'bg-indigo-600/5 ring-2 ring-indigo-500/20 px-4' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleLocalDrop}
        >
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg transition-colors ${referenceItems.length > 0 || isDragOver ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                        <Link2 size={16} className={isDragOver ? 'animate-pulse' : ''} />
                    </div>
                    <div>
                        <h3 className={`text-[11px] font-black uppercase tracking-widest transition-colors ${isDragOver ? 'text-indigo-300' : 'text-slate-200'}`}>
                            {isDragOver ? 'Link Reference Artifact' : referenceKind === 'image' ? 'Reference Image' : 'Neural References'}
                        </h3>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter mt-0.5">Linked Registry</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {referenceItems.length > 0 && (
                        <button 
                            onClick={() => setIsViewerOpen(true)}
                            className="p-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/20 transition-all"
                        >
                            <Maximize2 size={14} />
                        </button>
                    )}
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-white rounded-lg border border-white/5 transition-all ${isExpanded ? 'rotate-180' : ''}`}
                    >
                        <ChevronUp size={14} />
                    </button>
                </div>
            </div>

            <div className={`transition-all duration-500 ease-in-out`}>
                <div className={`flex gap-3 overflow-x-auto pb-4 custom-scrollbar ${isExpanded ? 'flex-wrap overflow-x-hidden h-auto' : 'flex-nowrap'}`}>
                    {referenceItems.map((item, idx) => (
                        <div 
                            key={item.id}
                            className="relative shrink-0 w-28 h-28 rounded-[1.5rem] bg-slate-900 border border-white/5 overflow-hidden group shadow-2xl transition-all hover:border-indigo-500/40"
                        >
                            {item.currentRevision?.fileUrl ? (
                                <img src={item.currentRevision.fileUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" alt="Ref" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-700">
                                    <FileIcon size={24} />
                                </div>
                            )}
                            
                            <div className="absolute top-2 left-2 bg-[#222] px-1.5 py-0.5 rounded border border-white/10 text-[9px] font-black text-white/80 shadow-lg z-10">
                                {idx + 1}
                            </div>

                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                <div className="flex gap-1.5 justify-center translate-y-2 group-hover:translate-y-0 transition-transform">
                                    <button 
                                        onClick={() => handleOpenPreview(idx)}
                                        className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-xl hover:bg-indigo-500 transition-colors"
                                    >
                                        <Maximize2 size={12} />
                                    </button>
                                    <button 
                                        onClick={() => onViewItem?.(item)}
                                        className="p-1.5 bg-slate-800 text-white rounded-lg shadow-xl hover:bg-slate-700 transition-colors"
                                    >
                                        <FileIcon size={12} />
                                    </button>
                                    {onUnlinkRequested && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onUnlinkRequested(item.id); }}
                                            className="p-1.5 bg-red-600 text-white rounded-lg shadow-xl hover:bg-red-500 transition-colors"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    <button 
                        type="button"
                        onClick={onLinkRequested}
                        className={`shrink-0 w-28 h-28 border-2 border-dashed rounded-[1.5rem] flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group/add ${
                            isDragOver 
                            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 scale-[0.98]' 
                            : 'border-slate-800 bg-black/20 text-slate-600 hover:border-indigo-500/30 hover:bg-indigo-500/5 hover:text-indigo-400'
                        }`}
                    >
                        {isDragOver ? (
                            <>
                                <UploadCloud size={32} className="animate-bounce text-indigo-400" />
                                <span className="text-[8px] font-black uppercase tracking-widest">Release to Link Node</span>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover/add:scale-110 transition-transform">
                                        <Plus size={20} />
                                    </div>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover/add:text-indigo-300 transition-colors">ADD NODE</span>
                                </div>
                                <span className="text-[9px] font-bold text-slate-700 uppercase tracking-tighter px-2 text-center leading-tight">Link Item or Drop Image</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
            
            {isLoading && (
                <div className="flex items-center justify-center py-2 animate-pulse">
                    <div className="w-1 h-1 bg-indigo-500 rounded-full mx-0.5" />
                    <div className="w-1 h-1 bg-indigo-500 rounded-full mx-0.5" />
                    <div className="w-1 h-1 bg-indigo-500 rounded-full mx-0.5" />
                </div>
            )}

            <MosaicViewerModal 
                isOpen={isViewerOpen} 
                onClose={() => setIsViewerOpen(false)} 
                files={viewerFiles} 
                title={referenceKind === 'image' ? 'Reference Image Registry' : 'Neural Reference Registry'} 
                initialIndex={activeIndex}
                onInspect={handleInspectReference}
                onMoveToProject={onMoveItemToProject ? handleMoveReferenceToProject : undefined}
            />
        </section>
    );
};
