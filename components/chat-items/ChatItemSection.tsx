import React from 'react';
import { CheckSquare, FolderPlus, RefreshCw, Square } from 'lucide-react';
import { ChatItem } from '../../types/chatItems';
import { ChatItemCard } from './ChatItemCard';
import { ModelOption } from '../project/lab/ModelSelector/registry/index';

interface ChatItemSectionProps {
    items: ChatItem[];
    isLoading: boolean;
    onSelect: (item: ChatItem) => void;
    onRefresh: () => void;
    selectedIds?: Set<string>;
    onToggleSelect?: (item: ChatItem) => void;
    onToggleSelectAll?: () => void;
    onMove?: (item: ChatItem) => void;
    onBulkMove?: () => void;
    isBulkMoveDisabled?: boolean;
    registry?: ModelOption[];
}

export const ChatItemSection: React.FC<ChatItemSectionProps> = ({
    items,
    isLoading,
    onSelect,
    onRefresh,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    onMove,
    onBulkMove,
    isBulkMoveDisabled = false,
    registry = []
}) => {
    const selectedCount = selectedIds?.size || 0;
    const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds?.has(item.id));

    return (
        <section className="px-6 lg:px-10 pt-6 pb-4">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Chat Captures</h2>
                    <p className="text-xs text-slate-500 mt-1">Saved AI chat runtime snapshots for this project.</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {onToggleSelectAll && items.length > 0 && (
                        <button
                            onClick={onToggleSelectAll}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        >
                            {allVisibleSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                            {allVisibleSelected ? 'Clear All' : 'Select All'}
                        </button>
                    )}
                    {onBulkMove && selectedCount > 0 && (
                        <button
                            onClick={onBulkMove}
                            disabled={isBulkMoveDisabled}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-[10px] font-black uppercase tracking-widest text-indigo-200 hover:bg-indigo-500/20 transition-all disabled:opacity-50"
                        >
                            <FolderPlus size={12} />
                            Move {selectedCount}
                        </button>
                    )}
                    <button
                        onClick={onRefresh}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
                        disabled={isLoading}
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>
            {items.length === 0 ? (
                <div className="border border-dashed border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-500">
                    {isLoading ? 'Loading chat captures...' : 'No chat captures yet.'}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {items.map((item) => (
                        <ChatItemCard
                            key={item.id}
                            item={item}
                            onSelect={onSelect}
                            isSelected={selectedIds?.has(item.id)}
                            onToggleSelect={onToggleSelect}
                            onMove={onMove}
                            registry={registry}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
