import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GeneratedImageResult } from '../../../services/geminiService';
import { LabSidebar, RATIO_CONFIG } from './LabSidebar';
import { LabPreview } from './LabPreview';
import { LabHeader } from './LabHeader';
import { SupportedEngine, ModelOption, ModelSelectorModal, ModelCategory } from './ModelSelectorModal';
import { loadDynamicRegistry } from './ModelSelector/registry/index';
import { useLabState } from '../../../hooks/useLabState';
import { saveArtifactToArchive, useAiGeneration, STAGE_LABELS, LabTask } from '../../../hooks/useAiGeneration';
import { getResolvedDimensions } from '../../../services/pollinationsService';
import { Revision, ItemWithCurrentRevision } from '../../../types';
import { ArtifactInspector } from './workspace/ArtifactInspector';
import { api } from '../../../services/api';
import { GitMerge, Loader2, AudioLines, Music2, FileAudio } from 'lucide-react';
import { isMusicAudioModel, isSpeechSynthesisModel, isTranscriptionAudioModel } from './ModelSelector/audioModelUtils';
import { extractPollenUsed, formatPollenAmount, getPrimaryModelCreditRate } from '../../../utils/pollenCredits';
import { clearPollenCreditContext, dispatchPollenCreditContext } from '../../../utils/pollenCreditChannel';
import {
  extractGoogleEstimatedCostUsd,
  extractGoogleUsage,
  formatGoogleUsd,
  getPrimaryGoogleApiRate,
  summarizeGoogleUsage
} from '../../../utils/googleCredits';
import { extractTranscriptionManifestDetails, isTranscriptPostProcessPending } from '../../../utils/transcriptionManifest';

// Sub-modals for expanded logic
import { LoraSelectorModal } from './LoraSelectorModal';
import { EmbeddingSelectorModal } from './EmbeddingSelectorModal';
import { ControlNetSelectorModal } from './ControlNetSelectorModal';

export type LabMode = 'image' | 'video' | 'audio' | 'music' | 'transcribe' | 'text';

const MODEL_CACHE_KEY_BY_MODE: Record<LabMode, string> = {
  image: 'aimana_lab_model_image',
  video: 'aimana_lab_model_video',
  audio: 'aimana_lab_model_audio_generation',
  music: 'aimana_lab_model_music_generation',
  transcribe: 'aimana_lab_model_transcription',
  text: 'aimana_lab_model_text'
};
const IMAGE_PROMPT_CACHE_KEY = 'aimana_lab_prompt_image_generation';
const VIDEO_PROMPT_CACHE_KEY = 'aimana_lab_prompt_video_generation';
const AUDIO_PROMPT_CACHE_KEY = 'aimana_lab_prompt_audio_generation';
const MUSIC_PROMPT_CACHE_KEY = 'aimana_lab_prompt_music_generation';

const getTargetCategoryForMode = (mode: LabMode): ModelCategory => (
  mode === 'image' ? 'Visual'
    : mode === 'video' ? 'Motion'
      : mode === 'audio' || mode === 'music' || mode === 'transcribe' ? 'Audio'
        : 'Language'
);

const isModelCompatibleWithMode = (model: ModelOption | undefined, mode: LabMode): boolean => {
  if (!model) return false;
  if (model.category !== getTargetCategoryForMode(mode)) return false;
  if (mode === 'audio') return isSpeechSynthesisModel(model);
  if (mode === 'music') return isMusicAudioModel(model);
  if (mode === 'transcribe') return isTranscriptionAudioModel(model);
  return true;
};

const readModeScopedModel = (mode: LabMode): SupportedEngine | null => {
  try {
    const cached = localStorage.getItem(MODEL_CACHE_KEY_BY_MODE[mode]);
    return cached ? (cached as SupportedEngine) : null;
  } catch {
    return null;
  }
};

const writeModeScopedModel = (mode: LabMode, modelId: SupportedEngine) => {
  try {
    localStorage.setItem(MODEL_CACHE_KEY_BY_MODE[mode], String(modelId));
  } catch {
    // ignore storage errors in private/sandboxed contexts
  }
};

const readMusicPromptCache = (): string => {
  try {
    return String(localStorage.getItem(MUSIC_PROMPT_CACHE_KEY) || '');
  } catch {
    return '';
  }
};

const writeMusicPromptCache = (prompt: string) => {
  try {
    localStorage.setItem(MUSIC_PROMPT_CACHE_KEY, String(prompt || ''));
  } catch {
    // ignore storage errors in private/sandboxed contexts
  }
};

const readImagePromptCache = (): string => {
  try {
    return String(localStorage.getItem(IMAGE_PROMPT_CACHE_KEY) || '');
  } catch {
    return '';
  }
};

const writeImagePromptCache = (prompt: string) => {
  try {
    localStorage.setItem(IMAGE_PROMPT_CACHE_KEY, String(prompt || ''));
  } catch {
    // ignore storage errors in private/sandboxed contexts
  }
};

const readVideoPromptCache = (): string => {
  try {
    return String(localStorage.getItem(VIDEO_PROMPT_CACHE_KEY) || '');
  } catch {
    return '';
  }
};

const writeVideoPromptCache = (prompt: string) => {
  try {
    localStorage.setItem(VIDEO_PROMPT_CACHE_KEY, String(prompt || ''));
  } catch {
    // ignore storage errors in private/sandboxed contexts
  }
};

const readAudioPromptCache = (): string => {
  try {
    return String(localStorage.getItem(AUDIO_PROMPT_CACHE_KEY) || '');
  } catch {
    return '';
  }
};

const writeAudioPromptCache = (prompt: string) => {
  try {
    localStorage.setItem(AUDIO_PROMPT_CACHE_KEY, String(prompt || ''));
  } catch {
    // ignore storage errors in private/sandboxed contexts
  }
};

const isTranscriptionArchiveRevision = (revision: ItemWithCurrentRevision['currentRevision']) => {
  if (!revision) return false;

  const mimeType = String(revision.mimeType || '').toLowerCase();
  const promptText = String(revision.prompt || '').trim();
  if (mimeType.startsWith('text/') && promptText.length > 0) return true;

  try {
    const parsed = revision.aiParameters ? JSON.parse(revision.aiParameters) : {};
    const advanced = parsed?.advanced_params || parsed || {};
    const post = (advanced?.transcriptionPostProcess && typeof advanced.transcriptionPostProcess === 'object')
      ? advanced.transcriptionPostProcess
      : ((parsed?.transcriptionPostProcess && typeof parsed.transcriptionPostProcess === 'object')
        ? parsed.transcriptionPostProcess
        : {});
    const transcriptionHint = String(advanced?.transcriptionHint || parsed?.transcriptionHint || '').trim();
    const postSummary = String(post?.summaryText || post?.summary || '').trim();
    return !!(
      advanced?.isTranscription === true
      || parsed?.isTranscription === true
      || transcriptionHint
      || postSummary
    );
  } catch (_error) {
    return false;
  }
};

const isMusicArchiveRevision = (revision: ItemWithCurrentRevision['currentRevision']) => {
  if (!revision) return false;
  const mimeType = String(revision.mimeType || '').toLowerCase();
  if (!mimeType.startsWith('audio/')) return false;

  const title = String(revision.title || '').trim().toLowerCase();
  if (title.startsWith('track:')) return true;

  try {
    const parsed = revision.aiParameters ? JSON.parse(revision.aiParameters) : {};
    const advanced = parsed?.advanced_params || parsed || {};
    return advanced?.isMusicGeneration === true || parsed?.isMusicGeneration === true;
  } catch (_error) {
    return false;
  }
};

const matchesArchiveMode = (revision: ItemWithCurrentRevision['currentRevision'], mode: LabMode) => {
  if (!revision) return false;
  const mimeType = String(revision.mimeType || '').toLowerCase();

  if (mode === 'transcribe') return isTranscriptionArchiveRevision(revision);
  if (mode === 'music') return isMusicArchiveRevision(revision);
  if (mode === 'audio') return mimeType.startsWith('audio/');
  if (mode === 'video') return mimeType.startsWith('video/');
  if (mode === 'text') return mimeType.startsWith('text/');
  if (mode === 'image') return mimeType.startsWith('image/');
  return true;
};

const isItemArchivedFlag = (value: unknown): boolean => (
  value === true || value === 1 || value === '1'
);

const shouldKeepArchivedTranscriptionVisible = (item: ItemWithCurrentRevision): boolean => {
  const revision = item.currentRevision;
  if (!revision) return false;

  const details = extractTranscriptionManifestDetails({
    aiParameters: revision.aiParameters || null
  });
  if (!details.isTranscription) return false;
  if (!isTranscriptPostProcessPending(details)) return false;

  const hasTranscriptText = String(revision.prompt || '').trim().length > 0;
  return !hasTranscriptText;
};

interface GenerateImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAsAsset: (result: GeneratedImageResult, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => Promise<void>;
  onBulkAddAsAssets?: (captures: any[]) => Promise<void>;
  initialModel?: SupportedEngine;
  mode?: LabMode;
  onModeChange?: (nextMode: LabMode) => void;
  remixRevision?: Revision | null;
  isPodcast?: boolean;
  onBack?: () => void;
  backLabel?: string;
}

const GenerateImageModal: React.FC<GenerateImageModalProps> = ({ isOpen, onClose, onAddAsAsset, onBulkAddAsAssets, initialModel, mode = 'image', onModeChange, remixRevision: externalRemixRevision, isPodcast, onBack, backLabel }) => {
  const MAX_HISTORY_ITEMS = 80;
  const labState = useLabState(initialModel);
  const { generate, isGenerating, tasks, updateTask, removeTask, stage, result, error, reset } = useAiGeneration();
  
  // UI Logic States
  const [isSaving, setIsSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [isMergingReferences, setIsMergingReferences] = useState(false);
  const [isSavingTranscriptToArchive, setIsSavingTranscriptToArchive] = useState(false);
  const [isRecyclingArchiveManifest, setIsRecyclingArchiveManifest] = useState(false);
  const [pendingDeleteArchiveItemIds, setPendingDeleteArchiveItemIds] = useState<string[]>([]);
  const [pendingDeleteArchiveTaskIds, setPendingDeleteArchiveTaskIds] = useState<string[]>([]);
  const [registry, setRegistry] = useState<ModelOption[]>([]);
  const [inspectedTask, setInspectedTask] = useState<LabTask | null>(null);
  const [activeTranscriptPreviewTask, setActiveTranscriptPreviewTask] = useState<LabTask | null>(null);
  const [internalRemixRevision, setInternalRemixRevision] = useState<Revision | null>(null);
  const captureMessageTimerRef = useRef<number | null>(null);
  
  // Sub-modal Visibility States
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isLoraSelectorOpen, setIsLoraSelectorOpen] = useState(false);
  const [isEmbeddingSelectorOpen, setIsEmbeddingSelectorOpen] = useState(false);
  const [isControlNetSelectorOpen, setIsControlNetSelectorOpen] = useState(false);
  const [transcriptionFile, setTranscriptionFile] = useState<File | null>(null);
  const [transcriptionSourceItemId, setTranscriptionSourceItemId] = useState<string | null>(null);
  const [audioReferenceItemId, setAudioReferenceItemId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcriptionSelectionNonce, setTranscriptionSelectionNonce] = useState(0);

  // Neural History (Unassigned Manifests)
  const [historyItems, setHistoryItems] = useState<ItemWithCurrentRevision[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const discardRecordingRef = useRef(false);
  const [activeMode, setActiveMode] = useState<LabMode>(mode);

  const activeRemixRevision = externalRemixRevision || internalRemixRevision;
  const isTranscriptionMode = activeMode === 'transcribe';

  useEffect(() => {
    setActiveMode(mode);
    if (mode !== 'transcribe') {
      setActiveTranscriptPreviewTask(null);
    }
    if (mode !== 'audio' && mode !== 'music') {
      setAudioReferenceItemId(null);
    }
  }, [mode]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'transcribe') return;
    labState.setPrompt('');
  }, [activeMode, isOpen, labState.setPrompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'music') return;
    labState.setPrompt(readMusicPromptCache());
  }, [activeMode, isOpen, labState.setPrompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'music') return;
    writeMusicPromptCache(labState.prompt);
  }, [activeMode, isOpen, labState.prompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'audio') return;
    labState.setPrompt(readAudioPromptCache());
  }, [activeMode, isOpen, labState.setPrompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'audio') return;
    writeAudioPromptCache(labState.prompt);
  }, [activeMode, isOpen, labState.prompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'image') return;
    labState.setPrompt(readImagePromptCache());
  }, [activeMode, isOpen, labState.setPrompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'image') return;
    writeImagePromptCache(labState.prompt);
  }, [activeMode, isOpen, labState.prompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'video') return;
    labState.setPrompt(readVideoPromptCache());
  }, [activeMode, isOpen, labState.setPrompt]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeMode !== 'video') return;
    writeVideoPromptCache(labState.prompt);
  }, [activeMode, isOpen, labState.prompt]);

  const handleAudioModeChange = useCallback((nextMode: 'audio' | 'music' | 'transcribe') => {
    if (nextMode === activeMode) return;
    if (nextMode !== 'transcribe') {
      setActiveTranscriptPreviewTask(null);
    }
    if (nextMode === 'transcribe') {
      setAudioReferenceItemId(null);
    }
    // When parent controls mode, prefer parent transition so each mode can mount as an isolated surface.
    if (onModeChange) {
      onModeChange(nextMode);
      return;
    }
    setActiveMode(nextMode);
  }, [activeMode, onModeChange]);

  const showCaptureMessage = useCallback((message: string) => {
    setCaptureMessage(message);
    if (captureMessageTimerRef.current) {
      window.clearTimeout(captureMessageTimerRef.current);
    }
    captureMessageTimerRef.current = window.setTimeout(() => {
      setCaptureMessage(null);
      captureMessageTimerRef.current = null;
    }, 3500);
  }, []);

  const handleRemixRevision = useCallback((revision?: Revision | null) => {
    if (!revision) return;
    setInternalRemixRevision(revision);
    const isAudioRevision = String(revision.mimeType || '').toLowerCase().startsWith('audio/');
    if (isAudioRevision) {
      const sourceItemId = typeof revision.itemId === 'string' && revision.itemId.trim()
        ? revision.itemId.trim()
        : null;
      setAudioReferenceItemId(sourceItemId);
      showCaptureMessage('Audio remix loaded into the content area.');
    } else {
      setAudioReferenceItemId(null);
    }
  }, [showCaptureMessage]);

  const cleanupRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      discardRecordingRef.current = true;
      recordingChunksRef.current = [];
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
    recordingChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const handleSelectTranscriptionFile = useCallback((file: File, options?: { sourceItemId?: string | null }) => {
    setActiveTranscriptPreviewTask(null);
    setTranscriptionFile(file);
    setTranscriptionSourceItemId(options?.sourceItemId || null);
    setTranscriptionSelectionNonce(Date.now());
    const suggestedTitle = file.name.replace(/\.[^.]+$/, '');
    labState.setTitle(suggestedTitle);
  }, [labState]);

  const handleClearTranscriptionFile = useCallback(() => {
    setActiveTranscriptPreviewTask(null);
    setTranscriptionFile(null);
    setTranscriptionSourceItemId(null);
    setTranscriptionSelectionNonce(Date.now());
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      discardRecordingRef.current = false;
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const chunks = recordingChunksRef.current;
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        if (!discardRecordingRef.current && blob.size > 0) {
          const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
          const file = new File([blob], `recording-${Date.now()}.${extension}`, { type: mimeType });
          handleSelectTranscriptionFile(file);
        }
        discardRecordingRef.current = false;
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        setIsRecording(false);
        setRecordingSeconds(0);
      });

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (_error) {
      showCaptureMessage('Microphone access was denied.');
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      recordingChunksRef.current = [];
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  }, [handleSelectTranscriptionFile]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const readFileAsDataUrl = useCallback((file: File) => (
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read source audio.'));
      reader.readAsDataURL(file);
    })
  ), []);

  const resolveAudioFormat = useCallback((file: File) => {
    const mime = String(file.type || '').toLowerCase();
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('m4a')) return 'm4a';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
    if (mime.includes('aac')) return 'aac';
    if (mime.includes('flac')) return 'flac';
    if (mime.includes('opus')) return 'opus';
    if (mime.includes('webm')) return 'webm';
    const fileName = String(file.name || '').toLowerCase();
    const fromName = fileName.split('.').pop();
    return fromName || 'mp3';
  }, []);

  const findPreferredAudioModel = useCallback((models: ModelOption[], nextMode: LabMode) => {
    if (nextMode === 'audio') {
      return models.find((m) => m.category === 'Audio' && isSpeechSynthesisModel(m));
    }
    if (nextMode === 'music') {
      return models.find((m) => m.category === 'Audio' && isMusicAudioModel(m));
    }
    if (nextMode === 'transcribe') {
      const transcriptionModels = models.filter((m) => m.category === 'Audio' && isTranscriptionAudioModel(m));
      return transcriptionModels.find((m) => {
        const marker = `${m.id} ${m.label} ${m.upstreamId || ''}`.toLowerCase();
        return marker.includes('whisper-large-v3') || marker.includes('scribe v2') || marker.includes('scribe-v2');
      }) || transcriptionModels[0];
    }
    return undefined;
  }, []);

  const fetchNeuralHistory = useCallback(async () => {
    try {
        const archive = await fetch('/api/projects/archive', { 
            headers: api.auth.getAuthHeaders()
        }).then(r => r.json());
        
        if (archive?.id) {
            const items = await api.items.list(archive.id, activeMode === 'transcribe');
            const sorted = items.sort((a, b) => b.createdAt - a.createdAt);
            const filtered: ItemWithCurrentRevision[] = [];
            const seenItemIds = new Set<string>();

            for (const item of sorted) {
                if (filtered.length >= MAX_HISTORY_ITEMS) break;
                const itemId = String(item?.id || '').trim();
                if (!itemId || itemId === '[object Object]' || seenItemIds.has(itemId)) continue;
                const rev = item.currentRevision;
                if (!rev) continue;
                if (isItemArchivedFlag((item as any).isArchived)) {
                    const canRecoverPendingTranscript = activeMode === 'transcribe' && shouldKeepArchivedTranscriptionVisible(item);
                    if (!canRecoverPendingTranscript) continue;
                }
                if (rev.engine === 'reference') continue;
                if (rev.secondaryFiles && rev.secondaryFiles.length > 0) continue;

                let shouldInclude = true;
                try {
                    const parsed = rev.aiParameters ? JSON.parse(rev.aiParameters) : {};
                    const adv = parsed.advanced_params || parsed;
                    const isAestheticLab = adv.source === 'aesthetic_lab' || parsed.source === 'aesthetic_lab';
                    const isMatrix = !!(adv.gridTopology || parsed.gridTopology || adv.matrixComposition === true || parsed.matrixComposition === true);
                    const label = (rev.label || '').trim().toLowerCase();
                    const isMatrixLabel = label === 'lab content mc';
                    const isRefTag = !!(
                        adv.isReference ||
                        adv.source === 'reference_upload' ||
                        adv.source === 'manifest_link' ||
                        (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
                    );
                    const isChild = !!adv.parentItemId;
                    const hasReferenceManifest = Array.isArray(adv.referenceItemIds) && adv.referenceItemIds.length > 0;
                    if (isAestheticLab || isMatrix || isMatrixLabel) shouldInclude = false;
                    if (isRefTag || isChild || hasReferenceManifest) shouldInclude = false;
                } catch (_e) {}

                if (shouldInclude && !matchesArchiveMode(rev, activeMode)) {
                    shouldInclude = false;
                }
                if (shouldInclude) {
                    filtered.push(item.id === itemId ? item : { ...item, id: itemId });
                    seenItemIds.add(itemId);
                }
            }

            setHistoryItems(filtered);
        }
    } catch (e) {
        console.warn("Lab failed to sync neural history archive.");
    }
  }, [MAX_HISTORY_ITEMS, activeMode]);

  useEffect(() => {
      if (!isOpen) return;
      loadDynamicRegistry().then(setRegistry);
      fetchNeuralHistory();
  }, [activeMode, fetchNeuralHistory, isOpen]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!isOpen) {
      cleanupRecorder();
      setTranscriptionFile(null);
    }
  }, [cleanupRecorder, isOpen]);

  useEffect(() => {
    return () => cleanupRecorder();
  }, [cleanupRecorder]);

  useEffect(() => {
    return () => {
      if (captureMessageTimerRef.current) {
        window.clearTimeout(captureMessageTimerRef.current);
      }
    };
  }, []);

  // Sync with background updates (e.g. from Auto-Save)
  useEffect(() => {
    const handleHistoryUpdate = () => {
      fetchNeuralHistory();
    };
    window.addEventListener('neural-history-updated', handleHistoryUpdate);
    return () => window.removeEventListener('neural-history-updated', handleHistoryUpdate);
  }, [fetchNeuralHistory]);

  // REMIX HYDRATION LOGIC
  useEffect(() => {
    if (isOpen && activeRemixRevision && registry.length > 0) {
      try {
        const params = activeRemixRevision.aiParameters ? JSON.parse(activeRemixRevision.aiParameters) : {};
        const adv = params.advanced_params || params;
        
        // Populate Title with Remix prefix
        if (activeRemixRevision.title) {
          labState.setTitle(`Remix: ${activeRemixRevision.title.replace('Remix: ', '')}`);
        }

        // Populate Prompt
        labState.setPrompt(activeRemixRevision.prompt || '');
        
        // Hydrate Engine and Params
        labState.setModel(activeRemixRevision.engine as SupportedEngine);
        
        // When remixing, explicitly set the seed in the UI
        if (adv.seed) labState.setSeed(adv.seed.toString());
        
        if (adv.negativePrompt) labState.setNegativePrompt(adv.negativePrompt);
        if (adv.ratio) labState.setSelectedRatio(adv.ratio);
        if (adv.motionIntensity) labState.setMotionIntensity(adv.motionIntensity);
        if (adv.duration) labState.setDuration(adv.duration);
        if (adv.temperature) labState.setTemperature(adv.temperature);
        if (adv.voiceName) labState.setSelectedVoice(adv.voiceName);
        if (adv.enhance !== undefined) labState.setEnhance(adv.enhance);
        if (adv.nologo !== undefined) labState.setNologo(adv.nologo);
        if (adv.safe !== undefined) labState.setSafe(adv.safe);
        if (adv.isPrivate !== undefined) labState.setIsPrivate(adv.isPrivate);
        if (adv.audio !== undefined) labState.setAudio(adv.audio);
        if (adv.inputImage) labState.setInputImage(adv.inputImage);
        if (adv.useSearch !== undefined) labState.setUseSearch(adv.useSearch);
        if (adv.referenceItemId) labState.setReferenceItemId(adv.referenceItemId);
        if (adv.referenceAudioItemId && (activeMode === 'audio' || activeMode === 'music' || activeMode === 'transcribe')) {
          setAudioReferenceItemId(adv.referenceAudioItemId);
        } else if ((activeMode === 'audio' || activeMode === 'music') && adv.referenceItemId) {
          setAudioReferenceItemId(adv.referenceItemId);
        }

        if (adv.dynamicParams) {
          Object.entries(adv.dynamicParams).forEach(([key, val]) => {
            labState.setDynamicParam(key, val);
          });
        }

        if (internalRemixRevision) setInternalRemixRevision(null);
      } catch (e) {
        console.warn("Remix hydration failed:", e);
      }
    }
  }, [activeMode, isOpen, activeRemixRevision, registry.length]);

  useEffect(() => {
      if (!isOpen || registry.length === 0 || activeRemixRevision) return;
      const modelData = registry.find((m) => m.id === labState.model);
      if (isModelCompatibleWithMode(modelData, activeMode)) return;

      const cachedModelId = readModeScopedModel(activeMode);
      const cachedModel = cachedModelId ? registry.find((m) => m.id === cachedModelId) : undefined;
      const fallback = isModelCompatibleWithMode(cachedModel, activeMode)
          ? cachedModel
          : findPreferredAudioModel(registry, activeMode) || registry.find((m) => m.category === getTargetCategoryForMode(activeMode));

      if (fallback && fallback.id !== labState.model) {
          labState.setModel(fallback.id);
      }
  }, [isOpen, activeMode, registry, labState.model, labState.setModel, activeRemixRevision, findPreferredAudioModel]);

  useEffect(() => {
    if (!isOpen || registry.length === 0) return;
    const modelData = registry.find((m) => m.id === labState.model);
    if (!isModelCompatibleWithMode(modelData, activeMode)) return;
    writeModeScopedModel(activeMode, labState.model);
  }, [isOpen, activeMode, registry, labState.model]);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    if (isOpen) checkKey();
  }, [isOpen]);

  const activeModel = registry.find((m) => m.id === labState.model);
  const activeCreditRate = getPrimaryModelCreditRate(activeModel);
  const latestPollenTask = tasks.find((task) => (
    !!extractPollenUsed(
      task?.metadata,
      task?.archivedItem?.currentRevision?.aiParameters || null
    )
  )) || null;
  const latestPollenUsed = latestPollenTask
    ? extractPollenUsed(
        latestPollenTask.metadata,
        latestPollenTask.archivedItem?.currentRevision?.aiParameters || null
      )
    : null;
  const latestPollenUsedLabel = latestPollenUsed ? `${formatPollenAmount(latestPollenUsed)} pollen` : null;
  const activeGoogleRate = getPrimaryGoogleApiRate(activeModel);
  const latestGoogleTask = tasks.find((task) => (
    !!extractGoogleUsage(
      task?.metadata,
      task?.archivedItem?.currentRevision?.aiParameters || null
    )
  )) || null;
  const latestGoogleUsage = latestGoogleTask
    ? extractGoogleUsage(
        latestGoogleTask.metadata,
        latestGoogleTask.archivedItem?.currentRevision?.aiParameters || null
      )
    : null;
  const latestGoogleUsageLabel = summarizeGoogleUsage(latestGoogleUsage);
  const latestGoogleCost = latestGoogleTask
    ? extractGoogleEstimatedCostUsd(
        latestGoogleTask.metadata,
        latestGoogleTask.archivedItem?.currentRevision?.aiParameters || null
      )
    : null;
  const latestGoogleCostLabel = latestGoogleCost !== null ? formatGoogleUsd(latestGoogleCost) : null;

  useEffect(() => {
    if (!isOpen) {
      clearPollenCreditContext();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    dispatchPollenCreditContext({
      visible: true,
      mode: activeMode,
      provider: activeModel?.provider || null,
      activeModelLabel: activeModel?.label || labState.model,
      googleQuotaLabel: activeModel?.provider === 'google' ? activeModel?.limits || null : null,
      creditRate: activeCreditRate?.displayValue || null,
      creditRateDetail: activeCreditRate?.detail || null,
      lastPollenUsed: latestPollenUsedLabel,
      googleRate: activeGoogleRate?.displayValue || null,
      googleRateDetail: activeGoogleRate?.detail || null,
      lastGoogleUsage: latestGoogleUsageLabel,
      lastGoogleCost: latestGoogleCostLabel,
      isGenerating
    });
  }, [
    isOpen,
    activeMode,
    activeModel?.provider,
    activeModel?.label,
    labState.model,
    activeCreditRate?.displayValue,
    activeCreditRate?.detail,
    activeGoogleRate?.displayValue,
    activeGoogleRate?.detail,
    latestPollenUsedLabel,
    latestGoogleUsageLabel,
    latestGoogleCostLabel,
    isGenerating
  ]);

  useEffect(() => {
    return () => {
      clearPollenCreditContext();
    };
  }, []);

  const handleGenerate = async () => {
      // Logic Guard: Prevent redundant tasks
      if (isGenerating) return;
      
      const modelData = registry.find(m => m.id === labState.model);
      const category = modelData?.category || 'Visual';

      if (category === 'Language') {
          labState.setChatHistory([...labState.chatHistory, { role: 'user', text: labState.prompt }]);
      }

      if (isTranscriptionMode && !transcriptionFile) return;

      // 1. RESOLVE SEED: Determine final seed for inference without polluting UI
      let finalSeed = labState.seed;
      if (!finalSeed && (category === 'Visual' || category === 'Motion')) {
          finalSeed = Math.floor(Math.random() * 10000000).toString();
      }

      const apiRatio = RATIO_CONFIG[labState.selectedRatio].apiValue;
      const { width, height } = getResolvedDimensions(
          apiRatio, 
          labState.selectedRatio === 'custom' ? labState.customWidth : undefined,
          labState.selectedRatio === 'custom' ? labState.customHeight : undefined
      );

      const fallbackTitle = isTranscriptionMode && transcriptionFile
          ? transcriptionFile.name.replace(/\.[^.]+$/, '')
          : activeMode === 'music'
              ? `Track: ${labState.prompt.slice(0, 40).trim() || 'Untitled'}`
              : activeMode === 'audio'
                  ? `Audio: ${labState.prompt.slice(0, 40).trim() || 'Untitled'}`
                  : labState.prompt.slice(0, 40).trim();
      const resolvedTitle = labState.title.trim() || fallbackTitle;
      const transcriptionDynamicParams = isTranscriptionMode
          ? { response_format: 'verbose_json', ...labState.dynamicParams }
          : labState.dynamicParams;
      const requestedDuration = Number(transcriptionDynamicParams?.duration ?? labState.duration);
      const isAudioGenerationMode = activeMode === 'audio' || activeMode === 'music';
      const resolvedAudioReferenceItemId = isTranscriptionMode
          ? transcriptionSourceItemId
          : (isAudioGenerationMode ? audioReferenceItemId : null);

      const runParams = {
          title: resolvedTitle,
          negativePrompt: labState.negativePrompt,
          seed: finalSeed,
          motionIntensity: labState.motionIntensity,
          temperature: labState.temperature,
          useSearch: labState.useSearch,
          voiceName: labState.selectedVoice,
          duration: Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : undefined,
          enhance: labState.enhance,
          nologo: labState.nologo,
          safe: labState.safe,
          isPrivate: labState.isPrivate,
          ratio: labState.selectedRatio,
          resolvedWidth: width,
          resolvedHeight: height,
          dynamicParams: transcriptionDynamicParams,
          audioData: isTranscriptionMode && transcriptionFile ? await readFileAsDataUrl(transcriptionFile) : undefined,
          audioFormat: isTranscriptionMode && transcriptionFile ? resolveAudioFormat(transcriptionFile) : undefined,
          sourceFileName: isTranscriptionMode && transcriptionFile ? transcriptionFile.name : undefined,
          isTranscription: isTranscriptionMode,
          isMusicGeneration: activeMode === 'music',
          // Preserve reference lineage for visual image inputs and audio source inputs.
          referenceItemId: isTranscriptionMode
              ? transcriptionSourceItemId
              : (isAudioGenerationMode ? resolvedAudioReferenceItemId : (labState.features.showImageInput ? labState.referenceItemId : null)),
          referenceAudioItemId: resolvedAudioReferenceItemId,
          inputImage: labState.features.showImageInput ? labState.inputImage : null,
          // Transcription outputs should persist to Neural Archive so they can be recovered and managed.
          skipAutoSave: false
      };

      generate(
        labState.prompt, 
        labState.model, 
        labState.selectedRatio, 
        runParams.resolvedWidth, 
        runParams.resolvedHeight,
        runParams
      );

      if (isTranscriptionMode) {
          setActiveTranscriptPreviewTask(null);
      }
      
      if (category === 'Language') labState.setPrompt('');
  };

  const getLatestTaskMetadata = useCallback((metadata: any, archivedItem?: ItemWithCurrentRevision) => {
    const base = metadata && typeof metadata === 'object' ? metadata : {};
    const rawAiParameters = String(archivedItem?.currentRevision?.aiParameters || '').trim();
    if (!rawAiParameters) return base;

    try {
      const parsed = JSON.parse(rawAiParameters);
      const parsedAdvanced = (parsed?.advanced_params && typeof parsed.advanced_params === 'object')
        ? parsed.advanced_params
        : (parsed && typeof parsed === 'object' ? parsed : {});
      const baseAdvanced = (base?.advanced_params && typeof base.advanced_params === 'object')
        ? base.advanced_params
        : (base && typeof base === 'object' ? base : {});

      return {
        ...base,
        ...parsed,
        advanced_params: {
          ...baseAdvanced,
          ...parsedAdvanced
        }
      };
    } catch (_error) {
      return base;
    }
  }, []);

  const getTaskArchiveParams = useCallback((task: LabTask) => {
    const merged = getLatestTaskMetadata(task.metadata, task.archivedItem);
    const root = merged && typeof merged === 'object' ? { ...merged } : {};
    const advanced = root.advanced_params && typeof root.advanced_params === 'object'
      ? { ...root.advanced_params }
      : {};

    delete root.advanced_params;
    delete root.auto_saved;

    return {
      ...root,
      ...advanced
    };
  }, [getLatestTaskMetadata]);

  const handleSave = useCallback(async (res: GeneratedImageResult | null, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => {
    setIsSaving(true);
    setCaptureMessage(null);

    try {
        const latestMetadata = getLatestTaskMetadata(metadata, archivedItem);
        await onAddAsAsset(res!, prompt, modelId, latestMetadata, userTitle, archivedItem);
        showCaptureMessage("Artifact successfully captured to project workspace.");
        // Refresh local history as the item was moved out of the unassigned archive
        if (activeMode !== 'transcribe') {
          fetchNeuralHistory();
        }
    } catch (err) {
        showCaptureMessage("Failed to save artifact.");
    } finally {
        setIsSaving(false);
    }
  }, [activeMode, fetchNeuralHistory, getLatestTaskMetadata, onAddAsAsset, showCaptureMessage]);

  const handleBulkSave = async (tasks: LabTask[]) => {
    setIsSaving(true);
    try {
        if (onBulkAddAsAssets) {
            const captures = tasks.map(t => ({
                res: t.result,
                prompt: t.prompt,
                modelId: t.modelId,
                metadata: getLatestTaskMetadata(t.metadata, t.archivedItem),
                userTitle: t.title,
                archivedItem: t.archivedItem
            }));
            await onBulkAddAsAssets(captures);
        } else {
            // Fallback for project contexts that only provide single-capture handler.
            let successCount = 0;
            let failCount = 0;
            for (const t of tasks) {
                try {
                    await onAddAsAsset(
                        t.result as GeneratedImageResult,
                        t.prompt,
                        t.modelId,
                        getLatestTaskMetadata(t.metadata, t.archivedItem),
                        t.title,
                        t.archivedItem
                    );
                    successCount++;
                } catch (e) {
                    failCount++;
                }
            }
            if (successCount > 0 && failCount === 0) {
                showCaptureMessage(successCount > 1 ? `Successfully captured ${successCount} artifacts.` : 'Artifact successfully captured to project workspace.');
            } else if (successCount > 0 && failCount > 0) {
                showCaptureMessage(`Captured ${successCount} artifact(s), ${failCount} failed.`);
            }
        }
    } catch (e) {
        console.error("Bulk capture initiation failed", e);
    } finally {
        setIsSaving(false);
    }
  };

  const handleUpdateTaskState = useCallback((taskId: string, updates: Partial<LabTask>) => {
    updateTask(taskId, updates);

    setHistoryItems((prev) => prev.map((item) => {
      if (item.id !== taskId) return item;
      const nextArchivedItem = updates.archivedItem;
      if (!nextArchivedItem?.currentRevision) return item;
      return {
        ...item,
        ...nextArchivedItem,
        currentRevision: nextArchivedItem.currentRevision
      };
    }));

    setInspectedTask((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      return {
        ...prev,
        ...updates,
        archivedItem: updates.archivedItem || prev.archivedItem,
        metadata: updates.metadata ?? prev.metadata
      };
    });
    setActiveTranscriptPreviewTask((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      return {
        ...prev,
        ...updates,
        title: updates.title ?? prev.title,
        prompt: updates.prompt ?? prev.prompt,
        archivedItem: updates.archivedItem || prev.archivedItem,
        metadata: updates.metadata ?? prev.metadata,
        result: updates.result ?? prev.result,
        error: updates.error ?? prev.error,
        status: updates.status ?? prev.status,
        progress: updates.progress ?? prev.progress
      };
    });
  }, [updateTask]);

  const normalizeTranscriptValue = useCallback((value: unknown): string => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === '[object Object]') return '';

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, any>;
          const candidates = [
            parsed.text,
            parsed.transcript,
            parsed.output_text,
            parsed.results?.transcript,
            parsed.results?.text,
            parsed.results?.transcripts?.[0]?.transcript
          ];
          for (const candidate of candidates) {
            if (typeof candidate !== 'string') continue;
            const normalized = candidate.trim();
            if (normalized && normalized !== '[object Object]') return normalized;
          }
        } catch (_error) {}
      }

      return trimmed;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

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
      if (normalized && normalized !== '[object Object]') return normalized;
    }

    const segmentCandidates = [
      parsed.segments,
      parsed.utterances,
      parsed.results?.segments
    ];
    for (const candidate of segmentCandidates) {
      if (!Array.isArray(candidate)) continue;
      const joined = candidate
        .map((segment: any) => String(segment?.text || segment?.transcript || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      if (joined && joined !== '[object Object]') return joined;
    }

    return '';
  }, []);

  const getTranscriptTaskText = useCallback((task: LabTask): string => {
    const revision = task.archivedItem?.currentRevision;
    const candidates = [
      task.result?.text,
      revision?.prompt,
      task.prompt
    ];
    for (const candidate of candidates) {
      const normalized = normalizeTranscriptValue(candidate);
      if (!normalized) continue;
      if (normalized.toLowerCase() === 'no prompt recorded') continue;
      return normalized;
    }
    return '';
  }, [normalizeTranscriptValue]);

  const isTranscriptManifestTask = useCallback((task: LabTask) => {
    const revision = task.archivedItem?.currentRevision;
    const mimeType = String(task.result?.mimeType || revision?.mimeType || '').toLowerCase();
    const transcriptText = getTranscriptTaskText(task);
    const details = extractTranscriptionManifestDetails({
      metadata: task.metadata,
      aiParameters: revision?.aiParameters || null
    });
    if (mimeType.startsWith('text/') && transcriptText.length > 0) return true;
    if (mimeType.includes('json') && details.isTranscription) return true;
    if (details.isTranscription && transcriptText.length > 0) return true;

    const modelMeta = registry.find((entry) => (
      entry.id === task.modelId || entry.id === revision?.engine
    ));
    if (modelMeta && isTranscriptionAudioModel(modelMeta) && (transcriptText.length > 0 || mimeType.includes('json'))) return true;

    if (isTranscriptionArchiveRevision(revision) && (transcriptText.length > 0 || mimeType.includes('json'))) return true;

    const parseCandidate = (value: any) => {
      if (!value || typeof value !== 'object') return null;
      const root = value as Record<string, any>;
      const adv = (root.advanced_params && typeof root.advanced_params === 'object')
        ? root.advanced_params as Record<string, any>
        : root;
      return { root, adv };
    };

    const parsedMetadata = parseCandidate(task.metadata);
    if (parsedMetadata) {
      const { root, adv } = parsedMetadata;
      if (
        adv.isTranscription === true
        || root.isTranscription === true
        || (typeof adv.transcriptionHint === 'string' && adv.transcriptionHint.trim().length > 0)
        || (typeof root.transcriptionHint === 'string' && root.transcriptionHint.trim().length > 0)
      ) {
        return transcriptText.length > 0 || mimeType.includes('json');
      }
    }

    const aiParameters = String(revision?.aiParameters || '').trim();
    if (aiParameters) {
      try {
        const parsed = JSON.parse(aiParameters) as Record<string, any>;
        const parsedAdv = (parsed.advanced_params && typeof parsed.advanced_params === 'object')
          ? parsed.advanced_params as Record<string, any>
          : parsed;
        if (
          parsedAdv.isTranscription === true
          || parsed.isTranscription === true
          || (typeof parsedAdv.transcriptionHint === 'string' && parsedAdv.transcriptionHint.trim().length > 0)
          || (typeof parsed.transcriptionHint === 'string' && parsed.transcriptionHint.trim().length > 0)
        ) {
          return transcriptText.length > 0 || mimeType.includes('json');
        }
      } catch (_error) {}
    }

    return false;
  }, [getTranscriptTaskText, registry]);

  const handleInspectManifestTask = useCallback((task: LabTask) => {
    if (isTranscriptManifestTask(task)) {
      setInspectedTask(task);
      return;
    }

    setInspectedTask(task);
  }, [isTranscriptManifestTask]);

  const handleSaveTranscriptToArchive = useCallback(async (task: LabTask | null) => {
    if (!task?.result) return;
    if (task.archivedItem?.currentRevision?.id) {
      showCaptureMessage('Transcript already saved to Neural Saved.');
      return;
    }

    setIsSavingTranscriptToArchive(true);
    try {
      const archiveParams = getTaskArchiveParams(task);
      const saved = await saveArtifactToArchive(task.result, task.prompt, task.modelId, archiveParams, {
        markAutoSaved: false,
        stripEmbeddedAudioData: true
      });

      if (!saved) {
        showCaptureMessage('Failed to save transcript to Neural Saved.');
        return;
      }

      handleUpdateTaskState(task.id, {
        archivedItem: saved,
        metadata: getLatestTaskMetadata(task.metadata, saved),
        title: saved.currentRevision?.title || task.title,
        prompt: saved.currentRevision?.prompt || task.prompt
      });
      showCaptureMessage('Transcript saved to Neural Saved.');
    } catch (error) {
      console.error('Failed to save transcript to archive', error);
      showCaptureMessage('Failed to save transcript to Neural Saved.');
    } finally {
      setIsSavingTranscriptToArchive(false);
    }
  }, [getLatestTaskMetadata, getTaskArchiveParams, handleUpdateTaskState, showCaptureMessage]);

  // Fixed: Added handleAddTriggerWord which was missing from this file but referenced in the sidebar props.
  const handleAddTriggerWord = (word: string) => {
      const current = labState.prompt.trim();
      if (!current) {
          labState.setPrompt(word);
      } else if (!current.includes(word)) {
          labState.setPrompt(`${current}, ${word}`);
      }
  };

  const handleRemoveTaskOrItem = (id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;

    const linkedTask = tasks.find((task) => (
      task.id === normalizedId || String(task.archivedItem?.id || '').trim() === normalizedId
    )) || null;
    const archiveIdFromHistory = historyItems.find((item) => item.id === normalizedId)?.id || null;
    const archiveIdFromTask = String(linkedTask?.archivedItem?.id || '').trim() || null;
    const resolvedArchiveId = archiveIdFromHistory || archiveIdFromTask;

    if (resolvedArchiveId) {
      setPendingDeleteArchiveItemIds((prev) => (
        prev.includes(resolvedArchiveId) ? prev : [...prev, resolvedArchiveId]
      ));
      if (linkedTask?.id) {
        setPendingDeleteArchiveTaskIds((prev) => (
          prev.includes(linkedTask.id) ? prev : [...prev, linkedTask.id]
        ));
      }
      return;
    }

    removeTask(normalizedId);
  };

  const handleRecycleArchiveManifests = useCallback(async () => {
    const uniqueItemIds = Array.from(new Set(
      pendingDeleteArchiveItemIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ));
    if (uniqueItemIds.length === 0) return;
    const queuedTaskIds = Array.from(new Set(
      pendingDeleteArchiveTaskIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ));

    setPendingDeleteArchiveItemIds([]);
    setPendingDeleteArchiveTaskIds([]);
    setIsRecyclingArchiveManifest(true);
    try {
      let archivedCount = 0;
      let failedCount = 0;
      const taskIdsToRemove = new Set<string>(queuedTaskIds);
      const archivedItemIds = new Set<string>();

      for (const itemId of uniqueItemIds) {
        try {
          await api.items.update({ id: itemId, isArchived: true, isPinned: false });
          archivedCount += 1;
          archivedItemIds.add(itemId);
        } catch (error) {
          failedCount += 1;
          console.error('Failed to move manifest to recycle bin', error);
        }
      }

      for (const itemId of archivedItemIds) {
        for (const task of tasks) {
          const taskId = String(task.id || '').trim();
          const archiveId = String(task.archivedItem?.id || '').trim();
          if (!taskId) continue;
          if (taskId === itemId || archiveId === itemId) {
            taskIdsToRemove.add(taskId);
          }
        }
      }
      taskIdsToRemove.forEach((taskId) => removeTask(taskId));

      if (archivedItemIds.size > 0) {
        setHistoryItems((prev) => prev.filter((item) => !archivedItemIds.has(String(item.id || '').trim())));
        setInspectedTask((prev) => {
          if (!prev) return prev;
          const archiveId = String(prev.archivedItem?.id || '').trim();
          const taskId = String(prev.id || '').trim();
          return archivedItemIds.has(archiveId) || archivedItemIds.has(taskId) ? null : prev;
        });
        setActiveTranscriptPreviewTask((prev) => {
          if (!prev) return prev;
          const archiveId = String(prev.archivedItem?.id || '').trim();
          const taskId = String(prev.id || '').trim();
          return archivedItemIds.has(archiveId) || archivedItemIds.has(taskId) ? null : prev;
        });
      }

      if (archivedCount > 0 && failedCount === 0) {
        showCaptureMessage(
          archivedCount === 1
            ? 'Manifest moved to Neural Recycle Bin.'
            : `${archivedCount} manifests moved to Neural Recycle Bin.`
        );
      } else if (archivedCount > 0 && failedCount > 0) {
        showCaptureMessage(`Moved ${archivedCount} manifest(s) to Recycle Bin; ${failedCount} failed.`);
      } else {
        showCaptureMessage('Failed to move selected manifests to Neural Recycle Bin.');
      }

      if (archivedCount > 0) {
        fetchNeuralHistory();
      }
    } catch (e: any) {
      console.error('Failed to move archive manifests to recycle bin', e);
      showCaptureMessage(e?.message || 'Failed to move selected manifests to Neural Recycle Bin.');
    } finally {
      setIsRecyclingArchiveManifest(false);
    }
  }, [
    fetchNeuralHistory,
    pendingDeleteArchiveItemIds,
    pendingDeleteArchiveTaskIds,
    removeTask,
    showCaptureMessage,
    tasks
  ]);

  useEffect(() => {
    if (isRecyclingArchiveManifest) return;
    if (pendingDeleteArchiveItemIds.length === 0) return;
    void handleRecycleArchiveManifests();
  }, [handleRecycleArchiveManifests, isRecyclingArchiveManifest, pendingDeleteArchiveItemIds.length]);

  const handleMergeDuplicateReferences = async () => {
    setIsMergingReferences(true);
    setCaptureMessage(null);
    try {
      const archive = await fetch('/api/projects/archive', {
        headers: api.auth.getAuthHeaders()
      }).then(r => r.json());

      if (!archive?.id) throw new Error('Archive project not found');

      const result = await api.items.mergeDuplicateReferences(archive.id);
      await fetchNeuralHistory();
      if (result.mergedItems > 0) {
        showCaptureMessage(`Merged ${result.mergedItems} duplicate reference image(s).`);
      } else {
        showCaptureMessage('No duplicate reference images found.');
      }
    } catch (e) {
      showCaptureMessage('Failed to merge duplicate reference images.');
    } finally {
      setIsMergingReferences(false);
    }
  };

  if (!isOpen) return null;

  // Map LabMode to ModelCategory for filtering
  const forcedCategory: ModelCategory | undefined = getTargetCategoryForMode(activeMode);

  const isAudioMode = activeMode === 'audio' || activeMode === 'music' || activeMode === 'transcribe';
  const modeSurfaceKey = isAudioMode ? `audio-family-${activeMode}` : `mode-${activeMode}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-in fade-in">
        {captureMessage && (
            <div className="pointer-events-none absolute top-8 left-1/2 z-[220] -translate-x-1/2">
                <div className="rounded-2xl border border-indigo-400/30 bg-slate-950/95 px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-100 shadow-[0_24px_60px_rgba(15,23,42,0.65)] backdrop-blur-xl">
                    {captureMessage}
                </div>
            </div>
        )}
        <div className="bg-[#0c0c0c] border border-slate-800/50 w-[95vw] h-[95vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/10">
            <LabHeader
              onClose={onClose}
              mode={activeMode}
              onBack={onBack}
              backLabel={backLabel}
            />
            <div className="px-6 pt-4">
              <div className={`flex flex-wrap items-center gap-3 ${isAudioMode ? 'justify-between' : 'justify-end'}`}>
                {isAudioMode && (
                  <div className="inline-flex items-center rounded-2xl border border-slate-700/80 bg-[#020d2a] p-1 shadow-[0_8px_24px_rgba(2,6,23,0.55)]">
                    <button
                      type="button"
                      onClick={() => handleAudioModeChange('audio')}
                      aria-pressed={activeMode === 'audio'}
                      className={`chat-focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black tracking-wide transition-colors ${
                        activeMode === 'audio'
                          ? 'bg-slate-700/60 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <AudioLines size={14} className="text-emerald-400" />
                      Audio Generation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAudioModeChange('music')}
                      aria-pressed={activeMode === 'music'}
                      className={`chat-focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black tracking-wide transition-colors ${
                        activeMode === 'music'
                          ? 'bg-slate-700/60 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Music2 size={14} className="text-amber-400" />
                      Music Generation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAudioModeChange('transcribe')}
                      aria-pressed={activeMode === 'transcribe'}
                      className={`chat-focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-black tracking-wide transition-colors ${
                        activeMode === 'transcribe'
                          ? 'bg-slate-700/60 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <FileAudio size={14} className="text-cyan-400" />
                      Transcription
                    </button>
                  </div>
                )}
                <button
                  onClick={handleMergeDuplicateReferences}
                  disabled={isMergingReferences}
                  className="px-4 py-2 rounded-xl border border-indigo-500/40 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-60"
                  title="Merge duplicate AI reference images in Neural Saved"
                >
                  {isMergingReferences ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
                  Merge Duplicate References
                </button>
              </div>
            </div>
            <div key={modeSurfaceKey} className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {!isAudioMode && (
                    <LabSidebar 
                        {...labState}
                        mode={activeMode}
                        hasApiKey={hasApiKey} 
                        registry={registry}
                        onSelectKey={() => { // @ts-ignore
                            window.aistudio?.openSelectKey().then(() => setHasApiKey(true));
                        }}
                        isGenerating={isGenerating} onGenerate={handleGenerate}
                        onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                        onOpenLoraSelector={() => setIsLoraSelectorOpen(true)}
                        onOpenEmbeddingSelector={() => setIsEmbeddingSelectorOpen(true)}
                        onOpenControlNetSelector={() => setIsControlNetSelectorOpen(true)}
                        onAddTriggerWord={handleAddTriggerWord}
                        onSetVae={labState.setVae}
                    />
                )}
                <LabPreview 
                    tasks={tasks}
                    historyItems={historyItems}
                    onRemoveTask={handleRemoveTaskOrItem}
                    onSave={handleSave}
                    onBulkSave={handleBulkSave}
                    onInspectTask={handleInspectManifestTask}
                    onRemixTask={(task) => {
                        handleRemixRevision(task.archivedItem?.currentRevision);
                    }}
                    onUpdateTask={handleUpdateTaskState}
                    onSaveActiveTranscriptToArchive={handleSaveTranscriptToArchive}
                    isSavingActiveTranscriptToArchive={isSavingTranscriptToArchive}
                    title={labState.title}
                    onSetTitle={labState.setTitle}
                    prompt={labState.prompt}
                    onSetPrompt={labState.setPrompt}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    category={registry.find(m => m.id === labState.model)?.category || 'Visual'}
                    model={labState.model}
                    hasApiKey={hasApiKey}
                    negativePrompt={labState.negativePrompt}
                    onSetNegativePrompt={labState.setNegativePrompt}
                    onRandomizeSeed={() => labState.setSeed(Math.floor(Math.random() * 10000000).toString())}
                    seed={labState.seed}
                    onSetSeed={labState.setSeed}
                    selectedVoice={labState.selectedVoice}
                    onSetSelectedVoice={labState.setSelectedVoice}
                    features={labState.features}
                    registry={registry}
                    onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                    paramSchema={labState.paramSchema}
                    dynamicParams={labState.dynamicParams}
                    onSetDynamicParam={labState.setDynamicParam}
                    isPodcast={isPodcast}
                    mode={activeMode}
                    selectedFile={transcriptionFile}
                    onSelectFile={handleSelectTranscriptionFile}
                    onClearFile={handleClearTranscriptionFile}
                    transcriptionSelectionNonce={transcriptionSelectionNonce}
                    activeTranscriptOverride={activeTranscriptPreviewTask}
                />
            </div>
        </div>

        {/* Modal Registry */}
        {isModelSelectorOpen && (
            <ModelSelectorModal 
                isOpen={isModelSelectorOpen}
                onClose={() => setIsModelSelectorOpen(false)}
                currentModel={labState.model}
                onSelect={(id) => {
                    labState.setModel(id);
                    setIsModelSelectorOpen(false);
                }}
                forcedCategory={forcedCategory}
                audioFilter={activeMode === 'audio' ? 'speech' : activeMode === 'music' ? 'music' : activeMode === 'transcribe' ? 'transcription' : undefined}
            />
        )}

        {isLoraSelectorOpen && (
            <LoraSelectorModal 
                isOpen={isLoraSelectorOpen}
                onClose={() => setIsLoraSelectorOpen(false)}
            />
        )}

        {isEmbeddingSelectorOpen && (
            <EmbeddingSelectorModal 
                isOpen={isEmbeddingSelectorOpen}
                onClose={() => setIsEmbeddingSelectorOpen(false)}
            />
        )}

        {isControlNetSelectorOpen && (
            <ControlNetSelectorModal 
                isOpen={isControlNetSelectorOpen}
                onClose={() => setIsControlNetSelectorOpen(false)}
            />
        )}

        {inspectedTask && (
            <ArtifactInspector 
                key={`artifact-inspector-${inspectedTask.id}-${String(inspectedTask.result?.mimeType || inspectedTask.archivedItem?.currentRevision?.mimeType || '').toLowerCase()}`}
                task={inspectedTask} 
                onClose={() => setInspectedTask(null)} 
                onUpdate={(taskId, updates) => {
                    updateTask(taskId, {
                        ...updates,
                        title: updates.title ?? inspectedTask.title,
                        prompt: updates.prompt ?? inspectedTask.prompt
                    });

                    setHistoryItems((prev) => prev.map((item) => {
                        if (item.id !== taskId) return item;
                        if (updates.archivedItem) return updates.archivedItem;
                        if (!item.currentRevision) return item;
                        return {
                            ...item,
                            currentRevision: {
                                ...item.currentRevision,
                                title: updates.title ?? item.currentRevision.title,
                                prompt: updates.prompt ?? item.currentRevision.prompt
                            }
                        };
                    }));

                    setInspectedTask((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            ...updates,
                            title: updates.title ?? prev.title,
                            prompt: updates.prompt ?? prev.prompt,
                            archivedItem: updates.archivedItem || (prev.archivedItem?.currentRevision
                                ? {
                                    ...prev.archivedItem,
                                    currentRevision: {
                                        ...prev.archivedItem.currentRevision,
                                        title: updates.title ?? prev.archivedItem.currentRevision.title,
                                        prompt: updates.prompt ?? prev.archivedItem.currentRevision.prompt
                                    }
                                }
                                : prev.archivedItem)
                        };
                    });
                }}
                onRemix={(task) => {
                    handleRemixRevision(task.archivedItem?.currentRevision);
                }}
                registry={registry}
            />
        )}

    </div>
  );
};

export default GenerateImageModal;
