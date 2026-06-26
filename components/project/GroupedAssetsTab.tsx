import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import AssetCard from '../AssetCard';
import { ItemWithCurrentRevision } from '../../types';
import { ChatItem } from '../../types/chatItems';
import { ChatItemCard } from '../chat-items/ChatItemCard';
import { ModelOption } from '../project/lab/ModelSelector/registry/index';

interface GroupedAssetsTabProps {
    items: ItemWithCurrentRevision[];
    chatItems?: ChatItem[];
    selectedItemIds: Set<string>;
    selectedChatItemIds?: Set<string>;
    onItemClick: (item: ItemWithCurrentRevision, index: number) => void;
    onChatItemClick?: (item: ChatItem) => void;
    onPinToggle: (item: ItemWithCurrentRevision) => void;
    onArchive: (item: ItemWithCurrentRevision) => void;
    onMove?: (item: ItemWithCurrentRevision) => void;
    onMoveChat?: (item: ChatItem) => void;
    onRemixToBulk?: (item: ItemWithCurrentRevision) => void;
    onInspectInfo?: (item: ItemWithCurrentRevision) => void;
    getContextBadges?: (item: ItemWithCurrentRevision) => string[];
    isItemReferencedIn?: (item: ItemWithCurrentRevision) => boolean;
    onToggleSelect: (e: React.MouseEvent, id: string) => void;
    onToggleChatSelect?: (item: ChatItem) => void;
    chatRegistry?: ModelOption[];
}

const parseReferenceIds = (item: ItemWithCurrentRevision): string[] => {
    const rev = item.currentRevision;
    if (!rev?.aiParameters) return [];
    try {
        const parsed = JSON.parse(rev.aiParameters);
        const adv = parsed?.advanced_params || parsed || {};
        const many = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds.filter((id: any) => typeof id === 'string' && id.trim()) : [];
        const single = typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim() ? [adv.referenceItemId] : [];
        return Array.from(new Set([...many, ...single]));
    } catch {
        return [];
    }
};

const isReferenceSource = (item: ItemWithCurrentRevision): boolean => {
    const rev = item.currentRevision;
    if (!rev) return false;
    if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
    if (rev.fileUrl?.includes('/Neural_Reference/')) return true;

    try {
        const parsed = rev.aiParameters ? JSON.parse(rev.aiParameters) : {};
        const adv = parsed?.advanced_params || parsed || {};
        return !!(
            (adv.isReference && !adv.parentItemId) ||
            adv.referenceAsset === true ||
            adv.reference_artifact === true ||
            adv.referenceArtifact === true ||
            adv.source === 'reference_upload' ||
            adv.source === 'reference_drop' ||
            (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
        );
    } catch {
        return false;
    }
};

export const GroupedAssetsTab: React.FC<GroupedAssetsTabProps> = ({
    items,
    chatItems = [],
    selectedItemIds,
    selectedChatItemIds = new Set(),
    onItemClick,
    onChatItemClick,
    onPinToggle,
    onArchive,
    onMove,
    onMoveChat,
    onRemixToBulk,
    onInspectInfo,
    getContextBadges,
    isItemReferencedIn,
    onToggleSelect,
    onToggleChatSelect,
    chatRegistry = []
}) => {
    const indexById = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items]);

    const { groups, singles } = useMemo(() => {
        const sourceItems = items.filter(isReferenceSource);
        const sourceIds = new Set(sourceItems.map((item) => item.id));
        const bucket = new Map<string, ItemWithCurrentRevision[]>();
        sourceItems.forEach((source) => bucket.set(source.id, []));

        const groupedIds = new Set<string>();

        for (const item of items) {
            if (sourceIds.has(item.id)) {
                groupedIds.add(item.id);
                continue;
            }
            const refs = parseReferenceIds(item);
            const sourceId = sourceItems.find((source) => refs.includes(source.id))?.id;
            if (!sourceId) continue;
            bucket.get(sourceId)?.push(item);
            groupedIds.add(item.id);
        }

        const grouped = sourceItems.map((source) => ({
            source,
            related: (bucket.get(source.id) || []).sort((a, b) => a.createdAt - b.createdAt)
        }));

        const ungrouped = items.filter((item) => !groupedIds.has(item.id));
        return { groups: grouped, singles: ungrouped };
    }, [items]);

    if (items.length === 0 && chatItems.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-800">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                    <Layers size={32} />
                </div>
                <p className="text-slate-400 text-lg font-medium">No grouped assets found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {groups.map((group) => (
                <div key={group.source.id} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                        <Layers size={14} />
                        Forge Group
                        <span className="text-slate-500">{group.related.length} linked</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        <AssetCard
                            key={group.source.id}
                            item={group.source}
                            onClick={() => onItemClick(group.source, indexById.get(group.source.id) || 0)}
                            onPinToggle={onPinToggle}
                            onArchive={onArchive}
                            onMove={onMove}
                            onRemixToBulk={onRemixToBulk}
                            onInspectInfo={onInspectInfo}
                            contextBadges={getContextBadges?.(group.source)}
                            isReferencedIn={isItemReferencedIn?.(group.source)}
                            isSelected={selectedItemIds.has(group.source.id)}
                            onToggleSelect={onToggleSelect}
                            viewType="grid"
                        />
                        {group.related.map((item) => (
                            <AssetCard
                                key={item.id}
                                item={item}
                                onClick={() => onItemClick(item, indexById.get(item.id) || 0)}
                                onPinToggle={onPinToggle}
                                onArchive={onArchive}
                                onMove={onMove}
                                onRemixToBulk={onRemixToBulk}
                                onInspectInfo={onInspectInfo}
                                contextBadges={getContextBadges?.(item)}
                                isReferencedIn={isItemReferencedIn?.(item)}
                                isSelected={selectedItemIds.has(item.id)}
                                onToggleSelect={onToggleSelect}
                                viewType="grid"
                            />
                        ))}
                    </div>
                </div>
            ))}

            {(singles.length > 0 || chatItems.length > 0) && (
                <div className="space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ungrouped</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {singles.map((item) => (
                            <AssetCard
                                key={item.id}
                                item={item}
                                onClick={() => onItemClick(item, indexById.get(item.id) || 0)}
                                onPinToggle={onPinToggle}
                                onArchive={onArchive}
                                onMove={onMove}
                                onRemixToBulk={onRemixToBulk}
                                onInspectInfo={onInspectInfo}
                                contextBadges={getContextBadges?.(item)}
                                isReferencedIn={isItemReferencedIn?.(item)}
                                isSelected={selectedItemIds.has(item.id)}
                                onToggleSelect={onToggleSelect}
                                viewType="grid"
                            />
                        ))}
                        {chatItems.map((item) => (
                            <ChatItemCard
                                key={item.id}
                                item={item}
                                onSelect={(chatItem) => onChatItemClick?.(chatItem)}
                                onMove={onMoveChat}
                                isSelected={selectedChatItemIds.has(item.id)}
                                onToggleSelect={onToggleChatSelect}
                                registry={chatRegistry}
                                viewType="grid"
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
