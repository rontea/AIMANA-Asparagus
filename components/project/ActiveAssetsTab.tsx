import React from 'react';
import { Archive, ChevronLeft, FolderPen, FolderPlus, Layers, Plus } from 'lucide-react';
import AssetCard from '../AssetCard';
import { ItemWithCurrentRevision, ProjectCollection } from '../../types';
import { ProjectCollectionCard } from './ProjectCollectionCard';
import { ChatItem } from '../../types/chatItems';
import { ModelOption } from '../project/lab/ModelSelector/registry/index';
import { ChatItemCard } from '../chat-items/ChatItemCard';

interface ActiveAssetsTabProps {
    collections?: ProjectCollection[];
    items: ItemWithCurrentRevision[];
    chatItems?: ChatItem[];
    viewType: 'grid' | 'list' | 'gallery';
    activeCollectionId?: string | null;
    onOpenCollection?: (collectionId: string) => void;
    onCloseCollection?: () => void;
    onNewItem?: () => void;
    onCreateCollection?: () => void;
    onEditCollection?: (collection: ProjectCollection) => void;
    hideCollectionHeader?: boolean;
    onCollectionItemDrop?: (itemId: string, collectionId: string) => void;
    onMoveToCollection?: (item: ItemWithCurrentRevision) => void;
    onSetCollectionThumbnail?: (item: ItemWithCurrentRevision) => void;
    getCollectionVisibleItemCount?: (collectionId: string) => number;
    selectedCollectionIds?: Set<string>;
    selectedItemIds: Set<string>;
    onItemClick: (item: ItemWithCurrentRevision, index: number) => void;
    onPinToggle: (item: ItemWithCurrentRevision) => void;
    onArchive: (item: ItemWithCurrentRevision) => void;
    onMove?: (item: ItemWithCurrentRevision) => void;
    onMoveChat?: (item: ChatItem) => void;
    onBulkMoveChat?: () => void;
    isBulkChatMoveDisabled?: boolean;
    selectedChatItemIds?: Set<string>;
    onToggleChatSelect?: (item: ChatItem) => void;
    onToggleAllChatSelect?: () => void;
    onChatItemClick?: (item: ChatItem) => void;
    chatRegistry?: ModelOption[];
    onRemixToBulk?: (item: ItemWithCurrentRevision) => void;
    onInspectInfo?: (item: ItemWithCurrentRevision) => void;
    getContextBadges?: (item: ItemWithCurrentRevision) => string[];
    isItemReferencedIn?: (item: ItemWithCurrentRevision) => boolean;
    onToggleSelect: (e: React.MouseEvent, id: string) => void;
    onToggleCollectionSelect?: (e: React.MouseEvent, id: string) => void;
}

export const ActiveAssetsTab: React.FC<ActiveAssetsTabProps> = ({
    collections = [],
    items,
    chatItems = [],
    viewType,
    activeCollectionId = null,
    onOpenCollection,
    onCloseCollection,
    onNewItem,
    onCreateCollection,
    onEditCollection,
    hideCollectionHeader = false,
    onCollectionItemDrop,
    onMoveToCollection,
    onSetCollectionThumbnail,
    getCollectionVisibleItemCount,
    selectedCollectionIds = new Set(),
    selectedItemIds,
    onItemClick,
    onPinToggle,
    onArchive,
    onMove,
    onMoveChat,
    onBulkMoveChat,
    isBulkChatMoveDisabled = false,
    selectedChatItemIds = new Set(),
    onToggleChatSelect,
    onToggleAllChatSelect,
    onChatItemClick,
    chatRegistry = [],
    onRemixToBulk,
    onInspectInfo,
    getContextBadges,
    isItemReferencedIn,
    onToggleSelect,
    onToggleCollectionSelect
}) => {
    const activeCollection = activeCollectionId ? collections.find((collection) => collection.id === activeCollectionId) || null : null;
    const isRootView = !activeCollection;
    const visibleChatCount = isRootView ? chatItems.length : 0;
    const isRootEmpty = items.length === 0 && collections.length === 0 && visibleChatCount === 0 && isRootView;

    const itemContainerClasses = 
        viewType === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" : 
        viewType === 'gallery' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4 md:gap-6" :
        "bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl";

    return (
        <div className="space-y-6">
            {!hideCollectionHeader && (activeCollection || onCreateCollection) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
                    <div className="min-w-0">
                        {activeCollection ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onCloseCollection}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-indigo-500/30 hover:text-white"
                                >
                                    <ChevronLeft size={14} />
                                    Back
                                </button>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Collection View</div>
                                    <div className="truncate text-sm font-semibold text-white">{activeCollection.name}</div>
                                </div>
                                {onEditCollection && (
                                    <button
                                        type="button"
                                        onClick={() => onEditCollection(activeCollection)}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-indigo-500/30 hover:text-white"
                                    >
                                        <FolderPen size={14} />
                                        Edit Title
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Project Root</div>
                                <div className="text-sm font-semibold text-white">Collections and loose assets</div>
                            </div>
                        )}
                    </div>

                    {isRootView && onCreateCollection && (
                        <button
                            type="button"
                            onClick={onCreateCollection}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                        >
                            <FolderPlus size={16} />
                            New Collection
                        </button>
                    )}
                </div>
            )}

            {isRootEmpty && (
                <div className="flex flex-col items-center justify-center py-24 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-800">
                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                        <Archive size={32} />
                    </div>
                    <p className="text-slate-400 text-lg font-medium">No assets found matching your criteria.</p>
                    <p className="text-slate-600 text-sm mt-1">Upload files or adjust your search filters.</p>
                    {onNewItem && (
                        <button
                            type="button"
                            onClick={onNewItem}
                            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
                        >
                            <Plus size={16} />
                            New Item
                        </button>
                    )}
                </div>
            )}

            {(items.length > 0 || visibleChatCount > 0 || (isRootView && collections.length > 0)) && (
                <div className="space-y-3">
                    {isRootView && visibleChatCount > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Project Runtime</div>
                                <div className="text-sm font-semibold text-white">
                                    {visibleChatCount} chat capture{visibleChatCount === 1 ? '' : 's'} included with your project assets
                                </div>
                            </div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                                Select chat cards to open bulk actions
                            </div>
                        </div>
                    )}
                    <div className={itemContainerClasses}>
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
                            {isRootView && collections.map((collection) => (
                                <ProjectCollectionCard
                                    key={collection.id}
                                    collection={collection}
                                    viewType={viewType}
                                    filteredItemCount={getCollectionVisibleItemCount?.(collection.id)}
                                    onClick={() => onOpenCollection?.(collection.id)}
                                    onDropItem={onCollectionItemDrop}
                                    isSelected={selectedCollectionIds.has(collection.id)}
                                    onToggleSelect={onToggleCollectionSelect}
                                />
                            ))}
                            {isRootView && chatItems.map((chatItem) => (
                                <ChatItemCard
                                    key={chatItem.id}
                                    item={chatItem}
                                    onSelect={(item) => onChatItemClick?.(item)}
                                    onMove={onMoveChat}
                                    isSelected={selectedChatItemIds.has(chatItem.id)}
                                    onToggleSelect={onToggleChatSelect}
                                    registry={chatRegistry}
                                    viewType={viewType}
                                />
                            ))}
                            {items.map((item, index) => (
                                <AssetCard 
                                    key={item.id} 
                                    item={item} 
                                    onClick={() => onItemClick(item, index)} 
                                    onPinToggle={onPinToggle} 
                                    onArchive={onArchive} 
                                    onMove={onMove}
                                    onMoveToCollection={onMoveToCollection}
                                    onSetCollectionThumbnail={onSetCollectionThumbnail}
                                    onRemixToBulk={onRemixToBulk}
                                    onInspectInfo={onInspectInfo}
                                    contextBadges={getContextBadges?.(item)}
                                    isReferencedIn={isItemReferencedIn?.(item)}
                                    isCollectionThumbnail={!!activeCollection && activeCollection.thumbnailItemId === item.id}
                                    isSelected={selectedItemIds.has(item.id)} 
                                    onToggleSelect={onToggleSelect}
                                    viewType={viewType}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {items.length === 0 && !isRootView && activeCollection && (
                <div className="flex flex-col items-center justify-center py-24 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-800">
                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                        <Layers size={32} />
                    </div>
                    <p className="text-slate-300 text-lg font-medium">This collection is empty.</p>
                    <p className="text-slate-600 text-sm mt-1">Move assets here from the active project view.</p>
                </div>
            )}
        </div>
    );
};
