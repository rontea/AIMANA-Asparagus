import React, { useMemo } from 'react';
import { MessageSquare, Clock, Bot, CheckCircle2, FolderPlus, Sparkles } from 'lucide-react';
import { ChatItem } from '../../types/chatItems';
import { ModelOption } from '../project/lab/ModelSelector/registry/index';

interface ChatItemCardProps {
    item: ChatItem;
    onSelect: (item: ChatItem) => void;
    isSelected?: boolean;
    onToggleSelect?: (item: ChatItem) => void;
    onMove?: (item: ChatItem) => void;
    registry?: ModelOption[];
    viewType?: 'grid' | 'list' | 'gallery';
}

const ChatItemCardComponent: React.FC<ChatItemCardProps> = ({
    item,
    onSelect,
    isSelected = false,
    onToggleSelect,
    onMove,
    registry = [],
    viewType = 'grid'
}) => {
    const modelIds = useMemo(() => {
        const ids = Array.isArray(item.modelIds) ? item.modelIds.filter(Boolean) : [];
        const normalized = ids.length > 0 ? ids : (item.modelId ? [item.modelId] : []);
        return Array.from(new Set(normalized.map(String)));
    }, [item.modelId, item.modelIds]);

    const modelMeta = useMemo(() => {
        const lookup = new Map(registry.map((model) => [String(model.id), model]));
        return modelIds.map((modelId) => ({
            id: modelId,
            model: lookup.get(modelId)
        }));
    }, [registry, modelIds]);

    const modelTooltip = useMemo(() => {
        if (modelMeta.length === 0) return 'No model recorded for this chat.';
        const lines = modelMeta.map(({ id, model }, index) => `${index + 1}. ${model?.label || id}`);
        return `Models used in this chat:\n${lines.join('\n')}`;
    }, [modelMeta]);

    const modelCountLabel = `${modelMeta.length || 1} model${(modelMeta.length || 1) === 1 ? '' : 's'} used`;
    const dateLabel = new Date(item.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const primaryModelLabel = modelMeta[0]?.model?.label || modelIds[0] || item.modelId || 'Unknown model';
    const sharedMoveButton = onMove ? (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onMove(item);
            }}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-slate-300 transition-all hover:border-indigo-400/40 hover:text-indigo-100"
            title="Move to project"
            aria-label="Move chat capture to project"
        >
            <FolderPlus size={14} />
        </button>
    ) : null;

    if (viewType === 'list') {
        return (
            <div
                onClick={() => onSelect(item)}
                className={`group flex items-center gap-6 border-b border-slate-800 px-5 py-6 text-left transition-colors ${
                    isSelected ? 'bg-indigo-500/5' : 'bg-slate-900/40 hover:bg-slate-900/70'
                }`}
            >
                {onToggleSelect ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleSelect(item);
                        }}
                        className="flex w-10 justify-center"
                    >
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                            isSelected ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-600 text-transparent hover:border-indigo-400'
                        }`}>
                            <CheckCircle2 size={14} />
                        </span>
                    </button>
                ) : (
                    <div className="w-10" />
                )}
                <div className="flex h-32 w-32 flex-col justify-between overflow-hidden rounded-2xl border border-slate-700 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.75)_0%,rgba(2,6,23,0.95)_100%)] p-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-black uppercase tracking-[0.24em] text-indigo-200">Chat</span>
                        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-2 text-indigo-300">
                            <MessageSquare size={16} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="line-clamp-2 text-sm font-semibold text-white">{item.title || 'Chat Capture'}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">
                            {item.messageCount} messages
                        </div>
                    </div>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-100">{item.title || 'Chat Capture'}</h3>
                        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-indigo-300">
                            Chat Capture
                        </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        <span>{item.messageCount} messages</span>
                        <span>{modelMeta.length || 1} models</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        <Clock size={12} />
                        <span>{dateLabel}</span>
                    </div>
                </div>
                <div className="hidden w-24 items-center md:flex text-[10px] font-black uppercase tracking-[0.18em] text-indigo-300">
                    Chat
                </div>
                <div className="hidden w-24 items-center md:flex text-[10px] text-slate-500">
                    {modelMeta.length || 1} model{(modelMeta.length || 1) === 1 ? '' : 's'}
                </div>
                <div className="hidden w-24 items-center lg:flex text-[10px] text-slate-500">
                    {dateLabel}
                </div>
                <div className="flex w-24 justify-end">
                    {sharedMoveButton ? React.cloneElement(sharedMoveButton, { className: 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/60 text-slate-300 transition-colors hover:border-indigo-500/30 hover:text-indigo-200' }) : null}
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => onSelect(item)}
            className={`group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-all ${
                isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-indigo-900/30' : 'border-slate-700 bg-slate-800 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-900/20'
            }`}
        >
            {onToggleSelect && (
                <div className="absolute left-3 top-3 z-30">
                    <button
                        type="button"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleSelect(item);
                        }}
                        className={`rounded-full border-2 p-1 transition-all ${
                            isSelected ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-slate-500 bg-slate-900/70 text-transparent hover:border-indigo-400 group-hover:bg-slate-800'
                        }`}
                        title={isSelected ? 'Deselect chat capture' : 'Select chat capture'}
                    >
                        <CheckCircle2 size={16} />
                    </button>
                </div>
            )}
            <div className={`absolute top-3 z-30 ${onToggleSelect ? 'left-12' : 'left-3'}`}>
                <div className="rounded-full border border-slate-950/90 bg-indigo-400 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-950 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                    Chat
                </div>
            </div>
            {sharedMoveButton && (
                <div className="absolute right-3 top-3 z-30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {React.cloneElement(sharedMoveButton, { className: 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 backdrop-blur-sm transition-all hover:border-indigo-400/40 hover:text-indigo-100' })}
                </div>
            )}
            <div className="relative aspect-square w-full overflow-hidden border-b border-slate-700/50 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.75)_0%,rgba(2,6,23,0.95)_100%)]">
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(99,102,241,0.22),transparent_42%,rgba(14,165,233,0.12)_100%)]" />
                <div className="relative flex h-full flex-col justify-between p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-200">AI Chat</div>
                            <div className="mt-2 line-clamp-2 text-sm font-semibold text-white">{item.title || 'Chat Capture'}</div>
                            <div className="mt-1 truncate text-[10px] uppercase tracking-[0.22em] text-slate-400">
                                {primaryModelLabel}
                            </div>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-200 shadow-lg shadow-indigo-950/20">
                            <MessageSquare size={20} />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-6 gap-1.5">
                            {Array.from({ length: Math.min(6, Math.max(3, Math.min(item.messageCount, 6))) }).map((_, index) => (
                                <span
                                    key={`${item.id}-chat-bar-${index}`}
                                    className="rounded-full bg-gradient-to-t from-indigo-500/35 via-indigo-300/75 to-cyan-100"
                                    style={{ height: `${18 + ((index * 7 + item.messageCount) % 28)}px` }}
                                />
                            ))}
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-slate-300 backdrop-blur-sm">
                            <span>{item.messageCount} messages</span>
                            <span>{modelMeta.length || 1} models</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="shrink-0 text-indigo-300 transition-transform duration-200 group-hover:scale-110">
                            <MessageSquare size={18} />
                        </div>
                        <h3 className="truncate text-sm font-medium text-slate-200" title={item.title || 'Chat Capture'}>
                            {item.title || 'Chat Capture'}
                        </h3>
                    </div>
                    <div
                        title={modelTooltip}
                        aria-label={modelCountLabel}
                        className="relative inline-flex h-8 w-8 shrink-0 cursor-help items-center justify-center rounded-full border border-indigo-500/25 bg-slate-950/90 text-indigo-200 shadow-[0_6px_18px_rgba(15,23,42,0.45)]"
                    >
                        <Bot size={14} />
                        <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/20 px-1 text-[8px] font-black leading-none text-indigo-100">
                            {modelMeta.length || 1}
                        </span>
                    </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                    <span className="uppercase">Chat Runtime Snapshot</span>
                </div>
                <div className="mt-3 space-y-0.5">
                    <div className="flex items-center text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                        <Sparkles size={10} className="mr-1.5" />
                        <span>Primary Model</span>
                    </div>
                    <div className="truncate pl-4 text-[10px] font-mono text-slate-500 opacity-80" title={primaryModelLabel}>
                        {primaryModelLabel}
                    </div>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-slate-700/50 pt-3 text-[10px] text-slate-500" title={`Updated on ${new Date(item.updatedAt).toLocaleString()}`}>
                    <div className="flex items-center">
                        <Clock size={10} className="mr-1.5" />
                        <span>{dateLabel}</span>
                    </div>
                    <div className="rounded-full border border-indigo-500/20 bg-indigo-500/5 px-2 py-1 font-black uppercase tracking-[0.18em] text-indigo-300">
                        {item.messageCount} msgs
                    </div>
                </div>
            </div>
        </button>
    );
};

export const ChatItemCard = React.memo(ChatItemCardComponent);
