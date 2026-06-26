import React from 'react';
import { Pin } from 'lucide-react';
import AssetCard from '../AssetCard';
import { ItemWithCurrentRevision } from '../../types';

interface PinnedAssetsTabProps {
    items: ItemWithCurrentRevision[];
    viewType: 'grid' | 'list' | 'gallery';
    selectedItemIds: Set<string>;
    onItemClick: (item: ItemWithCurrentRevision, index: number) => void;
    onPinToggle: (item: ItemWithCurrentRevision) => void;
    onArchive: (item: ItemWithCurrentRevision) => void;
    onMove?: (item: ItemWithCurrentRevision) => void;
    onRemixToBulk?: (item: ItemWithCurrentRevision) => void;
    onInspectInfo?: (item: ItemWithCurrentRevision) => void;
    getContextBadges?: (item: ItemWithCurrentRevision) => string[];
    onToggleSelect: (e: React.MouseEvent, id: string) => void;
}

export const PinnedAssetsTab: React.FC<PinnedAssetsTabProps> = ({
    items, viewType, selectedItemIds, onItemClick, onPinToggle, onArchive, onMove, onRemixToBulk, onInspectInfo, getContextBadges, onToggleSelect
}) => {
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-800">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                    <Pin size={32} />
                </div>
                <p className="text-slate-400 text-lg font-medium">No pinned assets in this project.</p>
                <p className="text-slate-600 text-sm mt-1">Pin your most important files for instant access.</p>
            </div>
        );
    }

    const containerClasses = 
        viewType === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" : 
        viewType === 'gallery' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4 md:gap-6" :
        "bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl";

    return (
        <div className={containerClasses}>
             {viewType === 'list' && (
                <div className="p-4 bg-slate-900/50 border-b border-slate-700 text-[10px] font-bold text-slate-500 uppercase flex gap-4">
                    <div className="w-10"></div>
                    <div className="w-12"></div>
                    <div className="flex-1">Title</div>
                    <div className="w-24 hidden md:block">Type</div>
                    <div className="w-24 hidden md:block">Size</div>
                    <div className="w-24 hidden lg:block">Modified</div>
                    <div className="w-24 text-right">Actions</div>
                </div>
            )}
            <div className={viewType === 'list' ? 'flex flex-col' : 'contents'}>
                {items.map((item, index) => (
                    <AssetCard 
                        key={item.id} 
                        item={item} 
                        onClick={() => onItemClick(item, index)} 
                        onPinToggle={onPinToggle} 
                        onArchive={onArchive} 
                        onMove={onMove}
                        onRemixToBulk={onRemixToBulk}
                        onInspectInfo={onInspectInfo}
                        contextBadges={getContextBadges?.(item)}
                        isSelected={selectedItemIds.has(item.id)} 
                        onToggleSelect={onToggleSelect}
                        viewType={viewType}
                    />
                ))}
            </div>
        </div>
    );
};
