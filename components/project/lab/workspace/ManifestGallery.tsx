
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { LayoutGrid, List as ListIcon, Archive, Clock, Trash2, FolderPlus, Info, Wand2, CheckSquare, Square, Check, Loader2, FileText, Cpu, Volume2, Play, Pause, Download, Share2, Flower2, ChevronDown, ChevronUp } from 'lucide-react';
import { LabTask } from '../../../../hooks/useAiGeneration';
import { LabTaskCard } from '../LabTaskCard';
import { ItemWithCurrentRevision } from '../../../../types';
import { GeneratedImageResult } from '../../../../services/geminiService';
import { ModelOption, loadDynamicRegistry } from '../ModelSelector/registry/index';
import { isMusicAudioModel, isTranscriptionAudioModel } from '../ModelSelector/audioModelUtils';
import { useModalDialogs } from '../../../../hooks/useModalDialogs';
import { extractPollenUsed, formatPollenAmount, getPrimaryModelCreditRate } from '../../../../utils/pollenCredits';
import { extractGoogleEstimatedCostUsd, extractGoogleUsage, formatGoogleUsd, summarizeGoogleUsage } from '../../../../utils/googleCredits';
import { downloadGeneratedArtifact, downloadRevisionArtifact } from '../../../../utils/downloadArtifact';
import { buildTranscriptSummaryExcerpt, extractTranscriptionManifestDetails, isTranscriptPostProcessPending } from '../../../../utils/transcriptionManifest';

interface ManifestGalleryProps {
    tasks: LabTask[];
    historyTasks: LabTask[];
    onRemoveTask: (id: string) => void;
    onSave: (result: GeneratedImageResult | null, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => void;
    onBulkSave?: (items: LabTask[]) => void;
    onInspectTask: (task: LabTask) => void;
    onRemixTask?: (task: LabTask) => void;
    onPublishToSource?: (task: LabTask) => Promise<void> | void;
    registry?: ModelOption[];
    excludeLabContentUploads?: boolean;
    excludeMatrixCompositions?: boolean;
    manifestType?: 'image' | 'video' | 'audio' | 'text' | 'all';
    hideAudioWhenManifestTypeAll?: boolean;
    onlyTranscriptions?: boolean;
    onlyMusicGenerations?: boolean;
}

const AUDIO_WAVEFORM_BARS = [4, 8, 12, 6, 10, 5, 9, 14, 7, 11, 6, 9, 13, 5, 10, 8, 12, 6, 9, 11, 7, 10, 6, 9, 5, 8];
const AUDIO_SLIDER_CLASS = "block h-3 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-indigo-200/80 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_5px_rgba(99,102,241,0.18)] [&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-indigo-200/80 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_0_5px_rgba(99,102,241,0.18)]";

const formatTime = (value?: number) => {
    if (!Number.isFinite(value) || value === undefined) return '--:--';
    const total = Math.max(0, Math.round(value));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

interface AudioManifestCardProps {
    task: LabTask;
    src: string;
    isSelected: boolean;
    isSelectable: boolean;
    onToggleSelection: (e: React.MouseEvent, id: string) => void;
    onInspect: () => void;
    onCapture?: () => void;
    onDownload?: () => void;
    onPublish?: () => void;
    onRemix?: () => void;
    onRemove: () => void;
    voiceLabel: string;
    titleLabel: string;
    modelLabel: string;
    timeLabel: string;
    pollenUsedLabel?: string | null;
    creditRateLabel?: string | null;
    googleUsageLabel?: string | null;
    googleCostLabel?: string | null;
    status: LabTask['status'];
}

const AudioListManifestCard: React.FC<AudioManifestCardProps> = ({
    task,
    src,
    isSelected,
    isSelectable,
    onToggleSelection,
    onInspect,
    onCapture,
    onDownload,
    onPublish,
    onRemix,
    onRemove,
    voiceLabel,
    titleLabel,
    modelLabel,
    timeLabel,
    pollenUsedLabel,
    creditRateLabel,
    googleUsageLabel,
    googleCostLabel,
    status
}) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showTranscript, setShowTranscript] = useState(false);
    const isInteractive = status === 'success';

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTime = () => setCurrentTime(audio.currentTime || 0);
        const handleMeta = () => setDuration(audio.duration || 0);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnd = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', handleTime);
        audio.addEventListener('loadedmetadata', handleMeta);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnd);

        return () => {
            audio.removeEventListener('timeupdate', handleTime);
            audio.removeEventListener('loadedmetadata', handleMeta);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnd);
        };
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio || !src) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(() => {});
        }
    };

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const progressPercent = duration > 0 ? Math.round(progress * 100) : 0;

    const handleSeek = (value: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(duration) || duration <= 0) return;
        const nextTime = Math.min(duration, Math.max(0, value));
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    return (
        <div
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : -1}
            onClick={isInteractive ? onInspect : undefined}
            onKeyDown={isInteractive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspect();
                }
            } : undefined}
            className={`group relative rounded-[2rem] border border-slate-800/70 bg-gradient-to-br from-slate-900/70 via-slate-950/50 to-slate-900/70 shadow-[0_20px_60px_rgba(0,0,0,0.45)] p-6 transition-all hover:border-indigo-500/40 ${
                isInteractive ? 'cursor-pointer' : 'cursor-default'
            } ${
                isSelected ? 'ring-1 ring-indigo-500/60' : ''
            }`}
        >
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    {isSelectable && (
                        <button
                            onClick={(e) => onToggleSelection(e, task.id)}
                            className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                                isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 text-transparent'
                            }`}
                        >
                            <Check size={12} />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        className="w-14 h-14 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl shadow-indigo-900/40 hover:scale-[1.02] transition-all"
                        disabled={!src}
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause size={20} /> : <Play size={22} className="ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="mb-2 truncate text-sm font-semibold text-white">{titleLabel}</div>
                        <div className="flex items-end gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                {AUDIO_WAVEFORM_BARS.map((height, index) => {
                                    const isActive = progress > 0 && index / AUDIO_WAVEFORM_BARS.length < progress;
                                    return (
                                        <span
                                            key={index}
                                            className={`w-1 rounded-full transition-all ${isActive ? 'bg-indigo-400' : 'bg-slate-700/60'}`}
                                            style={{ height: `${height + 4}px` }}
                                        />
                                    );
                                })}
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">{formatTime(currentTime)} / {formatTime(duration)}</span>
                        </div>
                        <div className="mt-3">
                            <input
                                type="range"
                                min={0}
                                max={duration || 0}
                                step={0.1}
                                value={Math.min(currentTime, duration || 0)}
                                onChange={(e) => handleSeek(Number(e.target.value))}
                                disabled={!src || duration <= 0}
                                aria-label={`Seek ${titleLabel}`}
                                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{
                                    background: duration > 0
                                        ? `linear-gradient(to right, rgb(129 140 248) 0%, rgb(129 140 248) ${progressPercent}%, rgb(30 41 59) ${progressPercent}%, rgb(30 41 59) 100%)`
                                        : undefined
                                }}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-slate-400 text-xs font-mono shrink-0">
                    <span>1.0x</span>
                    <Volume2 size={16} />
                    {onDownload && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDownload();
                            }}
                            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                            title="Download"
                        >
                            <Download size={16} />
                        </button>
                    )}
                    {onCapture && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCapture();
                            }}
                            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                            title="Capture to Project"
                        >
                            <FolderPlus size={16} />
                        </button>
                    )}
                    {onPublish && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onPublish();
                            }}
                            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                            title="Share"
                        >
                            <Share2 size={16} />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="p-2 rounded-lg hover:bg-red-600/20 transition-colors text-red-400/80 hover:text-red-300"
                        title="Move to Recycle Bin"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/60 pt-4">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowTranscript((prev) => !prev);
                    }}
                    className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                    <ListIcon size={14} />
                    {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                </button>
                <div className="flex items-center gap-3">
                    {onRemix && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemix();
                            }}
                            className="px-3 py-1 rounded-full border border-amber-500/30 text-amber-300 text-[10px] uppercase tracking-widest hover:bg-amber-500/10 transition-colors"
                        >
                            Remix
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onInspect();
                        }}
                        className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                    >
                        <Info size={12} />
                        Inspect
                    </button>
                </div>
            </div>

            {showTranscript && (
                <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200 italic leading-relaxed">
                    “{task.prompt}”
                </div>
            )}

            <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-[0.3em]">
                Voice: {voiceLabel || 'Unknown'} | Model: {modelLabel || 'Audio Engine'} | {duration ? `${duration.toFixed(1)}s` : timeLabel}
            </div>

            {(pollenUsedLabel || creditRateLabel) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-emerald-300/80">
                    <Flower2 size={10} />
                    {pollenUsedLabel && <span>Used: {pollenUsedLabel} pollen</span>}
                    {creditRateLabel && (
                        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono">
                            Rate: {creditRateLabel}
                        </span>
                    )}
                </div>
            )}

            {(googleUsageLabel || googleCostLabel) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-indigo-300/80">
                    <Cpu size={10} />
                    {googleUsageLabel && <span>Google: {googleUsageLabel}</span>}
                    {googleCostLabel && (
                        <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 font-mono">
                            Est: {googleCostLabel}
                        </span>
                    )}
                </div>
            )}

            {status !== 'success' && (
                <div className="absolute top-4 right-4">
                    {status === 'generating' ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> Generating
                        </span>
                    ) : (
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/30">
                            Failed
                        </span>
                    )}
                </div>
            )}

            {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
        </div>
    );
};

const AudioManifestCard: React.FC<AudioManifestCardProps> = ({
    task,
    src,
    isSelected,
    isSelectable,
    onToggleSelection,
    onInspect,
    onCapture,
    onDownload,
    onPublish,
    onRemix,
    onRemove,
    voiceLabel,
    titleLabel,
    modelLabel,
    timeLabel,
    pollenUsedLabel,
    creditRateLabel,
    googleUsageLabel,
    googleCostLabel,
    status
}) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showTranscript, setShowTranscript] = useState(false);
    const isInteractive = status === 'success';

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTime = () => setCurrentTime(audio.currentTime || 0);
        const handleMeta = () => setDuration(audio.duration || 0);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnd = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', handleTime);
        audio.addEventListener('loadedmetadata', handleMeta);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnd);

        return () => {
            audio.removeEventListener('timeupdate', handleTime);
            audio.removeEventListener('loadedmetadata', handleMeta);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnd);
        };
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio || !src) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(() => {});
        }
    };

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const progressPercent = duration > 0 ? Math.round(progress * 100) : 0;

    const handleSeek = (value: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(duration) || duration <= 0) return;
        const nextTime = Math.min(duration, Math.max(0, value));
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    return (
        <div
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : -1}
            onClick={isInteractive ? onInspect : undefined}
            onKeyDown={isInteractive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspect();
                }
            } : undefined}
            className={`group relative rounded-[2rem] border border-slate-800/70 bg-gradient-to-br from-slate-900/70 via-slate-950/50 to-slate-900/70 shadow-[0_20px_60px_rgba(0,0,0,0.45)] p-6 transition-all hover:border-indigo-500/40 ${
                isInteractive ? 'cursor-pointer' : 'cursor-default'
            } ${
                isSelected ? 'ring-1 ring-indigo-500/60' : ''
            }`}
        >
            <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                    {isSelectable && (
                        <button
                            onClick={(e) => onToggleSelection(e, task.id)}
                            className={`mt-1 w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                                isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 text-transparent'
                            }`}
                        >
                            <Check size={12} />
                        </button>
                    )}
                    <div className="flex flex-1 justify-end">
                        <div className="flex items-center justify-end gap-2 text-slate-400 text-xs font-mono shrink-0">
                            <span>1.0x</span>
                            <Volume2 size={16} />
                            {onDownload && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDownload();
                                    }}
                                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                                    title="Download"
                                >
                                    <Download size={16} />
                                </button>
                            )}
                            {onCapture && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCapture();
                                    }}
                                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                                    title="Capture to Project"
                                >
                                    <FolderPlus size={16} />
                                </button>
                            )}
                            {onPublish && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPublish();
                                    }}
                                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                                    title="Share"
                                >
                                    <Share2 size={16} />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove();
                                }}
                                className="p-2 rounded-lg hover:bg-red-600/20 transition-colors text-red-400/80 hover:text-red-300"
                                title="Move to Recycle Bin"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="truncate text-lg font-semibold text-white">{titleLabel}</div>

                <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/60 px-6 py-5">
                    <div className="flex h-16 w-full items-end gap-2 overflow-hidden">
                        {AUDIO_WAVEFORM_BARS.map((height, index) => {
                            const isActive = progress > 0 && index / AUDIO_WAVEFORM_BARS.length < progress;
                            return (
                                <span
                                    key={index}
                                    className={`w-1.5 shrink-0 rounded-full transition-all ${isActive ? 'bg-indigo-400' : 'bg-slate-700/60'}`}
                                    style={{ height: `${height + 16}px` }}
                                />
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/60 px-6 py-5">
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={Math.min(currentTime, duration || 0)}
                        onChange={(e) => handleSeek(Number(e.target.value))}
                        disabled={!src || duration <= 0}
                        aria-label={`Seek ${titleLabel}`}
                        className={AUDIO_SLIDER_CLASS}
                        style={{
                            background: duration > 0
                                ? `linear-gradient(to right, rgb(129 140 248) 0%, rgb(129 140 248) ${progressPercent}%, rgb(30 41 59) ${progressPercent}%, rgb(30 41 59) 100%)`
                                : undefined
                        }}
                    />
                    <div className="mt-3 text-left text-[11px] font-mono text-slate-400">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-slate-800/60 pt-4 text-xs text-slate-500 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col items-start gap-3">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-indigo-600/90 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-white shadow-xl shadow-indigo-900/40 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!src}
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                        {isPlaying ? 'Pause Audio' : 'Play Audio'}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowTranscript((prev) => !prev);
                        }}
                        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <ListIcon size={14} />
                        {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {onRemix && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemix();
                            }}
                            className="px-3 py-1 rounded-full border border-amber-500/30 text-amber-300 text-[10px] uppercase tracking-widest hover:bg-amber-500/10 transition-colors"
                        >
                            Remix
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onInspect();
                        }}
                        className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                    >
                        <Info size={12} />
                        Inspect
                    </button>
                </div>
            </div>

            {showTranscript && (
                <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200 italic leading-relaxed">
                    “{task.prompt}”
                </div>
            )}

            <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-[0.3em]">
                Voice: {voiceLabel || 'Unknown'} | Model: {modelLabel || 'Audio Engine'} | {duration ? `${duration.toFixed(1)}s` : timeLabel}
            </div>

            {(pollenUsedLabel || creditRateLabel) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-emerald-300/80">
                    <Flower2 size={10} />
                    {pollenUsedLabel && <span>Used: {pollenUsedLabel} pollen</span>}
                    {creditRateLabel && (
                        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono">
                            Rate: {creditRateLabel}
                        </span>
                    )}
                </div>
            )}

            {(googleUsageLabel || googleCostLabel) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-indigo-300/80">
                    <Cpu size={10} />
                    {googleUsageLabel && <span>Google: {googleUsageLabel}</span>}
                    {googleCostLabel && (
                        <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 font-mono">
                            Est: {googleCostLabel}
                        </span>
                    )}
                </div>
            )}

            {status !== 'success' && (
                <div className="absolute top-4 right-4">
                    {status === 'generating' ? (
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> Generating
                        </span>
                    ) : (
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/30">
                            Failed
                        </span>
                    )}
                </div>
            )}

            {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
        </div>
    );
};

export const ManifestGallery: React.FC<ManifestGalleryProps> = ({
    tasks,
    historyTasks,
    onRemoveTask,
    onSave,
    onBulkSave,
    onInspectTask,
    onRemixTask,
    onPublishToSource,
    registry: initialRegistry,
    excludeLabContentUploads = false,
    excludeMatrixCompositions = false,
    manifestType = 'all',
    hideAudioWhenManifestTypeAll = false,
    onlyTranscriptions = false,
    onlyMusicGenerations = false
}) => {
    const { confirm, confirmDialog } = useModalDialogs();
    const headingLabel = onlyTranscriptions
        ? 'Transcription Archive Manifests'
        : (onlyMusicGenerations
            ? 'Music Archive Manifests'
            : (manifestType === 'audio' ? 'Audio Archive Manifests' : 'Neural Archive Manifests'));
    const [viewType, setViewType] = useState<'grid' | 'list'>(() => 
        (localStorage.getItem('aimana_lab_gallery_view') as 'grid' | 'list') || 'list'
    );

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [registry, setRegistry] = useState<ModelOption[]>(initialRegistry || []);
    const [isManifestVisible, setIsManifestVisible] = useState(() => (
        localStorage.getItem('aimana_lab_manifest_gallery_visible') !== 'false'
    ));

    useEffect(() => {
        if (!initialRegistry || initialRegistry.length === 0) {
            loadDynamicRegistry().then(setRegistry);
        }
    }, [initialRegistry]);

    const handleViewChange = (type: 'grid' | 'list') => {
        setViewType(type);
        localStorage.setItem('aimana_lab_gallery_view', type);
    };

    const handleManifestVisibilityChange = () => {
        setIsManifestVisible((current) => {
            const next = !current;
            localStorage.setItem('aimana_lab_manifest_gallery_visible', String(next));
            return next;
        });
    };

    const getTaskMetadata = (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        if (rev?.aiParameters) {
            try {
                return JSON.parse(rev.aiParameters);
            } catch (e) {
                return task.metadata || {};
            }
        }
        return task.metadata || {};
    };
    const getThumbnailBlurEnabled = (task: LabTask) => {
        const raw = getTaskMetadata(task) || {};
        const adv = raw?.advanced_params || raw || {};
        return !!(adv.thumbnailBlur || raw?.thumbnailBlur);
    };

    const getTaskMimeType = (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        return String(task.result?.mimeType || rev?.mimeType || '').toLowerCase();
    };

    const normalizeTranscriptValue = (value: unknown): string => {
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
        if (!value || typeof value !== 'object') return '';

        const parsed = value as Record<string, any>;
        const candidates = [
            parsed.text,
            parsed.transcript,
            parsed.output_text,
            parsed.message,
            parsed.error,
            parsed.results?.transcript,
            parsed.results?.text,
            parsed.results?.transcripts?.[0]?.transcript
        ];

        for (const candidate of candidates) {
            if (typeof candidate !== 'string') continue;
            const normalized = candidate.trim();
            if (normalized) return normalized;
        }

        return '';
    };

    const getTranscriptText = (task: LabTask) => {
        const candidates = [
            task.result?.text,
            task.archivedItem?.currentRevision?.prompt,
            task.prompt
        ];
        for (const candidate of candidates) {
            const normalized = normalizeTranscriptValue(candidate);
            if (normalized.toLowerCase() === 'no prompt recorded') continue;
            if (normalized && normalized !== '[object Object]') return normalized;
        }
        return '';
    };

    const getTranscriptionDetails = (task: LabTask) => (
        extractTranscriptionManifestDetails({
            metadata: task.metadata,
            aiParameters: task.archivedItem?.currentRevision?.aiParameters || null
        })
    );

    const hasTranscriptPayload = (
        task: LabTask,
        details?: ReturnType<typeof getTranscriptionDetails> | null
    ) => {
        if (getTranscriptText(task).length > 0) return true;
        const mimeType = String(task.result?.mimeType || task.archivedItem?.currentRevision?.mimeType || '').toLowerCase();
        if (mimeType.startsWith('text/')) return true;
        if (mimeType.includes('json') && details?.isTranscription) return true;
        return false;
    };

    const isLockedTranscriptTask = (task: LabTask) => {
        const details = getTranscriptionDetails(task);
        if (!details?.isTranscription) return false;
        const pending = isTranscriptPostProcessPending(details);
        if (!pending) return false;
        return !hasTranscriptPayload(task, details);
    };

    const matchesManifestType = (task: LabTask) => {
        if (manifestType === 'all') return true;
        if (manifestType === 'text' && isTranscriptionManifest(task)) return true;

        const mimeType = getTaskMimeType(task);
        if (mimeType) {
            if (manifestType === 'image') return mimeType.startsWith('image/');
            if (manifestType === 'video') return mimeType.startsWith('video/');
            if (manifestType === 'audio') return mimeType.startsWith('audio/');
            if (manifestType === 'text') return mimeType.startsWith('text/');
        }

        const modelMeta = (registry || []).find((m) => m.id === task.modelId);
        const category = String(modelMeta?.category || '').toLowerCase();
        if (manifestType === 'image') return category === 'visual';
        if (manifestType === 'video') return category === 'motion';
        if (manifestType === 'audio') return category === 'audio';
        if (manifestType === 'text') return category === 'language';
        return true;
    };

    const isNonVisualOutput = (task: LabTask) => {
        const mimeType = getTaskMimeType(task);
        return mimeType.startsWith('audio/') || mimeType.startsWith('text/');
    };

    const isLabContentUpload = (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        if (rev?.engine === 'reference' || rev?.engine === 'reference-upload') return true;
        if (rev?.fileUrl?.includes('/Neural_Reference/')) return true;
        const raw = getTaskMetadata(task) || {};
        const adv = raw?.advanced_params || raw || {};
        const source = typeof adv.source === 'string' ? adv.source : (typeof raw?.source === 'string' ? raw.source : '');
        const explicitReferenceSource = !!(
            adv.source === 'reference_upload' ||
            adv.source === 'reference_drop' ||
            (typeof source === 'string' && source.startsWith('selector_ingest'))
        );
        return !!(
            raw.labContentUpload === true ||
            adv.labContentUpload === true ||
            explicitReferenceSource ||
            (!isNonVisualOutput(task) && (
                adv.isReference ||
                adv.referenceAsset === true
            ))
        );
    };

    const isMatrixComposition = (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        const raw = getTaskMetadata(task) || {};
        const adv = raw?.advanced_params || raw || {};
        const hasTopology = !!(raw.gridTopology || adv.gridTopology);
        const matrixFlag = raw.matrixComposition === true || adv.matrixComposition === true;
        const label = typeof rev?.label === 'string' ? rev.label : '';
        const labelMatch = label.trim().toLowerCase() === 'lab content mc';
        return hasTopology || matrixFlag || labelMatch;
    };

    const isTranscriptionManifest = (task: LabTask) => {
        const mimeType = getTaskMimeType(task);
        const modelMeta = (registry || []).find((m) =>
            m.id === task.modelId || m.id === task.archivedItem?.currentRevision?.engine
        );
        if (modelMeta && isTranscriptionAudioModel(modelMeta)) return true;

        const details = getTranscriptionDetails(task);
        if (details.isTranscription) return true;

        const raw = getTaskMetadata(task) || {};
        const adv = raw?.advanced_params || raw || {};
        return !!(
            (mimeType.startsWith('text/') && getTranscriptText(task).length > 0) ||
            adv.isTranscription === true ||
            raw.isTranscription === true ||
            (typeof adv.transcriptionHint === 'string' && adv.transcriptionHint.trim().length > 0) ||
            (typeof raw.transcriptionHint === 'string' && raw.transcriptionHint.trim().length > 0)
        );
    };

    const isAudioManifest = (task: LabTask) => {
        const mimeType = getTaskMimeType(task);
        if (mimeType.startsWith('audio/')) return true;

        const modelMeta = (registry || []).find((m) =>
            m.id === task.modelId || m.id === task.archivedItem?.currentRevision?.engine
        );
        const category = String(modelMeta?.category || '').toLowerCase();
        return category === 'audio';
    };

    const isMusicManifest = (task: LabTask) => {
        const modelMeta = (registry || []).find((m) =>
            m.id === task.modelId || m.id === task.archivedItem?.currentRevision?.engine
        );
        if (modelMeta && isMusicAudioModel(modelMeta)) return true;

        const raw = getTaskMetadata(task) || {};
        const adv = raw?.advanced_params || raw || {};
        const title = String(task.title || task.archivedItem?.currentRevision?.title || '').trim().toLowerCase();
        return !!(
            adv.isMusicGeneration === true ||
            raw.isMusicGeneration === true ||
            title.startsWith('track:')
        );
    };

    const combinedManifests = useMemo(() => {
        const liveActiveTasks = tasks.filter(t => {
            if (t.status === 'generating' || t.status === 'pending' || t.status === 'error') return true;
            if (t.status === 'success') {
                if (!t.archivedItem) return true;
                return !historyTasks.some(h => h.archivedItem?.id === t.archivedItem?.id);
            }
            return false;
        });

        const sorted = [...liveActiveTasks, ...historyTasks].sort((a, b) => b.timestamp - a.timestamp);
        const deduped: LabTask[] = [];
        const seenKeys = new Set<string>();

        for (const task of sorted) {
            const archiveId = String(task.archivedItem?.id || '').trim();
            const fallbackId = String(task.id || '').trim();
            const dedupeKey = archiveId ? `archive:${archiveId}` : `task:${fallbackId}`;
            if (!dedupeKey || seenKeys.has(dedupeKey)) continue;
            seenKeys.add(dedupeKey);
            deduped.push(task);
        }

        return deduped;
    }, [tasks, historyTasks]);

    const visibleManifests = useMemo(() => {
        return combinedManifests.filter((task) => {
            if (excludeLabContentUploads && isLabContentUpload(task)) return false;
            if (excludeMatrixCompositions && isMatrixComposition(task)) return false;
            if (!matchesManifestType(task)) return false;
            if (hideAudioWhenManifestTypeAll && manifestType === 'all' && isAudioManifest(task)) return false;
            if (onlyTranscriptions && !isTranscriptionManifest(task)) return false;
            if (onlyMusicGenerations && !isMusicManifest(task)) return false;
            return true;
        });
    }, [combinedManifests, excludeLabContentUploads, excludeMatrixCompositions, hideAudioWhenManifestTypeAll, isAudioManifest, manifestType, matchesManifestType, onlyTranscriptions, onlyMusicGenerations]);

    const selectableManifests = useMemo(() => 
        visibleManifests.filter(t => t.status === 'success' && !isLockedTranscriptTask(t)), 
    [visibleManifests]);

    const allSelected = selectableManifests.length > 0 && selectedIds.size === selectableManifests.length;

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(selectableManifests.map(t => t.id)));
        }
    };

    const toggleSelection = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const handleBulkCapture = async () => {
        if (selectedIds.size === 0) return;
        
        const selectedTasks = visibleManifests.filter(t => selectedIds.has(t.id) && t.status === 'success' && !isLockedTranscriptTask(t));
        
        if (onBulkSave) {
            onBulkSave(selectedTasks);
            setSelectedIds(new Set());
        } else {
            setIsBulkProcessing(true);
            try {
                for (const task of selectedTasks) {
                    await onSave(task.result || null, task.prompt, task.modelId, task.metadata, task.title, task.archivedItem);
                }
                setSelectedIds(new Set());
            } catch (e) {
                console.error("Bulk capture failed", e);
            } finally {
                setIsBulkProcessing(false);
            }
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const ok = await confirm({
            title: 'Move Selected Artifacts To Recycle Bin',
            description: `Move ${selectedIds.size} selected artifact${selectedIds.size > 1 ? 's' : ''} to Neural Recycle Bin? You can restore them later.`,
            confirmLabel: 'Move Selected',
            tone: 'danger'
        });
        if (!ok) return;
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            onRemoveTask(id);
        }
        setSelectedIds(new Set());
    };

    const handleRemoveTaskWithConfirm = async (id: string) => {
        const ok = await confirm({
            title: 'Move Artifact To Recycle Bin',
            description: 'Move this manifest artifact to Neural Recycle Bin? You can restore it later.',
            confirmLabel: 'Move To Recycle Bin',
            tone: 'danger'
        });
        if (ok) onRemoveTask(id);
    };

    const handleDownloadTask = async (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        const metadata = getTaskMetadata(task) || {};
        const advanced = metadata?.advanced_params || metadata || {};
        const formatHint = String(advanced.response_format || metadata.response_format || '').trim() || undefined;
        const baseName = task.title || rev?.title || rev?.originalFilename || 'aimana-audio-artifact';

        try {
            if (task.result) {
                downloadGeneratedArtifact(task.result, { baseName, formatHint });
                return;
            }

            if (rev) {
                await downloadRevisionArtifact(rev);
                return;
            }

            throw new Error('No artifact data available for download.');
        } catch (error) {
            console.error('Manifest download failed', error);
        }
    };

    const isUploadedReference = (task: LabTask) => {
        const rev = task.archivedItem?.currentRevision;
        if (rev?.engine === 'reference' || rev?.engine === 'reference-upload') return true;
        if (rev?.fileUrl?.includes('/Neural_Reference/')) return true;
        try {
            const raw = rev?.aiParameters ? JSON.parse(rev.aiParameters) : (task.metadata || {});
            const adv = raw?.advanced_params || raw || {};
            const source = typeof adv.source === 'string' ? adv.source : '';
            const explicitReferenceSource = !!(
                adv.source === 'reference_upload' ||
                adv.source === 'reference_drop' ||
                source.startsWith('selector_ingest')
            );
            return !!(
                explicitReferenceSource ||
                (!isNonVisualOutput(task) && (
                    adv.isReference ||
                    adv.referenceAsset === true
                ))
            );
        } catch (e) {
            const meta = task.metadata || {};
            const source = typeof meta.source === 'string' ? meta.source : '';
            const explicitReferenceSource = !!(
                meta.source === 'reference_upload' ||
                meta.source === 'reference_drop' ||
                source.startsWith('selector_ingest')
            );
            return !!(
                explicitReferenceSource ||
                (!isNonVisualOutput(task) && (
                    meta.isReference ||
                    meta.referenceAsset === true
                ))
            );
        }
    };

    if (visibleManifests.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 space-y-4 py-20">
                <div className="w-24 h-24 rounded-[2rem] border-2 border-dashed border-slate-700 flex items-center justify-center">
                    <span className="text-4xl font-black">AI</span>
                </div>
                <p className="text-sm font-black uppercase tracking-widest">Workspace Terminal Idle</p>
                <p className="text-xs max-w-xs leading-relaxed">Initiate neural synthesis from the studio command bar to begin manifesting artifacts.</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1760px] mx-auto space-y-12 animate-in fade-in duration-500 pb-24 relative">
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                    <button
                        type="button"
                        onClick={handleManifestVisibilityChange}
                        className="group flex min-w-0 items-center gap-3 text-left"
                        aria-expanded={isManifestVisible}
                    >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-500 transition-all group-hover:border-indigo-500/40 group-hover:text-indigo-300">
                            {isManifestVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">{headingLabel}</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                {isManifestVisible ? 'Central Registry of Synthesized Artifacts' : `${visibleManifests.length} manifest${visibleManifests.length === 1 ? '' : 's'} hidden`}
                            </span>
                        </span>
                    </button>
                    
                    {isManifestVisible && <div className="flex items-center gap-4 flex-wrap">
                        {selectableManifests.length > 0 && (
                            <button 
                                onClick={toggleSelectAll}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/40 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all shadow-lg"
                            >
                                {allSelected ? <CheckSquare size={14} className="text-indigo-400" /> : <Square size={14} />}
                                <span>{allSelected ? 'Deselect All' : 'Select Successes'}</span>
                            </button>
                        )}

                        <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800 shadow-xl">
                            <button 
                                onClick={() => handleViewChange('grid')}
                                className={`p-2 rounded-lg transition-all ${viewType === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Mosaic Grid"
                            >
                                <LayoutGrid size={18} />
                            </button>
                            <button 
                                onClick={() => handleViewChange('list')}
                                className={`p-2 rounded-lg transition-all ${viewType === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Technical List"
                            >
                                <ListIcon size={18} />
                            </button>
                        </div>
                    </div>}
                </div>

                {!isManifestVisible ? null : viewType === 'list' ? (
                    <div className="space-y-6">
                        {visibleManifests.map((task) => {
                            const rev = task.archivedItem?.currentRevision;
                            const isSuccess = task.status === 'success';
                            const isSelected = selectedIds.has(task.id);
                            const isContentUpload = isLabContentUpload(task);
                            const isReferenceUpload = isUploadedReference(task) && !isContentUpload;
                            const mimeType = task.result?.mimeType || rev?.mimeType || '';
                            const isAudio = mimeType.startsWith('audio/');
                            const transcriptText = getTranscriptText(task);
                            const isTranscriptArtifact = isTranscriptionManifest(task);
                            const isText = mimeType.startsWith('text/') || (!isAudio && isTranscriptArtifact);
                            const isVideo = mimeType.startsWith('video/');
                            const src = !isText && task.result?.base64
                                ? `data:${task.result.mimeType};base64,${task.result.base64}`
                                : (!isText ? (rev?.fileUrl || '') : '');
                            const activeModel = (registry || []).find(m => m.id === task.modelId);
                            const meta = getTaskMetadata(task) || {};
                            const adv = meta?.advanced_params || meta || {};
                            const isThumbnailBlurEnabled = getThumbnailBlurEnabled(task);
                            const thumbnailBlurClass = isThumbnailBlurEnabled && !isText && !isAudio ? 'blur-md' : '';
                            const transcriptTextForDisplay = isText ? transcriptText : '';
                            const transcriptionDetails = isText ? getTranscriptionDetails(task) : null;
                            const transcriptPayloadAvailable = !!transcriptionDetails && hasTranscriptPayload(task, transcriptionDetails);
                            const isTranscriptPending = !!transcriptionDetails && isTranscriptPostProcessPending(transcriptionDetails);
                            const isTranscriptLocked = Boolean(isTranscriptPending && !transcriptPayloadAvailable);
                            const canInspectTask = (isSuccess && !isTranscriptLocked) || (isText && transcriptPayloadAvailable);
                            const transcriptSummaryExcerpt = isText
                                ? buildTranscriptSummaryExcerpt(transcriptionDetails?.summaryText || '', transcriptTextForDisplay, 220)
                                : '';
                            const voiceLabel = String(adv.voiceName || adv.voice || meta.voiceName || meta.voice || '').trim();
                            const titleLabel = task.title || rev?.title || 'Untitled Audio';
                            const pollenUsed = extractPollenUsed(task.metadata, rev?.aiParameters || null);
                            const creditRate = getPrimaryModelCreditRate(activeModel);
                            const googleUsage = extractGoogleUsage(task.metadata, rev?.aiParameters || null);
                            const googleUsageLabel = summarizeGoogleUsage(googleUsage);
                            const googleCost = extractGoogleEstimatedCostUsd(task.metadata, rev?.aiParameters || null);
                            const timeLabel = new Date(task.timestamp).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            if (isAudio) {
                                return (
                                    <AudioListManifestCard
                                        key={task.id}
                                        task={task}
                                        src={src}
                                        isSelected={isSelected}
                                        isSelectable={isSuccess}
                                        onToggleSelection={toggleSelection}
                                        onInspect={() => isSuccess && onInspectTask(task)}
                                        onCapture={isSuccess ? () => onSave(task.result || null, task.prompt, task.modelId, task.metadata, task.title, task.archivedItem) : undefined}
                                        onDownload={isSuccess ? () => { void handleDownloadTask(task); } : undefined}
                                        onPublish={isSuccess && onPublishToSource ? () => onPublishToSource(task) : undefined}
                                        onRemix={isSuccess && onRemixTask && !isReferenceUpload ? () => onRemixTask(task) : undefined}
                                        onRemove={() => handleRemoveTaskWithConfirm(task.id)}
                                        voiceLabel={voiceLabel || 'Unknown'}
                                        titleLabel={titleLabel}
                                        modelLabel={task.modelLabel || activeModel?.label || String(task.modelId)}
                                        timeLabel={timeLabel}
                                        pollenUsedLabel={pollenUsed ? formatPollenAmount(pollenUsed) : null}
                                        creditRateLabel={creditRate?.displayValue || null}
                                        googleUsageLabel={googleUsageLabel}
                                        googleCostLabel={googleCost !== null ? formatGoogleUsd(googleCost) : null}
                                        status={task.status}
                                    />
                                );
                            }

                            return (
                                <div
                                    key={task.id}
                                    className={`group flex flex-col md:flex-row md:items-center gap-4 rounded-[1.5rem] border border-slate-800/60 bg-slate-900/50 p-5 shadow-lg transition-all hover:border-indigo-500/30 ${
                                        isSelected ? 'ring-1 ring-indigo-500/50' : ''
                                    }`}
                                    onClick={() => canInspectTask && onInspectTask(task)}
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        {isSuccess && !isTranscriptLocked && (
                                            <button
                                                onClick={(e) => toggleSelection(e, task.id)}
                                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 text-transparent'}`}
                                            >
                                                <Check size={12} />
                                            </button>
                                        )}
                                        <div className="w-16 h-16 rounded-2xl bg-black border border-slate-800 overflow-hidden shadow-inner flex items-center justify-center">
                                            {isText ? (
                                                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
                                                    <FileText size={18} className="text-cyan-300" />
                                                    <span className="line-clamp-2 text-[9px] font-bold text-slate-400">
                                                        {(transcriptSummaryExcerpt || transcriptText || 'Transcript').slice(0, 56)}
                                                    </span>
                                                </div>
                                            ) : src ? (
                                                isVideo ? (
                                                    <video src={src} className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity ${thumbnailBlurClass}`} muted playsInline preload="metadata" />
                                                ) : (
                                                    <img src={src} className={`w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity ${thumbnailBlurClass}`} alt="Thumb" />
                                                )
                                            ) : (
                                                <Archive size={20} className="text-slate-700" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-white line-clamp-1">
                                                {task.title || rev?.title || 'Untitled Artifact'}
                                            </div>
                                            {isText ? (
                                                <div className="mt-2 space-y-2">
                                                    {transcriptionDetails?.sourceFileName && (
                                                        <div className="flex flex-wrap gap-2">
                                                            <span className="text-[8px] font-black uppercase tracking-widest text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                                                                Source Audio: {transcriptionDetails.sourceFileName}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="text-xs font-medium leading-relaxed text-slate-300 line-clamp-3">
                                                        {transcriptSummaryExcerpt || transcriptTextForDisplay || 'Transcript output ready for inspection.'}
                                                    </div>
                                                    {isTranscriptPending && transcriptPayloadAvailable && (
                                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                                                            Summary and QA still finalizing. Transcript preview is available now.
                                                        </div>
                                                    )}
                                                    {isTranscriptLocked && (
                                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                                                            Transcript file is still staging. You can open it once payload sync finishes.
                                                        </div>
                                                    )}
                                                    {transcriptionDetails?.summaryError && (
                                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
                                                            Summary skipped: {transcriptionDetails.summaryError}
                                                        </div>
                                                    )}
                                                    {transcriptionDetails?.qaError && (
                                                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
                                                            QA skipped: {transcriptionDetails.qaError}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="mt-1 text-xs font-bold text-slate-300 line-clamp-2">"{task.prompt}"</div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-slate-500">
                                                <span className="flex items-center gap-1"><Clock size={12} /> {timeLabel}</span>
                                                <span className="flex items-center gap-1"><Cpu size={12} className={activeModel?.color || 'text-indigo-400/70'} /> {task.modelLabel}</span>
                                            </div>
                                            {(isContentUpload || isReferenceUpload) && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {isContentUpload && (
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                                                            Lab content uploads
                                                        </span>
                                                    )}
                                                    {isReferenceUpload && (
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                                                            Uploaded Reference Image
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 justify-end">
                                        {task.status === 'generating' ? (
                                            <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 flex items-center gap-2">
                                                <Loader2 size={12} className="animate-spin" /> {task.progress}%
                                            </span>
                                        ) : task.status === 'success' ? (
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                                isTranscriptLocked || isTranscriptPending
                                                    ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                                                    : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                                            }`}>
                                                {isTranscriptLocked ? 'Staging' : (isTranscriptPending ? 'Post-Processing' : 'Manifested')}
                                            </span>
                                        ) : canInspectTask ? (
                                            <span className="text-[9px] font-black uppercase text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                Transcript Ready
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                                                Fail
                                            </span>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); if (canInspectTask) onInspectTask(task); }} disabled={!canInspectTask} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"><Info size={16} /></button>
                                        {isSuccess && !isTranscriptLocked && <button onClick={(e) => { e.stopPropagation(); onSave(task.result || null, task.prompt, task.modelId, task.metadata, task.title, task.archivedItem); }} className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-600 rounded-lg transition-all"><FolderPlus size={16} /></button>}
                                        {isSuccess && !isTranscriptLocked && onPublishToSource && <button onClick={(e) => { e.stopPropagation(); onPublishToSource(task); }} className="p-2 text-emerald-400 hover:text-white hover:bg-emerald-600 rounded-lg transition-all" title="Save as new version to source item"><FileText size={16} /></button>}
                                        {isSuccess && onRemixTask && !isReferenceUpload && !isText && <button onClick={(e) => { e.stopPropagation(); onRemixTask(task); }} className="p-2 text-amber-500 hover:text-white hover:bg-amber-600 rounded-lg transition-all"><Wand2 size={16} /></button>}
                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveTaskWithConfirm(task.id); }} className="p-2 text-red-500/70 hover:text-white hover:bg-red-600 rounded-lg transition-all"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6 md:gap-8">
                        {visibleManifests.map((task) => {
                            const rev = task.archivedItem?.currentRevision;
                            const isSelected = selectedIds.has(task.id);
                            const isSuccess = task.status === 'success';
                            const isContentUpload = isLabContentUpload(task);
                            const isReferenceUpload = isUploadedReference(task) && !isContentUpload;
                            const mimeType = String(task.result?.mimeType || rev?.mimeType || '').toLowerCase();
                            const isAudio = mimeType.startsWith('audio/');
                            const transcriptText = getTranscriptText(task);
                            const isTranscriptArtifact = isTranscriptionManifest(task);
                            const isText = mimeType.startsWith('text/') || (!isAudio && isTranscriptArtifact);
                            const src = !isText && task.result?.base64
                                ? `data:${task.result.mimeType};base64,${task.result.base64}`
                                : (!isText ? (rev?.fileUrl || '') : '');
                            const activeModel = (registry || []).find(m => m.id === task.modelId);
                            const meta = getTaskMetadata(task) || {};
                            const adv = meta?.advanced_params || meta || {};
                            const voiceLabel = String(adv.voiceName || adv.voice || meta.voiceName || meta.voice || '').trim();
                            const titleLabel = task.title || rev?.title || 'Untitled Audio';
                            const transcriptionDetails = isText ? getTranscriptionDetails(task) : null;
                            const transcriptPayloadAvailable = !!transcriptionDetails && hasTranscriptPayload(task, transcriptionDetails);
                            const isTranscriptPending = !!transcriptionDetails && isTranscriptPostProcessPending(transcriptionDetails);
                            const isTranscriptLocked = Boolean(isTranscriptPending && !transcriptPayloadAvailable);
                            const canInspectTask = (isSuccess && !isTranscriptLocked) || (isText && transcriptPayloadAvailable);
                            const pollenUsed = extractPollenUsed(task.metadata, rev?.aiParameters || null);
                            const creditRate = getPrimaryModelCreditRate(activeModel);
                            const googleUsage = extractGoogleUsage(task.metadata, rev?.aiParameters || null);
                            const googleUsageLabel = summarizeGoogleUsage(googleUsage);
                            const googleCost = extractGoogleEstimatedCostUsd(task.metadata, rev?.aiParameters || null);
                            const timeLabel = new Date(task.timestamp).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            if (isAudio) {
                                return (
                                    <div key={task.id} className="relative">
                                        {isContentUpload && (
                                            <div className="absolute top-3 right-3 z-40 text-[8px] font-black uppercase tracking-widest text-cyan-300 bg-black/80 px-2 py-1 rounded-lg border border-cyan-500/40 backdrop-blur-sm pointer-events-none">
                                                Lab content uploads
                                            </div>
                                        )}
                                        {isReferenceUpload && (
                                            <div className="absolute top-3 right-3 z-40 text-[8px] font-black uppercase tracking-widest text-emerald-300 bg-black/80 px-2 py-1 rounded-lg border border-emerald-500/40 backdrop-blur-sm pointer-events-none">
                                                Uploaded Reference
                                            </div>
                                        )}
                                        <AudioManifestCard
                                            task={task}
                                            src={src}
                                            isSelected={isSelected}
                                            isSelectable={isSuccess}
                                            onToggleSelection={toggleSelection}
                                            onInspect={() => isSuccess && onInspectTask(task)}
                                            onCapture={isSuccess ? () => onSave(task.result || null, task.prompt, task.modelId, task.metadata, task.title, task.archivedItem) : undefined}
                                            onDownload={isSuccess ? () => { void handleDownloadTask(task); } : undefined}
                                            onPublish={isSuccess && onPublishToSource ? () => onPublishToSource(task) : undefined}
                                            onRemix={isSuccess && onRemixTask && !isReferenceUpload ? () => onRemixTask(task) : undefined}
                                            onRemove={() => handleRemoveTaskWithConfirm(task.id)}
                                            voiceLabel={voiceLabel || 'Unknown'}
                                            titleLabel={titleLabel}
                                            modelLabel={task.modelLabel || activeModel?.label || String(task.modelId)}
                                            timeLabel={timeLabel}
                                            pollenUsedLabel={pollenUsed ? formatPollenAmount(pollenUsed) : null}
                                            creditRateLabel={creditRate?.displayValue || null}
                                            googleUsageLabel={googleUsageLabel}
                                            googleCostLabel={googleCost !== null ? formatGoogleUsd(googleCost) : null}
                                            status={task.status}
                                        />
                                    </div>
                                );
                            }

                            return (
                                <div key={task.id} className="relative">
                                    {isContentUpload && (
                                        <div className="absolute top-3 right-3 z-40 text-[8px] font-black uppercase tracking-widest text-cyan-300 bg-black/80 px-2 py-1 rounded-lg border border-cyan-500/40 backdrop-blur-sm pointer-events-none">
                                            Lab content uploads
                                        </div>
                                    )}
                                    {isReferenceUpload && (
                                        <div className="absolute top-3 right-3 z-40 text-[8px] font-black uppercase tracking-widest text-emerald-300 bg-black/80 px-2 py-1 rounded-lg border border-emerald-500/40 backdrop-blur-sm pointer-events-none">
                                            Uploaded Reference
                                        </div>
                                    )}
                                    <LabTaskCard 
                                        task={task}
                                        isSelected={isSelected}
                                        onToggleSelection={(e) => toggleSelection(e, task.id)}
                                        onRemove={() => handleRemoveTaskWithConfirm(task.id)}
                                        onSave={onSave}
                                        onInspect={() => canInspectTask && onInspectTask(task)}
                                        onRemix={onRemixTask && !isReferenceUpload && !isText ? () => onRemixTask(task) : undefined}
                                        onPublishToSource={onPublishToSource ? () => onPublishToSource(task) : undefined}
                                        registry={registry}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedIds.size > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#0c0c0c] border border-indigo-500/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-4 flex items-center gap-8 animate-in slide-in-from-bottom-10 z-[100] ring-1 ring-white/10">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Bulk Synthesis Control</span>
                        <span className="text-sm font-bold text-white">{selectedIds.size} Artifacts Selected</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                        <button 
                            onClick={handleBulkDelete}
                            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-red-400 hover:text-white border border-red-500/30 hover:bg-red-600/20 rounded-xl transition-all"
                        >
                            Move Selected To Recycle Bin
                        </button>
                        <button 
                            onClick={handleBulkCapture}
                            disabled={isBulkProcessing}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-2xl shadow-indigo-900/40 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isBulkProcessing ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                            Capture {selectedIds.size > 1 ? `${selectedIds.size} Artifacts` : 'Artifact'} to Project
                        </button>
                    </div>
                </div>
            )}
            {confirmDialog}
        </div>
    );
};
