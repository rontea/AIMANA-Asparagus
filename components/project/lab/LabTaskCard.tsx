
import React, { useMemo } from 'react';
import { FolderPlus, Trash2, Monitor, AlertCircle, Loader2, Wand2, Fingerprint, Check, FileText, Volume2, Flower2, Cpu, Music } from 'lucide-react';
import { LabTask } from '../../../hooks/useAiGeneration';
import { GeneratedImageResult } from '../../../services/geminiService';
import { ItemWithCurrentRevision } from '../../../types';
import { RATIO_CONFIG } from './LabSidebar';
import { ModelOption } from './ModelSelectorModal';
import { extractPollenUsed, formatPollenAmount, getPrimaryModelCreditRate } from '../../../utils/pollenCredits';
import { extractGoogleEstimatedCostUsd, extractGoogleUsage, formatGoogleUsd, summarizeGoogleUsage } from '../../../utils/googleCredits';
import { buildTranscriptSummaryExcerpt, extractTranscriptionManifestDetails, isTranscriptPostProcessPending } from '../../../utils/transcriptionManifest';

interface LabTaskCardProps {
    task: LabTask;
    onRemove: () => void;
    onSave: (result: GeneratedImageResult | null, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => void;
    onInspect: () => void;
    onRemix?: () => void;
    onPublishToSource?: () => void;
    registry: ModelOption[];
    isSelected?: boolean;
    onToggleSelection?: (e: React.MouseEvent) => void;
}

const formatBytes = (bytes?: number | null) => {
    if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const LabTaskCard: React.FC<LabTaskCardProps> = ({ task, onRemove, onSave, onInspect, onRemix, onPublishToSource, registry, isSelected, onToggleSelection }) => {
    const isGenerating = task.status === 'generating' || task.status === 'pending';
    const isSuccess = task.status === 'success';
    const isError = task.status === 'error';

    const transcriptionDetails = useMemo(() => (
        extractTranscriptionManifestDetails({
            metadata: task.metadata,
            aiParameters: task.archivedItem?.currentRevision?.aiParameters || null
        })
    ), [task]);

    const mediaMeta = useMemo(() => {
        const rev = task.archivedItem?.currentRevision;
        const mimeType = task.result?.mimeType || rev?.mimeType || '';
        const isVideo = mimeType.startsWith('video/');
        const isAudio = mimeType.startsWith('audio/');
        const isText = mimeType.startsWith('text/') || (mimeType.includes('json') && transcriptionDetails.isTranscription);
        const src = !isText && task.result?.base64
            ? `data:${task.result.mimeType};base64,${task.result.base64}`
            : (!isText ? (rev?.fileUrl || '') : '');
        return { mimeType, isVideo, isAudio, isText, src };
    }, [task, transcriptionDetails.isTranscription]);
    const isThumbnailBlurEnabled = useMemo(() => {
        const baseMeta = task.metadata || {};
        if (task.archivedItem?.currentRevision?.aiParameters) {
            try {
                const parsed = JSON.parse(task.archivedItem.currentRevision.aiParameters);
                const adv = parsed?.advanced_params || parsed || {};
                return !!(adv.thumbnailBlur || parsed?.thumbnailBlur);
            } catch (e) {
                return false;
            }
        }
        const adv = baseMeta?.advanced_params || baseMeta || {};
        return !!(adv.thumbnailBlur || baseMeta?.thumbnailBlur);
    }, [task]);

    const voiceLabel = useMemo(() => {
        const baseMeta = task.metadata || {};
        if (task.archivedItem?.currentRevision?.aiParameters) {
            try {
                const params = JSON.parse(task.archivedItem.currentRevision.aiParameters);
                const adv = params.advanced_params || params || {};
                return String(adv.voiceName || adv.voice || baseMeta.voiceName || baseMeta.voice || '').trim();
            } catch (e) {}
        }
        return String(baseMeta.voiceName || baseMeta.voice || '').trim();
    }, [task]);

    const transcriptText = useMemo(() => (
        String(task.result?.text || task.archivedItem?.currentRevision?.prompt || task.prompt || '').trim()
    ), [task]);

    const transcriptSummaryExcerpt = useMemo(() => (
        buildTranscriptSummaryExcerpt(transcriptionDetails.summaryText, transcriptText, 180)
    ), [transcriptText, transcriptionDetails.summaryText]);
    const transcriptPayloadAvailable = useMemo(() => (
        transcriptText.length > 0
        || mediaMeta.mimeType.startsWith('text/')
        || (mediaMeta.mimeType.includes('json') && transcriptionDetails.isTranscription)
    ), [mediaMeta.mimeType, transcriptText, transcriptionDetails.isTranscription]);
    const isTranscriptPending = useMemo(() => (
        mediaMeta.isText && isTranscriptPostProcessPending(transcriptionDetails)
    ), [mediaMeta.isText, transcriptionDetails]);
    const isTranscriptLocked = useMemo(() => (
        isTranscriptPending && !transcriptPayloadAvailable
    ), [isTranscriptPending, transcriptPayloadAvailable]);
    const canInspectTask = useMemo(() => (
        (isSuccess && !isTranscriptLocked) || (mediaMeta.isText && transcriptPayloadAvailable)
    ), [isSuccess, isTranscriptLocked, mediaMeta.isText, transcriptPayloadAvailable]);

    const titleLabel = useMemo(() => (
        task.title || task.archivedItem?.currentRevision?.title || 'Untitled Artifact'
    ), [task]);

    const renderPreview = () => {
        if (!task.result && !task.archivedItem?.currentRevision) return null;
        if (!mediaMeta.src) return null;

        return (
            <div className="w-full h-full relative group/media overflow-hidden rounded-2xl border border-white/5 shadow-2xl bg-black/40">
                {mediaMeta.isVideo ? (
                    <video
                        src={mediaMeta.src}
                        className={`w-full h-full object-cover ${isThumbnailBlurEnabled ? 'blur-md' : ''}`}
                        muted
                        playsInline
                        preload="metadata"
                    />
                ) : mediaMeta.isAudio ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="max-w-full">
                            <div className="truncate text-sm font-semibold text-white">{titleLabel}</div>
                            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Audio Artifact</div>
                        </div>
                        <Volume2 size={28} className="text-pink-400" />
                        <audio src={mediaMeta.src} controls className="w-full" />
                    </div>
                ) : mediaMeta.isText ? (
                    <div className="flex h-full w-full flex-col justify-between gap-4 bg-slate-950/70 p-5 text-left">
                        <div className="flex items-center gap-3 text-cyan-300">
                            <FileText size={22} />
                            <span className="text-[10px] font-black uppercase tracking-[0.28em]">
                                {isTranscriptLocked ? 'Transcript Processing' : transcriptionDetails.summaryText ? 'Transcript Summary' : 'Transcript'}
                            </span>
                        </div>
                        <p className="line-clamp-6 text-sm leading-relaxed text-slate-300">
                            {isTranscriptLocked
                                ? 'Saving transcript summary and QA into the Neural Saved item before this transcript can open.'
                                : transcriptSummaryExcerpt || transcriptText || 'Transcript output ready for inspection.'}
                        </p>
                    </div>
                ) : (
                    <img
                        src={mediaMeta.src}
                        className={`w-full h-full object-contain bg-black/30 p-2 ${isThumbnailBlurEnabled ? 'blur-md' : ''}`}
                        alt="Generated artifact"
                    />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    {/* Overlay is now purely for visual feedback or small quick actions, main click is on card */}
                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white/40 border border-white/10">
                        <Fingerprint size={24} />
                    </div>
                </div>
            </div>
        );
    };

    const displayInfo = useMemo(() => {
        const revisionSize = Number(task.archivedItem?.currentRevision?.size || 0);
        const transcriptByteSize = mediaMeta.isText
            ? (revisionSize > 0
                ? revisionSize
                : new Blob([transcriptText], { type: mediaMeta.mimeType || 'text/plain' }).size)
            : 0;
        let width = task.metadata?.resolvedWidth;
        let height = task.metadata?.resolvedHeight;
        let ratioKey = task.metadata?.ratio || task.aspectRatio;

        if (!width && task.archivedItem?.currentRevision?.aiParameters) {
            try {
                const params = JSON.parse(task.archivedItem.currentRevision.aiParameters);
                const adv = params.advanced_params || params;
                width = adv.resolvedWidth;
                height = adv.resolvedHeight;
                ratioKey = adv.ratio || ratioKey;
            } catch (e) {}
        }

        const sizeLabel = width && height ? `${width}x${height}` : null;
        const ratioName = RATIO_CONFIG[ratioKey]?.label || ratioKey;
        const transcriptFileSize = formatBytes(transcriptByteSize);

        return {
            resolution: mediaMeta.isText ? (transcriptFileSize || 'Text File') : (sizeLabel || ratioKey),
            ratioLabel: mediaMeta.isText ? 'download size' : ratioName
        };
    }, [mediaMeta.isText, mediaMeta.mimeType, task, transcriptText]);

    const activeModel = useMemo(() => {
        return (registry || []).find(m => m.id === task.modelId);
    }, [registry, task.modelId]);

    const pollenUsed = useMemo(() => {
        return extractPollenUsed(task.metadata, task.archivedItem?.currentRevision?.aiParameters || null);
    }, [task]);

    const creditRate = useMemo(() => {
        return getPrimaryModelCreditRate(activeModel);
    }, [activeModel]);
    const googleUsageLabel = useMemo(() => {
        return summarizeGoogleUsage(extractGoogleUsage(task.metadata, task.archivedItem?.currentRevision?.aiParameters || null));
    }, [task]);
    const googleCostLabel = useMemo(() => {
        const cost = extractGoogleEstimatedCostUsd(task.metadata, task.archivedItem?.currentRevision?.aiParameters || null);
        return cost !== null ? formatGoogleUsd(cost) : null;
    }, [task]);

    if (mediaMeta.isText) {
        const modelLabel = activeModel?.label || task.modelLabel || String(task.modelId || 'Unknown model');
        const sourceAudioLabel = transcriptionDetails.sourceFileName || 'No source audio linked';
        const transcriptPreview = isTranscriptLocked
            ? 'Waiting for transcript summary and QA to finish saving into the Neural Archive item.'
            : transcriptSummaryExcerpt || transcriptText || 'Transcript output ready for inspection.';
        const statusLabel = isGenerating
            ? `Generating ${Math.max(0, Math.round(task.progress || 0))}%`
            : isError
                ? 'Failed'
                : isTranscriptLocked
                    ? 'Post-Processing'
                    : 'Verified';
        const statusBadgeClass = isGenerating
            ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30'
            : isError
                ? 'text-red-300 bg-red-500/10 border-red-500/30'
                : isTranscriptLocked
                    ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                    : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';

        return (
            <div
                role={canInspectTask ? 'button' : undefined}
                tabIndex={canInspectTask ? 0 : -1}
                onClick={() => canInspectTask ? onInspect() : null}
                onKeyDown={canInspectTask ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onInspect();
                    }
                } : undefined}
                className={`group relative flex min-h-[180px] flex-col overflow-hidden rounded-[2.25rem] border border-slate-700/60 bg-[rgba(15,23,42,0.4)] backdrop-blur-xl transition-all duration-300 ${canInspectTask ? 'cursor-pointer hover:-translate-y-1 hover:border-indigo-500/40 hover:bg-[rgba(15,23,42,0.58)] hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.55),0_0_20px_rgba(99,102,241,0.12)]' : 'cursor-default'} ${isSelected ? 'ring-2 ring-indigo-500/40 border-indigo-500/70' : ''}`}
            >
                {canInspectTask && onToggleSelection && (
                    <div className="absolute left-4 top-4 z-50" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={onToggleSelection}
                            className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-black/50 border-white/20 text-transparent opacity-0 group-hover:opacity-100 group-hover:border-white/60'}`}
                            aria-label={isSelected ? 'Deselect manifest' : 'Select manifest'}
                        >
                            <Check size={13} strokeWidth={3} />
                        </button>
                    </div>
                )}

                <div className="relative h-40 overflow-hidden border-b border-slate-800/50 bg-slate-900/50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(99,102,241,0.22),transparent_56%)]" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-pulse" />

                    <div className="relative z-10 flex flex-col items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-500/25 bg-indigo-500/10 transition-transform duration-500 group-hover:scale-110">
                            {isGenerating ? (
                                <Loader2 size={22} className="animate-spin text-indigo-300" />
                            ) : isError ? (
                                <AlertCircle size={22} className="text-red-300" />
                            ) : (
                                <FileText size={22} className="text-indigo-300" />
                            )}
                        </div>
                        <div className="flex gap-1">
                            <span className="h-3 w-1 rounded-full bg-indigo-500/45 animate-pulse" />
                            <span className="h-5 w-1 rounded-full bg-indigo-500/65 animate-pulse [animation-delay:180ms]" />
                            <span className="h-4 w-1 rounded-full bg-indigo-500/45 animate-pulse [animation-delay:360ms]" />
                        </div>
                    </div>

                    <div className="absolute left-4 top-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-widest ${statusBadgeClass}`}>
                            {!isError && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                            {statusLabel}
                        </span>
                    </div>

                    {isSuccess && (
                        <div className="absolute right-4 top-4 z-30 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {onRemix && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRemix(); }}
                                    className="rounded-lg border border-slate-700 bg-slate-900/75 p-2 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition-all"
                                    title="Neural Remix"
                                >
                                    <Wand2 size={14} />
                                </button>
                            )}
                            {!isTranscriptLocked && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSave(task.result || null, task.prompt, task.modelId, task.metadata, titleLabel, task.archivedItem); }}
                                    className="rounded-lg border border-slate-700 bg-slate-900/75 p-2 text-slate-300 hover:border-indigo-500/40 hover:text-indigo-200 transition-all"
                                    title="Capture to Project"
                                >
                                    <FolderPlus size={14} />
                                </button>
                            )}
                            {!isTranscriptLocked && onPublishToSource && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onPublishToSource(); }}
                                    className="rounded-lg border border-slate-700 bg-slate-900/75 p-2 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-200 transition-all"
                                    title="Save as New Version to Source"
                                >
                                    <FileText size={14} />
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                className="rounded-lg border border-slate-700 bg-slate-900/75 p-2 text-slate-300 hover:border-red-500/40 hover:text-red-300 transition-all"
                                title="Move to Recycle Bin"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-1 flex-col gap-4 p-6">
                    <div className="space-y-1">
                        <p className="line-clamp-2 text-sm font-black leading-tight text-white transition-colors group-hover:text-indigo-300">
                            {titleLabel}
                        </p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                            Source Audio Manifest
                        </p>
                    </div>

                    <div className="flex-1">
                        <p className="line-clamp-4 text-[11px] italic leading-relaxed text-slate-300">
                            "{transcriptPreview}"
                        </p>
                        {isTranscriptLocked && (
                            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                                Transcript QA and summary are being finalized.
                            </p>
                        )}
                        {isError && task.error && (
                            <p className="mt-2 line-clamp-2 text-[10px] font-bold text-red-300/90">
                                {task.error}
                            </p>
                        )}
                    </div>

                    <div className="space-y-3 border-t border-slate-800/50 pt-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <Cpu size={12} className="shrink-0 text-indigo-400" />
                                <span className="truncate text-[9px] font-mono uppercase tracking-wide text-slate-400">
                                    {modelLabel}
                                </span>
                            </div>
                            <span className="text-[9px] font-mono text-slate-500">
                                {displayInfo.resolution || 'Text File'}
                            </span>
                        </div>

                        <div className="space-y-2 rounded-xl border border-slate-800/50 bg-black/20 p-2.5">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <Music size={10} className="shrink-0 text-slate-500" />
                                <span className="truncate text-[8px] font-mono uppercase text-slate-400">
                                    {sourceAudioLabel}
                                </span>
                            </div>

                            {(pollenUsed || creditRate || googleUsageLabel || googleCostLabel) && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {(pollenUsed || creditRate) && (
                                        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter text-emerald-200">
                                            <Flower2 size={9} />
                                            {pollenUsed && <span>Used: {formatPollenAmount(pollenUsed)}</span>}
                                            {creditRate && <span>Rate: {creditRate.displayValue}</span>}
                                        </div>
                                    )}
                                    {(googleUsageLabel || googleCostLabel) && (
                                        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter text-indigo-200">
                                            <Fingerprint size={9} />
                                            {googleUsageLabel && <span>Google: {googleUsageLabel}</span>}
                                            {googleCostLabel && <span>Est: {googleCostLabel}</span>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div 
            role={canInspectTask ? 'button' : undefined}
            tabIndex={canInspectTask ? 0 : -1}
            onClick={() => canInspectTask ? onInspect() : null}
            onKeyDown={canInspectTask ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspect();
                }
            } : undefined}
            className={`flex flex-col bg-[#161616] border rounded-[1.5rem] overflow-hidden group transition-all shadow-2xl min-h-[180px] relative ${canInspectTask ? 'cursor-pointer hover:border-indigo-500/30' : 'cursor-default'} ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-800'}`}
        >
            {/* Direct Selection Circle */}
            {canInspectTask && onToggleSelection && (
                <div className="absolute top-4 left-4 z-40" onClick={(e) => e.stopPropagation()}>
                    <button 
                        onClick={onToggleSelection}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-black/40 border-white/30 text-transparent opacity-0 group-hover:opacity-100 group-hover:border-white/60'}`}
                    >
                        <Check size={14} strokeWidth={3} />
                    </button>
                </div>
            )}

            <div className="w-full h-48 bg-black/20 flex flex-col items-center justify-center border-b border-slate-800/50 shrink-0">
                {isGenerating ? (
                    <div className="flex flex-col items-center gap-4 text-slate-500 animate-pulse">
                        <Loader2 size={32} className="animate-spin text-indigo-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Manifesting...</span>
                    </div>
                ) : isSuccess ? (
                    renderPreview()
                ) : (
                    <div className="flex flex-col items-center gap-2 text-red-500/50">
                        <AlertCircle size={32} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Synthesis Fail</span>
                    </div>
                )}
            </div>

            <div className="flex-1 p-5 relative flex flex-col justify-center bg-gradient-to-r from-transparent to-indigo-500/5">
                {isGenerating && (
                    <div className="space-y-3 animate-in fade-in w-full">
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                            <div 
                                className="h-full transition-all duration-700 ease-out relative bg-gradient-to-r from-blue-600 to-indigo-500"
                                style={{ width: `${task.progress}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse" />
                            </div>
                        </div>
                        <div className="flex justify-end">
                             <span className="text-[10px] font-black font-mono text-indigo-400">
                                {task.progress}% IN PROGRESS
                             </span>
                        </div>
                    </div>
                )}

                {!isGenerating && isError && (
                    <div className="space-y-2 animate-in slide-in-from-left-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 text-red-500 bg-red-500/10 px-3 py-1 rounded-lg border border-red-500/20 w-fit">
                                <AlertCircle size={12} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Pipeline Exception</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                className="shrink-0 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                title="Delete Failed Synthesis"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <p className="text-[10px] text-red-400/80 font-medium leading-relaxed line-clamp-2">
                            {task.error}
                        </p>
                    </div>
                )}
                
                {!isGenerating && isSuccess && (
                     <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-black uppercase tracking-widest opacity-80 ${isTranscriptLocked ? 'text-amber-300' : 'text-slate-500'}`}>
                                {isTranscriptLocked ? 'Transcript Post-Processing' : 'Neural Output Verified'}
                            </span>
                            <div className="flex gap-1">
                                {onRemix && <button onClick={(e) => { e.stopPropagation(); onRemix(); }} className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all" title="Neural Remix"><Wand2 size={16} /></button>}
                                {!isTranscriptLocked && <button onClick={(e) => { e.stopPropagation(); onSave(task.result || null, task.prompt, task.modelId, task.metadata, titleLabel, task.archivedItem); }} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all" title="Capture to Project"><FolderPlus size={16} /></button>}
                                {!isTranscriptLocked && onPublishToSource && <button onClick={(e) => { e.stopPropagation(); onPublishToSource(); }} className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all" title="Save as New Version to Source"><FileText size={16} /></button>}
                                <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all" title="Move to Recycle Bin"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <p className="text-sm font-semibold text-white line-clamp-1">
                            {titleLabel}
                        </p>
                        {mediaMeta.isText ? (
                            <div className="space-y-1 pt-1">
                                {transcriptionDetails.sourceFileName && (
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/80">
                                        Source Audio: {transcriptionDetails.sourceFileName}
                                    </p>
                                )}
                                <p className="text-[11px] text-slate-300 font-medium line-clamp-3 leading-relaxed">
                                    {isTranscriptLocked
                                        ? 'Waiting for transcript summary and QA to finish saving into the Neural Saved item.'
                                        : transcriptSummaryExcerpt || transcriptText || 'Transcript output ready for inspection.'}
                                </p>
                            </div>
                        ) : (
                            <p className="text-[11px] text-slate-300 font-medium line-clamp-2 italic pt-1">"{task.prompt}"</p>
                        )}
                     </div>
                )}
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-slate-800/50 bg-black/20 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Fingerprint size={12} className="text-indigo-500" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter truncate max-w-[140px]">
                            {activeModel?.label || task.modelLabel}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 font-bold font-mono text-[9px]">
                        {mediaMeta.isText ? <FileText size={10} /> : <Monitor size={10} />}
                        {displayInfo.resolution}
                    </div>
                </div>
                {mediaMeta.isAudio && voiceLabel && (
                    <div className="flex items-center gap-2 text-slate-500 font-bold font-mono text-[9px] uppercase tracking-tighter">
                        <Volume2 size={10} />
                        <span>Voice: {voiceLabel}</span>
                    </div>
                )}
                {mediaMeta.isText && transcriptionDetails.sourceFileName && (
                    <div className="flex items-center gap-2 text-cyan-300/80 font-bold font-mono text-[9px] uppercase tracking-tighter">
                        <Volume2 size={10} />
                        <span>Source Audio: {transcriptionDetails.sourceFileName}</span>
                    </div>
                )}
                {(pollenUsed || creditRate) && (
                    <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-emerald-300/80">
                        <Flower2 size={10} />
                        {pollenUsed && <span>Used: {formatPollenAmount(pollenUsed)} pollen</span>}
                        {creditRate && (
                            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono">
                                Rate: {creditRate.displayValue}
                            </span>
                        )}
                    </div>
                )}
                {(googleUsageLabel || googleCostLabel) && (
                    <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-tighter text-indigo-300/80">
                        <Fingerprint size={10} />
                        {googleUsageLabel && <span>Google: {googleUsageLabel}</span>}
                        {googleCostLabel && (
                            <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 font-mono">
                                Est: {googleCostLabel}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
