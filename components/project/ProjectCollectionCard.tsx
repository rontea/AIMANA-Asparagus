import React, { useMemo } from 'react';
import { CheckCircle2, Clock, Folder, ImagePlus, Layers } from 'lucide-react';
import { ProjectCollection } from '../../types';

interface ProjectCollectionCardProps {
    collection: ProjectCollection;
    viewType: 'grid' | 'list' | 'gallery';
    filteredItemCount?: number;
    onClick: () => void;
    onDropItem?: (itemId: string, collectionId: string) => void;
    isSelected?: boolean;
    onToggleSelect?: (e: React.MouseEvent, collectionId: string) => void;
}

const resolvePreviewUrl = (collection: ProjectCollection, visibleCount?: number): string => {
    const effectiveCount = typeof visibleCount === 'number' ? visibleCount : collection.itemCount;
    if (effectiveCount <= 0 || collection.itemCount <= 0) return '';
    const thumbnail = collection.thumbnail;
    if (!thumbnail) return '';
    return thumbnail.thumbnailLink || thumbnail.fileUrl || '';
};

const hasThumbnailBlur = (collection: ProjectCollection): boolean => {
    const raw = collection.thumbnail?.aiParameters;
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        const advancedParams = parsed?.advanced_params || parsed || {};
        return !!(advancedParams.thumbnailBlur || parsed?.thumbnailBlur);
    } catch {
        return false;
    }
};

export const ProjectCollectionCard: React.FC<ProjectCollectionCardProps> = ({
    collection,
    viewType,
    filteredItemCount,
    onClick,
    onDropItem,
    isSelected = false,
    onToggleSelect
}) => {
    const visibleCount = filteredItemCount ?? collection.itemCount;
    const previewUrl = useMemo(() => resolvePreviewUrl(collection, visibleCount), [collection, visibleCount]);
    const thumbnailBlurClass = useMemo(() => hasThumbnailBlur(collection) ? 'blur-md' : '', [collection]);
    const dateLabel = useMemo(
        () => new Date(collection.updatedAt || collection.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        [collection.createdAt, collection.updatedAt]
    );

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const itemId = e.dataTransfer.getData('application/x-aimana-asset');
        if (itemId && onDropItem) onDropItem(itemId, collection.id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!onDropItem) return;
        if (e.dataTransfer.types.includes('application/x-aimana-asset')) {
            e.preventDefault();
        }
    };

    if (viewType === 'list') {
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={onClick}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClick();
                    }
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`group flex w-full items-center gap-6 border-b border-slate-800 px-5 py-6 text-left transition-colors ${isSelected ? 'bg-indigo-500/5' : 'bg-slate-900/40 hover:bg-slate-900/70'}`}
            >
                {onToggleSelect ? (
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(e, collection.id); }}
                        className="flex w-10 justify-center"
                    >
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${isSelected ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-600 text-transparent hover:border-indigo-400'}`}>
                            <CheckCircle2 size={14} />
                        </span>
                    </button>
                ) : (
                    <div className="w-10" />
                )}
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                    {previewUrl ? (
                        <img src={previewUrl} alt={collection.name} className={`h-full w-full object-cover ${thumbnailBlurClass}`} loading="lazy" />
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                            <Folder size={22} />
                            <span className="text-[9px] font-black uppercase tracking-[0.24em]">No Thumb</span>
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-100">{collection.name}</h3>
                        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-300">
                            Collection
                        </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        <span>{visibleCount} visible</span>
                        <span>{collection.itemCount} total</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        <Clock size={12} />
                        <span>{dateLabel}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 transition-colors group-hover:border-indigo-500/30 group-hover:text-indigo-300">
                    <Layers size={14} />
                    Open Folder
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-all ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-indigo-900/30' : 'border-slate-700 bg-slate-800 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-900/20'}`}
        >
            {onToggleSelect && (
                <div className="absolute left-3 top-3 z-30">
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(e, collection.id); }}
                        className={`rounded-full border-2 p-1 transition-all ${isSelected ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-500 bg-slate-900/70 text-transparent hover:border-indigo-400 group-hover:bg-slate-800'}`}
                    >
                        <CheckCircle2 size={16} />
                    </button>
                </div>
            )}
            <div className="relative aspect-square w-full overflow-hidden border-b border-slate-700/50 bg-slate-900">
                {previewUrl ? (
                    <>
                        <img
                            src={previewUrl}
                            alt={collection.name}
                            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${thumbnailBlurClass}`}
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                    </>
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.75)_0%,rgba(2,6,23,0.95)_100%)] p-4 text-slate-500">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-800">
                            <Folder size={28} />
                        </div>
                        <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.24em]">
                            <ImagePlus size={12} />
                            Set Main Thumbnail
                        </div>
                    </div>
                )}
                <div className={`absolute top-3 rounded-full border border-slate-950/90 bg-amber-400 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ${onToggleSelect ? 'left-12' : 'left-3'}`}>
                    Collection
                </div>
            </div>
            <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-2 flex-1 text-sm font-medium text-slate-200" title={collection.name}>{collection.name}</h3>
                    <div className="rounded-lg bg-slate-900/70 p-2 text-slate-500 transition-colors group-hover:text-indigo-300">
                        <Folder size={16} />
                    </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                    <span className="uppercase">Folder</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500" title={`Updated ${new Date(collection.updatedAt || collection.createdAt).toLocaleString()}`}>
                    <Clock size={12} />
                    <span>{dateLabel}</span>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-slate-700/50 pt-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <span>{visibleCount} visible</span>
                    <span>{collection.itemCount} total</span>
                </div>
            </div>
        </button>
    );
};
