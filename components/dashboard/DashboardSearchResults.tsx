import React from 'react';
import { useNavigate } from 'react-router';
import {
    AudioLines,
    FileText,
    Folder,
    ImageIcon,
    Loader2,
    MessageSquare,
    Pin,
    Search,
    Sparkles,
    Video
} from 'lucide-react';
import { DashboardSearchResult, DashboardSearchSort } from '../../hooks/useDashboardSearch';

interface DashboardSearchResultsProps {
    query: string;
    results: DashboardSearchResult[];
    totalIndexed: number;
    isLoading: boolean;
    error?: string | null;
    sort: DashboardSearchSort;
    onSortChange: (sort: DashboardSearchSort) => void;
}

const sortOptions: Array<{ id: DashboardSearchSort; label: string }> = [
    { id: 'relevance', label: 'Relevance' },
    { id: 'updated', label: 'Updated' },
    { id: 'created', label: 'Created' },
    { id: 'name', label: 'Name' }
];

const getKindIcon = (result: DashboardSearchResult) => {
    if (result.kind === 'project') return Folder;
    if (result.kind === 'chat') return MessageSquare;
    if (result.kind === 'prompt') return Sparkles;
    if (result.media === 'image') return ImageIcon;
    if (result.media === 'video') return Video;
    if (result.media === 'audio') return AudioLines;
    return FileText;
};

const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return 'Recently';
    const diff = Math.max(0, Date.now() - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} min ago`;
    if (diff < day) return `${Math.max(1, Math.round(diff / hour))} hr ago`;
    return `${Math.max(1, Math.round(diff / day))} day ago`;
};

export const DashboardSearchResults: React.FC<DashboardSearchResultsProps> = ({
    query,
    results,
    totalIndexed,
    isLoading,
    error,
    sort,
    onSortChange
}) => {
    const navigate = useNavigate();
    const trimmedQuery = query.trim();

    return (
        <section className="space-y-4">
            <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-300">
                        Showing <span className="font-black text-white">{results.length}</span> result{results.length === 1 ? '' : 's'}
                        {trimmedQuery && <> for <span className="text-indigo-300">"{trimmedQuery}"</span></>}
                    </p>
                    <p className="text-xs text-slate-500">
                        {isLoading ? 'Building dashboard search index...' : `${totalIndexed} searchable records indexed across the system.`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sort</span>
                    <div className="flex overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                        {sortOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => onSortChange(option.id)}
                                className={`px-3 py-2 text-xs font-bold transition-colors ${
                                    sort === option.id
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                    {error}
                </div>
            )}

            {isLoading && results.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm font-semibold text-slate-400">
                    <Loader2 size={18} className="animate-spin text-indigo-300" />
                    Indexing projects, saved items, chat captures, and prompts.
                </div>
            ) : results.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0E121E] shadow-xl shadow-black/10">
                    <div className="hidden grid-cols-12 gap-4 border-b border-slate-800 bg-slate-950/60 p-4 text-xs font-black uppercase tracking-widest text-slate-400 lg:grid">
                        <div className="col-span-5">Title & Prompt</div>
                        <div className="col-span-2">Date and Time</div>
                        <div className="col-span-3">Tags</div>
                        <div className="col-span-2 text-right">Source / Status</div>
                    </div>
                    {results.slice(0, 80).map((result) => {
                        const Icon = getKindIcon(result);
                        const isImage = result.previewUrl && result.media === 'image';

                        return (
                            <button
                                key={`${result.kind}-${result.id}`}
                                type="button"
                                onClick={() => navigate(result.href)}
                                className="group relative grid w-full grid-cols-1 gap-3 border-b border-slate-800/70 p-4 text-left transition-colors last:border-b-0 hover:bg-[#131724] lg:grid-cols-12 lg:gap-4"
                                title={result.title}
                            >
                                <div className="absolute bottom-0 left-0 top-0 w-0.5 bg-transparent transition-colors group-hover:bg-indigo-300" />
                                <div className="col-span-5 flex min-w-0 gap-3">
                                    <div className="mt-1 hidden h-4 w-4 shrink-0 rounded border border-slate-800 bg-slate-950 transition-colors group-hover:border-slate-500 sm:block" />
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-800 bg-slate-950">
                                        {isImage ? (
                                            <img src={result.previewUrl} alt={result.title} className={`h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100 ${result.thumbnailBlur ? 'blur-md' : ''}`} />
                                        ) : (
                                            <Icon size={18} className="text-indigo-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <h3 className="truncate text-sm font-bold text-slate-100 transition-colors group-hover:text-white">{result.title}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="rounded border border-indigo-400/20 bg-indigo-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-200">
                                                    {result.subtitle}
                                                </span>
                                                {result.isPinned && <Pin size={11} className="fill-amber-300 text-amber-300" />}
                                            </div>
                                        </div>
                                        <p className="mt-1 truncate text-[11px] text-slate-500">
                                            <span className="rounded bg-indigo-400/10 px-1 font-semibold text-indigo-300/80">Prompt:</span>{' '}
                                            {result.description}
                                        </p>
                                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{result.searchableText || result.description}</p>
                                    </div>
                                </div>

                                <div className="col-span-2 text-xs text-slate-400 lg:pt-2">
                                    <div className="font-semibold text-slate-300">{new Date(result.updatedAt || result.createdAt).toLocaleDateString()}</div>
                                    <div className="mt-0.5 text-[11px] text-slate-500">{formatRelativeTime(result.updatedAt || result.createdAt)}</div>
                                </div>

                                <div className="col-span-3 flex flex-wrap content-start gap-1.5 lg:pt-2">
                                    {(result.tags.length > 0 ? result.tags.slice(0, 4) : [result.kind]).map((tag) => (
                                        <span key={tag} className="rounded border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium text-indigo-200">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>

                                <div className="col-span-2 flex items-center justify-between gap-3 text-xs text-slate-400 lg:justify-end lg:pt-2 lg:text-right">
                                    <span className="truncate">{result.projectName || result.storageLabel}</span>
                                    <div>
                                        <div className="font-semibold capitalize text-slate-200">{result.status}</div>
                                        <div className="mt-0.5 text-[11px] text-slate-500">{result.storageLabel}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center">
                    <Search size={24} className="text-slate-600" />
                    <h3 className="mt-3 text-sm font-black text-slate-200">No matching records</h3>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                        Try a broader term, clear a filter, or search by project name, item title, prompt text, tags, engine, or chat transcript.
                    </p>
                </div>
            )}
        </section>
    );
};
