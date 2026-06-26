import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AudioLines,
    ChevronDown,
    Copy,
    Cpu,
    Download,
    FileText,
    FolderOpen,
    Globe,
    Loader2,
    Mic,
    Save,
    UploadCloud
} from 'lucide-react';
import { LabTask } from '../../../../hooks/useAiGeneration';
import { DynamicParam } from '../../../../hooks/useLabState';
import { api } from '../../../../services/api';
import { ArtifactSelectorModal } from '../../../../extensions/image-editor/components/ArtifactSelectorModal';
import { loadDynamicRegistry, ModelOption } from '../ModelSelector/registry/index';
import { buildTranscriptQaRedlineEdits, extractTranscriptionManifestDetails, normalizeTranscriptionPostProcessStatus, parseTranscriptQaReport } from '../../../../utils/transcriptionManifest';
import { buildTranscriptInspectionData, formatTranscriptClockTime } from '../../../../utils/transcriptExport';
import { Revision } from '../../../../types';

interface TranscriptionStudioPreviewProps {
    title: string;
    onSetTitle: (value: string) => void;
    prompt: string;
    onSetPrompt: (value: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    modelLabel: string;
    onOpenModelSelector: () => void;
    paramSchema: DynamicParam[];
    dynamicParams: Record<string, any>;
    onSetDynamicParam: (key: string, value: any) => void;
    selectedFile: File | null;
    onSelectFile: (file: File, options?: { sourceItemId?: string | null }) => void;
    onClearFile: () => void;
    activeTranscript: LabTask | null;
    onUpdateActiveTranscript?: (updates: Partial<LabTask>) => void;
    onSaveTranscriptToArchive?: () => void;
    isSavingTranscriptToArchive?: boolean;
}

interface CueDomNodes {
    row: HTMLDivElement | null;
    time: HTMLParagraphElement | null;
}

const ACCEPTED_AUDIO_EXTENSIONS = [
    '.mp3',
    '.wav',
    '.m4a',
    '.webm',
    '.ogg',
    '.flac',
    '.aac'
];

const DEFAULT_TRANSCRIPTION_PARAM_SCHEMA: DynamicParam[] = [
    {
        key: 'response_format',
        label: 'Transcript Format',
        type: 'select',
        default: 'json',
        options: [
            { label: 'JSON', value: 'json' },
            { label: 'TEXT', value: 'text' },
            { label: 'SRT', value: 'srt' },
            { label: 'VERBOSE JSON', value: 'verbose_json' },
            { label: 'VTT', value: 'vtt' }
        ],
        description: 'The format of the transcript output.'
    },
    {
        key: 'language',
        label: 'Source Language (ISO-639-1)',
        type: 'text',
        default: '',
        description: 'Optional language hint such as en or fr.'
    },
    {
        key: 'temperature',
        label: 'Temperature',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.1,
        default: 0,
        description: 'Sampling temperature between 0 and 1.'
    }
];

const RESERVED_TRANSCRIPTION_PARAM_KEYS = new Set(['file', 'model', 'prompt']);
const SUMMARY_ENABLED_PARAM_KEY = 'transcriptSummaryEnabled';
const SUMMARY_MODEL_PARAM_KEY = 'transcriptSummaryModelId';
const QA_ENABLED_PARAM_KEY = 'transcriptQaCheckerEnabled';
const QA_MODEL_PARAM_KEY = 'transcriptQaModelId';
const DEFAULT_SUMMARY_MODEL_ID = 'pollinations-openai';
const DEFAULT_QA_MODEL_ID = 'pollinations-gemini-large';
const TRANSCRIPTION_POST_PROCESS_KEY = 'transcriptionPostProcess';
const INSUFFICIENT_BALANCE_NOTIFY_COOLDOWN_MS = 12000;
let lastInsufficientBalanceNotifyAt = 0;
const LEGACY_DEPRECATED_QA_MODEL_IDS = new Set([
    'pollinations-openai-audio'
]);
const PREFERRED_QA_FALLBACK_MODEL_IDS = [
    'pollinations-gemini-large',
    'pollinations-gemini',
    'pollinations-openai-large',
    'pollinations-openai'
];
const FALLBACK_SUMMARY_MODEL: ModelOption = {
    id: DEFAULT_SUMMARY_MODEL_ID as any,
    label: 'OpenAI GPT-5 Mini',
    desc: '',
    icon: Cpu,
    color: 'text-cyan-400',
    limits: '',
    efficiency: 'Balanced',
    provider: 'pollinations',
    category: 'Language',
    ratios: [],
    isCustom: true
};

const maybeNotifyInsufficientBalance = (message: string) => {
    const text = String(message || '').trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const isInsufficientBalance = lower.includes('insufficient balance')
        || (lower.includes('available balance') && lower.includes('pollen'));
    if (!isInsufficientBalance) return;

    const now = Date.now();
    if (now - lastInsufficientBalanceNotifyAt < INSUFFICIENT_BALANCE_NOTIFY_COOLDOWN_MS) return;
    lastInsufficientBalanceNotifyAt = now;

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aimana-notification', {
            detail: {
                type: 'error',
                title: 'Insufficient Pollen Balance',
                message: text,
                source: 'transcription-summary'
            }
        }));
    }
};

const formatBytes = (bytes?: number) => {
    if (!Number.isFinite(bytes)) return '--';
    if ((bytes || 0) < 1024 * 1024) return `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`;
    return `${((bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
};

const buildTranscriptSummaryFallback = (transcript: string) => {
    const cleaned = String(transcript || '').trim();
    if (!cleaned) return [];
    const sentences = cleaned
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
    if (sentences.length === 0) return [cleaned];
    return sentences.slice(0, 3);
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
        const fallbackEnd = Number.isFinite(nextStart) && nextStart > safeStart ? nextStart : Number.POSITIVE_INFINITY;
        const safeEnd = Number.isFinite(rawEnd) && rawEnd > safeStart ? rawEnd : fallbackEnd;
        const withinSegment = index === segments.length - 1
            ? time >= safeStart && time <= safeEnd
            : time >= safeStart && time < safeEnd;
        if (withinSegment) return index;
    }
    return null;
};

const CUE_SYNC_HOLDBACK_SECONDS = 0.08;

const getSuggestedDownloadName = (title: string, formatHint: string) => {
    const normalizedTitle = String(title || 'transcript')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'transcript';
    const normalizedFormat = String(formatHint || 'txt').trim().toLowerCase();
    if (normalizedFormat === 'json' || normalizedFormat === 'verbose_json') return `${normalizedTitle}.json`;
    if (normalizedFormat === 'srt') return `${normalizedTitle}.srt`;
    if (normalizedFormat === 'vtt') return `${normalizedTitle}.vtt`;
    return `${normalizedTitle}.txt`;
};

const isAcceptedAudioFile = (file: File | null | undefined): file is File => {
    if (!file) return false;
    const mimeType = String(file.type || '').toLowerCase();
    if (mimeType.startsWith('audio/')) return true;
    const fileName = String(file.name || '').toLowerCase();
    return ACCEPTED_AUDIO_EXTENSIONS.some((extension) => fileName.endsWith(extension));
};

const inferAudioFormat = (file: File | null) => {
    if (!file) return 'mp3';
    const lowerType = String(file.type || '').toLowerCase();
    if (lowerType.includes('wav')) return 'wav';
    if (lowerType.includes('ogg')) return 'ogg';
    if (lowerType.includes('mp4')) return 'mp4';
    if (lowerType.includes('m4a')) return 'm4a';
    if (lowerType.includes('mpeg') || lowerType.includes('mp3')) return 'mp3';
    if (lowerType.includes('aac')) return 'aac';
    if (lowerType.includes('flac')) return 'flac';
    if (lowerType.includes('opus')) return 'opus';
    if (lowerType.includes('webm')) return 'webm';
    const ext = String(file.name || '').split('.').pop()?.toLowerCase();
    return ext || 'mp3';
};

const extensionFromMimeType = (mimeType: string) => {
    const value = String(mimeType || '').toLowerCase();
    if (value.includes('wav')) return 'wav';
    if (value.includes('ogg')) return 'ogg';
    if (value.includes('mp4')) return 'm4a';
    if (value.includes('m4a')) return 'm4a';
    if (value.includes('aac')) return 'aac';
    if (value.includes('flac')) return 'flac';
    if (value.includes('opus')) return 'opus';
    if (value.includes('webm')) return 'webm';
    if (value.includes('mpeg') || value.includes('mp3')) return 'mp3';
    return 'mp3';
};

const readFileAsBase64 = (file: File) => (
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const raw = String(reader.result || '');
            const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
            resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read source audio for QA checker.'));
        reader.readAsDataURL(file);
    })
);

const extractTextFromContentParts = (content: any): string => {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    return content
        .map((part) => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            if (typeof part?.content === 'string') return part.content;
            if (typeof part?.text?.value === 'string') return part.text.value;
            if (typeof part?.output_text === 'string') return part.output_text;
            return '';
        })
        .join('')
        .trim();
};

const normalizeMeaningfulText = (value: any): string => {
    if (value === null || value === undefined) return '';
    const valueType = typeof value;
    if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') return '';
    const text = String(value).trim();
    if (!text) return '';
    if (text === '[object Object]') return '';
    if (text === '{}' || text === '[]' || text === 'null') return '';
    return text;
};

const resolveQaFallbackModelId = (selectedModelId: string, models: ModelOption[]) => {
    const selected = String(selectedModelId || '').trim();
    if (!Array.isArray(models) || models.length === 0) return '';

    for (const preferredId of PREFERRED_QA_FALLBACK_MODEL_IDS) {
        const exists = models.some((model) => String(model?.id || '').trim() === preferredId);
        if (exists && preferredId !== selected) return preferredId;
    }

    const firstAlternative = models.find((model) => String(model?.id || '').trim() !== selected);
    return String(firstAlternative?.id || '').trim();
};

const extractProxyChatContent = (payload: any): string => {
    const direct = normalizeMeaningfulText(payload?.content);
    if (direct) return direct;

    const contentPartsText = normalizeMeaningfulText(extractTextFromContentParts(payload?.content));
    if (contentPartsText) return contentPartsText;

    const raw = payload?.raw;
    const rawString = normalizeMeaningfulText(raw);
    if (rawString) return rawString;

    const firstChoice = raw?.choices?.[0] || {};
    const message = firstChoice?.message || {};
    const messageText = normalizeMeaningfulText(extractTextFromContentParts(message?.content));
    if (messageText) return messageText;

    const choiceText = normalizeMeaningfulText(firstChoice?.text);
    if (choiceText) return choiceText;

    const outputText = normalizeMeaningfulText(raw?.output_text);
    if (outputText) return outputText;

    const refusal = normalizeMeaningfulText(message?.refusal);
    if (refusal) return `[Refusal] ${refusal}`;

    return '';
};

const requestProxyChat = async ({
    model,
    messages,
    maxTokens = 600,
    temperature = 0.2,
    fallbackModel,
    timeoutMs = 120000
}: {
    model: string;
    messages: any[];
    maxTokens?: number;
    temperature?: number;
    fallbackModel?: string;
    timeoutMs?: number;
}) => {
    const call = async (modelId: string) => {
        const controller = new AbortController();
        const timeoutHandle = window.setTimeout(() => controller.abort(), Math.max(10000, timeoutMs));
        let response: Response;
        try {
            response = await fetch('/api/proxy/chat', {
                method: 'POST',
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                signal: controller.signal,
                body: JSON.stringify({
                    model: modelId,
                    messages,
                    max_tokens: maxTokens,
                    temperature,
                    dynamicParams: {
                        useSearch: false,
                        reasoning: false
                    }
                })
            });
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error('Transcript post-processing request timed out. Please retry.');
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutHandle);
        }

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const errorMessage = String(payload?.error || 'AI summary request failed.');
            maybeNotifyInsufficientBalance(errorMessage);
            throw new Error(errorMessage);
        }

        const payload = await response.json().catch(() => ({}));
        return {
            content: extractProxyChatContent(payload),
            diagnostics: payload?.diagnostics
        };
    };

    const primary = await call(model);
    if (primary.content) return primary.content;

    const canRetryWithFallback = fallbackModel && String(fallbackModel).trim() && fallbackModel !== model;
    if (canRetryWithFallback) {
        const fallback = await call(String(fallbackModel));
        if (fallback.content) return fallback.content;
    }

    const warning = Array.isArray(primary?.diagnostics?.warnings) ? String(primary.diagnostics.warnings[0] || '').trim() : '';
    throw new Error(warning || 'Model returned an empty response.');
};

const parseObject = (value: unknown): Record<string, any> => (
    value && typeof value === 'object' ? value as Record<string, any> : {}
);

const buildTranscriptionAiParametersPayload = ({
    parsed,
    advanced,
    nextPost,
    stripEmbeddedAudioData
}: {
    parsed: Record<string, any>;
    advanced: Record<string, any>;
    nextPost: Record<string, any>;
    stripEmbeddedAudioData?: boolean;
}) => {
    const parsedForPersist = { ...parsed };
    const advancedForPersist = { ...advanced };

    if (stripEmbeddedAudioData) {
        delete parsedForPersist.audioData;
        delete parsedForPersist.inputAudioData;
        delete parsedForPersist.audioBase64;
        delete advancedForPersist.audioData;
        delete advancedForPersist.inputAudioData;
        delete advancedForPersist.audioBase64;
    }

    return JSON.stringify({
        ...parsedForPersist,
        advanced_params: {
            ...advancedForPersist,
            [TRANSCRIPTION_POST_PROCESS_KEY]: nextPost
        }
    }, null, 2);
};

export const TranscriptionStudioPreview: React.FC<TranscriptionStudioPreviewProps> = ({
    title,
    onSetTitle,
    prompt,
    onSetPrompt,
    onGenerate,
    isGenerating,
    modelLabel,
    onOpenModelSelector,
    paramSchema,
    dynamicParams,
    onSetDynamicParam,
    selectedFile,
    onSelectFile,
    onClearFile,
    activeTranscript,
    onUpdateActiveTranscript,
    onSaveTranscriptToArchive,
    isSavingTranscriptToArchive = false
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const postProcessRunRef = useRef(0);
    const isMountedRef = useRef(true);
    const [isDragging, setIsDragging] = useState(false);
    const [activeTab, setActiveTab] = useState<'transcript' | 'output' | 'summary'>('transcript');
    const [copied, setCopied] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isAudioSelectorOpen, setIsAudioSelectorOpen] = useState(false);
    const [languageModels, setLanguageModels] = useState<ModelOption[]>([]);
    const [isLoadingLanguageModels, setIsLoadingLanguageModels] = useState(false);
    const [aiSummary, setAiSummary] = useState('');
    const [summaryError, setSummaryError] = useState('');
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [qaReport, setQaReport] = useState('');
    const [qaError, setQaError] = useState('');
    const [isQaLoading, setIsQaLoading] = useState(false);
    const [isPromotingTranscript, setIsPromotingTranscript] = useState(false);
    const [archivedTranscriptPayload, setArchivedTranscriptPayload] = useState('');
    const persistedPostProcessSignatureRef = useRef('');
    const activePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
    const previewAudioRafRef = useRef<number | null>(null);
    const previewAudioSyncEnabledRef = useRef(false);
    const previewAudioNativeTextTrackRef = useRef<TextTrack | null>(null);
    const previewAudioNativeTrackCuesRef = useRef<any[]>([]);
    const previewAudioNativeTrackHostRef = useRef<HTMLAudioElement | null>(null);
    const previewAudioNativeCueRevisionRef = useRef('');
    const previewAudioNativeCueCleanupRef = useRef<(() => void) | null>(null);
    const previewAudioNativeCueSyncEnabledRef = useRef(false);
    const activeMainCueIndexRef = useRef<number | null>(null);
    const transcriptSegmentsRef = useRef<ReturnType<typeof buildTranscriptInspectionData>['segments']>([]);
    const transcriptCueNodeRefs = useRef<Record<string, Map<number, CueDomNodes>>>({});
    const lastAutoScrolledCueRef = useRef('');

    const rawTranscript = String(activeTranscript?.result?.text || activeTranscript?.archivedItem?.currentRevision?.prompt || '').trim();
    const effectiveRawTranscript = rawTranscript || archivedTranscriptPayload;
    const transcriptOutput = useMemo(() => buildTranscriptInspectionData(effectiveRawTranscript), [effectiveRawTranscript]);
    const transcriptText = transcriptOutput.transcriptText;
    const transcriptSegments = transcriptOutput.segments;
    const transcriptSpeakerCount = useMemo(() => (
        new Set(transcriptSegments.map((segment) => String(segment.speaker || '').trim()).filter(Boolean)).size
    ), [transcriptSegments]);
    const persistedPostProcess = useMemo(() => (
        extractTranscriptionManifestDetails({
            metadata: activeTranscript?.metadata,
            aiParameters: activeTranscript?.archivedItem?.currentRevision?.aiParameters || null
        })
    ), [activeTranscript]);

    useEffect(() => {
        const revision = activeTranscript?.archivedItem?.currentRevision;
        const revisionId = String(revision?.id || '').trim();
        const fileUrl = String(revision?.fileUrl || '').trim();
        const mimeType = String(revision?.mimeType || '').toLowerCase();

        if (!revisionId || rawTranscript) {
            setArchivedTranscriptPayload('');
            return;
        }
        if (!fileUrl || (!mimeType.startsWith('text/') && !mimeType.includes('json'))) {
            setArchivedTranscriptPayload('');
            return;
        }

        let cancelled = false;
        fetch(fileUrl)
            .then((response) => {
                if (!response.ok) throw new Error('Failed to fetch archived transcript payload.');
                return response.text();
            })
            .then((payload) => {
                if (cancelled) return;
                setArchivedTranscriptPayload(String(payload || '').trim());
            })
            .catch(() => {
                if (cancelled) return;
                setArchivedTranscriptPayload('');
            });

        return () => {
            cancelled = true;
        };
    }, [
        activeTranscript?.archivedItem?.currentRevision?.fileUrl,
        activeTranscript?.archivedItem?.currentRevision?.id,
        activeTranscript?.archivedItem?.currentRevision?.mimeType,
        rawTranscript
    ]);
    const transcriptSummaryFallback = useMemo(() => buildTranscriptSummaryFallback(transcriptText), [transcriptText]);
    const qaDetails = useMemo(() => parseTranscriptQaReport(qaReport, transcriptText), [qaReport, transcriptText]);
    const correctedTranscriptOutput = useMemo(
        () => buildTranscriptInspectionData(String(qaDetails.correctedTranscript || '').trim()),
        [qaDetails.correctedTranscript]
    );
    const qaRedlineEdits = useMemo(() => (
        buildTranscriptQaRedlineEdits(transcriptText, qaDetails.correctedTranscript, qaDetails.edits)
    ), [qaDetails.correctedTranscript, qaDetails.edits, transcriptText]);
    const transcriptHistoryText = useMemo(() => (
        String(persistedPostProcess.transcriptHistoryText || '').trim()
    ), [persistedPostProcess.transcriptHistoryText]);
    const canPromoteCorrectedTranscript = useMemo(() => (
        Boolean(qaDetails.correctedTranscript && qaDetails.hasCorrections)
    ), [qaDetails.correctedTranscript, qaDetails.hasCorrections]);
    const isGenerateDisabled = isGenerating || !selectedFile;
    const selectedAudioFormat = inferAudioFormat(selectedFile);
    const transcriptionParams = useMemo(
        () => (paramSchema.length > 0 ? paramSchema : DEFAULT_TRANSCRIPTION_PARAM_SCHEMA)
            .filter((param) => !RESERVED_TRANSCRIPTION_PARAM_KEYS.has(String(param.key || '').trim())),
        [paramSchema]
    );
    const selectedResponseFormat = String(
        dynamicParams.response_format
        ?? transcriptionParams.find((param) => param.key === 'response_format')?.default
        ?? 'text'
    ).trim().toLowerCase();
    const diarizationEnabled = Boolean(dynamicParams.diarize ?? false);
    const summaryEnabled = Boolean(dynamicParams[SUMMARY_ENABLED_PARAM_KEY] ?? true);
    const selectedSummaryModelId = String(dynamicParams[SUMMARY_MODEL_PARAM_KEY] ?? DEFAULT_SUMMARY_MODEL_ID).trim() || DEFAULT_SUMMARY_MODEL_ID;
    const qaCheckerEnabled = Boolean(dynamicParams[QA_ENABLED_PARAM_KEY] ?? false);
    const selectedQaModelId = String(dynamicParams[QA_MODEL_PARAM_KEY] ?? DEFAULT_QA_MODEL_ID).trim() || DEFAULT_QA_MODEL_ID;

    const availableSummaryModels = useMemo(() => (
        languageModels.length > 0 ? languageModels : [FALLBACK_SUMMARY_MODEL]
    ), [languageModels]);
    const availableQaModels = useMemo(() => {
        const audioCapable = availableSummaryModels.filter((model) =>
            Array.isArray(model.textInputModalities)
                && model.textInputModalities.some((modality) => String(modality || '').toLowerCase() === 'audio')
        );
        const nonDeprecatedAudio = audioCapable.filter((model) => (
            !LEGACY_DEPRECATED_QA_MODEL_IDS.has(String(model?.id || '').trim())
        ));
        if (nonDeprecatedAudio.length > 0) return nonDeprecatedAudio;
        if (audioCapable.length > 0) return audioCapable;

        const nonDeprecatedSummary = availableSummaryModels.filter((model) => (
            !LEGACY_DEPRECATED_QA_MODEL_IDS.has(String(model?.id || '').trim())
        ));
        return nonDeprecatedSummary.length > 0 ? nonDeprecatedSummary : availableSummaryModels;
    }, [availableSummaryModels]);
    const fallbackQaModelId = useMemo(
        () => resolveQaFallbackModelId(selectedQaModelId, availableQaModels),
        [availableQaModels, selectedQaModelId]
    );
    const summaryModelLabel = useMemo(() => (
        availableSummaryModels.find((model) => model.id === selectedSummaryModelId)?.label || selectedSummaryModelId
    ), [availableSummaryModels, selectedSummaryModelId]);
    const qaModelLabel = useMemo(() => (
        availableQaModels.find((model) => model.id === selectedQaModelId)?.label || selectedQaModelId
    ), [availableQaModels, selectedQaModelId]);
    const persistedSummaryModelLabel = useMemo(() => (
        availableSummaryModels.find((model) => model.id === persistedPostProcess.summaryModelId)?.label
        || persistedPostProcess.summaryModelId
    ), [availableSummaryModels, persistedPostProcess.summaryModelId]);
    const persistedQaModelLabel = useMemo(() => (
        availableQaModels.find((model) => model.id === persistedPostProcess.qaModelId)?.label
        || persistedPostProcess.qaModelId
    ), [availableQaModels, persistedPostProcess.qaModelId]);

    const summaryLines = useMemo(() => {
        const source = String(aiSummary || '').trim() || transcriptSummaryFallback.join('\n\n');
        return source
            .split(/\n{2,}/)
            .map((line) => line.trim())
            .filter(Boolean);
    }, [aiSummary, transcriptSummaryFallback]);
    const qaLines = useMemo(() => (
        String(qaReport || '')
            .split(/\n{2,}/)
            .map((line) => line.trim())
            .filter(Boolean)
    ), [qaReport]);
    const outputQaStatus = useMemo(() => {
        if (isQaLoading) return 'Running';
        if (qaError) return 'Skipped';
        if (qaLines.length > 0) {
            if (qaDetails.hasCorrections) return 'Corrections flagged';
            return qaDetails.verdict || 'Passed';
        }
        return qaCheckerEnabled ? 'Waiting' : 'Off';
    }, [isQaLoading, qaCheckerEnabled, qaDetails.hasCorrections, qaDetails.verdict, qaError, qaLines.length]);
    const isTranscriptSaved = Boolean(activeTranscript?.archivedItem?.currentRevision?.id);
    const setCueRowActiveStyles = useCallback((node: HTMLDivElement | null, isActive: boolean) => {
        if (!node) return;
        node.style.borderColor = isActive ? 'rgba(34, 211, 238, 0.45)' : '';
        node.style.background = isActive ? 'rgba(6, 182, 212, 0.12)' : '';
        node.style.boxShadow = isActive
            ? '0 0 0 1px rgba(6, 182, 212, 0.12), 0 18px 40px rgba(6, 182, 212, 0.2)'
            : '';
    }, []);
    const setCueTimeActiveStyles = useCallback((node: HTMLParagraphElement | null, isActive: boolean) => {
        if (!node) return;
        node.style.display = isActive ? 'inline-flex' : '';
        node.style.alignItems = isActive ? 'center' : '';
        node.style.width = isActive ? 'fit-content' : '';
        node.style.borderRadius = isActive ? '0.375rem' : '';
        node.style.padding = isActive ? '0.25rem 0.5rem' : '';
        node.style.backgroundColor = isActive ? 'rgba(34, 211, 238, 0.2)' : '';
        node.style.color = isActive ? '#cffafe' : '';
    }, []);
    const updateCueDomHighlight = useCallback((nextCueIndex: number | null) => {
        const previousCueIndex = activeMainCueIndexRef.current;
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
        activeMainCueIndexRef.current = nextCueIndex;
        return true;
    }, [setCueRowActiveStyles, setCueTimeActiveStyles]);
    const clearCueDomHighlight = useCallback(() => {
        updateCueDomHighlight(null);
    }, [updateCueDomHighlight]);
    const scrollCueIntoView = useCallback((timelineId: 'transcript-main' | 'output-main', cueIndex: number) => {
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
    const teardownPreviewAudioNativeCueSync = useCallback(() => {
        const cleanup = previewAudioNativeCueCleanupRef.current;
        if (cleanup) {
            try {
                cleanup();
            } catch (_error) {}
        }
        previewAudioNativeCueCleanupRef.current = null;

        const textTrack = previewAudioNativeTextTrackRef.current;
        if (textTrack) {
            previewAudioNativeTrackCuesRef.current.forEach((cue) => {
                try {
                    textTrack.removeCue(cue);
                } catch (_error) {}
            });
            textTrack.mode = 'disabled';
            try {
                (textTrack as any).oncuechange = null;
            } catch (_error) {}
        }

        previewAudioNativeTextTrackRef.current = null;
        previewAudioNativeTrackCuesRef.current = [];
        previewAudioNativeTrackHostRef.current = null;
        previewAudioNativeCueRevisionRef.current = '';
        previewAudioNativeCueSyncEnabledRef.current = false;
    }, []);
    const syncActiveCueFromAudio = useCallback((audio: HTMLAudioElement) => {
        if (!previewAudioSyncEnabledRef.current) {
            clearCueDomHighlight();
            return;
        }
        const nextCueIndex = getCueIndexForPlaybackTime(Number(audio.currentTime));
        const changed = updateCueDomHighlight(nextCueIndex);
        if (!changed || nextCueIndex === null) return;
        const activeTimelineId = activeTab === 'output'
            ? 'output-main'
            : activeTab === 'transcript'
                ? 'transcript-main'
                : null;
        if (!activeTimelineId) return;
        scrollCueIntoView(activeTimelineId, nextCueIndex);
    }, [activeTab, clearCueDomHighlight, getCueIndexForPlaybackTime, scrollCueIntoView, updateCueDomHighlight]);
    const syncActiveCueFromNativeTrack = useCallback((audio: HTMLAudioElement) => {
        if (!previewAudioNativeCueSyncEnabledRef.current) return false;
        if (previewAudioNativeTrackHostRef.current !== audio) return false;
        const cueIndex = getCueIndexForPlaybackTime(Number(audio.currentTime));
        if (cueIndex === null) return false;

        const changed = updateCueDomHighlight(cueIndex);
        if (!changed) return true;
        const activeTimelineId = activeTab === 'output'
            ? 'output-main'
            : activeTab === 'transcript'
                ? 'transcript-main'
                : null;
        if (activeTimelineId) {
            scrollCueIntoView(activeTimelineId, cueIndex);
        }
        return true;
    }, [activeTab, getCueIndexForPlaybackTime, scrollCueIntoView, updateCueDomHighlight]);
    const ensurePreviewAudioNativeCueSync = useCallback((audio: HTMLAudioElement) => {
        const segments = transcriptSegmentsRef.current;
        if (!previewAudioSyncEnabledRef.current || !Array.isArray(segments) || segments.length === 0) {
            teardownPreviewAudioNativeCueSync();
            return false;
        }

        const cueCtor = (window as any).VTTCue || (window as any).WebKitDataCue;
        if (typeof cueCtor !== 'function') {
            previewAudioNativeCueSyncEnabledRef.current = false;
            return false;
        }

        const revision = buildTranscriptCueRevision(segments);
        const sameTrack = previewAudioNativeTrackHostRef.current === audio
            && previewAudioNativeTextTrackRef.current
            && previewAudioNativeCueRevisionRef.current === revision;
        if (sameTrack) return true;

        teardownPreviewAudioNativeCueSync();

        let textTrack: TextTrack | null = null;
        try {
            textTrack = audio.addTextTrack('metadata', 'AIMANA Transcript Preview Cues', 'en');
            textTrack.mode = 'hidden';
        } catch (_error) {
            previewAudioNativeCueSyncEnabledRef.current = false;
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
            previewAudioNativeCueSyncEnabledRef.current = false;
            return false;
        }

        const handleCueChange = () => {
            const cueIndex = getCueIndexForPlaybackTime(Number(audio.currentTime));
            if (cueIndex !== null) {
                const changed = updateCueDomHighlight(cueIndex);
                if (!changed) return;
                const activeTimelineId = activeTab === 'output'
                    ? 'output-main'
                    : activeTab === 'transcript'
                        ? 'transcript-main'
                        : null;
                if (activeTimelineId) {
                    scrollCueIntoView(activeTimelineId, cueIndex);
                }
                return;
            }
            syncActiveCueFromAudio(audio);
        };

        if (typeof (textTrack as any).addEventListener === 'function') {
            (textTrack as any).addEventListener('cuechange', handleCueChange);
            previewAudioNativeCueCleanupRef.current = () => {
                try {
                    (textTrack as any).removeEventListener('cuechange', handleCueChange);
                } catch (_error) {}
            };
        } else {
            const previousHandler = (textTrack as any).oncuechange || null;
            (textTrack as any).oncuechange = handleCueChange;
            previewAudioNativeCueCleanupRef.current = () => {
                try {
                    if ((textTrack as any).oncuechange === handleCueChange) {
                        (textTrack as any).oncuechange = previousHandler;
                    }
                } catch (_error) {}
            };
        }

        previewAudioNativeTextTrackRef.current = textTrack;
        previewAudioNativeTrackHostRef.current = audio;
        previewAudioNativeTrackCuesRef.current = createdCues;
        previewAudioNativeCueRevisionRef.current = revision;
        previewAudioNativeCueSyncEnabledRef.current = true;
        handleCueChange();
        return true;
    }, [activeTab, buildTranscriptCueRevision, getCueIndexForPlaybackTime, scrollCueIntoView, syncActiveCueFromAudio, teardownPreviewAudioNativeCueSync, updateCueDomHighlight]);
    const stopPreviewAudioSyncLoop = useCallback(() => {
        if (previewAudioRafRef.current !== null) {
            window.cancelAnimationFrame(previewAudioRafRef.current);
            previewAudioRafRef.current = null;
        }
    }, []);
    const startPreviewAudioSyncLoop = useCallback((audio: HTMLAudioElement) => {
        stopPreviewAudioSyncLoop();
        activePreviewAudioRef.current = audio;
        const tick = () => {
            const currentAudio = activePreviewAudioRef.current;
            if (!currentAudio || currentAudio.paused || currentAudio.ended) {
                previewAudioRafRef.current = null;
                return;
            }
            syncActiveCueFromAudio(currentAudio);
            previewAudioRafRef.current = window.requestAnimationFrame(tick);
        };
        previewAudioRafRef.current = window.requestAnimationFrame(tick);
    }, [stopPreviewAudioSyncLoop, syncActiveCueFromAudio]);
    const handlePreviewAudioPlay = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        activePreviewAudioRef.current = audio;
        ensurePreviewAudioNativeCueSync(audio);
        syncActiveCueFromAudio(audio);
        startPreviewAudioSyncLoop(audio);
    }, [ensurePreviewAudioNativeCueSync, startPreviewAudioSyncLoop, syncActiveCueFromAudio]);
    const handlePreviewAudioLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activePreviewAudioRef.current && activePreviewAudioRef.current !== audio) return;
        activePreviewAudioRef.current = audio;
        const nativeCueSyncReady = ensurePreviewAudioNativeCueSync(audio);
        if (nativeCueSyncReady && syncActiveCueFromNativeTrack(audio)) return;
        syncActiveCueFromAudio(audio);
    }, [ensurePreviewAudioNativeCueSync, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const handlePreviewAudioProgress = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activePreviewAudioRef.current && activePreviewAudioRef.current !== audio) return;
        activePreviewAudioRef.current = audio;
        const nativeCueSyncReady = ensurePreviewAudioNativeCueSync(audio);
        if (nativeCueSyncReady) {
            if (!syncActiveCueFromNativeTrack(audio)) {
                syncActiveCueFromAudio(audio);
            }
            return;
        }
        syncActiveCueFromAudio(audio);
    }, [ensurePreviewAudioNativeCueSync, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const handlePreviewAudioPause = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activePreviewAudioRef.current && activePreviewAudioRef.current !== audio) return;
        stopPreviewAudioSyncLoop();
        const nativeCueSyncReady = ensurePreviewAudioNativeCueSync(audio);
        if (nativeCueSyncReady) {
            if (!syncActiveCueFromNativeTrack(audio)) {
                syncActiveCueFromAudio(audio);
            }
            return;
        }
        syncActiveCueFromAudio(audio);
    }, [ensurePreviewAudioNativeCueSync, stopPreviewAudioSyncLoop, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const handlePreviewAudioEnded = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
        const audio = event.currentTarget;
        if (activePreviewAudioRef.current && activePreviewAudioRef.current !== audio) return;
        stopPreviewAudioSyncLoop();
        const nativeCueSyncReady = ensurePreviewAudioNativeCueSync(audio);
        if (nativeCueSyncReady) {
            if (!syncActiveCueFromNativeTrack(audio)) {
                syncActiveCueFromAudio(audio);
            }
            activePreviewAudioRef.current = null;
            return;
        }
        syncActiveCueFromAudio(audio);
        activePreviewAudioRef.current = null;
    }, [ensurePreviewAudioNativeCueSync, stopPreviewAudioSyncLoop, syncActiveCueFromAudio, syncActiveCueFromNativeTrack]);
    const registerTranscriptCueNode = useCallback((timelineId: string, cueIndex: number, node: HTMLDivElement | null) => {
        if (!transcriptCueNodeRefs.current[timelineId]) {
            transcriptCueNodeRefs.current[timelineId] = new Map();
        }
        const timelineMap = transcriptCueNodeRefs.current[timelineId];
        const existing = timelineMap.get(cueIndex) || { row: null, time: null };
        if (node) {
            existing.row = node;
            timelineMap.set(cueIndex, existing);
            if (activeMainCueIndexRef.current === cueIndex) {
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
            if (activeMainCueIndexRef.current === cueIndex) {
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
    const activeTimelineId = useMemo(() => (
        activeTab === 'output' ? 'output-main' : activeTab === 'transcript' ? 'transcript-main' : null
    ), [activeTab]);
    useEffect(() => {
        transcriptSegmentsRef.current = transcriptSegments;
    }, [transcriptSegments]);
    useEffect(() => {
        previewAudioSyncEnabledRef.current = Boolean(previewUrl && transcriptSegments.length > 0);
        if (!previewAudioSyncEnabledRef.current) {
            clearCueDomHighlight();
            teardownPreviewAudioNativeCueSync();
        }
    }, [clearCueDomHighlight, previewUrl, teardownPreviewAudioNativeCueSync, transcriptSegments]);
    useEffect(() => {
        if (!activeTimelineId) return;
        const activeCueIndex = activeMainCueIndexRef.current;
        if (activeCueIndex === null) return;
        scrollCueIntoView(activeTimelineId, activeCueIndex);
    }, [activeTimelineId, scrollCueIntoView]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    useEffect(() => (
        () => {
            stopPreviewAudioSyncLoop();
            teardownPreviewAudioNativeCueSync();
        }
    ), [stopPreviewAudioSyncLoop, teardownPreviewAudioNativeCueSync]);

    useEffect(() => {
        const revisionId = activeTranscript?.archivedItem?.currentRevision?.id;
        if (!revisionId) {
            persistedPostProcessSignatureRef.current = '';
            return;
        }
        if (persistedPostProcessSignatureRef.current.startsWith(`${revisionId}|`)) return;
        persistedPostProcessSignatureRef.current = [
            revisionId,
            persistedPostProcess.postProcessStatus,
            persistedPostProcess.summaryText,
            persistedPostProcess.qaReport,
            persistedPostProcess.summaryModelId || selectedSummaryModelId,
            persistedPostProcess.qaModelId || selectedQaModelId,
            persistedPostProcess.summaryError,
            persistedPostProcess.qaError
        ].join('|');
    }, [
        activeTranscript?.archivedItem?.currentRevision?.id,
        persistedPostProcess.postProcessStatus,
        persistedPostProcess.summaryText,
        persistedPostProcess.qaReport,
        persistedPostProcess.summaryModelId,
        persistedPostProcess.qaModelId,
        persistedPostProcess.summaryError,
        persistedPostProcess.qaError,
        selectedQaModelId,
        selectedSummaryModelId
    ]);

    const persistTranscriptPostProcess = useCallback(async (
        summaryText: string,
        qaText: string,
        options: {
            status?: string;
            summaryError?: string;
            qaError?: string;
        } = {}
    ) => {
        const revision = activeTranscript?.archivedItem?.currentRevision;
        const currentMetadata = parseObject(activeTranscript?.metadata);
        const currentAdvanced = parseObject(currentMetadata.advanced_params);

        const summary = String(summaryText || '').trim();
        const qa = String(qaText || '').trim();
        const persistenceKey = revision?.id || activeTranscript?.id || 'transcript-stage';

        const signature = [
            persistenceKey,
            normalizeTranscriptionPostProcessStatus(options.status),
            summary,
            qa,
            selectedSummaryModelId,
            selectedQaModelId,
            String(options.summaryError || '').trim(),
            String(options.qaError || '').trim()
        ].join('|');
        if (persistedPostProcessSignatureRef.current === signature) return;

        let parsed: Record<string, any> = currentMetadata;
        if (revision?.aiParameters) {
            try {
                parsed = parseObject(JSON.parse(revision.aiParameters));
            } catch (_error) {}
        }

        const advanced = parseObject(parsed.advanced_params);
        const existingPost = parseObject(advanced[TRANSCRIPTION_POST_PROCESS_KEY]);
        const existingSummary = String(existingPost.summaryText || '').trim();
        const existingQa = String(existingPost.qaReport || '').trim();
        const existingSummaryModel = String(existingPost.summaryModelId || '').trim();
        const existingQaModel = String(existingPost.qaModelId || '').trim();
        const existingStatus = normalizeTranscriptionPostProcessStatus(existingPost.status);
        const existingSummaryEnabled = existingPost.summaryEnabled === true;
        const existingQaEnabled = existingPost.qaEnabled === true;
        const existingSummaryError = String(existingPost.summaryError || '').trim();
        const existingQaError = String(existingPost.qaError || '').trim();
        const targetSummaryModel = summary ? selectedSummaryModelId : existingSummaryModel;
        const targetQaModel = qa ? selectedQaModelId : existingQaModel;
        const nextStatus = normalizeTranscriptionPostProcessStatus(
            options.status || existingStatus || ((summary || qa) ? 'complete' : 'idle')
        );
        const nextSummaryEnabled = existingSummaryEnabled || summaryEnabled;
        const nextQaEnabled = existingQaEnabled || qaCheckerEnabled;
        const nextSummaryError = String(options.summaryError || '').trim();
        const nextQaError = String(options.qaError || '').trim();

        if (!summary && !qa && nextStatus === 'idle' && !nextSummaryEnabled && !nextQaEnabled && !nextSummaryError && !nextQaError) {
            return;
        }

        if (
            existingSummary === (summary || existingSummary)
            && existingQa === (qa || existingQa)
            && existingSummaryModel === targetSummaryModel
            && existingQaModel === targetQaModel
            && existingStatus === nextStatus
            && existingSummaryEnabled === nextSummaryEnabled
            && existingQaEnabled === nextQaEnabled
            && existingSummaryError === nextSummaryError
            && existingQaError === nextQaError
        ) {
            persistedPostProcessSignatureRef.current = signature;
            return;
        }

        const nextPost = {
            ...existingPost,
            summaryText: summary || existingPost.summaryText || '',
            summaryModelId: targetSummaryModel,
            qaReport: qa || existingPost.qaReport || '',
            qaModelId: targetQaModel,
            status: nextStatus,
            summaryEnabled: nextSummaryEnabled,
            qaEnabled: nextQaEnabled,
            summaryError: nextSummaryError,
            qaError: nextQaError,
            updatedAt: Date.now()
        };

        let nextAiParameters = revision?.id
            ? buildTranscriptionAiParametersPayload({
                parsed,
                advanced,
                nextPost
            })
            : '';
        let updatedRevision: Revision | null = null;
        if (revision?.id) {
            try {
                updatedRevision = await api.revisions.update({
                    id: revision.id,
                    aiParameters: nextAiParameters
                });
            } catch (primaryError) {
                const hasEmbeddedAudioPayload = Boolean(
                    String(advanced.audioData || parsed.audioData || advanced.inputAudioData || parsed.inputAudioData || '').trim()
                );
                if (!hasEmbeddedAudioPayload) throw primaryError;

                // Local-drive uploads can produce huge embedded audio payloads; strip them on retry
                // so transcript post-processing state can still be persisted.
                nextAiParameters = buildTranscriptionAiParametersPayload({
                    parsed,
                    advanced,
                    nextPost,
                    stripEmbeddedAudioData: true
                });
                updatedRevision = await api.revisions.update({
                    id: revision.id,
                    aiParameters: nextAiParameters
                });
            }
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('neural-history-updated'));
            }
        }

        persistedPostProcessSignatureRef.current = signature;

        if (isMountedRef.current) {
            const hasTranscriptBody = transcriptText.length > 0;
            const nextTaskStatus = nextStatus === 'error'
                ? (hasTranscriptBody ? 'success' : 'error')
                : nextStatus === 'complete'
                    ? 'success'
                    : 'pending';
            const nextTaskError = nextStatus === 'error'
                ? (hasTranscriptBody ? null : (nextQaError || nextSummaryError || 'Transcript post-processing failed.'))
                : null;
            onUpdateActiveTranscript?.({
                status: nextTaskStatus,
                progress: nextTaskStatus === 'success' ? 100 : 96,
                error: nextTaskError,
                metadata: {
                    ...currentMetadata,
                    [TRANSCRIPTION_POST_PROCESS_KEY]: nextPost,
                    advanced_params: {
                        ...currentAdvanced,
                        [TRANSCRIPTION_POST_PROCESS_KEY]: nextPost
                    }
                },
                archivedItem: activeTranscript?.archivedItem?.currentRevision && updatedRevision
                    ? {
                        ...activeTranscript.archivedItem,
                        currentRevision: {
                            ...activeTranscript.archivedItem.currentRevision,
                            ...updatedRevision,
                            aiParameters: nextAiParameters
                        }
                    }
                    : activeTranscript?.archivedItem
            });
        }
    }, [activeTranscript, onUpdateActiveTranscript, qaCheckerEnabled, selectedQaModelId, selectedSummaryModelId, summaryEnabled]);

    useEffect(() => {
        let isMounted = true;
        setIsLoadingLanguageModels(true);

        loadDynamicRegistry()
            .then((models) => {
                if (!isMounted) return;
                const language = models.filter((model) => model.category === 'Language');
                setLanguageModels(language);
            })
            .catch(() => {
                if (!isMounted) return;
                setLanguageModels([]);
            })
            .finally(() => {
                if (!isMounted) return;
                setIsLoadingLanguageModels(false);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (dynamicParams[SUMMARY_ENABLED_PARAM_KEY] === undefined) {
            onSetDynamicParam(SUMMARY_ENABLED_PARAM_KEY, true);
        }
        if (dynamicParams[SUMMARY_MODEL_PARAM_KEY] === undefined) {
            onSetDynamicParam(SUMMARY_MODEL_PARAM_KEY, DEFAULT_SUMMARY_MODEL_ID);
        }
        if (dynamicParams[QA_ENABLED_PARAM_KEY] === undefined) {
            onSetDynamicParam(QA_ENABLED_PARAM_KEY, false);
        }
        if (dynamicParams[QA_MODEL_PARAM_KEY] === undefined) {
            onSetDynamicParam(QA_MODEL_PARAM_KEY, DEFAULT_QA_MODEL_ID);
        }
    }, [dynamicParams, onSetDynamicParam]);

    useEffect(() => {
        if (availableSummaryModels.length === 0) return;

        const hasSummaryModel = availableSummaryModels.some((model) => model.id === selectedSummaryModelId);
        if (!hasSummaryModel) {
            onSetDynamicParam(SUMMARY_MODEL_PARAM_KEY, String(availableSummaryModels[0].id));
        }

        const hasQaModel = availableQaModels.some((model) => model.id === selectedQaModelId);
        if (!hasQaModel) {
            onSetDynamicParam(QA_MODEL_PARAM_KEY, String(availableQaModels[0].id));
        }
    }, [
        availableQaModels,
        availableSummaryModels,
        onSetDynamicParam,
        selectedQaModelId,
        selectedSummaryModelId
    ]);

    useEffect(() => {
        if (!selectedQaModelId) return;
        if (!LEGACY_DEPRECATED_QA_MODEL_IDS.has(selectedQaModelId)) return;
        if (!fallbackQaModelId || fallbackQaModelId === selectedQaModelId) return;
        onSetDynamicParam(QA_MODEL_PARAM_KEY, fallbackQaModelId);
    }, [fallbackQaModelId, onSetDynamicParam, selectedQaModelId]);

    useEffect(() => {
        if (!transcriptText) {
            setAiSummary('');
            setSummaryError('');
            setIsSummaryLoading(false);
            setQaReport('');
            setQaError('');
            setIsQaLoading(false);
            return;
        }

        const runId = postProcessRunRef.current + 1;
        postProcessRunRef.current = runId;
        const isActiveRun = () => postProcessRunRef.current === runId;
        const canUpdateUi = () => isMountedRef.current && isActiveRun();

        const runPostProcessing = async () => {
            const persistedSummary = String(persistedPostProcess.summaryText || '').trim();
            const persistedQa = String(persistedPostProcess.qaReport || '').trim();
            let summaryToPersist = persistedSummary;
            let qaToPersist = persistedQa;
            let summaryFailureMessage = '';
            let qaFailureMessage = '';

            if (isMountedRef.current) {
                setIsSummaryLoading(summaryEnabled && !persistedSummary);
                setSummaryError('');
                setAiSummary(persistedSummary);
                setQaReport(persistedQa);
                setQaError('');
                setIsQaLoading(qaCheckerEnabled && !persistedQa);
            }

            if (!summaryEnabled) {
                if (!summaryToPersist) summaryToPersist = transcriptSummaryFallback.join('\n\n');
                if (isMountedRef.current) setAiSummary(summaryToPersist);
                if (canUpdateUi()) {
                    setIsSummaryLoading(false);
                }
            } else if (persistedSummary) {
                if (canUpdateUi()) {
                    setIsSummaryLoading(false);
                }
            } else {
                try {
                    const summary = await requestProxyChat({
                        model: selectedSummaryModelId,
                        fallbackModel: DEFAULT_SUMMARY_MODEL_ID,
                        maxTokens: 420,
                        temperature: 0.2,
                        messages: [
                            {
                                role: 'system',
                                content: 'Summarize transcripts into concise sections: overview, key points, action items, and unresolved questions. Always return plain text with at least 4 bullets.'
                            },
                            {
                                role: 'user',
                                content: `Transcript:\n\n${transcriptText}`
                            }
                        ]
                    });
                    if (!isActiveRun()) return;
                    summaryToPersist = summary;
                    if (isMountedRef.current) setAiSummary(summary);
                } catch (error: any) {
                    if (!isActiveRun()) return;
                    summaryFailureMessage = String(error?.message || 'Failed to generate transcript summary.');
                    if (isMountedRef.current) setSummaryError(summaryFailureMessage);
                    summaryToPersist = transcriptSummaryFallback.join('\n\n');
                    if (isMountedRef.current) setAiSummary(summaryToPersist);
                } finally {
                    if (canUpdateUi()) {
                        setIsSummaryLoading(false);
                    }
                }
            }

            if (!qaCheckerEnabled) {
                if (canUpdateUi()) setIsQaLoading(false);
            } else if (persistedQa) {
                if (canUpdateUi()) setIsQaLoading(false);
            } else if (!selectedFile) {
                qaFailureMessage = 'QA checker is enabled but source audio is missing. Upload or re-select the source audio to validate transcript accuracy.';
                if (canUpdateUi()) {
                    setQaError(qaFailureMessage);
                    setIsQaLoading(false);
                }
            } else {
                try {
                    const base64Audio = await readFileAsBase64(selectedFile);
                    if (!isActiveRun()) return;

                    const qa = await requestProxyChat({
                        model: selectedQaModelId,
                        fallbackModel: fallbackQaModelId || undefined,
                        maxTokens: 700,
                        temperature: 0.1,
                        messages: [
                            {
                                role: 'system',
                                content: [
                                    'You are a transcript QA checker.',
                                    'Compare audio content against the provided transcript.',
                                    'Return plain text using these exact sections in order:',
                                    'VERDICT:',
                                    'CONFIDENCE:',
                                    'ACCURATE SEGMENTS:',
                                    'ISSUES:',
                                    'EDITS:',
                                    'CORRECTED TRANSCRIPT:',
                                    'CHANGE NOTES:',
                                    'Under EDITS, write each correction as:',
                                    '1. FROM: <original text>',
                                    'TO: <corrected text>',
                                    'If there are no corrections, write "None" under EDITS and repeat the original transcript exactly under CORRECTED TRANSCRIPT.'
                                ].join('\n')
                            },
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'text',
                                        text: `Check this transcript for accuracy against the audio.\n\nTranscript:\n${transcriptText}`
                                    },
                                    {
                                        type: 'input_audio',
                                        input_audio: {
                                            format: selectedAudioFormat,
                                            data: base64Audio
                                        }
                                    }
                                ]
                            }
                        ]
                    });
                    if (!isActiveRun()) return;
                    qaToPersist = qa;
                    if (isMountedRef.current) setQaReport(qa);
                } catch (error: any) {
                    if (!isActiveRun()) return;
                    qaFailureMessage = String(error?.message || 'Failed to run transcript QA checker.');
                    if (isMountedRef.current) setQaError(qaFailureMessage);
                } finally {
                    if (canUpdateUi()) {
                        setIsQaLoading(false);
                    }
                }
            }

            if (isActiveRun()) {
                await persistTranscriptPostProcess(
                    summaryToPersist,
                    qaToPersist,
                    {
                        status: 'complete',
                        summaryError: summaryFailureMessage,
                        qaError: qaFailureMessage
                    }
                );
            }
        };

        runPostProcessing();
        return () => {};
    }, [
        qaCheckerEnabled,
        summaryEnabled,
        selectedAudioFormat,
        selectedFile,
        selectedQaModelId,
        selectedSummaryModelId,
        persistedPostProcess.qaReport,
        persistedPostProcess.summaryText,
        persistTranscriptPostProcess,
        transcriptSummaryFallback,
        transcriptText
    ]);

    useEffect(() => {
        if (!selectedFile) {
            stopPreviewAudioSyncLoop();
            activePreviewAudioRef.current = null;
            clearCueDomHighlight();
            transcriptCueNodeRefs.current = {};
            lastAutoScrolledCueRef.current = '';
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(selectedFile);
        stopPreviewAudioSyncLoop();
        activePreviewAudioRef.current = null;
        clearCueDomHighlight();
        transcriptCueNodeRefs.current = {};
        lastAutoScrolledCueRef.current = '';
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [clearCueDomHighlight, selectedFile, stopPreviewAudioSyncLoop]);

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
            if (isAcceptedAudioFile(file)) onSelectFile(file);
    };

    const handleCopyTranscript = async () => {
        if (!transcriptText) return;
        await navigator.clipboard.writeText(transcriptText);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    };

    const handleDownloadTranscript = () => {
        if (!transcriptText) return;
        const payload = (selectedResponseFormat === 'json' || selectedResponseFormat === 'verbose_json')
            ? (rawTranscript || transcriptText)
            : transcriptText;
        const mimeType = selectedResponseFormat === 'json' || selectedResponseFormat === 'verbose_json'
            ? 'application/json;charset=utf-8'
            : 'text/plain;charset=utf-8';
        const blob = new Blob([payload], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getSuggestedDownloadName(title || selectedFile?.name || 'transcript', selectedResponseFormat);
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleGenerateAndOpenSummary = () => {
        setActiveTab('output');
        onGenerate();
    };

    const handlePromoteCorrectedTranscript = useCallback(async () => {
        const correctedTranscript = String(qaDetails.correctedTranscript || '').trim();
        if (!correctedTranscript || !activeTranscript) return;

        setIsPromotingTranscript(true);
        try {
            const archivedItem = activeTranscript.archivedItem;
            const revision = archivedItem?.currentRevision;
            let parsed: Record<string, any> = parseObject(activeTranscript.metadata);
            if (revision?.aiParameters) {
                try {
                    parsed = parseObject(JSON.parse(revision.aiParameters));
                } catch (_error) {}
            }

            const advanced = parseObject(parsed.advanced_params);
            const existingPost = parseObject(advanced[TRANSCRIPTION_POST_PROCESS_KEY] ?? parsed[TRANSCRIPTION_POST_PROCESS_KEY]);
            const nextPost = {
                ...existingPost,
                status: 'complete',
                correctedTranscriptApplied: true,
                promotedCorrectedTranscriptAt: Date.now(),
                promotedFromRevisionId: revision?.id || existingPost.promotedFromRevisionId || '',
                promotedFromTranscript: transcriptText,
                qaError: ''
            };

            const nextMetadata = {
                ...parseObject(activeTranscript.metadata),
                [TRANSCRIPTION_POST_PROCESS_KEY]: nextPost,
                advanced_params: {
                    ...parseObject(parseObject(activeTranscript.metadata).advanced_params),
                    [TRANSCRIPTION_POST_PROCESS_KEY]: nextPost
                }
            };
            const nextResult = activeTranscript.result
                ? {
                    ...activeTranscript.result,
                    text: correctedTranscript
                }
                : activeTranscript.result;

            if (archivedItem?.id && revision?.id) {
                const fileName = (() => {
                    const baseName = String(revision.originalFilename || revision.title || `transcript-${archivedItem.id}`).trim() || `transcript-${archivedItem.id}`;
                    return /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.txt`;
                })();
                const file = new File([correctedTranscript], fileName, {
                    type: revision.mimeType || 'text/plain'
                });
                const nextAiParameters = buildTranscriptionAiParametersPayload({
                    parsed,
                    advanced,
                    nextPost,
                    stripEmbeddedAudioData: true
                });

                const newRevision = await api.revisions.add(archivedItem.id, file, {
                    title: revision.title,
                    label: revision.label,
                    prompt: correctedTranscript,
                    engine: revision.engine,
                    note: revision.note,
                    aiParameters: nextAiParameters,
                    secondaryFiles: revision.secondaryFiles || []
                });
                const freshItem = await api.items.get(archivedItem.id);
                const nextArchivedItem = freshItem || {
                    ...archivedItem,
                    currentRevisionId: newRevision.id,
                    currentRevision: newRevision,
                    updatedAt: Date.now()
                };

                onUpdateActiveTranscript?.({
                    prompt: correctedTranscript,
                    result: nextResult,
                    metadata: nextMetadata,
                    title: nextArchivedItem.currentRevision?.title || activeTranscript.title,
                    archivedItem: nextArchivedItem
                });
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('neural-history-updated'));
                }
            } else {
                onUpdateActiveTranscript?.({
                    prompt: correctedTranscript,
                    result: nextResult,
                    metadata: nextMetadata
                });
            }
        } catch (error) {
            console.error('Failed to promote corrected transcript', error);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('aimana-notification', {
                    detail: {
                        type: 'error',
                        title: 'Transcript Promotion Failed',
                        message: 'Could not promote the corrected transcript.',
                        source: 'transcription-stage'
                    }
                }));
            }
        } finally {
            setIsPromotingTranscript(false);
        }
    }, [activeTranscript, onUpdateActiveTranscript, qaDetails.correctedTranscript, transcriptText]);

    const renderTranscriptCueList = useCallback((
        output: ReturnType<typeof buildTranscriptInspectionData>,
        keyPrefix: string,
        tone: 'default' | 'corrected' = 'default',
        syncTimelineId: 'transcript-main' | 'output-main' | null = null
    ) => {
        const wrapperClass = tone === 'corrected'
            ? 'border-emerald-500/20 bg-emerald-500/5'
            : 'border-slate-800/70 bg-slate-950/40';
        const timeClass = tone === 'corrected' ? 'text-emerald-200' : 'text-cyan-200';

        return (
            <div className="space-y-3">
                {output.segments.length > 0 ? output.segments.map((segment, index) => (
                    <div
                        key={`${keyPrefix}-${segment.id}-${segment.start}-${index}`}
                        ref={syncTimelineId ? (node) => registerTranscriptCueNode(syncTimelineId, index, node) : undefined}
                        className={`grid gap-3 rounded-[1.25rem] border p-4 md:grid-cols-[132px_minmax(0,1fr)] ${wrapperClass}`}
                    >
                        <div className="space-y-2">
                            <p
                                ref={syncTimelineId ? (node) => registerTranscriptCueTimeNode(syncTimelineId, index, node) : undefined}
                                className={`text-sm font-semibold ${timeClass}`}
                            >
                                {formatTranscriptClockTime(segment.start)}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                                {segment.speaker || `Cue ${index + 1}`}
                            </p>
                            <p className="text-[10px] text-slate-500">
                                to {formatTranscriptClockTime(segment.end)}
                            </p>
                        </div>
                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200">
                            {segment.text}
                        </p>
                    </div>
                )) : (
                    <div className={`rounded-[1.25rem] border p-4 ${wrapperClass}`}>
                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200">
                            {output.transcriptText || 'Transcript unavailable.'}
                        </p>
                    </div>
                )}
            </div>
        );
    }, [registerTranscriptCueNode, registerTranscriptCueTimeNode]);

    const handleSelectProjectAudio = async (itemIds: string[]) => {
        const selectedId = itemIds[0];
        if (!selectedId) return;

        try {
            const item = await api.items.get(selectedId);
            const revision = item?.currentRevision;
            const fileUrl = String(revision?.fileUrl || revision?.thumbnailLink || '').trim();
            if (!fileUrl) return;

            const sourceMime = String(revision?.mimeType || '').trim();
            const headers = api.auth.getAuthHeaders();
            let response = await fetch(fileUrl, { headers });
            if (!response.ok) response = await fetch(fileUrl);
            if (!response.ok) throw new Error(`Failed to fetch audio asset (${response.status})`);

            const blob = await response.blob();
            const mimeType = String(blob.type || sourceMime || 'audio/mpeg');
            const baseName = String(revision?.originalFilename || revision?.title || `audio-${selectedId}`).trim() || `audio-${selectedId}`;
            const hasExtension = /\.[a-z0-9]+$/i.test(baseName);
            const extension = extensionFromMimeType(mimeType);
            const fileName = hasExtension ? baseName : `${baseName}.${extension}`;
            const file = new File([blob], fileName, { type: mimeType });

            onSelectFile(file, { sourceItemId: selectedId });
            setIsAudioSelectorOpen(false);
        } catch (error) {
            console.error('Failed to load project audio asset', error);
        }
    };

    const renderParamControl = (param: DynamicParam) => {
        const currentValue = dynamicParams[param.key] ?? param.default ?? '';
        const isLanguageParam = param.key === 'language';

        if (param.type === 'select') {
            const options = Array.isArray(param.options) ? param.options : [];
            return (
                <div key={param.key} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">{param.label}</label>
                    <div className="relative">
                        {isLanguageParam && (
                            <Globe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        )}
                        <select
                            value={String(currentValue)}
                            onChange={(event) => onSetDynamicParam(param.key, event.target.value)}
                            className={`w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/50 appearance-none ${
                                isLanguageParam ? 'pl-10 pr-10' : 'px-4 pr-10'
                            }`}
                        >
                            {isLanguageParam && !options.some((option) => String(option.value) === '') && (
                                <option value="">Auto-Detect</option>
                            )}
                            {options.map((option) => (
                                <option key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    </div>
                    {param.description && <p className="text-xs text-slate-500">{param.description}</p>}
                </div>
            );
        }

        if (param.type === 'slider') {
            const min = Number.isFinite(param.min) ? Number(param.min) : 0;
            const max = Number.isFinite(param.max) ? Number(param.max) : 1;
            const step = Number.isFinite(param.step) ? Number(param.step) : 0.1;
            const safeValue = Number.isFinite(Number(currentValue))
                ? Number(currentValue)
                : Number(param.default ?? min);

            return (
                <div key={param.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">{param.label}</label>
                        <span className="text-xs font-semibold text-cyan-300">{safeValue}</span>
                    </div>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={safeValue}
                        onChange={(event) => onSetDynamicParam(param.key, Number(event.target.value))}
                        className="w-full accent-cyan-500"
                    />
                    {param.description && <p className="text-xs text-slate-500">{param.description}</p>}
                </div>
            );
        }

        if (param.type === 'toggle') {
            const enabled = Boolean(currentValue);
            return (
                <button
                    key={param.key}
                    type="button"
                    onClick={() => onSetDynamicParam(param.key, !enabled)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-left text-xs font-black uppercase tracking-[0.2em] transition-colors ${
                        enabled
                            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                            : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                >
                    <span className="flex items-center justify-between">
                        <span>{param.label}</span>
                        <span>{enabled ? 'On' : 'Off'}</span>
                    </span>
                    {param.description && <span className="mt-2 block text-[11px] font-medium uppercase tracking-normal text-slate-500">{param.description}</span>}
                </button>
            );
        }

        if (param.type === 'textarea') {
            return (
                <div key={param.key} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">{param.label}</label>
                    <textarea
                        value={String(currentValue)}
                        onChange={(event) => onSetDynamicParam(param.key, event.target.value)}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/50"
                    />
                    {param.description && <p className="text-xs text-slate-500">{param.description}</p>}
                </div>
            );
        }

        return (
            <div key={param.key} className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">{param.label}</label>
                <div className="relative">
                    {isLanguageParam && (
                        <Globe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    )}
                    <input
                        type="text"
                        value={String(currentValue)}
                        onChange={(event) => onSetDynamicParam(param.key, event.target.value)}
                        placeholder={isLanguageParam ? 'Auto-Detect' : ''}
                        className={`w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/50 ${
                            isLanguageParam ? 'pl-10 pr-3' : 'px-4'
                        }`}
                    />
                </div>
                {param.description && <p className="text-xs text-slate-500">{param.description}</p>}
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_0.9fr] xl:items-start">
                <div className="space-y-6">
                <section className="self-start rounded-[2rem] border border-slate-800/80 bg-slate-950/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_65%)] pointer-events-none" />
                    <div
                        className={`relative z-10 flex min-h-[96px] flex-col items-center justify-center w-full border-2 border-dashed rounded-2xl p-3 text-center transition-all cursor-pointer ${
                            isDragging
                                ? 'border-cyan-500/70 bg-slate-900/50'
                                : 'border-slate-700 bg-slate-900/30 hover:border-cyan-500/50 hover:bg-slate-900/50'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={(event) => {
                            event.preventDefault();
                            setIsDragging(false);
                        }}
                        onDrop={handleDrop}
                    >
                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mb-2 transition-colors">
                            <UploadCloud className="w-5 h-5 text-slate-400" />
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1">Upload Audio File</h3>
                        <p className="text-[11px] text-slate-400 mb-3 max-w-[240px]">
                            Drag and drop your audio file here, or click to browse. Supports MP3, WAV, M4A, WEBM, OGG, and FLAC.
                        </p>
                        <div className="flex items-center gap-3 w-full max-w-[180px] mb-3">
                            <div className="h-px bg-slate-800 flex-1" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">OR</span>
                            <div className="h-px bg-slate-800 flex-1" />
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold transition-all shadow-lg shadow-black/20"
                            >
                                {selectedFile ? 'Replace Audio File' : 'Browse Audio File'}
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setIsAudioSelectorOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-xs font-bold transition-all hover:bg-cyan-500/20 hover:text-white"
                            >
                                <FolderOpen size={12} />
                                Browse Projects
                            </button>
                        </div>
                        {selectedFile && (
                            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                                <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                                <span className="text-slate-600">|</span>
                                <span>{selectedAudioFormat.toUpperCase()}</span>
                                <span className="text-slate-600">|</span>
                                <span>{formatBytes(selectedFile.size)}</span>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onClearFile();
                                    }}
                                    className="px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:text-white"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (isAcceptedAudioFile(file)) onSelectFile(file);
                                event.target.value = '';
                            }}
                        />
                    </div>

                        {previewUrl && (
                            <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-4">
                                <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
                                    <span className="flex items-center gap-2 text-cyan-300">
                                        <AudioLines size={12} />
                                        Source Audio
                                    </span>
                                </div>
                                <audio
                                    src={previewUrl}
                                    controls
                                    onLoadedMetadata={handlePreviewAudioLoadedMetadata}
                                    onPlay={handlePreviewAudioPlay}
                                    onTimeUpdate={handlePreviewAudioProgress}
                                    onSeeked={handlePreviewAudioProgress}
                                    onPause={handlePreviewAudioPause}
                                    onEnded={handlePreviewAudioEnded}
                                    className="w-full"
                                />
                            </div>
                        )}
                </section>

                <section className="xl:col-start-1 overflow-hidden rounded-[2rem] border border-slate-800/80 bg-slate-950/80 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/40 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                            <FileText size={18} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-white">
                                {selectedFile?.name || title || 'Transcript Output'}
                            </h3>
                            <p className="text-[10px] font-mono text-slate-400">
                                {activeTranscript
                                    ? `Ready | ${String(activeTranscript.modelLabel || modelLabel)}`
                                    : isGenerating
                                        ? 'Processing source audio...'
                                        : 'Upload audio to begin'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
                            <button
                                type="button"
                                onClick={() => setActiveTab('transcript')}
                                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                                    activeTab === 'transcript' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Transcript
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('output')}
                                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                                    activeTab === 'output' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Output
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('summary')}
                                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                                    activeTab === 'summary' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                Summary
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyTranscript}
                            disabled={!transcriptText}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            title="Copy transcript"
                        >
                            <Copy size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadTranscript}
                            disabled={!transcriptText}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            title="Download transcript"
                        >
                            <Download size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={onSaveTranscriptToArchive}
                            disabled={!transcriptText || !onSaveTranscriptToArchive || isSavingTranscriptToArchive || isTranscriptSaved}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.2em] transition-colors ${
                                isTranscriptSaved
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
                            }`}
                            title={isTranscriptSaved ? 'Transcript already saved to Neural Saved' : 'Save transcript to Neural Saved'}
                        >
                            {isSavingTranscriptToArchive ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {isTranscriptSaved ? 'Saved' : 'Save Transcript'}
                        </button>
                    </div>
                </div>

                <div className="min-h-[380px] bg-slate-900/20 p-6">
                    <div className="mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-xs">
                        <span className="font-black uppercase tracking-[0.2em] text-slate-500">Stage Status</span>
                        <span className={isTranscriptSaved ? 'text-emerald-300' : 'text-cyan-200'}>
                            {isTranscriptSaved ? 'Saved to Neural Saved' : 'Local transcript on stage only'}
                        </span>
                    </div>
                    {isGenerating ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                            <Loader2 size={36} className="animate-spin text-cyan-400" />
                            <div>
                                <p className="text-sm font-black uppercase tracking-[0.28em] text-white">Transcription in Progress</p>
                                <p className="mt-2 text-sm text-slate-400">{`${modelLabel} is processing the uploaded source audio.`}</p>
                            </div>
                        </div>
                    ) : transcriptText ? (
                        activeTab === 'transcript' ? (
                            <div className="mx-auto max-w-4xl space-y-5">
                                {(canPromoteCorrectedTranscript || transcriptHistoryText) && (
                                    <div className={`rounded-[1.5rem] border p-5 ${
                                        canPromoteCorrectedTranscript
                                            ? 'border-emerald-500/25 bg-emerald-500/5'
                                            : 'border-amber-500/20 bg-amber-500/5'
                                    }`}>
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div className="space-y-2">
                                                <h4 className={`text-[10px] font-black uppercase tracking-[0.28em] ${
                                                    canPromoteCorrectedTranscript ? 'text-emerald-200' : 'text-amber-200'
                                                }`}>
                                                    {canPromoteCorrectedTranscript ? 'Corrected Transcript Ready' : 'Transcript History Retained'}
                                                </h4>
                                                <p className="text-sm leading-relaxed text-slate-300">
                                                    {canPromoteCorrectedTranscript
                                                        ? 'The QA checker found a corrected transcript. You can promote it as the main transcript here and keep the previous version below as history.'
                                                        : 'This transcript was already promoted. The previous transcript version is preserved below for reference.'}
                                                </p>
                                            </div>
                                            {canPromoteCorrectedTranscript && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void handlePromoteCorrectedTranscript();
                                                    }}
                                                    disabled={isPromotingTranscript}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {isPromotingTranscript ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                                    Promote as Main Transcript
                                                </button>
                                            )}
                                        </div>
                                        {canPromoteCorrectedTranscript && (
                                            <div className="mt-4 max-h-48 overflow-y-auto rounded-[1.25rem] border border-slate-800/70 bg-slate-950/50 p-4 custom-scrollbar">
                                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Corrected Transcript Preview</p>
                                                <div className="mt-3">
                                                    {renderTranscriptCueList(correctedTranscriptOutput, 'corrected-preview', 'corrected')}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {renderTranscriptCueList(transcriptOutput, 'transcript-main', 'default', 'transcript-main')}
                                {transcriptHistoryText && transcriptHistoryText !== transcriptText && (
                                    <div className="rounded-[1.5rem] border border-amber-500/20 bg-amber-500/5 p-5">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">Transcript History</h4>
                                        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-amber-200/70">
                                            Previous transcript retained before promotion
                                        </p>
                                        <div className="mt-4 max-h-72 overflow-y-auto rounded-[1.25rem] border border-slate-800/70 bg-slate-950/50 p-4 custom-scrollbar">
                                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                                                {transcriptHistoryText}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'output' ? (
                            <div className="mx-auto max-w-5xl space-y-5">
                                <div className="grid gap-4 md:grid-cols-4">
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Output Format</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{selectedResponseFormat.toUpperCase()}</p>
                                    </div>
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Cues</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{transcriptSegments.length || 'N/A'}</p>
                                    </div>
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Timing</p>
                                        <p className="mt-2 text-sm font-semibold text-white">
                                            {transcriptOutput.hasNativeSegments ? 'Native timestamps' : 'Estimated timestamps'}
                                        </p>
                                    </div>
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">QA Status</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{outputQaStatus}</p>
                                    </div>
                                </div>

                                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_320px]">
                                    <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/40 p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 pb-4">
                                            <div>
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Transcript Output</h4>
                                                <p className="mt-2 text-sm text-slate-400">
                                                    {transcriptOutput.hasNativeSegments
                                                        ? 'Using transcript timestamps returned by the transcription engine.'
                                                        : 'Using estimated cue timing so this transcript can still be reviewed in a timestamped layout.'}
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">
                                                {transcriptSpeakerCount > 0 ? `${transcriptSpeakerCount} speaker${transcriptSpeakerCount === 1 ? '' : 's'}` : 'Single stream'}
                                            </span>
                                        </div>
                                        <div className="mt-5">
                                            {renderTranscriptCueList(transcriptOutput, 'output-main', 'default', 'output-main')}
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        {previewUrl && (
                                            <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Source Audio</p>
                                                <audio
                                                    src={previewUrl}
                                                    controls
                                                    onLoadedMetadata={handlePreviewAudioLoadedMetadata}
                                                    onPlay={handlePreviewAudioPlay}
                                                    onTimeUpdate={handlePreviewAudioProgress}
                                                    onSeeked={handlePreviewAudioProgress}
                                                    onPause={handlePreviewAudioPause}
                                                    onEnded={handlePreviewAudioEnded}
                                                    className="mt-4 w-full"
                                                />
                                            </div>
                                        )}
                                        <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Output Notes</p>
                                            <div className="mt-4 space-y-3 text-sm text-slate-300">
                                                <p>QA details stay available in the `Summary` tab.</p>
                                                <p>{transcriptOutput.hasNativeSegments ? 'This output is using exact segment timing.' : 'This output is using generated timing cues for readability.'}</p>
                                                <p>{rawTranscript.trim().startsWith('{') ? 'Raw response includes structured transcript data.' : 'Raw response is plain transcript text.'}</p>
                                            </div>
                                        </div>
                                        <details className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                                                Raw Output
                                            </summary>
                                            <pre className="mt-4 whitespace-pre-wrap text-xs leading-6 text-slate-300">
                                                {rawTranscript || transcriptText}
                                            </pre>
                                        </details>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mx-auto max-w-3xl space-y-4">
                                <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/40 p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Session Summary</h4>
                                        <span className="text-[10px] font-mono text-slate-500">
                                            Model: {summaryEnabled ? summaryModelLabel : (persistedSummaryModelLabel || 'Disabled')}
                                        </span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {isSummaryLoading ? (
                                            <div className="flex items-center gap-2 text-sm text-cyan-200">
                                                <Loader2 size={14} className="animate-spin" />
                                                Generating AI summary...
                                            </div>
                                        ) : summaryLines.length > 0 ? (
                                            summaryLines.map((line, index) => (
                                                <p key={`${index}-${line.slice(0, 12)}`} className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
                                                    {line}
                                                </p>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-400">Summary is waiting for transcript content.</p>
                                        )}
                                        {summaryError && (
                                            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                                {summaryError}
                                            </p>
                                        )}
                                        {!summaryEnabled && (
                                            <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                                                {persistedPostProcess.summaryText
                                                    ? 'AI summary is off. Showing the saved summary from this transcript.'
                                                    : 'AI summary is off. Showing transcript-based fallback summary.'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {(qaCheckerEnabled || qaLines.length > 0) && (
                                    <div className="rounded-[1.5rem] border border-slate-800/70 bg-slate-950/40 p-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Transcript QA Checker</h4>
                                            <span className="text-[10px] font-mono text-slate-500">
                                                Model: {qaCheckerEnabled ? qaModelLabel : (persistedQaModelLabel || 'Saved')}
                                            </span>
                                        </div>
                                        <div className="mt-4 space-y-3">
                                            {isQaLoading ? (
                                                <div className="flex items-center gap-2 text-sm text-cyan-200">
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Validating transcript against source audio...
                                                </div>
                                            ) : qaLines.length > 0 ? (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        {qaDetails.verdict && (
                                                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${
                                                                qaDetails.hasCorrections
                                                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                                            }`}>
                                                                Verdict: {qaDetails.verdict}
                                                            </span>
                                                        )}
                                                        {qaDetails.confidence && (
                                                            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-300">
                                                                Confidence: {qaDetails.confidence}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {qaRedlineEdits.length > 0 && (
                                                        <div className="rounded-[1.25rem] border border-amber-500/20 bg-amber-500/5 p-4">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <h5 className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">Redline Edits</h5>
                                                                <span className="text-[10px] font-mono text-amber-300/80">
                                                                    {qaRedlineEdits.length} change{qaRedlineEdits.length === 1 ? '' : 's'}
                                                                </span>
                                                            </div>
                                                            <div className="mt-4 space-y-3">
                                                                {qaRedlineEdits.map((edit, index) => (
                                                                    <div key={`${index}-${edit.from}-${edit.to}`} className="rounded-xl border border-white/5 bg-black/20 p-3">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Edit {index + 1}</p>
                                                                        <div className="mt-3 space-y-2">
                                                                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm leading-relaxed text-rose-100 line-through decoration-rose-300/80 whitespace-pre-wrap">
                                                                                {edit.from || 'No original text captured.'}
                                                                            </div>
                                                                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-100 whitespace-pre-wrap">
                                                                                {edit.to || 'No replacement text captured.'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {qaDetails.correctedTranscript && (
                                                        <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-900/50 p-4">
                                                            <h5 className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Corrected Transcript</h5>
                                                            <div className="mt-3">
                                                                {renderTranscriptCueList(correctedTranscriptOutput, 'corrected-summary', 'corrected')}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {(qaDetails.issues.length > 0 || qaDetails.changeNotes.length > 0) && (
                                                        <div className="grid gap-4 md:grid-cols-2">
                                                            {qaDetails.issues.length > 0 && (
                                                                <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-900/40 p-4">
                                                                    <h5 className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Detected Issues</h5>
                                                                    <div className="mt-3 space-y-2">
                                                                        {qaDetails.issues.map((line, index) => (
                                                                            <p key={`${index}-${line.slice(0, 12)}`} className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
                                                                                {line}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {qaDetails.changeNotes.length > 0 && (
                                                                <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-900/40 p-4">
                                                                    <h5 className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Change Notes</h5>
                                                                    <div className="mt-3 space-y-2">
                                                                        {qaDetails.changeNotes.map((line, index) => (
                                                                            <p key={`${index}-${line.slice(0, 12)}`} className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
                                                                                {line}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <details className="rounded-[1.25rem] border border-slate-800/70 bg-black/20 p-4">
                                                        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                                                            Raw QA Report
                                                        </summary>
                                                        <div className="mt-4 space-y-3">
                                                            {qaLines.map((line, index) => (
                                                                <p key={`${index}-${line.slice(0, 12)}`} className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
                                                                    {line}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    </details>
                                                </>
                                            ) : (
                                                <p className="text-sm text-slate-400">QA report will appear after the checker runs.</p>
                                            )}
                                            {qaError && (
                                                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                                    {qaError}
                                                </p>
                                            )}
                                            {!qaCheckerEnabled && persistedPostProcess.qaReport && (
                                                <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                                                    QA checker is off. Showing the saved QA report from this transcript.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Words</p>
                                        <p className="mt-2 text-2xl font-semibold text-white">
                                            {transcriptText.split(/\s+/).filter(Boolean).length}
                                        </p>
                                    </div>
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Model</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{activeTranscript?.modelLabel || modelLabel}</p>
                                    </div>
                                    <div className="rounded-[1.25rem] border border-slate-800/70 bg-slate-950/40 p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Hint</p>
                                        <p className="mt-2 text-sm font-semibold text-white">{prompt.trim() ? 'Provided' : 'None'}</p>
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center opacity-70">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-dashed border-slate-700 bg-slate-950/40 text-slate-500">
                                <FileText size={30} />
                            </div>
                            <div>
                                <p className="text-sm font-black uppercase tracking-[0.28em] text-white">Transcript Output Idle</p>
                                <p className="mt-2 max-w-md text-sm text-slate-400">The full transcript will appear here after you upload a source audio file and run transcription.</p>
                            </div>
                        </div>
                    )}
                </div>

                {previewUrl && (
                    <div className="flex items-center gap-4 border-t border-slate-800 bg-slate-900 px-4 py-4">
                        <button
                            type="button"
                            onClick={() => {
                                const audio = document.getElementById('transcription-preview-audio') as HTMLAudioElement | null;
                                if (!audio) return;
                                if (audio.paused) {
                                    audio.play().catch(() => {});
                                } else {
                                    audio.pause();
                                }
                            }}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500/20"
                        >
                            <Mic size={18} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-200">{selectedFile?.name}</p>
                            <p className="text-[10px] font-mono text-slate-500">{copied ? 'Transcript copied to clipboard' : 'Source audio preview'}</p>
                        </div>
                        <audio
                            id="transcription-preview-audio"
                            src={previewUrl}
                            preload="metadata"
                            controls
                            onLoadedMetadata={handlePreviewAudioLoadedMetadata}
                            onPlay={handlePreviewAudioPlay}
                            onTimeUpdate={handlePreviewAudioProgress}
                            onSeeked={handlePreviewAudioProgress}
                            onPause={handlePreviewAudioPause}
                            onEnded={handlePreviewAudioEnded}
                            className="max-w-[320px] flex-1"
                        />
                    </div>
                )}
                </section>
                </div>

                <aside className="rounded-[2rem] border border-slate-800/80 bg-slate-950/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                    <div className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-200">
                        <AudioLines size={16} className="text-cyan-400" />
                        Transcription Settings
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Model</label>
                            <button
                                type="button"
                                onClick={onOpenModelSelector}
                                className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 transition-colors hover:border-slate-600"
                            >
                                <span className="flex items-center gap-2">
                                    <Cpu size={16} className="text-slate-400" />
                                    {modelLabel}
                                </span>
                                <ChevronDown className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {transcriptionParams.map((param) => renderParamControl(param))}
                        </div>
                        {diarizationEnabled && (
                            <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-100">
                                {selectedResponseFormat === 'text'
                                    ? 'Speaker diarization is on. A structured JSON response will still be used internally so speaker labels and timing metadata are preserved in the preview.'
                                    : 'Speaker diarization is on. Speaker labels will appear in the transcript preview when the model returns them.'}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => onSetDynamicParam(SUMMARY_ENABLED_PARAM_KEY, !summaryEnabled)}
                            className={`w-full rounded-xl border px-4 py-2.5 text-left text-xs font-black uppercase tracking-[0.2em] transition-colors ${
                                summaryEnabled
                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                                    : 'border-slate-700 bg-slate-900 text-slate-400'
                            }`}
                        >
                            <span className="flex items-center justify-between">
                                <span>AI Summary</span>
                                <span>{summaryEnabled ? 'On' : 'Off'}</span>
                            </span>
                            <span className="mt-2 block text-[11px] font-medium uppercase tracking-normal text-slate-500">
                                Turn off if you only want transcript-based fallback summary lines.
                            </span>
                        </button>

                        {summaryEnabled && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Summary Model</label>
                                <div className="relative">
                                    <select
                                        value={selectedSummaryModelId}
                                        onChange={(event) => onSetDynamicParam(SUMMARY_MODEL_PARAM_KEY, event.target.value)}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 pr-10 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/50 appearance-none"
                                    >
                                        {availableSummaryModels.map((model) => (
                                            <option key={model.id} value={model.id}>
                                                {model.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                </div>
                                <p className="text-xs text-slate-500">
                                    Uses GPT-5 Mini by default to generate a transcript summary after each transcription run.
                                    {isLoadingLanguageModels ? ' Refreshing model list...' : ''}
                                </p>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => onSetDynamicParam(QA_ENABLED_PARAM_KEY, !qaCheckerEnabled)}
                            className={`w-full rounded-xl border px-4 py-2.5 text-left text-xs font-black uppercase tracking-[0.2em] transition-colors ${
                                qaCheckerEnabled
                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                                    : 'border-slate-700 bg-slate-900 text-slate-400'
                            }`}
                        >
                            <span className="flex items-center justify-between">
                                <span>Transcript QA Checker</span>
                                <span>{qaCheckerEnabled ? 'On' : 'Off'}</span>
                            </span>
                            <span className="mt-2 block text-[11px] font-medium uppercase tracking-normal text-slate-500">
                                Runs a second AI pass to validate transcript accuracy against source audio.
                            </span>
                        </button>

                        {qaCheckerEnabled && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">QA Checker Model</label>
                                <div className="relative">
                                    <select
                                        value={selectedQaModelId}
                                        onChange={(event) => onSetDynamicParam(QA_MODEL_PARAM_KEY, event.target.value)}
                                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 pr-10 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/50 appearance-none"
                                    >
                                        {availableQaModels.map((model) => (
                                            <option key={model.id} value={model.id}>
                                                {model.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                </div>
                                <p className="text-xs text-slate-500">Audio-capable models are prioritized here for transcript verification quality.</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Prompt Hint</label>
                            <textarea
                                value={prompt}
                                onChange={(event) => onSetPrompt(event.target.value)}
                                rows={5}
                                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-cyan-500/50"
                                placeholder="Optional hint for names, acronyms, or domain terms."
                            />
                            <p className="text-xs text-slate-500">Leave this empty if you just want a plain transcript from the uploaded audio.</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGenerateAndOpenSummary}
                        disabled={isGenerateDisabled}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 text-sm font-black text-white transition-all hover:from-cyan-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                        {isGenerating ? 'Transcribing...' : 'Transcribe Audio'}
                    </button>
                </aside>
            </div>
            <ArtifactSelectorModal
                isOpen={isAudioSelectorOpen}
                onClose={() => setIsAudioSelectorOpen(false)}
                onSelect={handleSelectProjectAudio}
                ingestContext="transcription"
                mediaType="audio"
            />
        </div>
    );
};
