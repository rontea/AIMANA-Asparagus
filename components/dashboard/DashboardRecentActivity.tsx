import React, { useMemo } from 'react';
import {
    Activity,
    AudioLines,
    ChevronRight,
    FileText,
    ImageIcon,
    PackagePlus,
    Play,
    Sparkles,
    UploadCloud,
    Video
} from 'lucide-react';
import { ItemWithCurrentRevision, Project } from '../../types';

interface DashboardRecentActivityProps {
    items: ItemWithCurrentRevision[];
    projects: Project[];
    isLoading: boolean;
    onOpenProject: (projectId: string) => void;
    onViewLog?: () => void;
}

type ActivityKind = 'generated' | 'upload' | 'added';
type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'other';

interface RecentActivityCard {
    id: string;
    projectId: string;
    title: string;
    projectName: string;
    kind: ActivityKind;
    mediaKind: MediaKind;
    timestamp: number;
    meta: string;
    description: string;
    previewUrl?: string;
    thumbnailBlur?: boolean;
}

const generatedEngines = new Set([
    'gemini',
    'google',
    'pollinations',
    'openai',
    'flux',
    'sdxl',
    'seedream',
    'nanobanana',
    'kontext',
    'gpt-image',
    'veo',
    'seedance',
    'ltx',
    'grok'
]);

const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return 'Recently';
    const diff = Math.max(0, Date.now() - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) {
        const minutes = Math.max(1, Math.round(diff / minute));
        return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
    }
    if (diff < day) {
        const hours = Math.max(1, Math.round(diff / hour));
        return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.max(1, Math.round(diff / day));
    return `${days} day${days === 1 ? '' : 's'} ago`;
};

const getMediaKind = (mimeType = ''): MediaKind => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.includes('text') || mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('json')) return 'document';
    return 'other';
};

const getActivityKind = (item: ItemWithCurrentRevision): ActivityKind => {
    const rev = item.currentRevision;
    const engine = (rev?.engine || '').toLowerCase();
    if (engine === 'default-placeholder' || engine === 'reference-upload' || engine === 'reference') return 'upload';
    if (rev?.prompt?.trim()) return 'generated';
    if (Array.from(generatedEngines).some((token) => engine.includes(token))) return 'generated';
    return rev?.size ? 'upload' : 'added';
};

const getDetailLabel = (mediaKind: MediaKind, mimeType = '') => {
    if (mediaKind === 'image') return 'Image';
    if (mediaKind === 'audio') return 'Audio';
    if (mediaKind === 'video') return 'Video';
    if (mediaKind === 'document') return mimeType.includes('json') ? 'Data' : 'Document';
    return 'Item';
};

const hasThumbnailBlur = (aiParameters?: string | null) => {
    if (!aiParameters) return false;
    try {
        const parsed = JSON.parse(aiParameters);
        const advancedParams = parsed?.advanced_params || parsed || {};
        return !!(advancedParams.thumbnailBlur || parsed?.thumbnailBlur);
    } catch {
        return false;
    }
};

const expandThumbnailUrl = (url?: string) => {
    if (!url) return '';
    return url
        .replace(/=s\d+(-[a-z])?$/i, '=s1024')
        .replace(/=w\d+-h\d+(-[a-z])?$/i, '=w1024-h1024');
};

const topBadgeSurfaceStyle: React.CSSProperties = {
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    boxShadow: '0 10px 30px rgba(2, 6, 23, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.16)',
    backdropFilter: 'blur(12px)'
};

const ActivityPreview: React.FC<{ card: RecentActivityCard }> = ({ card }) => {
    if (card.previewUrl && (card.mediaKind === 'image' || card.mediaKind === 'video')) {
        return (
            <>
                <img
                    src={expandThumbnailUrl(card.previewUrl)}
                    alt={card.title}
                    className={`relative z-10 h-full w-full object-cover object-top opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100 ${card.thumbnailBlur ? 'blur-md' : ''}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                />
                {card.mediaKind === 'video' && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/10">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/45 text-white backdrop-blur">
                            <Play size={17} className="ml-0.5 fill-white" />
                        </div>
                    </div>
                )}
            </>
        );
    }

    if (card.mediaKind === 'audio') {
        return (
            <div className="relative z-10 flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.28),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.45)_0%,rgba(2,6,23,0.98)_100%)] p-6">
                <AudioLines size={30} className="text-violet-200/80" />
                <div className="flex h-24 items-end gap-2 opacity-85">
                    {[36, 78, 48, 96, 58, 84, 42, 68].map((height, index) => (
                        <span key={index} className="flex-1 rounded-full bg-gradient-to-t from-violet-500/35 to-violet-200" style={{ height }} />
                    ))}
                </div>
            </div>
        );
    }

    if (card.mediaKind === 'document') {
        return (
            <div className="relative z-10 h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_48%),linear-gradient(180deg,#040918,#081122)] p-6 text-left font-mono text-[8px] leading-relaxed tracking-widest text-emerald-300/45">
                ITEM: {card.title}<br />
                PROJECT: {card.projectName}<br />
                STATUS: RECENT<br />
                UPDATED: {new Date(card.timestamp).toLocaleString()}<br />
                SYNC: COMPLETE
            </div>
        );
    }

    return (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 text-slate-700">
            <PackagePlus size={34} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">No Preview</span>
        </div>
    );
};

const ActivityBadge: React.FC<{ kind: ActivityKind }> = ({ kind }) => {
    const label = kind === 'generated' ? 'Generated' : kind === 'upload' ? 'Uploaded' : 'Added';
    const classes = kind === 'generated'
        ? 'border-white/30 bg-black/75 text-white'
        : kind === 'upload'
            ? 'border-emerald-200/40 bg-black/75 text-emerald-50'
            : 'border-amber-200/40 bg-black/75 text-amber-50';

    return (
        <span
            className={`max-w-[72%] truncate rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${classes}`}
            style={topBadgeSurfaceStyle}
        >
            {label}
        </span>
    );
};

const EmptyActivityCard: React.FC = () => (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/35 p-5 text-sm text-slate-500">
        No recent generation, uploads, or added items yet.
    </div>
);

export const DashboardRecentActivity: React.FC<DashboardRecentActivityProps> = ({
    items,
    projects,
    isLoading,
    onOpenProject,
    onViewLog
}) => {
    const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

    const recentCards = useMemo<RecentActivityCard[]>(() => {
        return items
            .filter((item) => item.currentRevision)
            .sort((a, b) => (b.currentRevision?.createdAt || b.createdAt || 0) - (a.currentRevision?.createdAt || a.createdAt || 0))
            .slice(0, 5)
            .map((item) => {
                const rev = item.currentRevision!;
                const mediaKind = getMediaKind(rev.mimeType);
                const timestamp = rev.createdAt || item.createdAt || Date.now();
                return {
                    id: item.id,
                    projectId: item.projectId,
                    title: rev.title || rev.originalFilename || 'Untitled item',
                    projectName: projectNames.get(item.projectId) || 'Workspace',
                    kind: getActivityKind(item),
                    mediaKind,
                    timestamp,
                    meta: `${getDetailLabel(mediaKind, rev.mimeType)} - ${formatRelativeTime(timestamp)}`,
                    description: rev.prompt || rev.note || rev.label || rev.originalFilename || 'Recent item activity.',
                    previewUrl: rev.thumbnailLink || rev.fileUrl,
                    thumbnailBlur: hasThumbnailBlur(rev.aiParameters)
                };
            });
    }, [items, projectNames]);

    const totalLabel = isLoading
        ? 'Loading recent system activity...'
        : `${items.length} item${items.length === 1 ? '' : 's'} uploaded, generated, or added.`;

    return (
        <section className="space-y-5 rounded-lg border border-slate-800/80 bg-[#07101f]/70 p-5 shadow-[0_22px_70px_rgba(2,6,23,0.24)]">
            <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
                        <Activity size={19} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xl font-black tracking-tight text-white">Recent Activity</h2>
                        <p className="truncate text-xs font-semibold text-slate-400">{totalLabel}</p>
                    </div>
                </div>
                {onViewLog && (
                    <button
                        type="button"
                        onClick={onViewLog}
                        className="hidden items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-1.5 text-xs font-bold text-slate-400 transition-colors hover:border-indigo-400/40 hover:text-white sm:flex"
                    >
                        View Log
                        <ChevronRight size={14} />
                    </button>
                )}
            </div>

            {recentCards.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                    {recentCards.map((card) => {
                        const previewTone = card.mediaKind === 'image'
                            ? 'from-slate-800/20 to-slate-950/10'
                            : card.mediaKind === 'audio'
                                ? 'from-violet-500/25 to-fuchsia-500/10'
                                : card.mediaKind === 'video'
                                    ? 'from-amber-500/25 to-red-500/10'
                                    : 'from-emerald-500/15 to-slate-950/0';

                        return (
                            <button
                                key={card.id}
                                type="button"
                                onClick={() => onOpenProject(card.projectId)}
                                className="group relative flex min-h-[312px] flex-col overflow-hidden rounded-[1.15rem] border border-slate-800/80 bg-slate-950 text-left shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-slate-700 focus-visible:border-indigo-400/50 focus-visible:outline-none"
                                title={`${card.title} - ${card.description}`}
                                aria-label={`Open ${card.title} in ${card.projectName}`}
                            >
                                <div className="absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden bg-[#040918] text-slate-700">
                                    <div className={`absolute inset-0 bg-gradient-to-br ${previewTone}`} />
                                    <ActivityPreview card={card} />
                                    <div className="absolute left-2.5 right-2.5 top-2.5 z-30 flex items-start justify-between gap-2">
                                        <span
                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-[#020617] text-white transition-colors group-hover:border-white/45"
                                            style={topBadgeSurfaceStyle}
                                            title={card.kind}
                                        >
                                            <ActivityKindIcon kind={card.kind} />
                                        </span>
                                        <ActivityBadge kind={card.kind} />
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-3 bg-gradient-to-t from-black/95 via-black/78 to-transparent px-4 pb-4 pt-20 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                                        <h3 className="line-clamp-2 text-sm font-black leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                            {card.title}
                                        </h3>
                                        <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-relaxed text-slate-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                                            {card.description}
                                        </p>
                                    </div>
                                </div>

                                <div className="absolute inset-x-0 bottom-0 z-30 flex translate-y-full flex-col border-t border-white/10 bg-[#020617]/95 p-3 opacity-0 shadow-[0_-18px_42px_rgba(2,6,23,0.62)] backdrop-blur-md transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white">
                                            {card.mediaKind === 'image' && <ImageIcon size={13} />}
                                            {card.mediaKind === 'audio' && <AudioLines size={13} />}
                                            {card.mediaKind === 'video' && <Video size={13} />}
                                            {card.mediaKind === 'document' && <FileText size={13} />}
                                            {card.mediaKind === 'other' && <PackagePlus size={13} />}
                                        </span>
                                        <span className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-white">
                                            {getDetailLabel(card.mediaKind)}
                                        </span>
                                    </div>
                                    <h3 className="mt-2 line-clamp-1 text-sm font-black leading-tight text-white">
                                        {card.title}
                                    </h3>
                                    <p className="mt-1.5 line-clamp-2 min-h-[34px] text-[11px] font-semibold leading-relaxed text-slate-100">{card.description}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white">
                                            {card.meta}
                                        </span>
                                    </div>

                                    <div className="mt-auto flex items-center gap-2 pt-3">
                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white">
                                            {card.kind === 'generated' ? <Sparkles size={11} /> : card.kind === 'upload' ? <UploadCloud size={11} /> : <PackagePlus size={11} />}
                                            Recent
                                        </span>
                                        <span className="ml-auto min-w-0 truncate rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-100">
                                            {card.projectName}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <EmptyActivityCard />
            )}
        </section>
    );
};

const ActivityKindIcon: React.FC<{ kind: ActivityKind }> = ({ kind }) => {
    if (kind === 'generated') return <Sparkles size={13} />;
    if (kind === 'upload') return <UploadCloud size={13} />;
    return <PackagePlus size={13} />;
};
