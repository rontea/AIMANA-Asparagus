import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LabTask } from '../../../../hooks/useAiGeneration';
import { Wand2, X, Fingerprint, Activity, ChevronRight, ChevronLeft, LayoutPanelLeft, Trash2, Save, Check, Loader2, AlertCircle, Clipboard, Copy, Info, Box, Link2, Image as ImageIcon, Maximize2, FileIcon, AudioLines, Clock3, Tag, FileText, Volume2, Download } from 'lucide-react';
import { SpecsDisplay } from '../../../item/specs/SpecsDisplay';
import { ModelOption } from '../ModelSelectorModal';
import { isMusicAudioModel, isTranscriptionAudioModel } from '../ModelSelector/audioModelUtils';
import { api } from '../../../../services/api';
import { useModalDialogs } from '../../../../hooks/useModalDialogs';
import { determineAssetType } from '../../../../services/db';
import { AssetType, ItemWithCurrentRevision, Project } from '../../../../types';
import { MosaicViewerModal } from '../../../item/MosaicViewerModal';
import { ProjectReassignModal } from '../../../lab/history/ProjectReassignModal';
import { buildTranscriptComparisonSegments, buildTranscriptQaRedlineEdits, buildTranscriptSummaryExcerpt, extractTranscriptionManifestDetails, parseTranscriptQaReport } from '../../../../utils/transcriptionManifest';
import { buildTranscriptDownloadArtifact, buildTranscriptInspectionData, formatTranscriptClockTime, type TranscriptDownloadFormat } from '../../../../utils/transcriptExport';
import { createBrowserTtsController } from '../../../chat/browserTts';

interface ArtifactInspectorProps {
    task: LabTask | null;
    onClose: () => void;
    onUpdate?: (taskId: string, updates: Partial<LabTask>) => void;
    onDelete?: (taskId: string) => void;
    onRemix?: (task: LabTask) => void;
    registry: ModelOption[];
}

interface InspectorStripItem {
    id: string;
    url: string;
    mimeType: string;
    kind: 'linked' | 'reference';
    label: string;
}

interface InspectorProfileRow {
    label: string;
    value: string;
    icon: React.ReactNode;
}

interface MusicInfoRow {
    label: string;
    value: string;
}

interface CueDomNodes {
    row: HTMLDivElement | null;
    time: HTMLParagraphElement | null;
}

const TRANSCRIPT_DOWNLOAD_FORMATS: Array<{ id: TranscriptDownloadFormat; label: string }> = [
    { id: 'json', label: 'JSON' },
    { id: 'text', label: 'TEXT' },
    { id: 'srt', label: 'SRT' },
    { id: 'verbose_json', label: 'VERBOSE_JSON' },
    { id: 'vtt', label: 'VTT' }
];

interface TranscriptVoiceOption {
    value: string;
    label: string;
}

const DEFAULT_TRANSCRIPT_VOICE_OPTION: TranscriptVoiceOption = { value: '', label: 'System default' };

const buildTranscriptVoiceOptions = (voices: SpeechSynthesisVoice[]): TranscriptVoiceOption[] => {
    if (!Array.isArray(voices) || voices.length === 0) return [DEFAULT_TRANSCRIPT_VOICE_OPTION];
    const byUri = new Map<string, { value: string; label: string; isDefault: boolean }>();
    voices.forEach((voice) => {
        const uri = String(voice?.voiceURI || '').trim();
        if (!uri || byUri.has(uri)) return;
        const name = String(voice?.name || '').trim() || uri;
        const lang = String(voice?.lang || '').trim();
        const isDefault = voice?.default === true;
        byUri.set(uri, {
            value: uri,
            label: lang ? `${name} (${lang})${isDefault ? ' [default]' : ''}` : `${name}${isDefault ? ' [default]' : ''}`,
            isDefault
        });
    });
    const sorted = Array.from(byUri.values()).sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.label.localeCompare(b.label);
    });
    return [DEFAULT_TRANSCRIPT_VOICE_OPTION, ...sorted.map((item) => ({ value: item.value, label: item.label }))];
};

const normalizeInspectorAssetUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    return trimmed.replace(/[?#].*$/, '');
};

const getTierLabel = (category: string) => {
    switch(category) {
        case 'Language': return 'Text to Text';
        case 'Visual': return 'Text to Image';
        case 'Motion': return 'Text to Video';
        case 'Audio': return 'Text to Speech';
        case 'Static': return 'Static Reference';
        default: return 'Neural Experiment';
    }
};

const formatInspectorDuration = (seconds?: number | null) => {
    if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return '--';
    const total = Math.max(1, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const estimateSpeechDurationSeconds = (text: string) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    const baseSeconds = (wordCount / 150) * 60;
    const punctuationPauses = (trimmed.match(/[.!?;:]/g) || []).length * 0.3;
    const commaPauses = (trimmed.match(/[,]/g) || []).length * 0.15;
    const newlinePauses = (trimmed.match(/\n+/g) || []).length * 0.6;
    return Math.max(1, Math.round(baseSeconds + punctuationPauses + commaPauses + newlinePauses));
};

const formatInspectorCount = (value?: number | null, singular?: string, plural?: string) => {
    if (!Number.isFinite(value) || value === null || value === undefined) return 'N/A';
    const count = Math.max(0, Math.round(value));
    if (!singular || !plural) return String(count);
    return `${count} ${count === 1 ? singular : plural}`;
};

const readFirstStringValueByKeys = (source: unknown, candidateKeys: string[]): string => {
    if (!source || typeof source !== 'object' || candidateKeys.length === 0) return '';
    const wantedKeys = new Set(candidateKeys.map((key) => String(key).trim().toLowerCase()).filter(Boolean));
    if (wantedKeys.size === 0) return '';

    const stack: unknown[] = [source];
    const visited = new Set<unknown>();

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== 'object' || visited.has(current)) continue;
        visited.add(current);

        if (Array.isArray(current)) {
            for (let index = current.length - 1; index >= 0; index -= 1) {
                stack.push(current[index]);
            }
            continue;
        }

        for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
            if (wantedKeys.has(String(key).toLowerCase())) {
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (trimmed) return trimmed;
                }
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return String(value);
                }
                if (Array.isArray(value)) {
                    const firstText = value.find((item) => typeof item === 'string' && item.trim()) as string | undefined;
                    if (firstText) return firstText.trim();
                }
            }

            if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }

    return '';
};

const readFirstStringValueFromSources = (sources: unknown[], candidateKeys: string[]): string => {
    for (const source of sources) {
        const value = readFirstStringValueByKeys(source, candidateKeys);
        if (value) return value;
    }
    return '';
};

const findActiveCueIndexForPlayback = (
    segments: ReturnType<typeof buildTranscriptInspectionData>['segments'],
    playbackTime: number
): number | null => {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const time = Math.max(0, Number.isFinite(playbackTime) ? playbackTime : 0);
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const start = Number(segment.start);
        const safeStart = Number.isFinite(start) ? start : 0;
        const rawEnd = Number(segment.end);
        const nextStart = index < segments.length - 1
            ? Number(segments[index + 1]?.start)
            : Number.NaN;
        const hasNextStart = Number.isFinite(nextStart) && nextStart > safeStart;
        const fallbackEnd = hasNextStart ? Number(nextStart) : Number.POSITIVE_INFINITY;
        const resolvedEnd = Number.isFinite(rawEnd) && rawEnd > safeStart ? rawEnd : fallbackEnd;
        const safeEnd = hasNextStart ? Math.min(resolvedEnd, Number(nextStart)) : resolvedEnd;
        const withinSegment = index === segments.length - 1
            ? time >= safeStart && time <= safeEnd
            : time >= safeStart && time < safeEnd;
        if (withinSegment) return index;
    }
    return null;
};

const CUE_SYNC_HOLDBACK_SECONDS = 0.08;

const ArtifactInspectorView: React.FC<ArtifactInspectorProps> = ({ task, onClose, onUpdate, onDelete, onRemix, registry }) => {
    const navigate = useNavigate();
    const { alert, alertDialog } = useModalDialogs();
    const [showManifest, setShowManifest] = useState(false);
    const [showInspectHelp, setShowInspectHelp] = useState(false);
    const [showSourceStrip, setShowSourceStrip] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [errorCopied, setErrorCopied] = useState(false);
    const [promptCopied, setPromptCopied] = useState(false);
    const [transcriptCopied, setTranscriptCopied] = useState(false);
    const [musicLyricsCopied, setMusicLyricsCopied] = useState(false);
    const [correctedTranscriptCopied, setCorrectedTranscriptCopied] = useState(false);
    const [showTranscriptDownloadMenu, setShowTranscriptDownloadMenu] = useState(false);
    const [referenceItems, setReferenceItems] = useState<ItemWithCurrentRevision[]>([]);
    const [isSourcesLoading, setIsSourcesLoading] = useState(false);
    const [isSourceViewerOpen, setIsSourceViewerOpen] = useState(false);
    const [activeSourceIndex, setActiveSourceIndex] = useState<number | null>(null);
    const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
    const [sourceMoveItem, setSourceMoveItem] = useState<ItemWithCurrentRevision | null>(null);
    const [showSourceMoveSelector, setShowSourceMoveSelector] = useState(false);
    const [sourceMoveTargetProjectId, setSourceMoveTargetProjectId] = useState('');
    const [isSourceMoving, setIsSourceMoving] = useState(false);
    const [sourceAudioPlayableUrl, setSourceAudioPlayableUrl] = useState('');
    const [isSourceAudioLoading, setIsSourceAudioLoading] = useState(false);
    const [sourceAudioLoadError, setSourceAudioLoadError] = useState('');
    const [sourceAudioMeasuredDurationSeconds, setSourceAudioMeasuredDurationSeconds] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isSpaceHeld, setIsSpaceHeld] = useState(false);
    const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
    const [isTranscriptPreviewExpanded, setIsTranscriptPreviewExpanded] = useState(false);
    const [isTranscriptReadAloudSupported, setIsTranscriptReadAloudSupported] = useState(false);
    const [transcriptVoiceOptions, setTranscriptVoiceOptions] = useState<TranscriptVoiceOption[]>([DEFAULT_TRANSCRIPT_VOICE_OPTION]);
    const [selectedTranscriptVoiceUri, setSelectedTranscriptVoiceUri] = useState('');
    const [globalDefaultTranscriptVoice, setGlobalDefaultTranscriptVoice] = useState<{ voiceURI: string; voiceName: string }>({
        voiceURI: '',
        voiceName: ''
    });
    const [transcriptReadAloudState, setTranscriptReadAloudState] = useState<'idle' | 'playing' | 'paused'>('idle');
    const transcriptTtsControllerRef = useRef<ReturnType<typeof createBrowserTtsController> | null>(null);
    const activeSourceAudioRef = useRef<HTMLAudioElement | null>(null);
    const sourceAudioRafRef = useRef<number | null>(null);
    const sourceAudioSyncEnabledRef = useRef(false);
    const sourceAudioNativeTextTrackRef = useRef<TextTrack | null>(null);
    const sourceAudioNativeTrackHostRef = useRef<HTMLAudioElement | null>(null);
    const sourceAudioNativeTrackCuesRef = useRef<any[]>([]);
    const sourceAudioNativeCueCleanupRef = useRef<(() => void) | null>(null);
    const sourceAudioNativeCueRevisionRef = useRef('');
    const sourceAudioNativeCueSyncEnabledRef = useRef(false);
    const activeCueIndexRef = useRef<number | null>(null);
    const transcriptSegmentsRef = useRef<ReturnType<typeof buildTranscriptInspectionData>['segments']>([]);
    const transcriptCueNodeRefs = useRef<Record<string, Map<number, CueDomNodes>>>({});
    const lastAutoScrolledCueRef = useRef('');
    
    // Editable State
    const [editTitle, setEditTitle] = useState('');
    const [editPrompt, setEditPrompt] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPromotingTranscript, setIsPromotingTranscript] = useState(false);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const lastPointerRef = useRef({ x: 0, y: 0 });
    const onCloseRef = useRef(onClose);
    const onUpdateRef = useRef(onUpdate);
    const onDeleteRef = useRef(onDelete);
    const onRemixRef = useRef(onRemix);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);
    useEffect(() => {
        onDeleteRef.current = onDelete;
    }, [onDelete]);
    useEffect(() => {
        onRemixRef.current = onRemix;
    }, [onRemix]);
    const requestInspectorClose = useCallback(() => {
        onCloseRef.current();
    }, []);
    const emitInspectorUpdate = useCallback((taskId: string, updates: Partial<LabTask>) => {
        onUpdateRef.current?.(taskId, updates);
    }, []);
    const emitInspectorDelete = useCallback((taskId: string) => {
        onDeleteRef.current?.(taskId);
    }, []);
    const emitInspectorRemix = useCallback((nextTask: LabTask) => {
        onRemixRef.current?.(nextTask);
    }, []);
    const transcriptPreviewText = useMemo(() => (
        buildTranscriptInspectionData(
            String(task?.result?.text || task?.archivedItem?.currentRevision?.prompt || task?.prompt || '').trim()
        ).transcriptText
    ), [task]);

    const stopTranscriptReadAloud = useCallback(() => {
        transcriptTtsControllerRef.current?.stop();
        setTranscriptReadAloudState('idle');
    }, []);
    const transcriptDefaultVoiceLabel = useMemo(() => {
        const name = String(globalDefaultTranscriptVoice.voiceName || '').trim();
        return name ? `Default (${name})` : 'Default (System)';
    }, [globalDefaultTranscriptVoice.voiceName]);
    const transcriptVoiceOptionsForUi = useMemo(() => {
        if (transcriptVoiceOptions.length === 0) return [{ value: '', label: transcriptDefaultVoiceLabel }];
        if (transcriptVoiceOptions[0]?.value === '') {
            return [{ ...transcriptVoiceOptions[0], label: transcriptDefaultVoiceLabel }, ...transcriptVoiceOptions.slice(1)];
        }
        return [{ value: '', label: transcriptDefaultVoiceLabel }, ...transcriptVoiceOptions];
    }, [transcriptDefaultVoiceLabel, transcriptVoiceOptions]);
    const setCueRowActiveStyles = useCallback((node: HTMLDivElement | null, isActive: boolean) => {
        if (!node) return;
        node.style.borderColor = isActive ? 'rgba(129, 140, 248, 0.45)' : '';
        node.style.background = isActive ? 'rgba(99, 102, 241, 0.15)' : '';
        node.style.boxShadow = isActive
            ? '0 0 0 1px rgba(99, 102, 241, 0.12), 0 18px 40px rgba(37, 99, 235, 0.2)'
            : '';
    }, []);
    const setCueTimeActiveStyles = useCallback((node: HTMLParagraphElement | null, isActive: boolean) => {
        if (!node) return;
        node.style.display = isActive ? 'inline-flex' : '';
        node.style.alignItems = isActive ? 'center' : '';
        node.style.width = isActive ? 'fit-content' : '';
        node.style.borderRadius = isActive ? '0.375rem' : '';
        node.style.padding = isActive ? '0.25rem 0.5rem' : '';
        node.style.backgroundColor = isActive ? 'rgba(165, 180, 252, 0.2)' : '';
        node.style.color = isActive ? '#e0e7ff' : '';
    }, []);
    const updateCueDomHighlight = useCallback((nextCueIndex: number | null) => {
        const previousCueIndex = activeCueIndexRef.current;
        if (previousCueIndex === nextCueIndex) return false;
        Object.values(transcriptCueNodeRefs.current).forEach((timelineMap) => {
            if (previousCueIndex !== null) {
                const previousNodes = timelineMap.get(previousCueIndex);
                if (previousNodes) {
                    setCueRowActiveStyles(previousNodes.row, false);
                    setCueTimeActiveStyles(previousNodes.time, false);
                }
            }
            if (nextCueIndex !== null) {
                const nextNodes = timelineMap.get(nextCueIndex);
                if (nextNodes) {
                    setCueRowActiveStyles(nextNodes.row, true);
                    setCueTimeActiveStyles(nextNodes.time, true);
                }
            }
        });
        activeCueIndexRef.current = nextCueIndex;
        return true;
    }, [setCueRowActiveStyles, setCueTimeActiveStyles]);
    const clearCueDomHighlight = useCallback(() => {
        updateCueDomHighlight(null);
    }, [updateCueDomHighlight]);
    const scrollCueIntoView = useCallback((timelineId: 'main' | 'expanded-main', cueIndex: number) => {
        const cueNode = transcriptCueNodeRefs.current[timelineId]?.get(cueIndex)?.row || null;
        if (!cueNode) return;
        const scrollKey = `${timelineId}:${cueIndex}`;
        if (lastAutoScrolledCueRef.current === scrollKey) return;
        lastAutoScrolledCueRef.current = scrollKey;
        cueNode.scrollIntoView({
            behavior: 'auto',
            block: 'center',
            inline: 'nearest'
        });
    }, []);
    const applyActiveCueIndex = useCallback((nextCueIndex: number | null) => {
        const changed = updateCueDomHighlight(nextCueIndex);
        if (!changed || nextCueIndex === null) return;
        const activeTimelineId: 'main' | 'expanded-main' = isTranscriptPreviewExpanded ? 'expanded-main' : 'main';
        scrollCueIntoView(activeTimelineId, nextCueIndex);
    }, [isTranscriptPreviewExpanded, scrollCueIntoView, updateCueDomHighlight]);
    const teardownSourceAudioNativeCueSync = useCallback(() => {
        const cleanup = sourceAudioNativeCueCleanupRef.current;
        if (cleanup) {
            try {
                cleanup();
            } catch (_error) {}
        }
        sourceAudioNativeCueCleanupRef.current = null;

        const textTrack = sourceAudioNativeTextTrackRef.current;
        if (textTrack) {
            sourceAudioNativeTrackCuesRef.current.forEach((cue) => {
                try {
                    textTrack.removeCue(cue);
                } catch (_error) {}
            });
            textTrack.mode = 'disabled';
            try {
                (textTrack as any).oncuechange = null;
            } catch (_error) {}
        }
        sourceAudioNativeTrackCuesRef.current = [];
        sourceAudioNativeTextTrackRef.current = null;
        sourceAudioNativeTrackHostRef.current = null;
        sourceAudioNativeCueRevisionRef.current = '';
        sourceAudioNativeCueSyncEnabledRef.current = false;
    }, []);
    const buildTranscriptCueRevision = useCallback((segments: ReturnType<typeof buildTranscriptInspectionData>['segments']) => (
        segments
            .map((segment, index) => {
                const start = Number.isFinite(Number(segment.start)) ? Number(segment.start).toFixed(3) : '0.000';
                const end = Number.isFinite(Number(segment.end)) ? Number(segment.end).toFixed(3) : 'NaN';
                return `${index}:${start}-${end}`;
            })
            .join('|')
    ), []);
    const getCueIndexForPlaybackTime = useCallback((playbackTime: number) => {
        const normalizedTime = Number.isFinite(playbackTime) ? Math.max(0, playbackTime) : 0;
        const holdbackTime = Math.max(0, normalizedTime - CUE_SYNC_HOLDBACK_SECONDS);
        return findActiveCueIndexForPlayback(transcriptSegmentsRef.current, holdbackTime);
    }, []);
    const syncActiveCueFromAudio = useCallback((audio: HTMLAudioElement) => {
        if (!sourceAudioSyncEnabledRef.current) {
            clearCueDomHighlight();
            return;
        }
        const nextCueIndex = getCueIndexForPlaybackTime(Number(audio.currentTime));
        applyActiveCueIndex(nextCueIndex);
    }, [applyActiveCueIndex, clearCueDomHighlight, getCueIndexForPlaybackTime]);
    const syncActiveCueFromNativeTrack = useCallback((audio: HTMLAudioElement) => {
        if (!sourceAudioNativeCueSyncEnabledRef.current) return false;
        if (sourceAudioNativeTrackHostRef.current !== audio) return false;
        const cueIndex = getCueIndexForPlaybackTime(Number(audio.currentTime));
        applyActiveCueIndex(cueIndex);
        return cueIndex !== null;
    }, [applyActiveCueIndex, getCueIndexForPlaybackTime]);
    const ensureSourceAudioNativeCueSync = useCallback((audio: HTMLAudioElement) => {
        const segments = transcriptSegmentsRef.current;
        if (!sourceAudioSyncEnabledRef.current || !Array.isArray(segments) || segments.length === 0) {
            teardownSourceAudioNativeCueSync();
            return false;
        }

        const cueCtor = (window as any).VTTCue || (window as any).WebKitDataCue;
        if (typeof cueCtor !== 'function') {
            sourceAudioNativeCueSyncEnabledRef.current = false;
            return false;
        }

        const revision = buildTranscriptCueRevision(segments);
        const sameTrack = sourceAudioNativeTrackHostRef.current === audio
            && sourceAudioNativeTextTrackRef.current
            && sourceAudioNativeCueRevisionRef.current === revision;
        if (sameTrack) return true;

        teardownSourceAudioNativeCueSync();

        let textTrack: TextTrack | null = null;
        try {
            textTrack = audio.addTextTrack('metadata', 'AIMANA Transcript Cues', 'en');
            textTrack.mode = 'hidden';
        } catch (_error) {
            sourceAudioNativeCueSyncEnabledRef.current = false;
            return false;
        }
        if (!textTrack) return false;

        const createdCues: any[] = [];
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            const start = Number(segment.start);
            const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
            const rawEnd = Number(segment.end);
            const nextStart = index < segments.length - 1 ? Number(segments[index + 1]?.start) : Number.NaN;
            const hasNextStart = Number.isFinite(nextStart) && nextStart > safeStart;
            const audioDuration = Number(audio.duration);
            const fallbackEnd = hasNextStart
                ? Number(nextStart)
                : Number.isFinite(audioDuration) && audioDuration > safeStart
                    ? audioDuration + 0.01
                    : safeStart + 1.5;
            const resolvedEnd = Number.isFinite(rawEnd) && rawEnd > safeStart ? rawEnd : fallbackEnd;
            const safeEnd = hasNextStart ? Math.min(resolvedEnd, Number(nextStart)) : resolvedEnd;
            const cueEnd = Math.max(safeStart + 0.05, safeEnd);

            let cue: any = null;
            try {
                cue = new cueCtor(safeStart, cueEnd, String(index));
            } catch (_error) {
                cue = null;
            }
            if (!cue) continue;
            try {
                cue.id = String(index);
            } catch (_error) {}
            try {
                textTrack.addCue(cue);
                createdCues.push(cue);
            } catch (_error) {}
        }

        if (createdCues.length === 0) {
            sourceAudioNativeCueSyncEnabledRef.current = false;
            return false;
        }

        const handleCueChange = () => {
            const cueIndex = getCueIndexForPlaybackTime(Number(audio.currentTime));
            applyActiveCueIndex(cueIndex);
        };

        if (typeof (textTrack as any).addEventListener === 'function') {
            (textTrack as any).addEventListener('cuechange', handleCueChange);
            sourceAudioNativeCueCleanupRef.current = () => {
                try {
                    (textTrack as any).removeEventListener('cuechange', handleCueChange);
                } catch (_error) {}
            };
        } else {
            const previousHandler = (textTrack as any).oncuechange || null;
            (textTrack as any).oncuechange = handleCueChange;
            sourceAudioNativeCueCleanupRef.current = () => {
                try {
                    if ((textTrack as any).oncuechange === handleCueChange) {
                        (textTrack as any).oncuechange = previousHandler;
                    }
                } catch (_error) {}
            };
        }

        sourceAudioNativeTextTrackRef.current = textTrack;
        sourceAudioNativeTrackHostRef.current = audio;
        sourceAudioNativeTrackCuesRef.current = createdCues;
        sourceAudioNativeCueRevisionRef.current = revision;
        sourceAudioNativeCueSyncEnabledRef.current = true;
        handleCueChange();
        return true;
    }, [applyActiveCueIndex, buildTranscriptCueRevision, getCueIndexForPlaybackTime, teardownSourceAudioNativeCueSync]);
    const stopSourceAudioSyncLoop = useCallback(() => {
        if (sourceAudioRafRef.current !== null) {
            window.cancelAnimationFrame(sourceAudioRafRef.current);
            sourceAudioRafRef.current = null;
        }
    }, []);
    const startSourceAudioSyncLoop = useCallback((audio: HTMLAudioElement) => {
        stopSourceAudioSyncLoop();
        activeSourceAudioRef.current = audio;
        const tick = () => {
            const currentAudio = activeSourceAudioRef.current;
            if (!currentAudio || currentAudio.paused || currentAudio.ended) {
                sourceAudioRafRef.current = null;
                return;
            }
            syncActiveCueFromAudio(currentAudio);
            sourceAudioRafRef.current = window.requestAnimationFrame(tick);
        };
        sourceAudioRafRef.current = window.requestAnimationFrame(tick);
    }, [stopSourceAudioSyncLoop, syncActiveCueFromAudio]);
    const handleSourceAudioPlay = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        activeSourceAudioRef.current = audio;
        ensureSourceAudioNativeCueSync(audio);
        syncActiveCueFromAudio(audio);
        startSourceAudioSyncLoop(audio);
    }, [ensureSourceAudioNativeCueSync, startSourceAudioSyncLoop, syncActiveCueFromAudio]);
    const handleSourceAudioLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activeSourceAudioRef.current && activeSourceAudioRef.current !== audio) return;
        activeSourceAudioRef.current = audio;
        const measuredDuration = Number(audio.duration);
        if (Number.isFinite(measuredDuration) && measuredDuration > 0) {
            const rounded = Number(measuredDuration.toFixed(3));
            setSourceAudioMeasuredDurationSeconds((prev) => {
                if (Number.isFinite(prev) && prev !== null && Math.abs(Number(prev) - rounded) < 0.02) return prev;
                return rounded;
            });
        }
        const nativeCueSyncReady = ensureSourceAudioNativeCueSync(audio);
        if (nativeCueSyncReady && syncActiveCueFromNativeTrack(audio)) return;
        syncActiveCueFromAudio(audio);
    }, [ensureSourceAudioNativeCueSync, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const handleSourceAudioProgress = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activeSourceAudioRef.current && activeSourceAudioRef.current !== audio) return;
        activeSourceAudioRef.current = audio;
        const nativeCueSyncReady = ensureSourceAudioNativeCueSync(audio);
        if (nativeCueSyncReady) {
            if (!syncActiveCueFromNativeTrack(audio)) {
                syncActiveCueFromAudio(audio);
            }
            return;
        }
        syncActiveCueFromAudio(audio);
    }, [ensureSourceAudioNativeCueSync, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const handleSourceAudioPause = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activeSourceAudioRef.current && activeSourceAudioRef.current !== audio) return;
        stopSourceAudioSyncLoop();
        const nativeCueSyncReady = ensureSourceAudioNativeCueSync(audio);
        if (nativeCueSyncReady) {
            if (!syncActiveCueFromNativeTrack(audio)) {
                syncActiveCueFromAudio(audio);
            }
            return;
        }
        syncActiveCueFromAudio(audio);
    }, [ensureSourceAudioNativeCueSync, stopSourceAudioSyncLoop, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const handleSourceAudioEnded = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activeSourceAudioRef.current && activeSourceAudioRef.current !== audio) return;
        stopSourceAudioSyncLoop();
        const nativeCueSyncReady = ensureSourceAudioNativeCueSync(audio);
        if (nativeCueSyncReady) {
            if (!syncActiveCueFromNativeTrack(audio)) {
                syncActiveCueFromAudio(audio);
            }
            activeSourceAudioRef.current = null;
            return;
        }
        syncActiveCueFromAudio(audio);
        activeSourceAudioRef.current = null;
    }, [ensureSourceAudioNativeCueSync, stopSourceAudioSyncLoop, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const registerTranscriptCueNode = useCallback((timelineId: string, cueIndex: number, node: HTMLDivElement | null) => {
        if (!transcriptCueNodeRefs.current[timelineId]) {
            transcriptCueNodeRefs.current[timelineId] = new Map();
        }
        const timelineMap = transcriptCueNodeRefs.current[timelineId];
        const existing = timelineMap.get(cueIndex) || { row: null, time: null };
        if (node) {
            existing.row = node;
            timelineMap.set(cueIndex, existing);
            if (activeCueIndexRef.current === cueIndex) {
                setCueRowActiveStyles(node, true);
            } else {
                setCueRowActiveStyles(node, false);
            }
            return;
        }
        existing.row = null;
        if (!existing.time) timelineMap.delete(cueIndex);
        else timelineMap.set(cueIndex, existing);
    }, [setCueRowActiveStyles]);
    const registerTranscriptCueTimeNode = useCallback((timelineId: string, cueIndex: number, node: HTMLParagraphElement | null) => {
        if (!transcriptCueNodeRefs.current[timelineId]) {
            transcriptCueNodeRefs.current[timelineId] = new Map();
        }
        const timelineMap = transcriptCueNodeRefs.current[timelineId];
        const existing = timelineMap.get(cueIndex) || { row: null, time: null };
        if (node) {
            existing.time = node;
            timelineMap.set(cueIndex, existing);
            if (activeCueIndexRef.current === cueIndex) {
                setCueTimeActiveStyles(node, true);
            } else {
                setCueTimeActiveStyles(node, false);
            }
            return;
        }
        existing.time = null;
        if (!existing.row) timelineMap.delete(cueIndex);
        else timelineMap.set(cueIndex, existing);
    }, [setCueTimeActiveStyles]);

    const handleTranscriptReadAloudToggle = useCallback(() => {
        if (!transcriptPreviewText) return;
        const tts = transcriptTtsControllerRef.current;
        if (!tts || !tts.isSupported()) return;

        const state = tts.getState();
        if (state === 'playing') {
            tts.pause();
            setTranscriptReadAloudState('paused');
            return;
        }
        if (state === 'paused') {
            tts.resume();
            setTranscriptReadAloudState('playing');
            return;
        }

        const selectedVoiceUri = String(selectedTranscriptVoiceUri || '').trim();
        const defaultVoiceUri = String(globalDefaultTranscriptVoice.voiceURI || '').trim();
        const preferredVoiceUri = selectedVoiceUri || defaultVoiceUri;
        const matchedVoice = preferredVoiceUri
            ? tts.getVoices().find((voice) => String(voice?.voiceURI || '').trim() === preferredVoiceUri)
            : null;
        const started = tts.speak(transcriptPreviewText, {
            voiceURI: preferredVoiceUri || undefined,
            voiceName: String(matchedVoice?.name || '').trim() || undefined,
            onStart: () => setTranscriptReadAloudState('playing'),
            onPause: () => setTranscriptReadAloudState('paused'),
            onResume: () => setTranscriptReadAloudState('playing'),
            onEnd: () => setTranscriptReadAloudState('idle'),
            onError: () => setTranscriptReadAloudState('idle')
        });
        if (!started) setTranscriptReadAloudState('idle');
    }, [globalDefaultTranscriptVoice.voiceURI, selectedTranscriptVoiceUri, transcriptPreviewText]);

    useEffect(() => {
        let cancelled = false;
        const loadDefaultTranscriptVoice = async () => {
            try {
                const settings = await api.settings.get();
                if (cancelled) return;
                setGlobalDefaultTranscriptVoice({
                    voiceURI: String(settings?.defaultReadAloudVoiceURI || '').trim(),
                    voiceName: String(settings?.defaultReadAloudVoiceName || '').trim()
                });
            } catch {}
        };
        const handleRefresh = () => {
            loadDefaultTranscriptVoice();
        };

        loadDefaultTranscriptVoice();
        window.addEventListener('settings-updated', handleRefresh);
        return () => {
            cancelled = true;
            window.removeEventListener('settings-updated', handleRefresh);
        };
    }, []);

    useEffect(() => {
        const controller = createBrowserTtsController();
        transcriptTtsControllerRef.current = controller;
        const supported = controller.isSupported();
        setIsTranscriptReadAloudSupported(supported);
        setTranscriptVoiceOptions(
            supported
                ? buildTranscriptVoiceOptions(controller.getVoices())
                : [DEFAULT_TRANSCRIPT_VOICE_OPTION]
        );

        const warmupTimers: number[] = [];
        const syncVoices = () => {
            if (transcriptTtsControllerRef.current !== controller) return;
            setTranscriptVoiceOptions(buildTranscriptVoiceOptions(controller.getVoices()));
        };

        if (supported) {
            warmupTimers.push(window.setTimeout(syncVoices, 250));
            warmupTimers.push(window.setTimeout(syncVoices, 1200));
            const synth = window.speechSynthesis;
            if (typeof synth?.addEventListener === 'function') {
                synth.addEventListener('voiceschanged', syncVoices);
            }
            return () => {
                warmupTimers.forEach((timerId) => window.clearTimeout(timerId));
                if (typeof synth?.removeEventListener === 'function') {
                    synth.removeEventListener('voiceschanged', syncVoices);
                }
                controller.destroy();
                transcriptTtsControllerRef.current = null;
                setIsTranscriptReadAloudSupported(false);
                setTranscriptVoiceOptions([DEFAULT_TRANSCRIPT_VOICE_OPTION]);
                setTranscriptReadAloudState('idle');
            };
        }

        return () => {
            controller.destroy();
            transcriptTtsControllerRef.current = null;
            setIsTranscriptReadAloudSupported(false);
            setTranscriptVoiceOptions([DEFAULT_TRANSCRIPT_VOICE_OPTION]);
            setTranscriptReadAloudState('idle');
        };
    }, []);

    useEffect(() => {
        if (!selectedTranscriptVoiceUri) return;
        const exists = transcriptVoiceOptions.some((option) => option.value === selectedTranscriptVoiceUri);
        if (!exists) setSelectedTranscriptVoiceUri('');
    }, [selectedTranscriptVoiceUri, transcriptVoiceOptions]);
    useEffect(() => (
        () => {
            stopSourceAudioSyncLoop();
            teardownSourceAudioNativeCueSync();
        }
    ), [stopSourceAudioSyncLoop, teardownSourceAudioNativeCueSync]);

    useEffect(() => {
        if (task) {
            setEditTitle(task.title || task.archivedItem?.currentRevision?.title || '');
            setEditPrompt(task.prompt || '');
            setConfirmDelete(false);
            setShowInspectHelp(false);
            setShowSourceStrip(false);
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
            setIsPanning(false);
            setIsSpaceHeld(false);
            setImageNaturalSize(null);
            setIsTranscriptPreviewExpanded(false);
            setSourceAudioMeasuredDurationSeconds(null);
            setTranscriptCopied(false);
            setMusicLyricsCopied(false);
            setShowTranscriptDownloadMenu(false);
            clearCueDomHighlight();
            stopSourceAudioSyncLoop();
            teardownSourceAudioNativeCueSync();
            activeSourceAudioRef.current = null;
            transcriptCueNodeRefs.current = {};
            lastAutoScrolledCueRef.current = '';
            stopTranscriptReadAloud();
        }
    }, [clearCueDomHighlight, stopSourceAudioSyncLoop, stopTranscriptReadAloud, task, teardownSourceAudioNativeCueSync]);

    if (!task) return null;

    const rev = task.archivedItem?.currentRevision;
    const mimeType = task.result?.mimeType || rev?.mimeType || '';
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');
    const transcriptionDetails = extractTranscriptionManifestDetails({
        metadata: task.metadata,
        aiParameters: rev?.aiParameters || null
    });
    const isText = mimeType.startsWith('text/') || (mimeType.includes('json') && transcriptionDetails.isTranscription);
    const src = task.result?.base64 
        ? `data:${task.result.mimeType};base64,${task.result.base64}` 
        : rev?.fileUrl || '';
    const rawDisplayText = String(task.result?.text || rev?.prompt || task.prompt || '').trim();
    const isInspectableImage = !isVideo && !isAudio && !isText && !!src;
    const contentWidthClass = isText ? 'max-w-[92vw]' : 'max-w-6xl';
    const previewWidthClass = isText ? 'max-w-[92vw]' : 'max-w-4xl';
    const metadataWidthClass = isText ? 'max-w-[92vw]' : 'max-w-6xl';

    const activeModel = useMemo(() => {
        return registry.find(m => m.id === task.modelId);
    }, [registry, task.modelId]);

    const manifestData = useMemo(() => {
        if (task.metadata) return task.metadata;
        if (rev?.aiParameters) {
            try {
                return JSON.parse(rev.aiParameters);
            } catch (e) { return null; }
        }
        return null;
    }, [task.metadata, rev]);

    const audioManifest = useMemo(() => {
        const base = manifestData && typeof manifestData === 'object'
            ? manifestData as Record<string, any>
            : {};
        const advanced = base.advanced_params && typeof base.advanced_params === 'object'
            ? base.advanced_params as Record<string, any>
            : base;
        const dynamic = advanced.dynamicParams && typeof advanced.dynamicParams === 'object'
            ? advanced.dynamicParams as Record<string, any>
            : {};
        return { advanced, dynamic };
    }, [manifestData]);
    const transcriptTextForDuration = useMemo(() => (
        buildTranscriptInspectionData(rawDisplayText).transcriptText
    ), [rawDisplayText]);
    const transcriptDurationSeconds = useMemo(() => {
        const candidates = [
            sourceAudioMeasuredDurationSeconds,
            task.metadata?.duration,
            audioManifest.dynamic.duration,
            audioManifest.advanced.duration
        ];
        const explicitDuration = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
        if (explicitDuration) return Number(explicitDuration);
        return transcriptTextForDuration ? estimateSpeechDurationSeconds(transcriptTextForDuration) : null;
    }, [
        audioManifest.advanced.duration,
        audioManifest.dynamic.duration,
        sourceAudioMeasuredDurationSeconds,
        task.metadata?.duration,
        transcriptTextForDuration
    ]);
    const transcriptOutput = useMemo(() => (
        buildTranscriptInspectionData(rawDisplayText, {
            durationSeconds: transcriptDurationSeconds
        })
    ), [rawDisplayText, transcriptDurationSeconds]);
    const displayText = transcriptOutput.transcriptText;

    const isMusicTask = useMemo(() => (
        isMusicAudioModel(activeModel)
        || /music|suno/i.test(`${task.modelId} ${task.modelLabel}`)
    ), [activeModel, task.modelId, task.modelLabel]);

    const isTextToAudioTask = useMemo(() => (
        isAudio
        && !isMusicTask
        && !isTranscriptionAudioModel(activeModel)
    ), [activeModel, isAudio, isMusicTask]);

    const speechScriptText = useMemo(() => (
        String(editPrompt || displayText || '').trim()
    ), [displayText, editPrompt]);

    const speechWordCount = useMemo(() => (
        speechScriptText ? speechScriptText.split(/\s+/).filter(Boolean).length : 0
    ), [speechScriptText]);

    const speechCharacterCount = speechScriptText.length;
    const estimatedSpeechDurationSeconds = useMemo(() => (
        estimateSpeechDurationSeconds(speechScriptText)
    ), [speechScriptText]);

    const voiceLabel = useMemo(() => (
        String(
            audioManifest.dynamic.voiceName
            || audioManifest.advanced.voiceName
            || audioManifest.dynamic.voice
            || audioManifest.advanced.voice
            || ''
        ).trim()
    ), [audioManifest]);

    const responseFormatLabel = useMemo(() => {
        const raw = String(
            audioManifest.dynamic.response_format
            || audioManifest.advanced.response_format
            || ''
        ).trim();
        return raw ? raw.toUpperCase() : '';
    }, [audioManifest]);

    const seedLabel = useMemo(() => {
        const raw = String(audioManifest.advanced.seed || '').trim();
        return raw || '';
    }, [audioManifest]);

    const musicMetadataSources = useMemo(() => (
        [audioManifest.dynamic, audioManifest.advanced, manifestData, task.metadata, task.result]
    ), [audioManifest.advanced, audioManifest.dynamic, manifestData, task.metadata, task.result]);

    const musicLyricsText = useMemo(() => {
        if (!isAudio || !isMusicTask) return '';
        const savedLyrics = readFirstStringValueFromSources(musicMetadataSources, [
            'lyrics',
            'lyric',
            'lyricsText',
            'lyricText',
            'songLyrics',
            'song_lyrics',
            'vocalLyrics',
            'vocal_lyrics'
        ]);
        return String(savedLyrics || editPrompt || task.prompt || '').trim();
    }, [editPrompt, isAudio, isMusicTask, musicMetadataSources, task.prompt]);

    const musicLyricsWordCount = useMemo(() => (
        musicLyricsText ? musicLyricsText.split(/\s+/).filter(Boolean).length : 0
    ), [musicLyricsText]);

    const multiSpeakerEnabled = useMemo(() => (
        Boolean(audioManifest.dynamic.multiSpeakerEnabled ?? audioManifest.advanced.multiSpeakerEnabled ?? false)
    ), [audioManifest]);

    const speakerPairs = useMemo(() => {
        const speakerEntries = [
            {
                id: 'A',
                name: String(audioManifest.dynamic.speakerOneName || audioManifest.advanced.speakerOneName || '').trim(),
                voice: String(audioManifest.dynamic.speakerOneVoice || audioManifest.advanced.speakerOneVoice || '').trim()
            },
            {
                id: 'B',
                name: String(audioManifest.dynamic.speakerTwoName || audioManifest.advanced.speakerTwoName || '').trim(),
                voice: String(audioManifest.dynamic.speakerTwoVoice || audioManifest.advanced.speakerTwoVoice || '').trim()
            }
        ];
        return speakerEntries.filter((speaker) => speaker.name || speaker.voice);
    }, [audioManifest]);

    const visualDimensions = useMemo(() => {
        const widthCandidate = [
            task.metadata?.resolvedWidth,
            audioManifest.advanced.resolvedWidth,
            imageNaturalSize?.width
        ].find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
        const heightCandidate = [
            task.metadata?.resolvedHeight,
            audioManifest.advanced.resolvedHeight,
            imageNaturalSize?.height
        ].find((value) => Number.isFinite(Number(value)) && Number(value) > 0);

        return {
            width: widthCandidate ? Number(widthCandidate) : null,
            height: heightCandidate ? Number(heightCandidate) : null
        };
    }, [audioManifest.advanced.resolvedHeight, audioManifest.advanced.resolvedWidth, imageNaturalSize?.height, imageNaturalSize?.width, task.metadata?.resolvedHeight, task.metadata?.resolvedWidth]);

    const ratioLabel = useMemo(() => {
        const raw = String(
            task.metadata?.ratio
            || audioManifest.dynamic.aspectRatio
            || audioManifest.dynamic.ratio
            || audioManifest.advanced.aspectRatio
            || audioManifest.advanced.ratio
            || task.aspectRatio
            || ''
        ).trim();
        return raw || '';
    }, [audioManifest, task.aspectRatio, task.metadata?.ratio]);

    const mediaTypeLabel = isVideo ? 'Video' : isAudio ? 'Audio' : isText ? 'Text' : 'Image';
    const inspectionHeading = isAudio
        ? (isMusicTask ? 'Audio Music Artifact Inspection' : 'Audio Artifact Inspection')
        : '';

    const actualMimeLabel = useMemo(() => {
        const raw = String(mimeType || '').trim();
        return raw ? raw.toUpperCase() : 'Unknown';
    }, [mimeType]);

    const audioDurationLabel = useMemo(() => {
        if (!isAudio) return 'N/A';
        const requestedDuration = Number(audioManifest.dynamic.duration ?? audioManifest.advanced.duration ?? 0);
        if (Number.isFinite(requestedDuration) && requestedDuration > 0) {
            return formatInspectorDuration(requestedDuration);
        }
        if (isTextToAudioTask && estimatedSpeechDurationSeconds > 0) {
            return `${formatInspectorDuration(estimatedSpeechDurationSeconds)} (est.)`;
        }
        return 'Unknown';
    }, [audioManifest, estimatedSpeechDurationSeconds, isAudio, isTextToAudioTask]);

    const musicInfoRows = useMemo<MusicInfoRow[]>(() => {
        if (!isAudio || !isMusicTask) return [];
        const readField = (keys: string[]) => readFirstStringValueFromSources(musicMetadataSources, keys);

        const rawInstrumental = audioManifest.dynamic.instrumental ?? audioManifest.advanced.instrumental;
        const vocalsValue = typeof rawInstrumental === 'boolean'
            ? (rawInstrumental ? 'Instrumental only' : 'Vocals enabled')
            : (() => {
                const normalized = String(rawInstrumental || '').trim().toLowerCase();
                if (!normalized) return 'Not specified';
                if (normalized === 'true' || normalized === '1' || normalized === 'yes') return 'Instrumental only';
                if (normalized === 'false' || normalized === '0' || normalized === 'no') return 'Vocals enabled';
                return String(rawInstrumental).trim();
            })();

        return [
            { label: 'Model', value: String(task.modelLabel || task.modelId || 'Unknown').trim() || 'Unknown' },
            { label: 'Duration', value: audioDurationLabel || 'Unknown' },
            { label: 'Output', value: responseFormatLabel || actualMimeLabel || 'Unknown' },
            { label: 'Vocals', value: vocalsValue },
            { label: 'Genre', value: readField(['genre', 'musicGenre', 'songGenre']) || 'Not specified' },
            { label: 'Mood', value: readField(['mood', 'vibe', 'emotion']) || 'Not specified' },
            { label: 'Tempo', value: readField(['tempo', 'bpm', 'pace']) || 'Not specified' },
            { label: 'Key', value: readField(['musicalKey', 'keySignature', 'key']) || 'Not specified' },
            { label: 'Style', value: readField(['style', 'musicStyle', 'subgenre']) || 'Not specified' },
            { label: 'Seed', value: seedLabel || 'Not specified' }
        ];
    }, [actualMimeLabel, audioDurationLabel, audioManifest.advanced.instrumental, audioManifest.dynamic.instrumental, isAudio, isMusicTask, musicMetadataSources, responseFormatLabel, seedLabel, task.modelId, task.modelLabel]);

    const textLengthLabel = useMemo(() => {
        if (!isText) return 'N/A';
        const words = displayText ? displayText.split(/\s+/).filter(Boolean).length : 0;
        const chars = displayText.length;
        return `${formatInspectorCount(words, 'word', 'words')} / ${formatInspectorCount(chars, 'char', 'chars')}`;
    }, [displayText, isText]);
    const transcriptWordCount = useMemo(() => (
        displayText ? displayText.split(/\s+/).filter(Boolean).length : 0
    ), [displayText]);
    const transcriptCharacterTotal = displayText.length;
    const transcriptArtifactId = useMemo(() => (
        String(rev?.id || task.archivedItem?.id || task.id || 'transcript').trim() || 'transcript'
    ), [rev?.id, task.archivedItem?.id, task.id]);

    const transcriptSummaryBlocks = useMemo(() => {
        const savedSummary = String(transcriptionDetails.summaryText || '').trim();
        if (savedSummary) {
            return savedSummary
                .split(/\n{2,}/)
                .map((block) => block.trim())
                .filter(Boolean);
        }

        const fallback = buildTranscriptSummaryExcerpt('', displayText, 320);
        return fallback ? [fallback] : [];
    }, [displayText, transcriptionDetails.summaryText]);

    const qaDetails = useMemo(() => (
        parseTranscriptQaReport(transcriptionDetails.qaReport, displayText)
    ), [displayText, transcriptionDetails.qaReport]);
    const qaRedlineEdits = useMemo(() => (
        buildTranscriptQaRedlineEdits(displayText, qaDetails.correctedTranscript, qaDetails.edits)
    ), [displayText, qaDetails.correctedTranscript, qaDetails.edits]);
    const correctedTranscriptOutput = useMemo(() => (
        buildTranscriptInspectionData(String(qaDetails.correctedTranscript || '').trim(), {
            durationSeconds: transcriptDurationSeconds
        })
    ), [qaDetails.correctedTranscript, transcriptDurationSeconds]);
    const transcriptComparison = useMemo(() => {
        const originalTranscript = transcriptionDetails.transcriptHistoryText || displayText;
        const correctedTranscript = transcriptionDetails.transcriptHistoryText
            ? displayText
            : qaDetails.correctedTranscript;
        return buildTranscriptComparisonSegments(originalTranscript, correctedTranscript);
    }, [displayText, qaDetails.correctedTranscript, transcriptionDetails.transcriptHistoryText]);
    const canPromoteCorrectedTranscript = useMemo(() => (
        !!task.archivedItem?.id
        && !!qaDetails.correctedTranscript
        && qaDetails.hasCorrections
    ), [qaDetails.correctedTranscript, qaDetails.hasCorrections, task.archivedItem?.id]);
    const hasStructuredQaData = qaDetails.edits.length > 0
        || qaDetails.issues.length > 0
        || qaDetails.changeNotes.length > 0
        || !!qaDetails.correctedTranscript
        || !!qaDetails.verdict
        || !!qaDetails.confidence;
    const transcriptCueCount = transcriptOutput.segments.length;
    const transcriptSpeakerCount = new Set(
        transcriptOutput.segments.map((segment) => String(segment.speaker || '').trim()).filter(Boolean)
    ).size;
    const transcriptTimingLabel = transcriptOutput.hasNativeSegments ? 'Native timing' : 'Estimated timing';
    const renderTranscriptTimeline = (
        output: ReturnType<typeof buildTranscriptInspectionData>,
        variant: 'main' | 'expanded' | 'compact' = 'main',
        syncTimelineId: 'main' | 'expanded-main' | null = null
    ) => (
        <div className={variant === 'main' ? 'space-y-3' : 'space-y-4'}>
            {output.segments.length > 0 ? output.segments.map((segment, index) => (
                <div
                    key={`${variant}-${segment.id}-${segment.start}-${index}`}
                    ref={syncTimelineId ? (node) => registerTranscriptCueNode(syncTimelineId, index, node) : undefined}
                    className={`grid gap-3 rounded-[1.25rem] border border-slate-800/70 bg-black/20 ${
                        variant === 'compact'
                            ? 'p-3 md:grid-cols-[120px_minmax(0,1fr)]'
                            : variant === 'main'
                            ? 'p-4 md:grid-cols-[132px_minmax(0,1fr)]'
                            : 'p-4 md:grid-cols-[148px_minmax(0,1fr)]'
                    }`}
                >
                    <div className="space-y-2">
                        <p
                            ref={syncTimelineId ? (node) => registerTranscriptCueTimeNode(syncTimelineId, index, node) : undefined}
                            className="text-sm font-semibold text-indigo-200"
                        >
                            {formatTranscriptClockTime(segment.start)}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                            {segment.speaker || `Cue ${index + 1}`}
                        </p>
                        <p className="text-[10px] text-slate-500">to {formatTranscriptClockTime(segment.end)}</p>
                    </div>
                    <p className={`whitespace-pre-wrap text-slate-100 ${
                        variant === 'compact'
                            ? 'text-sm leading-6'
                            : variant === 'main'
                                ? 'text-[15px] leading-7'
                                : 'text-[15px] leading-8'
                    }`}>
                        {segment.text}
                    </p>
                </div>
            )) : (
                <pre className={`whitespace-pre-wrap text-slate-100 ${
                    variant === 'compact'
                        ? 'text-sm leading-6'
                        : variant === 'main'
                            ? 'text-[15px] leading-7'
                            : 'text-[15px] leading-8'
                }`}>
                    {output.transcriptText || 'Transcript preview unavailable.'}
                </pre>
            )}
        </div>
    );
    const renderInlineSourceAudio = (size: 'inline' | 'full' = 'inline') => {
        if (!sourceAudioPreviewSrc) return null;
        return (
            <div className={`rounded-xl border border-slate-800 bg-slate-900/70 ${
                size === 'inline' ? 'px-2 py-1.5' : 'px-3 py-3'
            }`}>
                <div className={`flex ${size === 'inline' ? 'items-center gap-2' : 'flex-col gap-2'}`}>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                        <AudioLines size={12} />
                        Source Audio
                    </div>
                    <audio
                        src={sourceAudioPreviewSrc}
                        controls
                        preload="metadata"
                        onLoadedMetadata={handleSourceAudioLoadedMetadata}
                        onPlay={handleSourceAudioPlay}
                        onTimeUpdate={handleSourceAudioProgress}
                        onSeeked={handleSourceAudioProgress}
                        onPause={handleSourceAudioPause}
                        onEnded={handleSourceAudioEnded}
                        className={size === 'inline' ? 'h-8 w-[220px] max-w-full' : 'w-full'}
                    />
                </div>
            </div>
        );
    };

    useEffect(() => {
        let isCancelled = false;
        setReferenceItems([]);
        if (!rev?.aiParameters) return;

        try {
            const params = JSON.parse(rev.aiParameters);
            const adv = params?.advanced_params || params || {};
            const neuralIds = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds.filter(Boolean) : [];
            const singleReferenceId = typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()
                ? adv.referenceItemId.trim()
                : '';
            const referenceIds = Array.from(new Set([singleReferenceId, ...neuralIds].filter(Boolean)));

            if (referenceIds.length === 0) return;
            setIsSourcesLoading(true);

            Promise.all(referenceIds.map((id: string) => api.items.get(id)))
                .then((items) => {
                    if (isCancelled) return;
                    setReferenceItems(items.filter((item): item is ItemWithCurrentRevision => !!item));
                })
                .finally(() => {
                    if (!isCancelled) setIsSourcesLoading(false);
                });
        } catch {
            setReferenceItems([]);
        }

        return () => {
            isCancelled = true;
        };
    }, [rev?.aiParameters]);

    const sourceStripItems = useMemo<InspectorStripItem[]>(() => {
        const linked = (rev?.secondaryFiles || []).map((file, index) => ({
            id: file.id,
            url: file.url,
            mimeType: file.mimeType || 'image/png',
            kind: 'linked' as const,
            label: `Linked Artifact ${index + 1}`
        }));

        const references = referenceItems
            .filter(item => item.currentRevision?.fileUrl)
            .map((item, index) => ({
                id: item.id,
                url: item.currentRevision?.fileUrl || '',
                mimeType: item.currentRevision?.mimeType || 'image/png',
                kind: 'reference' as const,
                label: `Reference ${index + 1}`
            }));

        const seenIds = new Set<string>();
        const seenUrls = new Set<string>();
        return [...references, ...linked].filter((item) => {
            const itemId = item.id?.trim();
            const normalizedUrl = normalizeInspectorAssetUrl(item.url);
            const isDuplicateById = !!itemId && seenIds.has(itemId);
            const isDuplicateByUrl = !!normalizedUrl && seenUrls.has(normalizedUrl);
            if (isDuplicateById || isDuplicateByUrl) return false;
            if (itemId) seenIds.add(itemId);
            if (normalizedUrl) seenUrls.add(normalizedUrl);
            return true;
        });
    }, [referenceItems, rev?.secondaryFiles]);

    const handleInspectSourceStripItem = useCallback(async (itemId: string) => {
        const referencedItem = referenceItems.find((item) => item.id === itemId);
        if (referencedItem?.projectId) {
            setIsSourceViewerOpen(false);
            requestInspectorClose();
            navigate(`/project/${referencedItem.projectId}?itemId=${encodeURIComponent(referencedItem.id)}`);
            return;
        }

        try {
            const resolvedItem = await api.items.get(itemId);
            if (resolvedItem?.projectId) {
                setIsSourceViewerOpen(false);
                requestInspectorClose();
                navigate(`/project/${resolvedItem.projectId}?itemId=${encodeURIComponent(resolvedItem.id)}`);
                return;
            }
        } catch (_error) {}

        await alert({
            title: 'Inspect unavailable',
            description: 'This manifest preview node is a linked file, not a saved item manifest.'
        });
    }, [alert, navigate, referenceItems, requestInspectorClose]);

    const handleMoveSourceStripItem = useCallback(async (itemId: string) => {
        const referencedItem = referenceItems.find((item) => item.id === itemId);
        const resolvedItem = referencedItem || await api.items.get(itemId);

        if (!resolvedItem?.projectId) {
            await alert({
                title: 'Move unavailable',
                description: 'This manifest preview node is a linked file, not a saved item that can be reassigned.'
            });
            return;
        }

        setIsSourceViewerOpen(false);
        setSourceMoveItem(resolvedItem);
        setSourceMoveTargetProjectId((prev) => {
            if (prev) return prev;
            return resolvedItem.projectId || '';
        });
        setShowSourceMoveSelector(true);
    }, [alert, referenceItems]);

    useEffect(() => {
        if (!showSourceMoveSelector) return;
        let isCancelled = false;

        api.projects.list()
            .then((projects) => {
                if (isCancelled) return;
                setAvailableProjects(projects);
                setSourceMoveTargetProjectId((prev) => {
                    if (prev && projects.some((project) => project.id === prev)) return prev;
                    if (sourceMoveItem?.projectId) {
                        const fallback = projects.find((project) => project.id !== sourceMoveItem.projectId);
                        return fallback?.id || sourceMoveItem.projectId;
                    }
                    return projects[0]?.id || '';
                });
            })
            .catch(() => {
                if (!isCancelled) setAvailableProjects([]);
            });

        return () => {
            isCancelled = true;
        };
    }, [showSourceMoveSelector, sourceMoveItem?.projectId]);

    const handleConfirmSourceMove = useCallback(async () => {
        if (!sourceMoveItem?.id || !sourceMoveTargetProjectId) return;

        const sourceProjectId = sourceMoveItem.projectId;
        if (sourceProjectId === sourceMoveTargetProjectId) {
            setShowSourceMoveSelector(false);
            return;
        }

        setIsSourceMoving(true);
        try {
            await api.items.update({
                id: sourceMoveItem.id,
                projectId: sourceMoveTargetProjectId,
                collectionId: null,
                isArchived: false
            });

            if (sourceProjectId) {
                window.dispatchEvent(new CustomEvent('project-items-updated', {
                    detail: { projectId: sourceProjectId, reason: 'artifact-inspector-source-move' }
                }));
            }
            window.dispatchEvent(new CustomEvent('project-items-updated', {
                detail: { projectId: sourceMoveTargetProjectId, reason: 'artifact-inspector-source-move' }
            }));

            setReferenceItems((prev) => prev.map((item) => (
                item.id === sourceMoveItem.id
                    ? { ...item, projectId: sourceMoveTargetProjectId, collectionId: null }
                    : item
            )));

            const targetProjectName = availableProjects.find((project) => project.id === sourceMoveTargetProjectId)?.name || 'the selected project';
            await alert({
                title: 'Artifact moved',
                description: `Manifest preview item moved to ${targetProjectName}.`
            });

            setShowSourceMoveSelector(false);
            setSourceMoveItem(null);
        } catch (error: any) {
            await alert({
                title: 'Move failed',
                description: error?.message || 'Could not move this manifest preview item to another project.',
                tone: 'danger'
            });
        } finally {
            setIsSourceMoving(false);
        }
    }, [alert, availableProjects, sourceMoveItem, sourceMoveTargetProjectId]);

    const sourceAudioReference = useMemo(() => (
        referenceItems.find((item) => String(item.currentRevision?.mimeType || '').startsWith('audio/')) || null
    ), [referenceItems]);

    const sourceAudioAsset = useMemo(() => {
        if (sourceAudioReference?.currentRevision?.fileUrl) {
            return {
                url: sourceAudioReference.currentRevision.fileUrl,
                label: sourceAudioReference.currentRevision.originalFilename
                    || sourceAudioReference.currentRevision.title
                    || transcriptionDetails.sourceFileName
                    || 'Source audio attached'
            };
        }

        const stripAudio = sourceStripItems.find((item) => String(item.mimeType || '').startsWith('audio/') && String(item.url || '').trim());
        if (stripAudio) {
            return {
                url: stripAudio.url,
                label: transcriptionDetails.sourceFileName || stripAudio.label || 'Source audio attached'
            };
        }

        if (transcriptionDetails.sourceAudioDataUrl) {
            return {
                url: transcriptionDetails.sourceAudioDataUrl,
                label: transcriptionDetails.sourceFileName || 'Source audio attached'
            };
        }

        return {
            url: '',
            label: transcriptionDetails.sourceFileName
                || sourceAudioReference?.currentRevision?.originalFilename
                || sourceAudioReference?.currentRevision?.title
                || ''
        };
    }, [sourceAudioReference, sourceStripItems, transcriptionDetails.sourceAudioDataUrl, transcriptionDetails.sourceFileName]);
    const sourceAudioItemHref = useMemo(() => {
        if (!sourceAudioReference?.id || !sourceAudioReference?.projectId) return '';
        return `/project/${sourceAudioReference.projectId}?itemId=${encodeURIComponent(sourceAudioReference.id)}`;
    }, [sourceAudioReference?.id, sourceAudioReference?.projectId]);

    const sourceAudioLabel = useMemo(() => {
        if (!isText) return 'N/A';
        return transcriptionDetails.sourceFileName
            || sourceAudioAsset.label
            || (sourceAudioAsset.url ? 'Attached audio source' : 'Unknown');
    }, [isText, sourceAudioAsset.label, sourceAudioAsset.url, transcriptionDetails.sourceFileName]);
    const sourceAudioPreviewSrc = useMemo(() => (
        String(sourceAudioPlayableUrl || sourceAudioAsset.url || '').trim()
    ), [sourceAudioAsset.url, sourceAudioPlayableUrl]);
    useEffect(() => {
        transcriptSegmentsRef.current = transcriptOutput.segments;
    }, [transcriptOutput.segments]);
    useEffect(() => {
        sourceAudioSyncEnabledRef.current = Boolean(isText && sourceAudioPreviewSrc && transcriptOutput.segments.length > 0);
        if (!sourceAudioSyncEnabledRef.current) {
            clearCueDomHighlight();
            teardownSourceAudioNativeCueSync();
        }
    }, [clearCueDomHighlight, isText, sourceAudioPreviewSrc, teardownSourceAudioNativeCueSync, transcriptOutput.segments]);
    useEffect(() => {
        clearCueDomHighlight();
        stopSourceAudioSyncLoop();
        teardownSourceAudioNativeCueSync();
        setSourceAudioMeasuredDurationSeconds(null);
        activeSourceAudioRef.current = null;
        transcriptCueNodeRefs.current = {};
        lastAutoScrolledCueRef.current = '';
    }, [clearCueDomHighlight, sourceAudioPreviewSrc, stopSourceAudioSyncLoop, teardownSourceAudioNativeCueSync]);
    useEffect(() => {
        if (!isText) return;
        const activeCueIndex = activeCueIndexRef.current;
        if (activeCueIndex === null) return;
        const timelineId: 'main' | 'expanded-main' = isTranscriptPreviewExpanded ? 'expanded-main' : 'main';
        scrollCueIntoView(timelineId, activeCueIndex);
    }, [isText, isTranscriptPreviewExpanded, scrollCueIntoView]);

    const inspectorProfileRows = useMemo<InspectorProfileRow[]>(() => {
        const isImage = !isAudio && !isVideo && !isText;
        const resolutionValue = (isImage || isVideo)
            ? (visualDimensions.width && visualDimensions.height
                ? `${visualDimensions.width}x${visualDimensions.height}`
                : 'Unknown')
            : 'N/A';
        const aspectValue = (isImage || isVideo)
            ? (ratioLabel || 'Unknown')
            : 'N/A';
        const durationValue = isVideo
            ? (() => {
                const raw = Number(audioManifest.dynamic.duration ?? audioManifest.advanced.duration ?? 0);
                return Number.isFinite(raw) && raw > 0 ? formatInspectorDuration(raw) : 'Unknown';
            })()
            : (isAudio ? audioDurationLabel : 'N/A');
        const voiceValue = isTextToAudioTask
            ? (multiSpeakerEnabled
                ? `Multi-speaker${speakerPairs.length > 0 ? ` (${speakerPairs.length})` : ''}`
                : (voiceLabel || 'Unknown'))
            : 'N/A';
        const synthesisFormatValue = isAudio
            ? (responseFormatLabel || actualMimeLabel)
            : 'N/A';

        return [
            { label: 'Media Type', value: mediaTypeLabel, icon: <Activity size={12} /> },
            { label: 'Resolution', value: resolutionValue, icon: <Maximize2 size={12} /> },
            { label: 'Aspect Ratio', value: aspectValue, icon: <Tag size={12} /> },
            { label: 'Duration', value: durationValue, icon: <Clock3 size={12} /> },
            { label: 'Voice Routing', value: voiceValue, icon: <Volume2 size={12} /> },
            { label: 'Synthesis Format', value: synthesisFormatValue, icon: <AudioLines size={12} /> },
            { label: 'Source Audio', value: sourceAudioLabel, icon: <AudioLines size={12} /> },
            { label: 'Text Length', value: textLengthLabel, icon: <FileText size={12} /> }
        ];
    }, [actualMimeLabel, audioDurationLabel, audioManifest, isAudio, isText, isTextToAudioTask, isVideo, mediaTypeLabel, multiSpeakerEnabled, ratioLabel, responseFormatLabel, sourceAudioLabel, speakerPairs.length, textLengthLabel, visualDimensions.height, visualDimensions.width, voiceLabel]);

    useEffect(() => {
        let isCancelled = false;
        let objectUrl = '';
        const rawUrl = String(sourceAudioAsset.url || '').trim();

        setSourceAudioLoadError('');
        if (!rawUrl) {
            setSourceAudioPlayableUrl('');
            setIsSourceAudioLoading(false);
            return () => {};
        }

        if (rawUrl.startsWith('data:')) {
            setSourceAudioPlayableUrl(rawUrl);
            setIsSourceAudioLoading(false);
            return () => {};
        }

        const loadAudio = async () => {
            setIsSourceAudioLoading(true);
            try {
                const headers = api.auth.getAuthHeaders();
                let response = await fetch(rawUrl, { headers });
                if (!response.ok) response = await fetch(rawUrl);
                if (!response.ok) throw new Error(`Audio fetch failed (${response.status})`);
                const blob = await response.blob();
                objectUrl = URL.createObjectURL(blob);
                if (isCancelled) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }
                setSourceAudioPlayableUrl(objectUrl);
            } catch (_error) {
                if (isCancelled) return;
                // Fallback to direct URL in case it is already publicly readable.
                setSourceAudioPlayableUrl(rawUrl);
                setSourceAudioLoadError('Could not preload source audio with auth headers. Trying direct playback.');
            } finally {
                if (!isCancelled) setIsSourceAudioLoading(false);
            }
        };

        loadAudio();
        return () => {
            isCancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [sourceAudioAsset.url]);

    const createdAt = rev?.createdAt || task.timestamp;
    const createdLabel = createdAt
        ? new Date(createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : null;

    const hasPendingChanges = useMemo(() => {
        const currentTitle = String(task.title || task.archivedItem?.currentRevision?.title || '');
        const currentPrompt = String(task.prompt || '');
        return editTitle !== currentTitle || editPrompt !== currentPrompt;
    }, [editPrompt, editTitle, task]);

    const persistEdits = useCallback(async () => {
        if (!hasPendingChanges) return true;
        setIsSaving(true);
        try {
            // If it's a persisted item, update the DB
            if (task.archivedItem?.currentRevision) {
                await api.revisions.update({
                    ...task.archivedItem.currentRevision,
                    title: editTitle,
                    prompt: editPrompt
                });
            }
            // Update local state in parent
            emitInspectorUpdate(task.id, { title: editTitle, prompt: editPrompt });
            return true;
        } catch (e) {
            console.error("Auto-save failed");
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [editPrompt, editTitle, emitInspectorUpdate, hasPendingChanges, task]);

    const handleAutoSave = async () => {
        await persistEdits();
    };

    const handlePromoteCorrectedTranscript = useCallback(async () => {
        const archivedItem = task.archivedItem;
        const currentRevision = archivedItem?.currentRevision;
        const correctedTranscript = String(qaDetails.correctedTranscript || '').trim();
        if (!archivedItem?.id || !currentRevision?.id || !correctedTranscript) return;

        setIsPromotingTranscript(true);
        try {
            let parsedParams: Record<string, any> = {};
            try {
                parsedParams = currentRevision.aiParameters ? JSON.parse(currentRevision.aiParameters) : {};
            } catch (_error) {}

            const advanced = parsedParams?.advanced_params && typeof parsedParams.advanced_params === 'object'
                ? parsedParams.advanced_params
                : {};
            const existingPost = advanced.transcriptionPostProcess && typeof advanced.transcriptionPostProcess === 'object'
                ? advanced.transcriptionPostProcess
                : {};
            const nextPost = {
                ...existingPost,
                status: 'complete',
                correctedTranscriptApplied: true,
                promotedCorrectedTranscriptAt: Date.now(),
                promotedFromRevisionId: currentRevision.id,
                promotedFromTranscript: currentRevision.prompt || displayText || '',
                qaError: ''
            };

            const fileName = (() => {
                const baseName = String(currentRevision.originalFilename || currentRevision.title || `transcript-${archivedItem.id}`).trim() || `transcript-${archivedItem.id}`;
                return /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.txt`;
            })();
            const file = new File([correctedTranscript], fileName, {
                type: currentRevision.mimeType || 'text/plain'
            });

            const newRevision = await api.revisions.add(archivedItem.id, file, {
                title: currentRevision.title,
                label: currentRevision.label,
                prompt: correctedTranscript,
                engine: currentRevision.engine,
                note: currentRevision.note,
                aiParameters: JSON.stringify({
                    ...parsedParams,
                    advanced_params: {
                        ...advanced,
                        transcriptionPostProcess: nextPost
                    }
                }, null, 2),
                secondaryFiles: currentRevision.secondaryFiles || []
            });

            const freshItem = await api.items.get(archivedItem.id);
            const nextArchivedItem = freshItem || (
                newRevision ? {
                    ...archivedItem,
                    currentRevisionId: newRevision.id,
                    currentRevision: newRevision,
                    updatedAt: Date.now()
                } : archivedItem
            );

            setEditPrompt(correctedTranscript);
            emitInspectorUpdate(task.id, {
                prompt: correctedTranscript,
                title: nextArchivedItem.currentRevision?.title || task.title,
                archivedItem: nextArchivedItem
            });
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('neural-history-updated'));
            }
        } catch (error) {
            console.error('Failed to promote corrected transcript', error);
            await alert({
                title: 'Transcript Promotion Failed',
                description: 'Could not create a new revision from the corrected transcript.',
                tone: 'danger'
            });
        } finally {
            setIsPromotingTranscript(false);
        }
    }, [alert, displayText, emitInspectorUpdate, qaDetails.correctedTranscript, task]);

    const handleCloseWithSave = useCallback(async () => {
        const didPersist = await persistEdits();
        if (didPersist) requestInspectorClose();
    }, [persistEdits, requestInspectorClose]);
    const handleBackdropClose = useCallback(() => {
        if (isAudio && isMusicTask) return;
        void handleCloseWithSave();
    }, [handleCloseWithSave, isAudio, isMusicTask]);

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        
        setIsDeleting(true);
        try {
            if (onDeleteRef.current) {
                // If it's in the DB, move it to recycle bin first.
                if (task.archivedItem) {
                    await api.items.update({ id: task.archivedItem.id, isArchived: true, isPinned: false });
                    window.dispatchEvent(new CustomEvent('project-items-updated', {
                        detail: {
                            projectId: task.archivedItem.projectId,
                            reason: 'artifact-inspector-item-archived',
                            itemIds: [task.archivedItem.id]
                        }
                    }));
                }
                emitInspectorDelete(task.id);
            }
            requestInspectorClose();
        } catch (e) {
            await alert({
                title: 'Move Failed',
                description: 'Could not move artifact to Neural Recycle Bin.',
                tone: 'danger'
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleCopyError = () => {
        if (!task.error) return;
        navigator.clipboard.writeText(task.error);
        setErrorCopied(true);
        setTimeout(() => setErrorCopied(false), 2000);
    };

    const handleCopyPrompt = async () => {
        if (!editPrompt.trim()) return;
        await navigator.clipboard.writeText(editPrompt);
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 2000);
    };

    const copyTranscriptValue = useCallback(async (value: string) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return false;
        await navigator.clipboard.writeText(trimmed);
        return true;
    }, []);

    const handleCopyTranscript = async () => {
        if (!await copyTranscriptValue(displayText)) return;
        setTranscriptCopied(true);
        setTimeout(() => setTranscriptCopied(false), 2000);
    };

    const handleCopyCorrectedTranscript = async () => {
        if (!await copyTranscriptValue(correctedTranscriptOutput.transcriptText)) return;
        setCorrectedTranscriptCopied(true);
        setTimeout(() => setCorrectedTranscriptCopied(false), 2000);
    };

    const handleCopyMusicLyrics = async () => {
        if (!await copyTranscriptValue(musicLyricsText)) return;
        setMusicLyricsCopied(true);
        setTimeout(() => setMusicLyricsCopied(false), 2000);
    };

    const handleDownloadTranscriptFormat = (format: TranscriptDownloadFormat) => {
        const artifact = buildTranscriptDownloadArtifact(format, {
            rawTranscript: rawDisplayText,
            title: editTitle || task.title || transcriptionDetails.sourceFileName || sourceAudioAsset.label || 'transcript',
            sourceFileName: transcriptionDetails.sourceFileName || sourceAudioAsset.label || '',
            modelId: task.modelId,
            createdAt: task.timestamp,
            durationSeconds: transcriptDurationSeconds,
            summaryText: transcriptionDetails.summaryText,
            qaReport: transcriptionDetails.qaReport
        });
        const blob = new Blob([artifact.content], { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = artifact.filename;
        link.click();
        URL.revokeObjectURL(url);
        setShowTranscriptDownloadMenu(false);
    };

    const clampZoom = (value: number) => Math.max(1, Math.min(6, Number(value.toFixed(2))));

    const applyPanDelta = (deltaX: number, deltaY: number) => {
        const viewport = viewportRef.current;
        if (!viewport || !imageNaturalSize) return;

        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        const baseScale = Math.min(
            viewportWidth / imageNaturalSize.width,
            viewportHeight / imageNaturalSize.height
        );
        const renderedWidth = imageNaturalSize.width * baseScale * zoom;
        const renderedHeight = imageNaturalSize.height * baseScale * zoom;
        const maxPanX = Math.max(0, (renderedWidth - viewportWidth) / 2);
        const maxPanY = Math.max(0, (renderedHeight - viewportHeight) / 2);

        setPanOffset(prev => ({
            x: Math.max(-maxPanX, Math.min(maxPanX, prev.x + deltaX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, prev.y + deltaY))
        }));
    };

    useEffect(() => {
        if (!isInspectableImage) {
            setIsSpaceHeld(false);
            setIsPanning(false);
            return () => {};
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            const viewport = viewportRef.current;
            const activeEl = document.activeElement as HTMLElement | null;
            const isViewportFocused = !!viewport && !!activeEl && (activeEl === viewport || viewport.contains(activeEl));
            if (!isViewportFocused) return;

            const panStep = 60 / zoom;

            if (e.code === 'Space') {
                if (!e.repeat) setIsSpaceHeld(true);
                e.preventDefault();
                return;
            }

            if (e.code === 'KeyW' || e.code === 'ArrowUp') {
                e.preventDefault();
                applyPanDelta(0, panStep);
            }
            if (e.code === 'KeyS' || e.code === 'ArrowDown') {
                e.preventDefault();
                applyPanDelta(0, -panStep);
            }
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
                e.preventDefault();
                applyPanDelta(panStep, 0);
            }
            if (e.code === 'KeyD' || e.code === 'ArrowRight') {
                e.preventDefault();
                applyPanDelta(-panStep, 0);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setIsSpaceHeld(false);
                setIsPanning(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [applyPanDelta, isInspectableImage, zoom]);

    const focusViewport = () => {
        viewportRef.current?.focus();
    };

    const handleViewportWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!isInspectableImage) return;
        e.preventDefault();
        focusViewport();
        setZoom(prev => {
            const next = clampZoom(prev + (e.deltaY < 0 ? 0.15 : -0.15));
            if (next === 1) {
                setPanOffset({ x: 0, y: 0 });
            }
            return next;
        });
    };

    const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isInspectableImage || !isSpaceHeld) return;
        e.preventDefault();
        focusViewport();
        setIsPanning(true);
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isInspectableImage || !isPanning) return;
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        applyPanDelta(dx, dy);
    };

    const handleViewportMouseUp = () => {
        setIsPanning(false);
    };

    const handleOpenSourceViewer = (index: number) => {
        setActiveSourceIndex(index);
        setIsSourceViewerOpen(true);
    };

    const shouldShowTranscriptInspector = isText && (
        displayText
        || transcriptSummaryBlocks.length > 0
        || transcriptionDetails.sourceFileName
        || sourceAudioReference
        || transcriptionDetails.qaReport
    );

    const shouldRenderInspectorBody = isText || isTextToAudioTask || (isAudio && isMusicTask) || showSourceStrip;

    const inspectorHeaderPanel = isText ? (
        <div className={`w-full ${metadataWidthClass} shrink-0 mt-4 md:mt-6 animate-in slide-in-from-bottom-4 duration-700`}>
            <div className="rounded-[2.35rem] border border-slate-800/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(2,6,23,0.7))] px-5 py-5 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl md:px-7 md:py-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 ${activeModel?.color || 'text-indigo-400'}`}>
                            <Activity size={20} />
                        </div>
                        <div className="min-w-0">
                            <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onBlur={handleAutoSave}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        (e.currentTarget as HTMLInputElement).blur();
                                    }
                                }}
                                placeholder="Add descriptive title..."
                                className="w-full bg-transparent text-left text-lg font-black tracking-tight text-white outline-none transition-colors focus:text-indigo-300 md:text-xl"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em]">
                                <span className="text-slate-500">{task.modelLabel}</span>
                                {createdLabel && <span className="text-slate-600">{createdLabel}</span>}
                                {isSaving && <Loader2 size={10} className="animate-spin text-indigo-400" />}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {(sourceStripItems.length > 0 || isSourcesLoading) && (
                            <button
                                onClick={() => setShowSourceStrip((prev) => !prev)}
                                className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                                    showSourceStrip
                                        ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-100'
                                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <Box size={14} />
                                {showSourceStrip ? 'Hide Film Strip' : 'Show Film Strip'}
                            </button>
                        )}
                        <button
                            onClick={handleCloseWithSave}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                        >
                            <X size={14} />
                            Dismiss View
                        </button>
                        {onRemix && (
                            <button
                                onClick={async () => {
                                    const didPersist = await persistEdits();
                                    if (!didPersist) return;
                                    emitInspectorRemix(task);
                                    requestInspectorClose();
                                }}
                                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_50px_rgba(79,70,229,0.45)] transition-all hover:bg-indigo-500 active:scale-95"
                            >
                                <Wand2 size={14} />
                                Remix Artifact
                            </button>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                            disabled={isDeleting}
                            className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                                confirmDelete
                                    ? 'border-red-400 bg-red-600 text-white animate-pulse'
                                    : 'border-slate-800 bg-slate-900/70 text-red-300 hover:border-red-500/40 hover:bg-red-900/25'
                            }`}
                        >
                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            {confirmDelete ? 'Confirm Move To Recycle Bin' : 'Move Artifact To Recycle Bin'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    ) : (
        <div className={`w-full ${metadataWidthClass} shrink-0 mt-6 md:mt-8 animate-in slide-in-from-bottom-4 duration-700`}>
            <div className="rounded-[2rem] border border-white/5 bg-black/35 px-6 py-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                <div className={`w-full ${metadataWidthClass} mx-auto space-y-8 text-center`}>
                    {!isAudio && (
                        <div className="w-full px-0 md:px-1">
                            <div className="flex min-w-0 items-start gap-4">
                                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 ${activeModel?.color || 'text-indigo-400'}`}>
                                    <Activity size={24} />
                                </div>
                                <div className="min-w-0 w-full">
                                    {inspectionHeading && (
                                        <h3 className="text-left text-lg font-black tracking-tight text-white">
                                            {inspectionHeading}
                                        </h3>
                                    )}
                                    <input
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onBlur={handleAutoSave}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        placeholder="Add descriptive title..."
                                        className={`w-full bg-transparent text-left text-base md:text-xl font-semibold text-white tracking-normal outline-none focus:text-indigo-400 transition-colors ${inspectionHeading ? 'mt-2' : ''}`}
                                    />
                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-slate-500">{task.modelLabel}</span>
                                        {createdLabel && <span className="text-slate-600">{createdLabel}</span>}
                                        {isSaving && <Loader2 size={10} className="animate-spin text-indigo-500" />}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-4 flex-wrap">
                        {(sourceStripItems.length > 0 || isSourcesLoading) && (
                            <button
                                onClick={() => setShowSourceStrip((prev) => !prev)}
                                className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border ${
                                    showSourceStrip
                                        ? 'bg-indigo-600/20 border-indigo-400/40 text-indigo-200'
                                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                                }`}
                            >
                                <Box size={16} />
                                {showSourceStrip ? 'Hide Film Strip' : 'Show Film Strip'}
                            </button>
                        )}
                        {onRemix && (
                            <button
                                onClick={async () => {
                                    const didPersist = await persistEdits();
                                    if (!didPersist) return;
                                    emitInspectorRemix(task);
                                    requestInspectorClose();
                                }}
                                className="px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-indigo-900/40 transition-all flex items-center gap-2 active:scale-95"
                            >
                                <Wand2 size={16} /> Remix Artifact
                            </button>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                            disabled={isDeleting}
                            className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border shadow-2xl ${
                                confirmDelete
                                    ? 'bg-red-600 border-red-400 text-white animate-pulse'
                                    : 'bg-slate-900 border-slate-700 text-red-400 hover:bg-red-900/20'
                            }`}
                        >
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            {confirmDelete ? 'Confirm Move To Recycle Bin' : 'Move Artifact To Recycle Bin'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className={`fixed inset-0 z-[1300] flex items-stretch animate-in fade-in ${isText ? 'bg-black/70 backdrop-blur-md' : 'bg-black/95 backdrop-blur-3xl'}`} onClick={handleBackdropClose}>
            {/* Main Preview Column */}
            <div className={`flex-1 flex flex-col items-center relative overflow-hidden ${isText ? 'p-4 md:p-10' : 'p-6 md:p-12'}`}>
                <button
                    onClick={handleCloseWithSave}
                    aria-label="Close inspector"
                    className={`absolute z-40 rounded-2xl border text-white transition-all ${
                        isText
                            ? 'right-4 top-4 border-slate-700/80 bg-slate-950/75 p-3 hover:bg-slate-900'
                            : 'right-4 top-4 border-slate-700/80 bg-slate-950/85 px-3 py-1.5 text-sm font-black lowercase hover:bg-slate-900 md:right-8 md:top-6'
                    }`}
                >
                    {isText ? <X size={20} /> : 'x'}
                </button>

                {isAudio && (
                    <div
                        className="absolute left-4 top-4 z-40 max-w-[calc(100%-6.5rem)] md:left-8 md:top-6 md:max-w-[calc(100%-10rem)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex min-w-0 items-start gap-4">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 ${activeModel?.color || 'text-indigo-400'}`}>
                                <AudioLines size={20} />
                            </div>
                            <div className="min-w-0">
                                {inspectionHeading && (
                                    <h3 className="text-left text-lg font-black tracking-tight text-white">
                                        {inspectionHeading}
                                    </h3>
                                )}
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onBlur={handleAutoSave}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            (e.currentTarget as HTMLInputElement).blur();
                                        }
                                    }}
                                    placeholder="Add descriptive title..."
                                    className={`w-full bg-transparent text-left text-base font-semibold tracking-normal text-white outline-none transition-colors focus:text-indigo-400 md:text-xl ${inspectionHeading ? 'mt-2' : ''}`}
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-slate-500">{task.modelLabel}</span>
                                    {createdLabel && <span className="text-slate-600">{createdLabel}</span>}
                                    {isSaving && <Loader2 size={10} className="animate-spin text-indigo-500" />}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isInspectableImage && (
                    <div
                        className="absolute left-4 top-4 z-40 md:left-8 md:top-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowInspectHelp(prev => !prev);
                            }}
                            className={`p-3 rounded-full border transition-all shadow-2xl ${
                                showInspectHelp
                                    ? 'bg-indigo-600/20 border-indigo-400/40 text-indigo-300'
                                    : 'bg-slate-800/50 border-white/5 text-slate-300 hover:text-white hover:bg-slate-700'
                            }`}
                            title="Inspection controls"
                        >
                            <Info size={18} />
                        </button>
                        {showInspectHelp && (
                            <div
                                className="absolute left-0 mt-3 w-[min(320px,calc(100vw-2rem))] rounded-[1.5rem] border border-indigo-400/30 bg-slate-950/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Inspect Controls</h4>
                                <div className="mt-3 space-y-2 text-[11px] leading-5 text-slate-200">
                                    <p><span className="font-black text-slate-400">Zoom:</span> Mouse wheel</p>
                                    <p><span className="font-black text-slate-400">Pan:</span> Space + drag</p>
                                    <p><span className="font-black text-slate-400">Keys:</span> W/A/S/D or arrow keys</p>
                                    <p><span className="font-black text-slate-400">Scale:</span> {Math.round(zoom * 100)}%</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className={`mx-auto ${contentWidthClass} w-full flex-1 min-h-0 flex flex-col items-center pb-6 transition-all duration-500 md:pb-8 ${isText ? 'h-[90vh] max-h-[90vh] overflow-y-auto custom-scrollbar pr-1 pt-12 md:pt-10' : 'pt-28 md:pt-32'}`} onClick={(e) => e.stopPropagation()}>
                    {isText ? (
                        <div className={`w-full ${previewWidthClass} shrink-0 space-y-6 rounded-[3rem] border border-slate-800/60 bg-[#050505]/95 px-0 py-0 shadow-[0_32px_128px_-20px_rgba(0,0,0,1)]`}>
                            <div className="shrink-0 border-b border-slate-800/60 bg-gradient-to-b from-white/[0.02] to-transparent px-6 py-6 md:px-10">
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                        <div className="flex min-w-0 items-start gap-4">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                                                <Activity size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-lg font-black tracking-tight text-white">Transcript Artifact Inspection</h3>
                                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">
                                                        ID: {transcriptArtifactId}
                                                    </span>
                                                    <span className="h-1 w-1 rounded-full bg-slate-700" />
                                                    <span className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-600">
                                                        {task.modelLabel || task.modelId || 'Unknown Engine'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowTranscriptDownloadMenu((prev) => !prev);
                                                }}
                                                disabled={!displayText.trim()}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600"
                                            >
                                                <Download size={13} />
                                                Download
                                            </button>
                                            {showTranscriptDownloadMenu && displayText.trim() && (
                                                <div
                                                    className="absolute right-0 top-full z-20 mt-2 w-52 rounded-[1.25rem] border border-slate-800 bg-slate-950/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="px-2 pb-2 pt-1 text-[9px] font-black uppercase tracking-[0.24em] text-indigo-300">
                                                        Transcript Format
                                                    </div>
                                                    <div className="space-y-1">
                                                        {TRANSCRIPT_DOWNLOAD_FORMATS.map((format) => (
                                                            <button
                                                                key={format.id}
                                                                type="button"
                                                                onClick={() => handleDownloadTranscriptFormat(format.id)}
                                                                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 transition-colors hover:bg-slate-800 hover:text-indigo-100"
                                                            >
                                                                <span>{format.label}</span>
                                                                <Download size={11} className="text-indigo-300" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="px-2 pb-1 pt-2 text-[9px] leading-relaxed text-slate-500">
                                                        SRT, VTT, and VERBOSE_JSON use approximate timing if native segment timestamps were not saved.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleCopyTranscript();
                                                }}
                                                disabled={!displayText.trim()}
                                                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] transition-all ${
                                                    transcriptCopied
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600'
                                                }`}
                                            >
                                                {transcriptCopied ? <Check size={13} /> : <Copy size={13} />}
                                                {transcriptCopied ? 'Copied' : 'Quick Copy'}
                                            </button>
                                            <button
                                            type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setIsTranscriptPreviewExpanded(true);
                                                }}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white"
                                            >
                                                <Maximize2 size={13} />
                                                Full View
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-slate-800 bg-slate-900/65 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
                                            {formatInspectorCount(transcriptWordCount, 'word', 'words')}
                                        </span>
                                        <span className="rounded-full border border-slate-800 bg-slate-900/65 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
                                            {formatInspectorCount(transcriptCharacterTotal, 'char', 'chars')}
                                        </span>
                                        <span className="rounded-full border border-slate-800 bg-slate-900/65 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
                                            Est. Runtime {formatInspectorDuration(transcriptDurationSeconds)}
                                        </span>
                                        {sourceAudioLabel !== 'Unknown' && sourceAudioLabel !== 'N/A' && (
                                            <span className="max-w-full truncate rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-indigo-200">
                                                Source: {sourceAudioLabel}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-6 px-5 pb-6 md:px-10 md:pb-10">
                                <div className="overflow-hidden rounded-[2rem] border border-slate-700/80 bg-[rgba(15,23,42,0.55)] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                    <div className="flex items-center gap-3 border-b border-slate-800/60 bg-white/[0.02] px-6 py-5">
                                        <div className="rounded-xl bg-indigo-500/10 p-2 text-indigo-300">
                                            <FileText size={16} />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">Transcript Preview</span>
                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                Primary reading view for the saved transcript body
                                            </p>
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {renderInlineSourceAudio('inline')}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleCopyTranscript();
                                                    }}
                                                    disabled={!displayText.trim()}
                                                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                                                        transcriptCopied
                                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600'
                                                    }`}
                                                >
                                                    {transcriptCopied ? <Check size={12} /> : <Copy size={12} />}
                                                    {transcriptCopied ? 'Copied' : 'Quick Copy'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleTranscriptReadAloudToggle();
                                                    }}
                                                    disabled={!displayText.trim() || !isTranscriptReadAloudSupported}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600"
                                                    aria-label={!isTranscriptReadAloudSupported ? 'Read aloud unavailable in this browser' : (transcriptReadAloudState === 'playing' ? 'Pause transcript reading' : transcriptReadAloudState === 'paused' ? 'Resume transcript reading' : 'Read transcript aloud')}
                                                >
                                                    <Volume2 size={12} />
                                                    {!isTranscriptReadAloudSupported
                                                        ? 'Unavailable'
                                                        : (transcriptReadAloudState === 'playing'
                                                            ? 'Pause Reading'
                                                            : transcriptReadAloudState === 'paused'
                                                                ? 'Resume Reading'
                                                                : 'Read Aloud')}
                                                </button>
                                                <select
                                                    value={selectedTranscriptVoiceUri}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        stopTranscriptReadAloud();
                                                        setSelectedTranscriptVoiceUri(e.target.value);
                                                    }}
                                                    disabled={!isTranscriptReadAloudSupported}
                                                    className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 outline-none transition-colors focus:border-indigo-400 disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600"
                                                    aria-label="Transcript preview voice"
                                                    title="Select transcript read-aloud voice"
                                                >
                                                    {transcriptVoiceOptionsForUi.map((option) => (
                                                        <option key={option.value || '__default'} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:p-6">
                                        <div className="min-h-[220px] rounded-[1.5rem] border border-slate-800/70 bg-black/25 p-5 md:p-6">
                                            {renderTranscriptTimeline(transcriptOutput, 'main', 'main')}
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                            <div className="rounded-[1.35rem] border border-slate-800/70 bg-black/25 px-4 py-4">
                                                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Artifact Type</p>
                                                <p className="mt-2 text-sm font-semibold text-white">AI Audio Transcript</p>
                                            </div>
                                            <div className="rounded-[1.35rem] border border-slate-800/70 bg-black/25 px-4 py-4">
                                                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Engine</p>
                                                <p className="mt-2 text-sm font-semibold text-white">{task.modelLabel || task.modelId || 'Unknown Engine'}</p>
                                            </div>
                                            <div className="rounded-[1.35rem] border border-slate-800/70 bg-black/25 px-4 py-4">
                                                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Created</p>
                                                <p className="mt-2 text-sm font-semibold text-white">{createdLabel || 'Not saved yet'}</p>
                                            </div>
                                            <div className="rounded-[1.35rem] border border-slate-800/70 bg-black/25 px-4 py-4">
                                                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Output</p>
                                                <p className="mt-2 text-sm font-semibold text-white">{transcriptTimingLabel}</p>
                                                <p className="mt-1 text-[11px] text-slate-400">
                                                    {transcriptCueCount} cue{transcriptCueCount === 1 ? '' : 's'}
                                                    {transcriptSpeakerCount > 0 ? ` | ${transcriptSpeakerCount} speaker${transcriptSpeakerCount === 1 ? '' : 's'}` : ''}
                                                </p>
                                            </div>
                                            <div className="rounded-[1.35rem] border border-amber-500/30 bg-amber-500/10 px-4 py-4">
                                                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-200">Notice</p>
                                                <p className="mt-2 text-[11px] leading-relaxed text-amber-100/90">
                                                    Cue transitions to the next segment may have slight delay during playback.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {transcriptionDetails.transcriptHistoryText && transcriptionDetails.transcriptHistoryText !== displayText && (
                                    <div className="overflow-hidden rounded-[2rem] border border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.06),rgba(15,23,42,0.55))] shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                                        <div className="border-b border-amber-500/10 px-6 py-5 bg-amber-500/[0.02]">
                                            <div className="flex items-center gap-3 text-amber-300">
                                                <FileIcon size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Transcript History</span>
                                            </div>
                                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-200/70">
                                                Original transcript captured before corrected transcript promotion
                                            </p>
                                        </div>
                                        <div className="bg-black/25 px-6 py-6">
                                            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                                                {transcriptionDetails.transcriptHistoryText}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                                {transcriptComparison.hasChanges && (
                                    <div className="overflow-hidden rounded-[2rem] border border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.06),rgba(15,23,42,0.55))] shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                                        <div className="border-b border-emerald-500/10 px-6 py-5 bg-emerald-500/[0.02]">
                                            <div className="flex items-center gap-3 text-emerald-300">
                                                <FileIcon size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Transcript Comparison</span>
                                            </div>
                                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200/70">
                                                Side-by-side original and corrected transcript with updated sections highlighted
                                            </p>
                                        </div>
                                        <div className="grid gap-4 p-5 xl:grid-cols-2 xl:p-6">
                                            <div className="overflow-hidden rounded-[1.5rem] border border-rose-500/20 bg-slate-950/55">
                                                <div className="border-b border-rose-500/10 px-5 py-4">
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-200">Original Transcript</h4>
                                                </div>
                                                <div className="max-h-[360px] overflow-y-auto px-5 py-5 custom-scrollbar">
                                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                                                        {transcriptComparison.original.map((segment, index) => (
                                                            <span
                                                                key={`original-${index}-${segment.changed ? 'changed' : 'same'}`}
                                                                className={segment.changed ? 'rounded bg-rose-500/15 px-0.5 text-rose-100' : undefined}
                                                            >
                                                                {segment.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="overflow-hidden rounded-[1.5rem] border border-emerald-500/20 bg-slate-950/55">
                                                <div className="border-b border-emerald-500/10 px-5 py-4">
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
                                                        {transcriptionDetails.transcriptHistoryText ? 'Corrected Main Transcript' : 'Corrected Transcript'}
                                                    </h4>
                                                </div>
                                                <div className="max-h-[360px] overflow-y-auto px-5 py-5 custom-scrollbar">
                                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                                                        {transcriptComparison.corrected.map((segment, index) => (
                                                            <span
                                                                key={`corrected-${index}-${segment.changed ? 'changed' : 'same'}`}
                                                                className={segment.changed ? 'rounded bg-emerald-500/15 px-0.5 text-emerald-100' : undefined}
                                                            >
                                                                {segment.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : src ? (
                        <div
                            ref={viewportRef}
                            tabIndex={0}
                            onWheel={handleViewportWheel}
                            onMouseDown={handleViewportMouseDown}
                            onMouseMove={handleViewportMouseMove}
                            onMouseUp={handleViewportMouseUp}
                            onMouseLeave={handleViewportMouseUp}
                            onClick={focusViewport}
                            className="flex-1 w-full min-h-0 min-w-0 flex items-center justify-center relative overflow-hidden group outline-none"
                        >
                            {isVideo ? (
                                <video
                                    src={src}
                                    className="block h-full w-full max-h-full max-w-full rounded-[2.5rem] border border-white/10 object-contain shadow-[0_0_120px_rgba(99,102,241,0.15)]"
                                    controls
                                    loop
                                    muted
                                    playsInline
                                    preload="metadata"
                                />
                            ) : isAudio ? (
                                <div className="w-full max-w-2xl bg-slate-900/40 border border-slate-800 rounded-[2rem] p-8 flex flex-col items-center gap-6 shadow-[0_0_120px_rgba(236,72,153,0.12)]">
                                    <div className="w-24 h-24 rounded-full bg-pink-500/10 border border-pink-500/30 flex items-center justify-center">
                                        <Activity size={40} className="text-pink-400" />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-pink-300">Audio Preview</p>
                                        <p className="text-sm text-slate-300">
                                            Player moved to the top of the inspection panel.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={`relative flex h-full w-full max-h-full max-w-full items-center justify-center ${isPanning ? 'cursor-grabbing' : isSpaceHeld ? 'cursor-grab' : 'cursor-default'}`}
                                    style={{
                                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                                        transformOrigin: 'center center',
                                        transition: isPanning ? 'none' : 'transform 120ms ease-out'
                                    }}
                                >
                                    <img
                                        src={src}
                                        className="block h-full w-full max-h-full max-w-full object-contain rounded-[2.5rem] border border-white/10 select-none shadow-[0_0_120px_rgba(99,102,241,0.15)]"
                                        alt="Generated"
                                        draggable={false}
                                        onLoad={(e) => {
                                            setImageNaturalSize({
                                                width: e.currentTarget.naturalWidth,
                                                height: e.currentTarget.naturalHeight
                                            });
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-center gap-6 opacity-40">
                            <Activity size={80} strokeWidth={1} className="text-slate-600" />
                            <p className="text-xs font-black uppercase tracking-[0.4em] text-slate-500">Binary Stream Unavailable</p>
                        </div>
                    )}

                    {!isText && inspectorHeaderPanel}

                    {shouldRenderInspectorBody && (
                        <div className={`w-full ${metadataWidthClass} shrink-0 mt-6 md:mt-8 space-y-6 animate-in slide-in-from-bottom-4 duration-700`}>
                                {isAudio && isMusicTask && (
                                    <>
                                        <div className="rounded-[1.75rem] border border-pink-500/20 bg-pink-500/5 p-5 text-left shadow-inner">
                                            <div className="space-y-4 rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Audio Playback</h4>
                                                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            Top playback panel for this music artifact
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                                                            {audioDurationLabel || 'Unknown'}
                                                        </span>
                                                        <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                                                            {responseFormatLabel || actualMimeLabel || 'Unknown'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {src ? (
                                                    <audio src={src} controls className="w-full rounded-xl border border-slate-800/80 bg-black/40 p-1" />
                                                ) : (
                                                    <p className="text-sm leading-relaxed text-slate-400">
                                                        Audio playback is unavailable for this artifact.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-[1.75rem] border border-pink-500/20 bg-pink-500/5 p-5 text-left shadow-inner">
                                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
                                                <div className="space-y-3 rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Lyrics</h4>
                                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                                Saved lyric body for this music generation
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                                                                {formatInspectorCount(musicLyricsWordCount, 'word', 'words')}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleCopyMusicLyrics();
                                                                }}
                                                                disabled={!musicLyricsText.trim()}
                                                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                                                                    musicLyricsCopied
                                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                                                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600'
                                                                }`}
                                                            >
                                                                {musicLyricsCopied ? <Check size={12} /> : <Copy size={12} />}
                                                                {musicLyricsCopied ? 'Copied' : 'Quick Copy'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="max-h-[360px] overflow-y-auto rounded-xl border border-slate-800/70 bg-slate-950/30 p-4 custom-scrollbar">
                                                        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                                                            {musicLyricsText || 'No saved lyrics were found for this music artifact.'}
                                                        </pre>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Music Information</h4>
                                                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            Saved generation controls and render metadata
                                                        </p>
                                                    </div>
                                                    <div className="space-y-2 text-[11px]">
                                                        {musicInfoRows.map((row) => (
                                                            <div key={row.label} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2">
                                                                <span className="font-black uppercase tracking-[0.2em] text-slate-500">{row.label}</span>
                                                                <span className={`text-right font-semibold ${row.value === 'Not specified' ? 'text-slate-500' : 'text-slate-200'}`}>
                                                                    {row.value}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {isTextToAudioTask && (speechScriptText || voiceLabel || responseFormatLabel || multiSpeakerEnabled || speakerPairs.length > 0 || estimatedSpeechDurationSeconds > 0) && (
                                    <div className="rounded-[1.75rem] border border-pink-500/20 bg-pink-500/5 p-5 text-left shadow-inner">
                                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
                                            <div className="space-y-3 rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Narration Script</h4>
                                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Saved text prompt used to synthesize this audio render
                                                    </p>
                                                </div>
                                                <div className="max-h-[360px] overflow-y-auto rounded-xl border border-slate-800/70 bg-slate-950/30 p-4 custom-scrollbar">
                                                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                                                        {speechScriptText || 'No script was saved for this text-to-audio render.'}
                                                    </pre>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-3 rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Speech Config</h4>
                                                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            Voice routing and output settings
                                                        </p>
                                                    </div>
                                                    <div className="space-y-2 text-[11px]">
                                                        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2">
                                                            <span className="font-black uppercase tracking-[0.2em] text-slate-500">Voice</span>
                                                            <span className="text-right font-semibold text-slate-200">{voiceLabel || 'Not specified'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2">
                                                            <span className="font-black uppercase tracking-[0.2em] text-slate-500">Output</span>
                                                            <span className="text-right font-semibold text-slate-200">{responseFormatLabel || 'Default'}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2">
                                                            <span className="font-black uppercase tracking-[0.2em] text-slate-500">Speakers</span>
                                                            <span className="text-right font-semibold text-slate-200">{multiSpeakerEnabled ? 'Multi-speaker' : 'Single speaker'}</span>
                                                        </div>
                                                        {seedLabel && (
                                                            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-2">
                                                                <span className="font-black uppercase tracking-[0.2em] text-slate-500">Seed</span>
                                                                <span className="text-right font-semibold text-slate-200">{seedLabel}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {multiSpeakerEnabled && speakerPairs.length > 0 && (
                                                        <div className="grid gap-2">
                                                            {speakerPairs.map((speaker) => (
                                                                <div key={`${speaker.id}-${speaker.name}-${speaker.voice}`} className="rounded-xl border border-pink-500/15 bg-pink-500/5 px-3 py-2">
                                                                    <p className="text-[9px] font-black uppercase tracking-[0.24em] text-pink-200">Speaker {speaker.id}</p>
                                                                    <p className="mt-1 text-sm font-semibold text-white">{speaker.name || `Speaker ${speaker.id}`}</p>
                                                                    <p className="text-[11px] text-slate-400">{speaker.voice || 'Voice not specified'}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-3 rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Delivery Stats</h4>
                                                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            Derived from the saved narration script
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-3 text-center">
                                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Words</p>
                                                            <p className="mt-2 text-lg font-semibold text-white">{speechWordCount}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-3 text-center">
                                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Chars</p>
                                                            <p className="mt-2 text-lg font-semibold text-white">{speechCharacterCount}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-3 text-center">
                                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Est Run</p>
                                                            <p className="mt-2 text-lg font-semibold text-white">{formatInspectorDuration(estimatedSpeechDurationSeconds)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {shouldShowTranscriptInspector && (
                                    <div className="rounded-[2rem] border border-slate-700/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(15,23,42,0.72))] p-5 text-left shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                                            <div className="space-y-3 rounded-[1.75rem] border border-slate-700/70 bg-black/25 p-5">
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">Transcript Summary</h4>
                                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        {transcriptionDetails.summaryText ? 'Saved post-process summary' : 'Fallback transcript excerpt'}
                                                    </p>
                                                </div>
                                                <div className="space-y-2">
                                                    {transcriptSummaryBlocks.map((block, index) => (
                                                        <p key={`${index}-${block.slice(0, 12)}`} className="text-sm leading-relaxed text-slate-200">
                                                            {block}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-[1.75rem] border border-slate-700/70 bg-black/25 p-5">
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">QA Checker</h4>
                                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Saved transcript validation report
                                                    </p>
                                                </div>
                                                {transcriptionDetails.qaReport ? (
                                                    <div className="max-h-[520px] overflow-y-auto rounded-[1.35rem] border border-slate-800/70 bg-slate-950/35 p-1 custom-scrollbar">
                                                        <div className="space-y-3 p-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            {qaDetails.verdict && (
                                                                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.24em] ${
                                                                    qaDetails.hasCorrections
                                                                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                                                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                                                }`}>
                                                                    {qaDetails.verdict}
                                                                </span>
                                                            )}
                                                            {transcriptionDetails.qaModelId && (
                                                                <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[9px] font-black uppercase tracking-[0.24em] text-slate-300">
                                                                    {transcriptionDetails.qaModelId}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {qaRedlineEdits.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {qaRedlineEdits.map((edit, index) => (
                                                                    <div key={`${index}-${edit.from}-${edit.to}`} className="rounded-[1.2rem] border border-slate-700/70 bg-slate-950/55 p-3">
                                                                        <p className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">Edit {index + 1}</p>
                                                                        <div className="mt-2 space-y-2">
                                                                            <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm leading-relaxed text-rose-100 line-through decoration-rose-300/80 whitespace-pre-wrap">
                                                                                {edit.from}
                                                                            </p>
                                                                            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-100 whitespace-pre-wrap">
                                                                                {edit.to}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : !hasStructuredQaData ? (
                                                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                                                                {transcriptionDetails.qaReport}
                                                            </p>
                                                        ) : (
                                                            <p className="text-sm leading-relaxed text-slate-300">
                                                                {qaDetails.hasCorrections ? transcriptionDetails.qaReport : 'No text changes were flagged by the saved QA pass.'}
                                                            </p>
                                                        )}

                                                        {qaDetails.correctedTranscript && (
                                                            <div className="overflow-hidden rounded-[1.5rem] border border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.06),rgba(15,23,42,0.4))]">
                                                                <div className="border-b border-emerald-500/10 px-4 py-4">
                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                        <div>
                                                                            <h5 className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200">Corrected Transcript</h5>
                                                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-emerald-100/70">
                                                                                Same reading layout as the main transcript preview
                                                                            </p>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            {renderInlineSourceAudio('inline')}
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    void handleCopyCorrectedTranscript();
                                                                                }}
                                                                                disabled={!correctedTranscriptOutput.transcriptText.trim()}
                                                                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                                                                                    correctedTranscriptCopied
                                                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                                                                                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600'
                                                                                }`}
                                                                            >
                                                                                {correctedTranscriptCopied ? <Check size={12} /> : <Copy size={12} />}
                                                                                {correctedTranscriptCopied ? 'Copied' : 'Quick Copy'}
                                                                            </button>
                                                                            {canPromoteCorrectedTranscript && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        void handlePromoteCorrectedTranscript();
                                                                                    }}
                                                                                    disabled={isPromotingTranscript}
                                                                                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                                                >
                                                                                    {isPromotingTranscript ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                                                                    Promote
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="p-4">
                                                                    {renderTranscriptTimeline(correctedTranscriptOutput, 'compact')}
                                                                </div>
                                                            </div>
                                                        )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs leading-relaxed text-slate-400">
                                                        No saved QA checker report was captured for this transcript yet.
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-3 rounded-[1.75rem] border border-slate-700/70 bg-black/25 p-5">
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">Source Audio</h4>
                                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Uploaded or attached audio used for transcription
                                                    </p>
                                                </div>
                                                {(transcriptionDetails.sourceFileName || sourceAudioReference || sourceAudioAsset.url) ? (
                                                    <>
                                                        <p className="text-sm font-semibold text-white break-all">
                                                            {sourceAudioAsset.label || 'Source audio attached'}
                                                        </p>
                                                        {sourceAudioItemHref && (
                                                            <a
                                                                href={sourceAudioItemHref}
                                                                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-300 transition-colors hover:text-indigo-100"
                                                            >
                                                                <Link2 size={12} />
                                                                Open Source Project Item
                                                            </a>
                                                        )}
                                                        {sourceAudioAsset.url && !sourceAudioItemHref && (
                                                            <a
                                                                href={sourceAudioPlayableUrl || sourceAudioAsset.url}
                                                                download={sourceAudioAsset.label || 'source-audio'}
                                                                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-indigo-300 transition-colors hover:text-indigo-100"
                                                            >
                                                                <Link2 size={12} />
                                                                Open Source Audio
                                                            </a>
                                                        )}
                                                        {isSourceAudioLoading && (
                                                            <p className="text-xs leading-relaxed text-cyan-200">
                                                                Loading source audio...
                                                            </p>
                                                        )}
                                                        {sourceAudioLoadError && (
                                                            <p className="text-xs leading-relaxed text-amber-200">
                                                                {sourceAudioLoadError}
                                                            </p>
                                                        )}
                                                        {sourceAudioAsset.url && (
                                                            <audio
                                                                src={sourceAudioPlayableUrl || sourceAudioAsset.url}
                                                                controls
                                                                preload="metadata"
                                                                onLoadedMetadata={handleSourceAudioLoadedMetadata}
                                                                onPlay={handleSourceAudioPlay}
                                                                onTimeUpdate={handleSourceAudioProgress}
                                                                onSeeked={handleSourceAudioProgress}
                                                                onPause={handleSourceAudioPause}
                                                                onEnded={handleSourceAudioEnded}
                                                                className="w-full rounded-xl border border-slate-800/80 bg-black/30 p-1"
                                                            />
                                                        )}
                                                        {!sourceAudioAsset.url && (
                                                            <p className="text-xs leading-relaxed text-slate-400">
                                                                The file name was saved with this transcript even when the original upload was not stored as a separate archive item.
                                                            </p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-xs leading-relaxed text-slate-400">
                                                        No source-audio details were captured for this transcript.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {showSourceStrip && (
                                    <div className="rounded-[1.75rem] border border-slate-700/70 bg-slate-950/60 p-4 text-left shadow-[0_14px_40px_rgba(0,0,0,0.35)] animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex items-center justify-between gap-3 px-2">
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Source Film Strip</h4>
                                                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                                                    Linked artifacts and reference assets
                                                </p>
                                            </div>
                                            {isSourcesLoading && (
                                                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                    <Loader2 size={12} className="animate-spin text-indigo-400" />
                                                    Loading
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                                            {sourceStripItems.map((item, index) => {
                                                const assetType = determineAssetType(item.mimeType);
                                                const isImage = assetType === AssetType.IMAGE;
                                                const isVideoAsset = assetType === AssetType.VIDEO;
                                                const isAudioAsset = assetType === AssetType.AUDIO;

                                                return (
                                                    <button
                                                        key={`${item.kind}-${item.id}`}
                                                        onClick={() => handleOpenSourceViewer(index)}
                                                        className="group shrink-0 w-32"
                                                    >
                                                        <div className="relative h-32 w-32 overflow-hidden rounded-[1.35rem] border border-white/5 bg-black shadow-[0_10px_25px_rgba(0,0,0,0.45)] transition-all group-hover:border-indigo-500/40 group-hover:scale-[1.02]">
                                                            {isImage ? (
                                                                <img src={item.url} alt={item.label} className="h-full w-full object-cover opacity-85 group-hover:opacity-100 transition-opacity" />
                                                            ) : isVideoAsset ? (
                                                                <video src={item.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                                                            ) : isAudioAsset ? (
                                                                <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-cyan-300 bg-cyan-500/5">
                                                                    <AudioLines size={26} />
                                                                    <span className="text-[8px] font-black uppercase tracking-widest text-cyan-200">Audio</span>
                                                                </div>
                                                            ) : (
                                                                <div className="h-full w-full flex items-center justify-center text-slate-600">
                                                                    <FileIcon size={26} />
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-3 py-2">
                                                                <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/80">
                                                                    {item.kind === 'linked'
                                                                        ? <Box size={10} className="text-indigo-300" />
                                                                        : (isAudioAsset ? <AudioLines size={10} className="text-cyan-300" /> : <ImageIcon size={10} className="text-cyan-300" />)}
                                                                    <span>{item.kind === 'linked' ? 'Linked' : 'Reference'}</span>
                                                                </div>
                                                            </div>
                                                            <div className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                                                                <Maximize2 size={12} />
                                                            </div>
                                                        </div>
                                                        <div className="px-1 pt-2 text-center">
                                                            <p className="truncate text-[9px] font-black uppercase tracking-widest text-slate-300">{item.label}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}

                                            {!isSourcesLoading && sourceStripItems.length === 0 && (
                                                <div className="w-full rounded-[1.5rem] border border-dashed border-slate-800 bg-black/20 px-4 py-8 text-center">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">No linked sources available</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                            {isText && inspectorHeaderPanel}
                        </div>
                    )}
                </div>
            </div>

            {isText && isTranscriptPreviewExpanded && (
                <div
                    className="fixed inset-0 z-[1350] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsTranscriptPreviewExpanded(false);
                    }}
                >
                    <div
                        className="flex h-[90vh] w-[96vw] max-w-6xl flex-col overflow-hidden rounded-[2.4rem] border border-slate-700/80 bg-[#050505] shadow-[0_30px_120px_rgba(0,0,0,0.8)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 bg-white/[0.02] px-6 py-5">
                            <div>
                                <div className="flex items-center gap-3 text-indigo-300">
                                    <FileIcon size={18} />
                                    <span className="text-[10px] font-black uppercase tracking-[0.28em]">Transcript Preview</span>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    Expanded reading view for the full transcript.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsTranscriptPreviewExpanded(false)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 transition-colors hover:bg-slate-800"
                            >
                                <X size={12} />
                                Close
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                            <div className="space-y-6">
                                    <div className="overflow-hidden rounded-[1.75rem] border border-slate-700/70 bg-slate-900/30">
                                        <div className="border-b border-slate-800/70 px-5 py-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 text-indigo-300">
                                                    <FileIcon size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-[0.28em]">Transcript Preview</span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {renderInlineSourceAudio('inline')}
                                                    <button
                                                        type="button"
                                                        onClick={handleTranscriptReadAloudToggle}
                                                        disabled={!displayText.trim() || !isTranscriptReadAloudSupported}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600"
                                                        aria-label={!isTranscriptReadAloudSupported ? 'Read aloud unavailable in this browser' : (transcriptReadAloudState === 'playing' ? 'Pause transcript reading' : transcriptReadAloudState === 'paused' ? 'Resume transcript reading' : 'Read transcript aloud')}
                                                    >
                                                        <Volume2 size={12} />
                                                        {!isTranscriptReadAloudSupported
                                                            ? 'Unavailable'
                                                            : (transcriptReadAloudState === 'playing'
                                                                ? 'Pause Reading'
                                                                : transcriptReadAloudState === 'paused'
                                                                    ? 'Resume Reading'
                                                                    : 'Read Aloud')}
                                                    </button>
                                                    <select
                                                        value={selectedTranscriptVoiceUri}
                                                        onChange={(e) => {
                                                            stopTranscriptReadAloud();
                                                            setSelectedTranscriptVoiceUri(e.target.value);
                                                        }}
                                                        disabled={!isTranscriptReadAloudSupported}
                                                        className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 outline-none transition-colors focus:border-indigo-400 disabled:border-slate-900 disabled:bg-slate-950/60 disabled:text-slate-600"
                                                        aria-label="Transcript preview voice"
                                                        title="Select transcript read-aloud voice"
                                                    >
                                                        {transcriptVoiceOptionsForUi.map((option) => (
                                                            <option key={option.value || '__default'} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                Full transcript content in a larger reading view
                                            </p>
                                        </div>
                                        <div className="px-5 py-5">
                                            {renderTranscriptTimeline(transcriptOutput, 'expanded', 'expanded-main')}
                                        </div>
                                        <div className="border-t border-slate-800/70 px-5 py-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-300">
                                                    {transcriptTimingLabel}
                                                </span>
                                                <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-300">
                                                    {transcriptCueCount} cue{transcriptCueCount === 1 ? '' : 's'}
                                                </span>
                                                {transcriptSpeakerCount > 0 && (
                                                    <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-300">
                                                        {transcriptSpeakerCount} speaker{transcriptSpeakerCount === 1 ? '' : 's'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                {transcriptionDetails.transcriptHistoryText && transcriptionDetails.transcriptHistoryText !== displayText && (
                                    <div className="overflow-hidden rounded-[1.75rem] border border-amber-500/20 bg-amber-500/5">
                                        <div className="border-b border-amber-500/10 px-5 py-4">
                                            <div className="flex items-center gap-3 text-amber-300">
                                                <FileIcon size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Transcript History</span>
                                            </div>
                                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-200/70">
                                                Original transcript captured before corrected transcript promotion
                                            </p>
                                        </div>
                                        <div className="px-5 py-4">
                                            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                                                {transcriptionDetails.transcriptHistoryText}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                                {transcriptComparison.hasChanges && (
                                    <div className="overflow-hidden rounded-[1.75rem] border border-emerald-500/20 bg-emerald-500/5">
                                        <div className="border-b border-emerald-500/10 px-5 py-4">
                                            <div className="flex items-center gap-3 text-emerald-300">
                                                <FileIcon size={16} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.28em]">Transcript Comparison</span>
                                            </div>
                                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200/70">
                                                Side-by-side original and corrected transcript with updated sections highlighted
                                            </p>
                                        </div>
                                        <div className="grid gap-4 px-5 py-4 xl:grid-cols-2">
                                            <div className="overflow-hidden rounded-[1.25rem] border border-rose-500/20 bg-slate-950/50">
                                                <div className="border-b border-rose-500/10 px-4 py-3">
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-200">Original Transcript</h4>
                                                </div>
                                                <div className="max-h-[420px] overflow-y-auto px-4 py-4 custom-scrollbar">
                                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                                                        {transcriptComparison.original.map((segment, index) => (
                                                            <span
                                                                key={`expanded-original-${index}-${segment.changed ? 'changed' : 'same'}`}
                                                                className={segment.changed ? 'rounded bg-rose-500/15 px-0.5 text-rose-100' : undefined}
                                                            >
                                                                {segment.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="overflow-hidden rounded-[1.25rem] border border-emerald-500/20 bg-slate-950/50">
                                                <div className="border-b border-emerald-500/10 px-4 py-3">
                                                    <h4 className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
                                                        {transcriptionDetails.transcriptHistoryText ? 'Corrected Main Transcript' : 'Corrected Transcript'}
                                                    </h4>
                                                </div>
                                                <div className="max-h-[420px] overflow-y-auto px-4 py-4 custom-scrollbar">
                                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                                                        {transcriptComparison.corrected.map((segment, index) => (
                                                            <span
                                                                key={`expanded-corrected-${index}-${segment.changed ? 'changed' : 'same'}`}
                                                                className={segment.changed ? 'rounded bg-emerald-500/15 px-0.5 text-emerald-100' : undefined}
                                                            >
                                                                {segment.text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Neural Manifest Sidebar */}
            <div className="absolute inset-y-0 right-0 z-30 flex items-center pointer-events-none">
                <div
                    className="h-full flex items-center transition-transform duration-500 ease-out"
                    style={{ transform: showManifest ? 'translateX(0)' : 'translateX(calc(100% - 4.25rem))' }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowManifest((prev) => !prev);
                        }}
                        className="pointer-events-auto flex items-center justify-center self-center h-16 w-[4.25rem] rounded-l-[1.75rem] bg-indigo-600 text-white border border-indigo-400/40 shadow-[0_18px_60px_rgba(79,70,229,0.45)] transition-all hover:bg-indigo-500"
                        title={showManifest ? 'Hide captured specs' : 'Show captured specs'}
                    >
                        {showManifest ? <ChevronRight size={28} /> : <ChevronLeft size={28} />}
                    </button>

                    <div 
                        className="pointer-events-auto h-full w-[92vw] max-w-[480px] bg-[#080808] border-l border-slate-800/80 overflow-hidden flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.55)]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-8 border-b border-slate-800 bg-slate-900/20 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                                    <Fingerprint size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-widest">Neural Manifest</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Captured Controls & Run Metadata</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                        <Save size={12} /> Prompt
                                    </h4>
                                    <button
                                        onClick={handleCopyPrompt}
                                        disabled={!editPrompt.trim()}
                                        className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                                            promptCopied
                                                ? 'text-emerald-400'
                                                : 'text-slate-500 hover:text-white disabled:text-slate-700 disabled:hover:text-slate-700'
                                        }`}
                                        title="Copy prompt"
                                    >
                                        {promptCopied ? <Check size={10} /> : <Copy size={10} />}
                                        {promptCopied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div className="relative group">
                                    <textarea 
                                        value={editPrompt}
                                        onChange={(e) => setEditPrompt(e.target.value)}
                                        onBlur={handleAutoSave}
                                        placeholder="Enter synthesis prompt..."
                                        className="w-full min-h-[148px] bg-slate-900/40 border border-slate-800 rounded-[2rem] p-5 text-[11px] text-slate-300 font-medium leading-relaxed outline-none focus:border-indigo-500/50 focus:bg-slate-900/60 transition-all resize-y custom-scrollbar"
                                    />
                                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        <Save size={14} className="text-slate-700" />
                                    </div>
                                </div>
                            </div>

                            {/* 1. Diagnostics Section (Conditional on Error) */}
                            {(task.error || (task as any).isManualTriage) && (
                                <div className="space-y-4 animate-in slide-in-from-top-2">
                                     <div className="flex items-center justify-between px-1">
                                        <h4 className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                                             <AlertCircle size={12} /> Diagnostic Trace
                                        </h4>
                                        {task.error && (
                                            <button 
                                                onClick={handleCopyError}
                                                className={`text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 transition-all ${errorCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}
                                            >
                                                {errorCopied ? <><Check size={10} /> Copied</> : <><Clipboard size={10} /> Copy Trace</>}
                                            </button>
                                        )}
                                     </div>
                                     <div className="p-5 bg-red-950/10 border border-red-900/20 rounded-[2rem] space-y-4 shadow-inner">
                                        {(task as any).isManualTriage && (
                                            <div className="flex items-start gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                                                <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                                                <p className="text-[10px] text-indigo-300 font-medium leading-relaxed italic">
                                                    Handled via Triage: This task was manually moved from the Synthesis Queue to the Laboratory.
                                                </p>
                                            </div>
                                        )}
                                        {task.error && (
                                            <div className="font-mono text-[11px] text-red-400/80 leading-relaxed bg-black/40 p-4 rounded-xl border border-red-900/10 max-h-40 overflow-y-auto custom-scrollbar">
                                                {task.error}
                                            </div>
                                        )}
                                        <p className="text-[9px] text-slate-500 font-medium px-1">
                                            The pipeline was interrupted or rejected by the inference gateway. Check upstream safety filters or network latency parameters.
                                        </p>
                                     </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <Activity size={12} /> Artifact Profile
                                </h4>
                                <div className="rounded-[2rem] border border-white/5 bg-black/20 px-5 py-3">
                                    {inspectorProfileRows.map((row) => (
                                        <div key={row.label} className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-b-0">
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="shrink-0 text-slate-500">
                                                    {row.icon}
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    {row.label}
                                                </span>
                                            </div>
                                            <span className={`text-right text-[11px] font-bold ${
                                                row.value === 'N/A' ? 'text-slate-600' : 'text-slate-200'
                                            }`}>
                                                {row.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Standard Manifest Specs */}
                            {manifestData ? (
                                <SpecsDisplay 
                                    params={manifestData.advanced_params || manifestData} 
                                    engine={activeModel} 
                                    rawMetadata={manifestData}
                                    mediaType={isVideo ? 'video' : isAudio ? 'audio' : isText ? 'text' : 'image'}
                                />
                            ) : (
                                <div className="h-64 flex flex-col items-center justify-center text-center space-y-4 opacity-30">
                                    <LayoutPanelLeft size={48} strokeWidth={1} />
                                    <p className="text-xs font-black uppercase tracking-widest">No Technical Meta Captured</p>
                                </div>
                            )}

                            {/* 3. Logic Snapshot */}
                            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-[2rem] p-6 space-y-4">
                                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                     <Fingerprint size={12} /> Model Signature
                                </h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-slate-500 uppercase">Provider</span>
                                        <span className="text-slate-300">{activeModel?.provider?.toUpperCase() || 'EXTERNAL'}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-slate-500 uppercase">Category</span>
                                        <span className="text-slate-300">{getTierLabel(activeModel?.category || 'DYNAMIC')}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-slate-500 uppercase">Efficiency</span>
                                        <span className="text-slate-300">{activeModel?.efficiency || 'STANDARD'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 border-t border-slate-800 bg-slate-900/10 text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center leading-relaxed">
                            This manifest shows the saved prompt, controls, references, and run metadata captured for this artifact.
                        </div>
                    </div>
                </div>
            </div>
            <MosaicViewerModal
                isOpen={isSourceViewerOpen}
                onClose={() => setIsSourceViewerOpen(false)}
                files={sourceStripItems.map((item) => ({
                    id: item.id,
                    url: item.url,
                    mimeType: item.mimeType
                }))}
                title="Inspector Source Film Strip"
                initialIndex={activeSourceIndex}
                onInspect={handleInspectSourceStripItem}
                onMoveToProject={handleMoveSourceStripItem}
            />
            {showSourceMoveSelector && (
                <ProjectReassignModal
                    projects={availableProjects}
                    selectedProjectId={sourceMoveTargetProjectId}
                    onSelectProject={setSourceMoveTargetProjectId}
                    onConfirm={handleConfirmSourceMove}
                    onCancel={() => {
                        if (isSourceMoving) return;
                        setShowSourceMoveSelector(false);
                        setSourceMoveItem(null);
                    }}
                    isMoving={isSourceMoving}
                    title="Move Source Artifact"
                    description="Select a destination project workspace for this saved manifest preview item."
                    confirmLabel="Move Artifact"
                />
            )}
            {alertDialog}
        </div>
    );
};

const areArtifactInspectorPropsEqual = (prev: ArtifactInspectorProps, next: ArtifactInspectorProps) => (
    prev.task === next.task
    && prev.registry === next.registry
);

export const ArtifactInspector = React.memo(ArtifactInspectorView, areArtifactInspectorPropsEqual);
