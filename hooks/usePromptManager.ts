import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { generateImageWithGemini, type GeminiImageModel } from '../services/geminiService';
import { generateMediaWithPollinations, type PollinationsModel } from '../services/pollinationsService';
import { DEFAULT_GOOGLE_IMAGE_MODEL, DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL, DEFAULT_GOOGLE_TEXT_MODEL } from '../utils/googleModelIds';
import type { PromptDraft, PromptDraftRevision, PromptManagerImageModelOption, PromptManagerTab, PromptManagerViewMode } from '../components/prompt-manager/types';
import { derivePromptTitle, filterPromptDrafts, getPromptDraftDuplicateGroups, getPromptExportPayload, normalizePromptDraftSource, parsePromptImportInput, toPromptDraft, type PromptDraftDuplicateGroup } from '../components/prompt-manager/utils';
import type { Project, Revision } from '../types';
import { loadDynamicRegistry } from '../components/project/lab/ModelSelector/registry/index';
import type { ModelOption, SupportedEngine } from '../components/project/lab/ModelSelector/types';
import type { EngineFeatures, DynamicParamBlueprint } from './useEngineManagement';
import type { ConfirmConfig } from './useModalDialogs';
import { normalizeUserFacingError } from '../utils/userFacingErrors';
import { consumePollenCredit } from '../utils/pollenCreditBalance';
import { resolvePollenCharge } from '../utils/pollenCredits';
import { mergeRevisionTags } from '../utils/revisionTags';

const DRAFT_STORAGE_KEY = 'aimana_prompt_manager_drafts_v1';
const VIEW_STORAGE_KEY = 'aimana_prompt_manager_view_v1';
const PROMPT_MANAGER_INFERENCE_CACHE_STORAGE_KEY = 'aimana_prompt_manager_inference_console_v1_4';
const PROMPT_COLLECTION_PROJECT_TYPE = 'prompt';
const PROMPT_EXPORT_BATCH_SIZE = 500;
const DRAFT_AUTOSAVE_DELAY_MS = 700;
const PROMPT_DRAFT_REVISION_LIMIT = 50;
const ASPECT_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9', 'custom'] as const;
type PromptManagerAspectRatio = typeof ASPECT_RATIO_OPTIONS[number];

interface PromptManagerInferenceCache {
  previewModel?: string;
  selectedRatio?: string;
  customWidth?: number;
  customHeight?: number;
  negativePrompt?: string;
  seed?: string;
  useSearch?: boolean;
  enhance?: boolean;
  nologo?: boolean;
  safe?: boolean;
  dynamicParams?: Record<string, any>;
  duration?: number;
  audio?: boolean;
  isPrivate?: boolean;
  nofeed?: boolean;
}

const DEFAULT_VIEW: PromptManagerViewMode = 'grid';
const DEFAULT_ENGINE_FEATURES: EngineFeatures = {
  showDimensions: true,
  showSeed: true,
  showNegativePrompt: true,
  showEnhancements: true,
  showNologo: true,
  showImageInput: false,
  showVideoRatio: false,
  showSampling: false,
  showGuidance: true
};

const IMAGE_MODEL_OPTIONS: PromptManagerImageModelOption[] = [
  {
    id: DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL,
    label: 'Gemini 3.1 Flash Image Preview',
    description: 'Grounded preview model for richer prompt validation.'
  },
  {
    id: DEFAULT_GOOGLE_IMAGE_MODEL,
    label: 'Gemini 2.5 Flash Image',
    description: 'Faster prompt preview model for quick iteration.'
  }
];
const PREVIEW_IMAGE_MODELS = new Set<string>([
  DEFAULT_GOOGLE_IMAGE_MODEL,
  DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL
]);

const resolvePreviewModelForImageGeneration = (modelId: string): GeminiImageModel => {
  if (PREVIEW_IMAGE_MODELS.has(modelId)) {
    return modelId as GeminiImageModel;
  }
  return DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL;
};

const parseJsonOrFallback = <T,>(raw: unknown, fallback: T): T => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
};

const normalizeEngineFeatures = (raw: unknown, fallback: EngineFeatures): EngineFeatures => {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const toBool = (value: unknown, defaultValue: boolean) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
    return defaultValue;
  };

  return {
    showDimensions: toBool(source.showDimensions, fallback.showDimensions),
    showSeed: toBool(source.showSeed, fallback.showSeed),
    showNegativePrompt: toBool(source.showNegativePrompt, fallback.showNegativePrompt),
    showEnhancements: toBool(source.showEnhancements, fallback.showEnhancements),
    showNologo: toBool(source.showNologo, fallback.showNologo),
    showImageInput: toBool(source.showImageInput, fallback.showImageInput),
    showVideoRatio: toBool(source.showVideoRatio, fallback.showVideoRatio),
    showSampling: toBool(source.showSampling, fallback.showSampling ?? false),
    showGuidance: toBool(source.showGuidance, fallback.showGuidance ?? true)
  };
};

const normalizeAspectRatio = (value: string): PromptManagerAspectRatio => (
  (ASPECT_RATIO_OPTIONS as readonly string[]).includes(value) ? value as PromptManagerAspectRatio : '1:1'
);

const resolveGenerationAspectRatio = (value: PromptManagerAspectRatio): Exclude<PromptManagerAspectRatio, 'custom'> => (
  value === 'custom' ? '1:1' : value
);

const dispatchNotification = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
  window.dispatchEvent(new CustomEvent('aimana-notification', {
    detail: {
      title,
      message,
      type
    }
  }));
};

const dispatchProjectItemsUpdated = (projectId: string, reason: string) => {
  window.dispatchEvent(new CustomEvent('project-items-updated', {
    detail: { projectId, reason }
  }));
};

const resolveReferenceImageTitleTag = async (referenceItemId?: string | null): Promise<string> => {
  const cleanId = String(referenceItemId || '').trim();
  if (!cleanId) return '';

  try {
    const item = await api.items.get(cleanId);
    return String(item?.currentRevision?.title || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
};

const resolvePromptManagerReferenceImage = async (
  rawImage?: string | null,
  referenceItemId?: string | null
): Promise<string> => {
  const directImage = String(rawImage || '').trim();
  if (directImage) return directImage;

  const cleanId = String(referenceItemId || '').trim();
  if (!cleanId) return '';

  try {
    const item = await api.items.get(cleanId);
    return String(item?.currentRevision?.fileUrl || item?.currentRevision?.thumbnailLink || '').trim();
  } catch {
    return '';
  }
};

const sortDrafts = (drafts: PromptDraft[]) => (
  [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)
);

const isMeaningfulText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

const mergeDistinctDraftNotes = (primary?: string, duplicate?: string) => {
  const values = [primary, duplicate]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (values.length === 0) return undefined;
  return Array.from(new Set(values)).join('\n\n');
};

const createPromptDraftRevisionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `prompt-revision-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizePromptDraftRevisionHistory = (value: unknown): PromptDraftRevision[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((revision): revision is PromptDraftRevision => (
      !!revision
      && typeof revision.id === 'string'
      && typeof revision.title === 'string'
      && typeof revision.prompt === 'string'
      && typeof revision.createdAt === 'number'
    ))
    .slice(0, PROMPT_DRAFT_REVISION_LIMIT);
};

const getNextPromptDraftRevisionNumber = (history?: PromptDraftRevision[]) => (
  normalizePromptDraftRevisionHistory(history).reduce((max, revision) => (
    Math.max(max, Number(revision.versionNumber) || 0)
  ), 0) + 1
);

const snapshotPromptDraftRevision = (draft: PromptDraft, timestamp = Date.now()): PromptDraftRevision => ({
  id: createPromptDraftRevisionId(),
  versionNumber: getNextPromptDraftRevisionNumber(draft.revisionHistory),
  title: draft.title,
  prompt: draft.prompt,
  raw: draft.raw,
  label: draft.label,
  tags: draft.tags,
  note: draft.note,
  status: draft.status,
  ingestionState: draft.ingestionState,
  queueLetter: draft.queueLetter,
  queueNumber: draft.queueNumber,
  previewImageUrl: draft.previewImageUrl,
  previewMimeType: draft.previewMimeType,
  thumbnailBlur: draft.thumbnailBlur,
  createdAt: timestamp,
  sourceUpdatedAt: draft.updatedAt
});

const appendPromptDraftRevision = (draft: PromptDraft, timestamp = Date.now()) => [
  snapshotPromptDraftRevision(draft, timestamp),
  ...normalizePromptDraftRevisionHistory(draft.revisionHistory)
].slice(0, PROMPT_DRAFT_REVISION_LIMIT);

type PromptDraftRevisionTrackedField = keyof Pick<PromptDraftRevision, 'title' | 'prompt' | 'raw' | 'label' | 'tags' | 'note'>;

const promptDraftRevisionTrackedFields: PromptDraftRevisionTrackedField[] = [
  'title',
  'prompt',
  'raw',
  'label',
  'tags',
  'note'
];

const hasPromptDraftRevisionChange = (previous: PromptDraft, next: PromptDraft) => (
  promptDraftRevisionTrackedFields.some((field) => String(previous[field] || '') !== String(next[field] || ''))
);

const hasPromptDraftRevisionContentDelta = (draft: PromptDraft, revision: PromptDraftRevision) => (
  promptDraftRevisionTrackedFields.some((field) => String(draft[field] || '') !== String(revision[field] || ''))
);

const prunePromptDraftRevisionHistory = (draft: PromptDraft): PromptDraftRevision[] => (
  normalizePromptDraftRevisionHistory(draft.revisionHistory)
    .filter((revision) => hasPromptDraftRevisionContentDelta(draft, revision))
);

const ingestionStatePriority: Record<'waiting' | 'pending' | 'done', number> = {
  waiting: 0,
  pending: 1,
  done: 2
};

const resolvePreferredIngestionState = (primary?: string, duplicate?: string) => {
  const primaryState = primary === 'pending' || primary === 'done' ? primary : 'waiting';
  const duplicateState = duplicate === 'pending' || duplicate === 'done' ? duplicate : 'waiting';
  return ingestionStatePriority[duplicateState] > ingestionStatePriority[primaryState]
    ? duplicateState
    : primaryState;
};

const readStoredDrafts = (): PromptDraft[] => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromptDraft[];
    if (!Array.isArray(parsed)) return [];
    return sortDrafts(
      parsed
        .filter((draft) => (
          !!draft
          && typeof draft.id === 'string'
          && typeof draft.title === 'string'
          && typeof draft.prompt === 'string'
          && (draft.status === 'staging' || draft.status === 'ready' || draft.status === 'deleted')
        ))
        .map((draft) => {
          const normalizedDraft = {
            ...draft,
            revisionHistory: normalizePromptDraftRevisionHistory(draft.revisionHistory)
          };
          return {
            ...normalizedDraft,
            revisionHistory: prunePromptDraftRevisionHistory(normalizedDraft)
          };
        })
    );
  } catch {
    return [];
  }
};

const readStoredView = (): PromptManagerViewMode => {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === 'gallery' || raw === 'list' || raw === 'workflow' ? raw : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
};

const readPromptManagerInferenceCache = (): PromptManagerInferenceCache => {
  try {
    const raw = localStorage.getItem(PROMPT_MANAGER_INFERENCE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PromptManagerInferenceCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writePromptManagerInferenceCache = (cache: PromptManagerInferenceCache) => {
  try {
    localStorage.setItem(PROMPT_MANAGER_INFERENCE_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage failures
  }
};

const resolveExportTargets = (drafts: PromptDraft[], selectedIds: Set<string>) => {
  const exportableDrafts = drafts.filter((draft) => (
    draft.prompt.trim()
    && draft.status !== 'deleted'
  ));
  if (selectedIds.size === 0) {
    return exportableDrafts;
  }
  return exportableDrafts.filter((draft) => selectedIds.has(draft.id));
};

const resolveAssetIngestionTargets = (drafts: PromptDraft[], targetIds?: Set<string>) => {
  const exportableDrafts = drafts.filter((draft) => draft.prompt.trim() && draft.status === 'ready');
  if (!targetIds || targetIds.size === 0) {
    return exportableDrafts;
  }
  return exportableDrafts.filter((draft) => targetIds.has(draft.id));
};

const chunkPromptDrafts = (drafts: PromptDraft[], size: number) => {
  const chunks: PromptDraft[][] = [];
  for (let index = 0; index < drafts.length; index += size) {
    chunks.push(drafts.slice(index, index + size));
  }
  return chunks;
};

const buildAssetIngestionPromptPayload = (drafts: PromptDraft[]) => (
  drafts.map((draft) => ({
    title: draft.title.trim() || derivePromptTitle(draft.prompt),
    prompt: draft.prompt.trim(),
    raw: draft.raw?.trim() || undefined,
    label: draft.label?.trim() || undefined,
    tags: mergeRevisionTags(draft.tags) || undefined,
    note: draft.note?.trim() || undefined,
    source: normalizePromptDraftSource(draft.source),
    previewImageUrl: draft.previewImageUrl,
    previewMimeType: draft.previewMimeType,
    thumbnailBlur: draft.thumbnailBlur,
    ingestionState: draft.ingestionState || 'waiting',
    queueLetter: draft.queueLetter || 'A-Z',
    queueNumber: draft.queueNumber || '0-9'
  }))
);

const resolveGenerationTargets = (drafts: PromptDraft[], selectedIds: Set<string>) => {
  const stagingDrafts = drafts.filter((draft) => draft.status === 'staging' && draft.prompt.trim());
  if (selectedIds.size > 0) {
    const selectedTargets = stagingDrafts.filter((draft) => selectedIds.has(draft.id));
    if (selectedTargets.length > 0) {
      return selectedTargets;
    }
  }
  return stagingDrafts.filter((draft) => !draft.previewImageUrl);
};

const serializeGenerationError = (error: unknown): { userMessage: string; details: string } => {
  if (error instanceof Error) {
    const userMessage = normalizeUserFacingError(error.message || 'Preview generation failed.');
    const detailParts = [
      error.name ? `name: ${error.name}` : '',
      error.message ? `message: ${error.message}` : '',
      error.stack ? `stack:\n${error.stack}` : ''
    ].filter(Boolean);
    return {
      userMessage,
      details: detailParts.join('\n\n') || userMessage
    };
  }

  if (typeof error === 'string') {
    const userMessage = normalizeUserFacingError(error);
    return { userMessage, details: error };
  }

  try {
    const raw = JSON.stringify(error, null, 2);
    const userMessage = normalizeUserFacingError(raw || 'Preview generation failed.');
    return { userMessage, details: raw || userMessage };
  } catch {
    const fallback = 'Preview generation failed.';
    return { userMessage: fallback, details: fallback };
  }
};

const containsPromptTemplateToken = (value: string) => /\{\{\s*[^}]+\s*\}\}/.test(value);

const resolveRevisionThumbnail = (revision: Revision | null | undefined): { url: string; mimeType: string } => {
  if (!revision) return { url: '', mimeType: '' };

  const candidates: string[] = [];
  if (revision.thumbnailLink) candidates.push(revision.thumbnailLink);
  if (revision.fileUrl) candidates.push(revision.fileUrl);

  let aiPreviewMimeType = '';
  try {
    if (revision.aiParameters) {
      const parsed = JSON.parse(revision.aiParameters);
      const adv = parsed?.advanced_params || parsed || {};
      if (typeof adv.parentItemThumbnail === 'string' && adv.parentItemThumbnail.trim()) {
        candidates.push(adv.parentItemThumbnail.trim());
      }
      if (typeof adv.previewImageUrl === 'string' && adv.previewImageUrl.trim()) {
        candidates.push(adv.previewImageUrl.trim());
      }
      if (typeof adv.previewMimeType === 'string' && adv.previewMimeType.trim()) {
        aiPreviewMimeType = adv.previewMimeType.trim();
      }
    }
  } catch {
    // Ignore malformed metadata and continue with direct revision fields.
  }

  const url = candidates.find(Boolean) || '';
  if (!url) return { url: '', mimeType: '' };

  const dataUrlMime = url.startsWith('data:')
    ? (url.match(/^data:([^;,]+)/i)?.[1] || '')
    : '';
  const mimeType = aiPreviewMimeType || revision.mimeType || dataUrlMime || 'image/png';

  return { url, mimeType };
};

const saveDraftPreviewLocally = async (draftId: string, dataUrl: string, mimeType?: string) => {
  const saved = await api.settings.uploadPromptManagerDraftImage(draftId, dataUrl, mimeType);
  return {
    previewImageUrl: saved.fileUrl,
    previewMimeType: saved.mimeType || mimeType || 'image/png'
  };
};

const migratePromptManagerDraftAssets = async (drafts: PromptDraft[]) => {
  let changed = false;
  const migrated = await Promise.all(drafts.map(async (draft) => {
    const previewImageUrl = typeof draft.previewImageUrl === 'string' ? draft.previewImageUrl.trim() : '';
    if (!previewImageUrl.startsWith('data:')) {
      return draft;
    }

    const inferredMimeType = draft.previewMimeType
      || (previewImageUrl.match(/^data:([^;,]+)/i)?.[1] || '')
      || 'image/png';
    const savedPreview = await saveDraftPreviewLocally(draft.id, previewImageUrl, inferredMimeType);
    changed = true;
    return {
      ...draft,
      previewImageUrl: savedPreview.previewImageUrl,
      previewMimeType: savedPreview.previewMimeType,
      updatedAt: Date.now()
    };
  }));

  return {
    drafts: migrated,
    changed
  };
};

interface UsePromptManagerOptions {
  confirm?: (config: ConfirmConfig) => Promise<boolean>;
}

export const usePromptManager = ({ confirm }: UsePromptManagerOptions = {}) => {
  const inferenceCache = readPromptManagerInferenceCache();
  const bulkGenerationActiveRef = useRef(false);
  const stopGenerationRequestedRef = useRef(false);
  const draftsLoadedRef = useRef(false);
  const skipNextDraftAutosaveRef = useRef(false);
  const draftAutosaveTimerRef = useRef<number | null>(null);
  const lastPersistedDraftsJsonRef = useRef<string>('');
  const [drafts, setDrafts] = useState<PromptDraft[]>(() => readStoredDrafts());
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectThumbnails, setProjectThumbnails] = useState<Record<string, { url: string; mimeType: string }>>({});
  const [activeTab, setActiveTab] = useState<PromptManagerTab>('staging');
  const [viewMode, setViewMode] = useState<PromptManagerViewMode>(() => readStoredView());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [previewModel, setPreviewModel] = useState<string>(
    typeof inferenceCache.previewModel === 'string' && inferenceCache.previewModel.trim()
      ? inferenceCache.previewModel
      : DEFAULT_GOOGLE_IMAGE_PREVIEW_MODEL
  );
  const [checkpointModelOptions, setCheckpointModelOptions] = useState<PromptManagerImageModelOption[]>(IMAGE_MODEL_OPTIONS);
  const [modelRegistry, setModelRegistry] = useState<ModelOption[]>([]);
  const [modelBlueprints, setModelBlueprints] = useState<Record<string, any>>({});
  const [modelCategoryMap, setModelCategoryMap] = useState<Record<string, string>>({});
  const [currentModelCategory, setCurrentModelCategory] = useState<'Visual' | 'Motion'>('Visual');
  const [currentModelFeatures, setCurrentModelFeatures] = useState<EngineFeatures>(DEFAULT_ENGINE_FEATURES);
  const [currentModelSchema, setCurrentModelSchema] = useState<DynamicParamBlueprint[]>([]);
  const [selectedRatio, setSelectedRatio] = useState<PromptManagerAspectRatio>(() => normalizeAspectRatio(String(inferenceCache.selectedRatio || '1:1')));
  const [customWidth, setCustomWidth] = useState(() => Number.isFinite(Number(inferenceCache.customWidth)) ? Number(inferenceCache.customWidth) : 1024);
  const [customHeight, setCustomHeight] = useState(() => Number.isFinite(Number(inferenceCache.customHeight)) ? Number(inferenceCache.customHeight) : 1024);
  const [negativePrompt, setNegativePrompt] = useState(() => typeof inferenceCache.negativePrompt === 'string' ? inferenceCache.negativePrompt : '');
  const [seed, setSeed] = useState(() => typeof inferenceCache.seed === 'string' ? inferenceCache.seed : '');
  const [useSearch, setUseSearch] = useState(() => typeof inferenceCache.useSearch === 'boolean' ? inferenceCache.useSearch : true);
  const [enhance, setEnhance] = useState(() => typeof inferenceCache.enhance === 'boolean' ? inferenceCache.enhance : false);
  const [nologo, setNologo] = useState(() => typeof inferenceCache.nologo === 'boolean' ? inferenceCache.nologo : true);
  const [safe, setSafe] = useState(() => typeof inferenceCache.safe === 'boolean' ? inferenceCache.safe : true);
  const [dynamicParams, setDynamicParams] = useState<Record<string, any>>(
    () => inferenceCache.dynamicParams && typeof inferenceCache.dynamicParams === 'object' ? inferenceCache.dynamicParams : {}
  );
  const [duration, setDuration] = useState(() => Number.isFinite(Number(inferenceCache.duration)) ? Number(inferenceCache.duration) : 4);
  const [audio, setAudio] = useState(() => typeof inferenceCache.audio === 'boolean' ? inferenceCache.audio : false);
  const [isPrivate, setIsPrivate] = useState(() => typeof inferenceCache.isPrivate === 'boolean' ? inferenceCache.isPrivate : false);
  const [nofeed, setNofeed] = useState(() => typeof inferenceCache.nofeed === 'boolean' ? inferenceCache.nofeed : true);
  const [isImporting, setIsImporting] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [cooldownProgress, setCooldownProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isMergingDuplicates, setIsMergingDuplicates] = useState(false);
  const [latestPreviewPollenUsed, setLatestPreviewPollenUsed] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [currentGeneratingDraftId, setCurrentGeneratingDraftId] = useState<string | null>(null);
  const [lastCopiedDraftId, setLastCopiedDraftId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // ignore storage failures
    }
  }, [drafts]);

  const syncPromptDraftsFromDatabase = useCallback(async () => {
    try {
      let remoteDrafts = sortDrafts((await api.settings.listPromptManagerDrafts()).map((draft) => {
        const normalizedDraft = {
          ...draft,
          revisionHistory: normalizePromptDraftRevisionHistory(draft.revisionHistory)
        };
        return {
          ...normalizedDraft,
          revisionHistory: prunePromptDraftRevisionHistory(normalizedDraft)
        };
      }));
      const localDrafts = readStoredDrafts();
      if (remoteDrafts.length === 0 && localDrafts.length > 0) {
        await api.settings.appendPromptManagerDrafts(localDrafts);
        remoteDrafts = localDrafts;
        dispatchNotification('Prompt Manager', `Migrated ${localDrafts.length} local prompt draft(s) to the database.`, 'success');
      }
      const migrated = await migratePromptManagerDraftAssets(remoteDrafts);
      const nextDrafts = sortDrafts(migrated.drafts);
      lastPersistedDraftsJsonRef.current = JSON.stringify(nextDrafts);
      skipNextDraftAutosaveRef.current = true;
      setDrafts(nextDrafts);
      if (migrated.changed) {
        await api.settings.appendPromptManagerDrafts(nextDrafts);
        dispatchNotification('Prompt Manager', 'Stored existing Prompt Manager previews in local storage folder.', 'success');
      }
    } catch {
      const fallbackDrafts = readStoredDrafts();
      lastPersistedDraftsJsonRef.current = JSON.stringify(fallbackDrafts);
      skipNextDraftAutosaveRef.current = true;
      setDrafts(fallbackDrafts);
      dispatchNotification('Prompt Manager', 'Unable to load prompt drafts from the database. Showing local fallback data.', 'info');
    } finally {
      draftsLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    void syncPromptDraftsFromDatabase();
  }, [syncPromptDraftsFromDatabase]);

  useEffect(() => () => {
    if (draftAutosaveTimerRef.current) {
      window.clearTimeout(draftAutosaveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!draftsLoadedRef.current) return;
    if (draftAutosaveTimerRef.current) {
      window.clearTimeout(draftAutosaveTimerRef.current);
    }

    const serializedDrafts = JSON.stringify(drafts);
    if (skipNextDraftAutosaveRef.current) {
      skipNextDraftAutosaveRef.current = false;
      if (serializedDrafts === lastPersistedDraftsJsonRef.current) return;
    }
    if (serializedDrafts === lastPersistedDraftsJsonRef.current) return;

    draftAutosaveTimerRef.current = window.setTimeout(() => {
      draftAutosaveTimerRef.current = null;
      void api.settings.appendPromptManagerDrafts(drafts)
        .then(() => {
          lastPersistedDraftsJsonRef.current = serializedDrafts;
        })
        .catch(() => {
          dispatchNotification('Prompt Manager', 'Unable to save prompt drafts to the database. Local cache was kept.', 'error');
        });
    }, DRAFT_AUTOSAVE_DELAY_MS);
  }, [drafts]);

  useEffect(() => {
    const syncDrafts = () => {
      void syncPromptDraftsFromDatabase();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== DRAFT_STORAGE_KEY) return;
      syncDrafts();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('aimana-prompt-drafts-updated', syncDrafts);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('aimana-prompt-drafts-updated', syncDrafts);
    };
  }, [syncPromptDraftsFromDatabase]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      // ignore storage failures
    }
  }, [viewMode]);

  useEffect(() => {
    writePromptManagerInferenceCache({
      previewModel,
      selectedRatio,
      customWidth,
      customHeight,
      negativePrompt,
      seed,
      useSearch,
      enhance,
      nologo,
      safe,
      dynamicParams,
      duration,
      audio,
      isPrivate,
      nofeed
    });
  }, [
    previewModel,
    selectedRatio,
    customWidth,
    customHeight,
    negativePrompt,
    seed,
    useSearch,
    enhance,
    nologo,
    safe,
    dynamicParams,
    duration,
    audio,
    isPrivate,
    nofeed
  ]);

  useEffect(() => {
    setSelectedDraftIds(new Set());
  }, [activeTab]);

  const refreshProjects = useCallback(async () => {
    setIsProjectsLoading(true);
    try {
      const rows = await api.projects.list();
      const promptCollections = rows.filter((project) => String(project.projectType || '').toLowerCase() === PROMPT_COLLECTION_PROJECT_TYPE);
      const projectSummaries = await Promise.all(
        promptCollections.map(async (project) => {
          try {
            const items = await api.items.list(project.id);
            const firstWithPreview = items.find((item) => {
              const resolved = resolveRevisionThumbnail(item.currentRevision);
              return !!resolved.url;
            });
            const resolved = resolveRevisionThumbnail(firstWithPreview?.currentRevision);
            return {
              project: {
                ...project,
                itemCount: items.length
              },
              thumbnail: resolved.url ? [project.id, resolved] as const : null
            };
          } catch {
            return {
              project: {
                ...project,
                itemCount: 0
              },
              thumbnail: null
            };
          }
        })
      );
      const sortedPromptCollections = projectSummaries
        .map((entry) => entry.project)
        .sort((a, b) => {
          const pinnedDiff = Number(!!b.isPinned) - Number(!!a.isPinned);
          if (pinnedDiff !== 0) return pinnedDiff;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      setProjects(sortedPromptCollections);
      setProjectThumbnails(Object.fromEntries(
        projectSummaries
          .map((entry) => entry.thumbnail)
          .filter(Boolean) as Array<readonly [string, { url: string; mimeType: string }]>
      ));
      setSelectedProjectId((current) => {
        if (current && sortedPromptCollections.some((project) => project.id === current)) {
          return current;
        }
        return sortedPromptCollections[0]?.id || '';
      });
    } catch (error) {
      setProjects([]);
      setProjectThumbnails({});
      dispatchNotification('Prompt Manager', 'Failed to load prompt collections.', 'error');
    } finally {
      setIsProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const refreshCheckpointModelOptions = useCallback(async () => {
    try {
      const [registry, registryResponse] = await Promise.all([
        loadDynamicRegistry(),
        fetch('/api/settings/registry', {
          headers: api.auth.getAuthHeaders(),
          cache: 'no-store'
        })
      ]);
      const options = registry
        .filter((model) => model.category === 'Visual' || model.category === 'Motion')
        .map((model) => ({
          id: String(model.id),
          label: model.label,
          description: model.desc || `${model.category} checkpoint`
        }));
      const visualRegistry = registry.filter((model) => model.category === 'Visual' || model.category === 'Motion');
      const nextCategoryMap: Record<string, string> = {};
      registry.forEach((model) => {
        nextCategoryMap[String(model.id)] = String(model.category || '');
      });
      const nextBlueprints: Record<string, any> = {};
      if (registryResponse.ok) {
        const rows = await registryResponse.json();
        if (Array.isArray(rows)) {
          rows.forEach((row) => {
            if (row?.id) nextBlueprints[String(row.id)] = row;
          });
        }
      }

      setModelRegistry(visualRegistry);
      setModelBlueprints(nextBlueprints);
      setModelCategoryMap(nextCategoryMap);

      if (options.length > 0) {
        setCheckpointModelOptions(options);
      } else {
        setCheckpointModelOptions(IMAGE_MODEL_OPTIONS);
      }
    } catch {
      setCheckpointModelOptions(IMAGE_MODEL_OPTIONS);
    }
  }, []);

  useEffect(() => {
    void refreshCheckpointModelOptions();
  }, [refreshCheckpointModelOptions]);

  useEffect(() => {
    const blueprint = modelBlueprints[previewModel];
    const fallbackFeatures = {
      ...DEFAULT_ENGINE_FEATURES,
      showEnhancements: previewModel.startsWith('pollinations-'),
      showNologo: previewModel.startsWith('pollinations-')
    };
    const parsedFeatures = normalizeEngineFeatures(
      parseJsonOrFallback<Record<string, unknown> | null>(blueprint?.featuresJson, null),
      fallbackFeatures
    );
    const schema = Array.isArray(parseJsonOrFallback<DynamicParamBlueprint[]>(blueprint?.uiConfigJson, []))
      ? parseJsonOrFallback<DynamicParamBlueprint[]>(blueprint?.uiConfigJson, [])
      : [];
    const nextCategory = modelCategoryMap[previewModel] === 'Motion' ? 'Motion' : 'Visual';

    setCurrentModelCategory(nextCategory);
    setCurrentModelFeatures(parsedFeatures);
    setCurrentModelSchema(schema);
    setDynamicParams((previous) => {
      const next: Record<string, any> = {};
      schema.forEach((param) => {
        next[param.key] = previous[param.key] ?? param.default;
      });

      // Some models expose image input through feature flags instead of an explicit
      // `image` schema entry. Preserve the saved reference image in those cases.
      const supportsReferenceImage = parsedFeatures.showImageInput || schema.some((param) => param.key === 'image');
      if (supportsReferenceImage) {
        if (previous.image !== undefined) {
          next.image = previous.image;
        }
        if (previous.referenceItemId !== undefined) {
          next.referenceItemId = previous.referenceItemId;
        }
      }

      return next;
    });

    const schemaDuration = schema.find((param) => param.key === 'duration');
    const cachedDuration = Number(dynamicParams.duration ?? duration);
    if (schemaDuration) {
      const nextDuration = Number.isFinite(cachedDuration)
        ? cachedDuration
        : Number(schemaDuration.default ?? duration);
      if (Number.isFinite(nextDuration)) {
        setDuration(nextDuration);
      }
    }

    if (schema.find((param) => param.key === 'audio')) {
      const cachedAudio = dynamicParams.audio;
      setAudio(typeof cachedAudio === 'boolean'
        ? cachedAudio
        : Boolean(schema.find((param) => param.key === 'audio')?.default));
    }

    if (
      !negativePrompt.trim()
      && typeof blueprint?.defaultNegativePrompt === 'string'
      && blueprint.defaultNegativePrompt.trim()
    ) {
      setNegativePrompt(blueprint.defaultNegativePrompt.trim());
    }
  }, [previewModel, modelBlueprints, modelCategoryMap, negativePrompt]);

  const setDynamicParam = useCallback((key: string, value: any) => {
    setDynamicParams((previous) => ({
      ...previous,
      [key]: value
    }));
  }, []);

  const createDraft = useCallback(() => {
    const next = toPromptDraft({
      title: '',
      prompt: ''
    });
    setDrafts((previous) => sortDrafts([next, ...previous]));
    setActiveTab('staging');
    return next.id;
  }, []);

  const updateDraft = useCallback((draftId: string, updates: Partial<PromptDraft>) => {
    setDrafts((previous) => {
      const existing = previous.find((draft) => draft.id === draftId);
      if (!existing) {
        const timestamp = Date.now();
        return sortDrafts([
          {
            id: draftId,
            title: String(updates.title || '').trim(),
            prompt: String(updates.prompt || '').trim(),
            raw: typeof updates.raw === 'string' && updates.raw.trim() ? updates.raw.trim() : undefined,
            label: typeof updates.label === 'string' && updates.label.trim() ? updates.label.trim() : undefined,
            tags: mergeRevisionTags(updates.tags) || undefined,
            note: typeof updates.note === 'string' && updates.note.trim() ? updates.note.trim() : undefined,
            source: updates.source === 'json' ? 'json' : 'manual',
            status: updates.status || 'staging',
            previewImageUrl: updates.previewImageUrl,
            previewMimeType: updates.previewMimeType,
            thumbnailBlur: updates.thumbnailBlur,
            previewError: typeof updates.previewError === 'string' && updates.previewError.trim() ? updates.previewError.trim() : undefined,
            previewErrorDetails: typeof updates.previewErrorDetails === 'string' && updates.previewErrorDetails.trim() ? updates.previewErrorDetails.trim() : undefined,
            revisionHistory: normalizePromptDraftRevisionHistory(updates.revisionHistory),
            createdAt: timestamp,
            updatedAt: timestamp
          },
          ...previous
        ]);
      }

      return sortDrafts(previous.map((draft) => {
        if (draft.id !== draftId) return draft;

        const timestamp = Date.now();
        const nextDraft: PromptDraft = {
          ...draft,
          ...updates,
          revisionHistory: prunePromptDraftRevisionHistory(draft),
          ...(Object.prototype.hasOwnProperty.call(updates, 'tags')
            ? { tags: mergeRevisionTags(updates.tags) || undefined }
            : {}),
          updatedAt: timestamp
        };

        return {
          ...nextDraft,
          revisionHistory: hasPromptDraftRevisionChange(draft, nextDraft)
            ? appendPromptDraftRevision(draft, timestamp)
            : prunePromptDraftRevisionHistory(nextDraft)
        };
      }));
    });
  }, []);

  const requestConfirm = useCallback(async (config: ConfirmConfig) => {
    if (confirm) return confirm(config);
    return window.confirm(config.description);
  }, [confirm]);

  const removeDraft = useCallback(async (draftId: string) => {
    const target = drafts.find((draft) => draft.id === draftId);
    if (!target) return false;

    const targetLabel = target.title.trim() || 'Untitled Prompt';
    const confirmed = target.status === 'deleted'
      ? await requestConfirm({
          title: 'Delete Prompt Forever',
          description: `Delete "${targetLabel}" forever? This cannot be undone.`,
          confirmLabel: 'Delete Forever',
          tone: 'danger'
        })
      : await requestConfirm({
          title: 'Move Prompt To Recycle Bin',
          description: `Move "${targetLabel}" to recycle bin?`,
          confirmLabel: 'Move To Recycle Bin',
          tone: 'danger'
        });
    if (!confirmed) return false;

    if (target.status === 'deleted') {
      setDrafts((previous) => previous.filter((draft) => draft.id !== draftId));
      void api.settings.deletePromptManagerDrafts([draftId]).catch(() => {
        dispatchNotification('Prompt Manager', 'Unable to delete prompt draft from the database. Local cache was updated.', 'error');
      });
    } else {
      setDrafts((previous) => sortDrafts(previous.map((draft) => (
        draft.id === draftId
          ? { ...draft, status: 'deleted', updatedAt: Date.now() }
          : draft
      ))));
    }
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      next.delete(draftId);
      return next;
    });
    dispatchNotification(
      'Prompt Manager',
      target.status === 'deleted'
        ? `Deleted "${targetLabel}" forever.`
        : `Moved "${targetLabel}" to recycle bin.`,
      'success'
    );
    return true;
  }, [drafts, requestConfirm]);

  const removeSelectedDrafts = useCallback(async () => {
    if (selectedDraftIds.size === 0) return false;
    const selectedCount = selectedDraftIds.size;
    const confirmed = await requestConfirm({
      title: 'Move Selected Prompts To Recycle Bin',
      description: `Move ${selectedCount} selected prompt${selectedCount === 1 ? '' : 's'} to recycle bin?`,
      confirmLabel: 'Move To Recycle Bin',
      tone: 'danger'
    });
    if (!confirmed) return false;

    setDrafts((previous) => (
      sortDrafts(previous.map((draft) => (
        selectedDraftIds.has(draft.id)
          ? { ...draft, status: 'deleted', updatedAt: Date.now() }
          : draft
      )))
    ));
    setSelectedDraftIds(new Set());
    dispatchNotification(
      'Prompt Manager',
      `Moved ${selectedCount} prompt${selectedCount === 1 ? '' : 's'} to recycle bin.`,
      'success'
    );
    return true;
  }, [requestConfirm, selectedDraftIds]);

  const deleteDraftForever = useCallback(async (draftId: string) => {
    const target = drafts.find((draft) => draft.id === draftId);
    if (!target) return false;

    const targetLabel = target.title.trim() || 'Untitled Prompt';
    const confirmed = await requestConfirm({
      title: 'Delete Prompt Forever',
      description: `Delete "${targetLabel}" forever? This cannot be undone.`,
      confirmLabel: 'Delete Forever',
      tone: 'danger'
    });
    if (!confirmed) return false;

    setDrafts((previous) => previous.filter((draft) => draft.id !== draftId));
    void api.settings.deletePromptManagerDrafts([draftId]).catch(() => {
      dispatchNotification('Prompt Manager', 'Unable to delete prompt draft from the database. Local cache was updated.', 'error');
    });
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      next.delete(draftId);
      return next;
    });
    dispatchNotification('Prompt Manager', `Deleted "${targetLabel}" forever.`, 'success');
    return true;
  }, [drafts, requestConfirm]);

  const deleteSelectedDraftsForever = useCallback(async () => {
    if (selectedDraftIds.size === 0) return false;
    const selectedCount = selectedDraftIds.size;
    const confirmed = await requestConfirm({
      title: 'Delete Selected Prompts Forever',
      description: `Delete ${selectedCount} selected prompt${selectedCount === 1 ? '' : 's'} forever? This cannot be undone.`,
      confirmLabel: 'Delete Forever',
      tone: 'danger'
    });
    if (!confirmed) return false;

    const idsToDelete = Array.from(selectedDraftIds);
    setDrafts((previous) => previous.filter((draft) => !selectedDraftIds.has(draft.id)));
    void api.settings.deletePromptManagerDrafts(idsToDelete).catch(() => {
      dispatchNotification('Prompt Manager', 'Unable to delete selected prompt drafts from the database. Local cache was updated.', 'error');
    });
    setSelectedDraftIds(new Set());
    dispatchNotification(
      'Prompt Manager',
      `Deleted ${selectedCount} prompt${selectedCount === 1 ? '' : 's'} forever.`,
      'success'
    );
    return true;
  }, [requestConfirm, selectedDraftIds]);

  const restoreDraft = useCallback((draftId: string) => {
    setDrafts((previous) => sortDrafts(previous.map((draft) => (
      draft.id === draftId
        ? { ...draft, status: 'staging', updatedAt: Date.now() }
        : draft
    ))));
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      next.delete(draftId);
      return next;
    });
  }, []);

  const restoreSelectedDrafts = useCallback(() => {
    if (selectedDraftIds.size === 0) return;
    setDrafts((previous) => sortDrafts(previous.map((draft) => (
      selectedDraftIds.has(draft.id)
        ? { ...draft, status: 'staging', updatedAt: Date.now() }
        : draft
    ))));
    setSelectedDraftIds(new Set());
    setActiveTab('staging');
  }, [selectedDraftIds]);

  const restoreDraftRevision = useCallback((draftId: string, revisionId: string) => {
    setDrafts((previous) => sortDrafts(previous.map((draft) => {
      if (draft.id !== draftId) return draft;
      const history = normalizePromptDraftRevisionHistory(draft.revisionHistory);
      const revision = history.find((entry) => entry.id === revisionId);
      if (!revision) return draft;

      const timestamp = Date.now();
      const remainingHistory = history.filter((entry) => entry.id !== revisionId);
      return {
        ...draft,
        title: revision.title,
        prompt: revision.prompt,
        raw: revision.raw,
        label: revision.label,
        tags: revision.tags,
        note: revision.note,
        status: revision.status,
        ingestionState: revision.ingestionState,
        queueLetter: revision.queueLetter,
        queueNumber: revision.queueNumber,
        previewImageUrl: revision.previewImageUrl,
        previewMimeType: revision.previewMimeType,
        previewError: undefined,
        previewErrorDetails: undefined,
        revisionHistory: [
          snapshotPromptDraftRevision(draft, timestamp),
          ...remainingHistory
        ].slice(0, PROMPT_DRAFT_REVISION_LIMIT),
        updatedAt: timestamp
      };
    })));
    dispatchNotification('Prompt Manager', 'Restored prompt draft revision.', 'success');
  }, []);

  const createDuplicateDraft = useCallback((source: PromptDraft): PromptDraft => {
    const timestamp = Date.now();
    return {
      ...source,
      id: toPromptDraft({ title: source.title, prompt: source.prompt, label: source.label, tags: source.tags, note: source.note }).id,
      title: `${source.title} Copy`,
      source: source.source || 'manual',
      status: 'staging',
      previewError: undefined,
      previewErrorDetails: undefined,
      revisionHistory: undefined,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }, []);

  const duplicateDraft = useCallback((draftId: string) => {
    const source = drafts.find((draft) => draft.id === draftId);
    if (!source) return null;

    const copy = createDuplicateDraft(source);
    setDrafts((previous) => sortDrafts([copy, ...previous]));
    setActiveTab('staging');
    dispatchNotification('Prompt Manager', `Duplicated "${source.title || 'Untitled Prompt'}".`, 'success');
    return copy.id;
  }, [createDuplicateDraft, drafts]);

  const duplicateSelectedDrafts = useCallback(() => {
    const sources = drafts.filter((draft) => (
      selectedDraftIds.has(draft.id)
      && draft.status !== 'deleted'
    ));
    if (sources.length === 0) {
      dispatchNotification('Prompt Manager', 'Select at least one prompt to duplicate.', 'info');
      return [];
    }

    const copies = sources.map(createDuplicateDraft);
    setDrafts((previous) => sortDrafts([...copies, ...previous]));
    setSelectedDraftIds(new Set(copies.map((draft) => draft.id)));
    setActiveTab('staging');
    dispatchNotification(
      'Prompt Manager',
      `Duplicated ${copies.length} prompt${copies.length === 1 ? '' : 's'}.`,
      'success'
    );
    return copies.map((draft) => draft.id);
  }, [createDuplicateDraft, drafts, selectedDraftIds]);

  const toggleSelectDraft = useCallback((draftId: string) => {
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDraftIds(new Set());
  }, []);

  const selectDrafts = useCallback((draftIds: string[]) => {
    setSelectedDraftIds(new Set(draftIds));
  }, []);

  const selectPreviewDrafts = useCallback(() => {
    const next = drafts
      .filter((draft) => draft.status === 'staging' && !!draft.previewImageUrl)
      .map((draft) => draft.id);
    setSelectedDraftIds(new Set(next));
  }, [drafts]);

  const selectMissingPreviewDrafts = useCallback(() => {
    const next = drafts
      .filter((draft) => draft.status === 'staging' && draft.prompt.trim() && !draft.previewImageUrl)
      .map((draft) => draft.id);
    setSelectedDraftIds(new Set(next));
  }, [drafts]);

  const stopPreviewGeneration = useCallback(() => {
    stopGenerationRequestedRef.current = true;
    bulkGenerationActiveRef.current = false;
    setIsGenerating(false);
    setIsCoolingDown(false);
    setCooldownProgress(0);
    setGenerationProgress({ current: 0, total: 0 });
  }, []);

  const moveSelectedDrafts = useCallback((status: 'staging' | 'ready' | 'deleted') => {
    if (selectedDraftIds.size === 0) return;
    setDrafts((previous) => sortDrafts(previous.map((draft) => (
      selectedDraftIds.has(draft.id)
        ? { ...draft, status, updatedAt: Date.now() }
        : draft
    ))));
    setActiveTab(status === 'deleted' ? 'staging' : status);
    setSelectedDraftIds(new Set());
  }, [selectedDraftIds]);

  const copyPrompt = useCallback(async (draftId: string, prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setLastCopiedDraftId(draftId);
    window.setTimeout(() => {
      setLastCopiedDraftId((current) => current === draftId ? null : current);
    }, 1800);
  }, []);

  const uploadPreviewImage = useCallback(async (draftId: string, file: File) => {
    const previewUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Preview upload failed.'));
      reader.readAsDataURL(file);
    });

    const savedPreview = await saveDraftPreviewLocally(draftId, previewUrl, file.type || 'image/*');

    updateDraft(draftId, {
      previewImageUrl: savedPreview.previewImageUrl,
      previewMimeType: savedPreview.previewMimeType,
      previewError: undefined,
      previewErrorDetails: undefined
    });
    dispatchNotification('Prompt Manager', 'Preview image saved locally to draft storage.', 'success');
  }, [updateDraft]);

  const activeDuplicateGroups = useMemo<PromptDraftDuplicateGroup[]>(() => {
    if (activeTab !== 'staging') return [];
    return getPromptDraftDuplicateGroups(drafts.filter((draft) => draft.status === 'staging'));
  }, [activeTab, drafts]);

  const mergeDuplicateDrafts = useCallback(async (selectedDuplicateIds: string[]) => {
    if (activeTab !== 'staging') return false;
    const selectedIds = new Set(selectedDuplicateIds);
    if (selectedIds.size === 0) {
      dispatchNotification('Prompt Manager', 'No duplicate prompts were selected for merge.', 'info');
      return false;
    }

    setIsMergingDuplicates(true);
    try {
      const now = Date.now();
      const archivedDuplicateIds = new Set<string>();
      const mergedGroupKeys = new Set<string>();

      setDrafts((previous) => {
        const draftById = new Map(previous.map((draft) => [draft.id, draft]));
        const mergedDrafts = new Map<string, PromptDraft>();

        activeDuplicateGroups.forEach((group) => {
          const [primaryCandidate, ...allDuplicates] = group.items
            .map((item) => draftById.get(item.id))
            .filter((item): item is PromptDraft => !!item);
          if (!primaryCandidate) return;

          const duplicateCandidates = allDuplicates.filter((duplicateDraft) => selectedIds.has(duplicateDraft.id));
          if (duplicateCandidates.length === 0) return;

          let nextDraft: PromptDraft = {
            ...primaryCandidate,
            updatedAt: now
          };

          duplicateCandidates.forEach((duplicateDraft) => {
            if (!isMeaningfulText(nextDraft.raw) && isMeaningfulText(duplicateDraft.raw)) {
              nextDraft = { ...nextDraft, raw: duplicateDraft.raw?.trim() };
            }
            if (!isMeaningfulText(nextDraft.label) && isMeaningfulText(duplicateDraft.label)) {
              nextDraft = { ...nextDraft, label: duplicateDraft.label?.trim() };
            }
            const mergedTags = mergeRevisionTags(nextDraft.tags, duplicateDraft.tags);
            if (mergedTags !== (nextDraft.tags || '')) {
              nextDraft = { ...nextDraft, tags: mergedTags || undefined };
            }
            const mergedNote = mergeDistinctDraftNotes(nextDraft.note, duplicateDraft.note);
            if (mergedNote !== nextDraft.note) {
              nextDraft = { ...nextDraft, note: mergedNote };
            }
            if (!nextDraft.previewImageUrl && duplicateDraft.previewImageUrl) {
              nextDraft = {
                ...nextDraft,
                previewImageUrl: duplicateDraft.previewImageUrl,
                previewMimeType: duplicateDraft.previewMimeType,
                previewError: undefined,
                previewErrorDetails: undefined
              };
            } else if (!nextDraft.previewImageUrl && !nextDraft.previewError && duplicateDraft.previewError) {
              nextDraft = {
                ...nextDraft,
                previewError: duplicateDraft.previewError,
                previewErrorDetails: duplicateDraft.previewErrorDetails
              };
            }
            nextDraft = {
              ...nextDraft,
              ingestionState: resolvePreferredIngestionState(nextDraft.ingestionState, duplicateDraft.ingestionState)
            };
            archivedDuplicateIds.add(duplicateDraft.id);
          });

          mergedDrafts.set(primaryCandidate.id, nextDraft);
          mergedGroupKeys.add(group.normalizedKey);
        });

        return sortDrafts(previous.map((draft) => {
          if (archivedDuplicateIds.has(draft.id)) {
            return {
              ...draft,
              status: 'deleted',
              updatedAt: now
            };
          }
          return mergedDrafts.get(draft.id) || draft;
        }));
      });

      setSelectedDraftIds((previous) => {
        const next = new Set(previous);
        archivedDuplicateIds.forEach((draftId) => next.delete(draftId));
        return next;
      });

      if (archivedDuplicateIds.size === 0) {
        dispatchNotification('Prompt Manager', 'No duplicate prompts were selected for merge.', 'info');
        return false;
      }

      dispatchNotification(
        'Prompt Manager',
        `Merged ${archivedDuplicateIds.size} duplicate prompt${archivedDuplicateIds.size === 1 ? '' : 's'} across ${mergedGroupKeys.size} group${mergedGroupKeys.size === 1 ? '' : 's'}.`,
        'success'
      );
      return true;
    } finally {
      setIsMergingDuplicates(false);
    }
  }, [activeDuplicateGroups, activeTab]);

  const importDrafts = useCallback(async (rawInput: string, sourceInput?: string) => {
    setIsImporting(true);
    try {
      const parsed = parsePromptImportInput(rawInput);
      const sourceParsed = sourceInput ? parsePromptImportInput(sourceInput) : [];
      const timestamp = Date.now();
      const nextDrafts = parsed.map((record, index) => {
        const sourceRecord = sourceParsed[index];
        const sourcePrompt = typeof sourceRecord?.prompt === 'string' ? sourceRecord.prompt.trim() : '';
        const resolvedPrompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
        const sourceRaw = typeof sourceRecord?.raw === 'string' ? sourceRecord.raw.trim() : '';
        const rawPrompt = sourceRaw
          || (sourcePrompt && (sourcePrompt !== resolvedPrompt || containsPromptTemplateToken(sourcePrompt)) ? sourcePrompt : '')
          || (typeof record.raw === 'string' ? record.raw.trim() : '');

        return toPromptDraft({
          ...record,
          prompt: resolvedPrompt,
          raw: rawPrompt || undefined
        }, undefined, timestamp + index);
      });
      setDrafts((previous) => sortDrafts([...nextDrafts, ...previous]));
      setActiveTab('staging');
      dispatchNotification('Prompt Manager', `Imported ${nextDrafts.length} prompt draft(s).`, 'success');
      return { count: nextDrafts.length };
    } finally {
      setIsImporting(false);
    }
  }, []);

  const generatePreviewImages = useCallback(async () => {
    if (bulkGenerationActiveRef.current) return;
    const targets = resolveGenerationTargets(drafts, selectedDraftIds);
    if (targets.length === 0) {
      dispatchNotification('Prompt Manager', 'No staging prompts are ready for preview generation.', 'info');
      return;
    }

    bulkGenerationActiveRef.current = true;
    stopGenerationRequestedRef.current = false;
    setIsGenerating(true);
    setIsCoolingDown(false);
    setCooldownProgress(0);
    setGenerationProgress({ current: 0, total: targets.length });
    const modelForPreview = resolvePreviewModelForImageGeneration(previewModel);
    const isPollinationsModel = previewModel.startsWith('pollinations-');
    const isMotionModel = modelCategoryMap[previewModel] === 'Motion';
    const parsedSeed = Number.parseInt(seed, 10);
    const resolvedSeed = Number.isFinite(parsedSeed) ? parsedSeed : undefined;
    const generationAspectRatio = resolveGenerationAspectRatio(selectedRatio);
    const dynamicDuration = Number(dynamicParams.duration ?? duration);
    const resolvedDuration = Number.isFinite(dynamicDuration) ? dynamicDuration : undefined;
    const dynamicAudio = dynamicParams.audio;
    const resolvedAudio = typeof dynamicAudio === 'boolean' ? dynamicAudio : audio;
    const dynamicImage = typeof dynamicParams.image === 'string' ? dynamicParams.image.trim() : '';
    const dynamicReferenceItemId = typeof dynamicParams.referenceItemId === 'string' ? dynamicParams.referenceItemId.trim() : '';
    const qualityValue = dynamicParams.quality;
    const resolvedQuality = qualityValue === undefined || qualityValue === null || qualityValue === ''
      ? undefined
      : String(qualityValue);
    const transparentValue = dynamicParams.transparent;
    const resolvedTransparent = typeof transparentValue === 'boolean' ? transparentValue : undefined;
    const guidanceValue = dynamicParams.guidance_scale;
    const resolvedGuidance = typeof guidanceValue === 'number'
      ? guidanceValue
      : Number.isFinite(Number(guidanceValue))
        ? Number(guidanceValue)
        : undefined;

    let completed = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    let wasStopped = false;
    let wasStoppedDueToConsecutiveFailures = false;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (stopGenerationRequestedRef.current || !bulkGenerationActiveRef.current) {
          wasStopped = true;
          break;
        }
        if (index > 0) {
          setIsCoolingDown(true);
          setCooldownProgress(0);
          let step = 0;
          const interrupted = await new Promise<boolean>((resolve) => {
            const timer = window.setInterval(() => {
              if (stopGenerationRequestedRef.current || !bulkGenerationActiveRef.current) {
                window.clearInterval(timer);
                resolve(true);
                return;
              }
              step += 1;
              setCooldownProgress((step / 50) * 100);
              if (step >= 50) {
                window.clearInterval(timer);
                resolve(false);
              }
            }, 100);
          });
          setIsCoolingDown(false);
          setCooldownProgress(0);
          if (interrupted) {
            wasStopped = true;
            break;
          }
        }

        const draft = targets[index];
        setCurrentGeneratingDraftId(draft.id);
        dispatchNotification(
          'Prompt Manager',
          `Generating sample ${index + 1} of ${targets.length}: ${draft.title || 'Untitled Prompt'}`,
          'info'
        );
        setGenerationProgress({ current: completed + failed + 1, total: targets.length });
        try {
          const resolvedReferenceImage = await resolvePromptManagerReferenceImage(
            dynamicImage,
            dynamicReferenceItemId
          );
          const referenceImageTag = dynamicReferenceItemId
            ? await resolveReferenceImageTitleTag(dynamicReferenceItemId)
            : '';
          const result = isPollinationsModel
            ? await generateMediaWithPollinations(
                draft.prompt,
                generationAspectRatio,
                previewModel as PollinationsModel,
                selectedRatio === 'custom' ? customWidth : undefined,
                selectedRatio === 'custom' ? customHeight : undefined,
                resolvedSeed,
                negativePrompt || undefined,
                {
                  enhance,
                  nologo,
                  safe,
                  private: isPrivate,
                  nofeed,
                  transparent: resolvedTransparent,
                  quality: resolvedQuality,
                  guidance_scale: resolvedGuidance,
                  duration: resolvedDuration,
                  audio: resolvedAudio,
                  image: resolvedReferenceImage || undefined
                }
              )
            : await generateImageWithGemini(
                draft.prompt,
                generationAspectRatio,
                modelForPreview,
                useSearch,
                resolvedSeed,
                resolvedReferenceImage || undefined
              );
          if (isPollinationsModel) {
            const modelData = modelRegistry.find((model) => model.id === previewModel);
            const resolvedCharge = resolvePollenCharge({
              model: modelData,
              pollenUsed: 'pollenUsed' in result ? result.pollenUsed : undefined,
              promptText: draft.prompt,
              durationSeconds: resolvedDuration
            });
            const resolvedPollenUsed = 'pollenUsed' in result && typeof result.pollenUsed === 'string'
              ? result.pollenUsed
              : '';
            const pollenUsed = resolvedPollenUsed || (resolvedCharge.amount !== null ? String(resolvedCharge.amount) : '');
            if (typeof pollenUsed === 'string' && pollenUsed) {
              consumePollenCredit(
                pollenUsed,
                resolvedCharge.isEstimated ? 'Prompt Manager Preview (estimated)' : 'Prompt Manager Preview'
              );
              setLatestPreviewPollenUsed(pollenUsed);
            }
          }
          const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
          const savedPreview = await saveDraftPreviewLocally(
            draft.id,
            dataUrl,
            result.mimeType || (isMotionModel ? 'video/mp4' : 'image/png')
          );
          updateDraft(draft.id, {
            previewImageUrl: savedPreview.previewImageUrl,
            previewMimeType: savedPreview.previewMimeType,
            tags: mergeRevisionTags(draft.tags, referenceImageTag),
            previewError: undefined,
            previewErrorDetails: undefined
          });
          completed += 1;
          consecutiveFailures = 0;
        } catch (error) {
          if (stopGenerationRequestedRef.current || !bulkGenerationActiveRef.current) {
            wasStopped = true;
            break;
          }
          const serializedError = serializeGenerationError(error);
          updateDraft(draft.id, {
            previewError: serializedError.userMessage,
            previewErrorDetails: serializedError.details
          });
          dispatchNotification(
            'Prompt Manager',
            `${draft.title || 'Untitled Prompt'} failed: ${serializedError.userMessage}`,
            'error'
          );
          failed += 1;
          consecutiveFailures += 1;
          if (consecutiveFailures >= 2) {
            wasStopped = true;
            wasStoppedDueToConsecutiveFailures = true;
            bulkGenerationActiveRef.current = false;
            stopGenerationRequestedRef.current = true;
            break;
          }
        }
      }

      if (wasStoppedDueToConsecutiveFailures) {
        dispatchNotification(
          'Prompt Manager',
          'Generation has been stopped due to 2 consecutive failures.',
          'error'
        );
      } else if (wasStopped) {
        dispatchNotification('Prompt Manager', `Stopped after ${completed} preview(s).`, completed > 0 ? 'info' : 'error');
      } else if (completed > 0 && failed === 0) {
        dispatchNotification('Prompt Manager', `Generated ${completed} preview image(s).`, 'success');
      } else if (completed > 0) {
        dispatchNotification('Prompt Manager', `Generated ${completed} preview(s). ${failed} prompt(s) failed.`, 'info');
      } else {
        dispatchNotification('Prompt Manager', 'Preview generation failed for all selected prompts.', 'error');
      }
      if (completed > 0 && !isPollinationsModel && modelForPreview !== previewModel) {
        dispatchNotification(
          'Prompt Manager',
          'Selected checkpoint is motion/video. Previews were generated using Gemini image preview.',
          'info'
        );
      }
    } finally {
      bulkGenerationActiveRef.current = false;
      stopGenerationRequestedRef.current = false;
      setIsGenerating(false);
      setIsCoolingDown(false);
      setCooldownProgress(0);
      setGenerationProgress({ current: 0, total: 0 });
      setCurrentGeneratingDraftId(null);
      if (selectedDraftIds.size > 0) {
        setSelectedDraftIds(new Set());
      }
    }
  }, [
    drafts,
    previewModel,
    selectedDraftIds,
    updateDraft,
    modelCategoryMap,
    seed,
    selectedRatio,
    negativePrompt,
    enhance,
    nologo,
    safe,
    useSearch,
    customWidth,
    customHeight,
    dynamicParams,
    duration,
    audio,
    isPrivate,
    nofeed
  ]);

  const exportReadyDrafts = useCallback(async (limit?: number) => {
    if (!selectedProjectId) {
      dispatchNotification('Prompt Manager', 'Choose a target prompt collection before moving prompts.', 'error');
      return;
    }

    const maxTargets = Number.isFinite(limit) && Number(limit) > 0
      ? Math.floor(Number(limit))
      : undefined;
    const targets = resolveExportTargets(drafts, selectedDraftIds).slice(0, maxTargets);
    if (targets.length === 0) {
      dispatchNotification('Prompt Manager', 'No selected prompts are ready to move.', 'info');
      return;
    }

    setIsExporting(true);
    try {
      const targetProject = projects.find((project) => project.id === selectedProjectId);
      const exportEngine = targetProject?.defaultEngine || DEFAULT_GOOGLE_TEXT_MODEL;
      const batches = chunkPromptDrafts(targets, PROMPT_EXPORT_BATCH_SIZE);
      const aggregate = { created: 0, skipped: 0, renamed: 0, inputDuplicates: 0 };

      for (const batch of batches) {
        const response = await api.items.createFromPrompts(
          selectedProjectId,
          exportEngine,
          getPromptExportPayload(batch),
          true,
          null,
          'suffix'
        );
        aggregate.created += response.created || 0;
        aggregate.skipped += response.skipped || 0;
        aggregate.renamed += response.renamed || 0;
        aggregate.inputDuplicates += response.inputDuplicates || 0;
      }

      if (aggregate.created > 0 && aggregate.skipped === 0 && aggregate.created === targets.length) {
        const exportedIds = new Set(targets.map((draft) => draft.id));
        setDrafts((previous) => previous.filter((draft) => !exportedIds.has(draft.id)));
        void api.settings.deletePromptManagerDrafts(Array.from(exportedIds)).catch(() => {
          dispatchNotification('Prompt Manager', 'Unable to remove moved prompt drafts from the database. Local cache was updated.', 'error');
        });
      }

      setSelectedDraftIds(new Set());
      if (aggregate.created > 0) {
        dispatchProjectItemsUpdated(selectedProjectId, 'prompt-manager-export');
      }
      await refreshProjects();

      if (aggregate.created > 0 && aggregate.skipped === 0) {
        dispatchNotification(
          'Prompt Manager',
          aggregate.renamed
            ? `Moved ${aggregate.created} prompt draft(s) into the selected prompt collection. ${aggregate.renamed} title${aggregate.renamed === 1 ? ' was' : 's were'} renamed to avoid duplicates.`
            : `Moved ${aggregate.created} prompt draft(s) into the selected prompt collection.`,
          'success'
        );
      } else if (aggregate.created > 0) {
        dispatchNotification('Prompt Manager', `Moved ${aggregate.created} prompt draft(s). ${aggregate.skipped} duplicate title(s) were skipped and left in Prompt Manager.`, 'info');
      } else {
        dispatchNotification('Prompt Manager', `${aggregate.skipped} prompt draft(s) were skipped because matching titles already exist.`, 'info');
      }
    } catch (error) {
      const message = error instanceof Error
        ? normalizeUserFacingError(error.message)
        : 'Failed to move prompt drafts into the selected prompt collection.';
      dispatchNotification('Prompt Manager', message, 'error');
    } finally {
      setIsExporting(false);
    }
  }, [drafts, projects, refreshProjects, selectedDraftIds, selectedProjectId]);

  const exportDraftsToAssetIngestion = useCallback(async (draftIds?: string[], collectionId?: string | null) => {
    const targetIds = draftIds?.length ? new Set(draftIds) : selectedDraftIds;
    const targets = resolveAssetIngestionTargets(drafts, targetIds);
    if (targets.length === 0) {
      dispatchNotification('Prompt Manager', 'No queue prompts are ready to export into Asset Ingestion.', 'info');
      return null;
    }

    setIsExporting(true);
    try {
      const assetIngestionProject = await api.projects.getAssetIngestion();
      if (!assetIngestionProject?.id) {
        dispatchNotification('Prompt Manager', 'Asset Ingestion project could not be resolved.', 'error');
        return null;
      }

      const exportEngine = assetIngestionProject.defaultEngine || DEFAULT_GOOGLE_TEXT_MODEL;
      const batches = chunkPromptDrafts(targets, PROMPT_EXPORT_BATCH_SIZE);
      const aggregate = { success: true, created: 0, skipped: 0, renamed: 0, inputDuplicates: 0 };

      for (const batch of batches) {
        const response = await api.items.createFromPrompts(
          assetIngestionProject.id,
          exportEngine,
          buildAssetIngestionPromptPayload(batch),
          true,
          collectionId || null,
          'suffix'
        );
        aggregate.created += response.created || 0;
        aggregate.skipped += response.skipped || 0;
        aggregate.renamed += response.renamed || 0;
        aggregate.inputDuplicates += response.inputDuplicates || 0;
      }

      const successfullyPlacedDraftIds = new Set<string>();
      if (aggregate.created > 0 && aggregate.created === targets.length) {
        targets.forEach((draft) => successfullyPlacedDraftIds.add(draft.id));
      } else if (targets.length === 1 && aggregate.created === 1) {
        const exportedDraftId = targets[0]?.id;
        if (exportedDraftId) {
          successfullyPlacedDraftIds.add(exportedDraftId);
        }
      }

      if (successfullyPlacedDraftIds.size > 0) {
        setDrafts((previous) => previous.filter((draft) => !successfullyPlacedDraftIds.has(draft.id)));
        void api.settings.deletePromptManagerDrafts(Array.from(successfullyPlacedDraftIds)).catch(() => {
          dispatchNotification('Prompt Manager', 'Unable to remove exported prompt drafts from the database. Local cache was updated.', 'error');
        });
      }

      setSelectedDraftIds((previous) => {
        if (previous.size === 0) return previous;
        const next = new Set(previous);
        successfullyPlacedDraftIds.forEach((draftId) => next.delete(draftId));
        return next;
      });

      if (aggregate.created > 0) {
        dispatchProjectItemsUpdated(assetIngestionProject.id, 'prompt-manager-export-asset-ingestion');
        window.dispatchEvent(new CustomEvent('aimana-queue-collections-updated', {
          detail: {
            projectId: assetIngestionProject.id,
            collectionId: collectionId || null,
            reason: 'prompt-manager-export-asset-ingestion'
          }
        }));
      }

      if (aggregate.created > 0 && aggregate.skipped === 0) {
        dispatchNotification(
          'Prompt Manager',
          aggregate.renamed
            ? `Exported ${aggregate.created} prompt draft(s) to Asset Ingestion${collectionId ? ' collection' : ''} as items. ${aggregate.renamed} title${aggregate.renamed === 1 ? ' was' : 's were'} renamed to avoid duplicates.`
            : `Exported ${aggregate.created} prompt draft(s) to Asset Ingestion${collectionId ? ' collection' : ''} as items.`,
          'success'
        );
      } else if (aggregate.created > 0) {
        dispatchNotification(
          'Prompt Manager',
          `Exported ${aggregate.created} prompt draft(s) to Asset Ingestion${collectionId ? ' collection' : ''}. ${aggregate.skipped} duplicate title(s) stayed in Prompt Manager.`,
          'info'
        );
      } else {
        dispatchNotification(
          'Prompt Manager',
          `${aggregate.skipped} prompt draft(s) were skipped because matching titles already exist in Asset Ingestion${collectionId ? ' collection' : ''}.`,
          'info'
        );
      }
      return aggregate;
    } catch {
      dispatchNotification('Prompt Manager', 'Failed to export prompt drafts to Asset Ingestion.', 'error');
      return null;
    } finally {
      setIsExporting(false);
    }
  }, [drafts, selectedDraftIds]);

  const draftsInTab = useMemo(() => {
    if (activeTab === 'projects') return [];
    return drafts.filter((draft) => draft.status === activeTab);
  }, [activeTab, drafts]);

  const filteredDrafts = useMemo(() => filterPromptDrafts(draftsInTab, searchQuery), [draftsInTab, searchQuery]);

  const selectedDrafts = useMemo(() => drafts.filter((draft) => selectedDraftIds.has(draft.id)), [drafts, selectedDraftIds]);
  const queuedGenerationCount = useMemo(
    () => resolveGenerationTargets(drafts, selectedDraftIds).length,
    [drafts, selectedDraftIds]
  );

  const stagingCount = useMemo(() => drafts.filter((draft) => draft.status === 'staging').length, [drafts]);
  const readyCount = useMemo(() => drafts.filter((draft) => draft.status === 'ready').length, [drafts]);
  const deletedCount = useMemo(() => drafts.filter((draft) => draft.status === 'deleted').length, [drafts]);
  const missingPreviewCount = useMemo(
    () => drafts.filter((draft) => draft.status === 'staging' && draft.prompt.trim() && !draft.previewImageUrl).length,
    [drafts]
  );

  return {
    drafts,
    filteredDrafts,
    projects,
    projectThumbnails,
    activeTab,
    viewMode,
    searchQuery,
    selectedDraftIds,
    selectedDrafts,
    selectedProjectId,
    previewModel,
    modelRegistry,
    currentModelCategory,
    currentModelFeatures,
    currentModelSchema,
    selectedRatio,
    customWidth,
    customHeight,
    negativePrompt,
    seed,
    useSearch,
    enhance,
    nologo,
    safe,
    dynamicParams,
    duration,
    audio,
    isPrivate,
    nofeed,
    imageModelOptions: checkpointModelOptions,
    isImporting,
    isProjectsLoading,
    isGenerating,
    isCoolingDown,
    cooldownProgress,
    isExporting,
    isMergingDuplicates,
    latestPreviewPollenUsed,
    generationProgress,
    currentGeneratingDraftId,
    lastCopiedDraftId,
    stagingCount,
    readyCount,
    deletedCount,
    missingPreviewCount,
    queuedGenerationCount,
    setActiveTab,
    setViewMode,
    setSearchQuery,
    setSelectedProjectId,
    setPreviewModel,
    setSelectedRatio: (ratio: string) => setSelectedRatio(normalizeAspectRatio(ratio)),
    setCustomWidth,
    setCustomHeight,
    setNegativePrompt,
    setSeed,
    setUseSearch,
    setEnhance,
    setNologo,
    setSafe,
    setDynamicParam,
    setDuration,
    setAudio,
    setIsPrivate,
    setNofeed,
    refreshProjects,
    createDraft,
    updateDraft,
    removeDraft,
    removeSelectedDrafts,
    deleteDraftForever,
    deleteSelectedDraftsForever,
    restoreDraft,
    restoreSelectedDrafts,
    restoreDraftRevision,
    duplicateDraft,
    duplicateSelectedDrafts,
    toggleSelectDraft,
    selectDrafts,
    clearSelection,
    selectPreviewDrafts,
    selectMissingPreviewDrafts,
    stopPreviewGeneration,
    moveSelectedDrafts,
    copyPrompt,
    uploadPreviewImage,
    activeDuplicateGroups,
    mergeDuplicateDrafts,
    importDrafts,
    generatePreviewImages,
    exportReadyDrafts,
    exportDraftsToAssetIngestion
  };
};
