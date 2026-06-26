import type { PromptDraft, PromptExportPayload, PromptImportRecord } from './types';
import { mergeRevisionTags } from '../../utils/revisionTags';

const MAX_AUTO_TITLE_LENGTH = 48;

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const normalizeDuplicateText = (value: unknown) => (
  normalizeText(value)
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .toLowerCase()
);

const truncate = (value: string, length: number) => (
  value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1)).trimEnd()}...`
);

export const normalizePromptDraftSource = (value: unknown): 'json' | 'manual' => (
  value === 'json' ? 'json' : 'manual'
);

export const createPromptDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const derivePromptTitle = (prompt: string, fallback = 'Untitled Prompt') => {
  const trimmed = normalizeText(prompt);
  if (!trimmed) return fallback;
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) || trimmed;
  return truncate(firstLine, MAX_AUTO_TITLE_LENGTH);
};

export const toPromptDraft = (
  record: PromptImportRecord,
  createId: () => string = createPromptDraftId,
  timestamp: number = Date.now()
): PromptDraft => {
  const prompt = normalizeText(record.prompt);
  const raw = normalizeText(record.raw);
  const title = normalizeText(record.title) || derivePromptTitle(prompt);
  const label = normalizeText(record.label);
  const tags = mergeRevisionTags(record.tags);
  const note = normalizeText(record.note);

  return {
    id: createId(),
    title,
    prompt,
    raw: raw || undefined,
    label: label || undefined,
    tags: tags || undefined,
    note: note || undefined,
    source: normalizePromptDraftSource(record.source),
    status: 'staging',
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

const normalizeImportObject = (value: unknown, index: number): PromptImportRecord => {
  if (typeof value === 'string') {
    const prompt = normalizeText(value);
    if (!prompt) {
      throw new Error(`Entry ${index + 1} is empty.`);
    }
    return { prompt, source: 'json' };
  }

  if (!value || typeof value !== 'object') {
    throw new Error(`Entry ${index + 1} must be a string or object.`);
  }

  const raw = value as Record<string, unknown>;
  const prompt = normalizeText(raw.prompt);
  if (!prompt) {
    throw new Error(`Entry ${index + 1} is missing a prompt.`);
  }

  return {
    title: normalizeText(raw.title) || undefined,
    prompt,
    raw: normalizeText(raw.raw) || undefined,
    label: normalizeText(raw.label) || undefined,
    tags: mergeRevisionTags(raw.tags) || undefined,
    note: normalizeText(raw.note ?? raw.notes) || undefined,
    source: 'json'
  };
};

const splitDelimitedPromptLine = (line: string) => {
  const delimiters = ['|', '::', '\t'];

  for (const delimiter of delimiters) {
    const delimiterIndex = line.indexOf(delimiter);
    if (delimiterIndex === -1) continue;

    const title = normalizeText(line.slice(0, delimiterIndex));
    const prompt = normalizeText(line.slice(delimiterIndex + delimiter.length));
    if (title && prompt) {
      return { title, prompt };
    }
  }

  return null;
};

const parsePlainTextPromptImport = (input: string): PromptImportRecord[] => {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('No prompts were found in the import input.');
  }

  return lines.map((line) => splitDelimitedPromptLine(line) ?? ({ prompt: line }));
};

export const parsePromptImportInput = (rawInput: string): PromptImportRecord[] => {
  const input = normalizeText(rawInput);
  if (!input) {
    throw new Error('Import input is empty.');
  }

  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Prompt import JSON must be an array.');
    }
    if (parsed.length === 0) {
      throw new Error('Prompt import JSON is empty.');
    }
    return parsed.map((entry, index) => normalizeImportObject(entry, index));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return parsePlainTextPromptImport(input);
    }
    throw error;
  }
};

export interface PromptImportJsonCheck {
  ok: boolean;
  count: number;
  message: string;
}

type PromptThumbnailBlurSource = {
  thumbnailBlur?: unknown;
  aiParameters?: unknown;
  currentRevision?: {
    aiParameters?: unknown;
  } | null;
} | null | undefined;

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const isPromptThumbnailBlurEnabled = (source: PromptThumbnailBlurSource): boolean => {
  if (!source) return false;
  if ('thumbnailBlur' in source && source.thumbnailBlur !== undefined) {
    return Boolean(source.thumbnailBlur);
  }

  const rawAiParameters = source.currentRevision?.aiParameters ?? source.aiParameters;
  const parsed = parseJsonObject(rawAiParameters);
  const advancedParams = parsed.advanced_params && typeof parsed.advanced_params === 'object'
    ? parsed.advanced_params as Record<string, unknown>
    : {};
  return Boolean(advancedParams.thumbnailBlur || parsed.thumbnailBlur);
};

export const getPromptThumbnailBlurClass = (source: PromptThumbnailBlurSource): string => (
  isPromptThumbnailBlurEnabled(source) ? 'blur-md' : ''
);

export const buildPromptThumbnailBlurAiParameters = (
  rawAiParameters: unknown,
  enabled: boolean
): string => {
  const parsed = parseJsonObject(rawAiParameters);
  return JSON.stringify({
    ...parsed,
    thumbnailBlur: enabled,
    advanced_params: {
      ...(parsed.advanced_params && typeof parsed.advanced_params === 'object' ? parsed.advanced_params as Record<string, unknown> : {}),
      thumbnailBlur: enabled
    }
  }, null, 2);
};

const normalizeLooseJsonText = (rawInput: string) => {
  let input = normalizeText(rawInput)
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const fenced = input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    input = fenced[1].trim();
  }

  input = input
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);

  if (input.startsWith('{') && input.endsWith('}')) {
    input = `[${input}]`;
  }

  return input;
};

export const autoCorrectPromptImportJsonInput = (rawInput: string) => {
  const corrected = normalizeLooseJsonText(rawInput);
  return {
    corrected,
    changed: corrected !== normalizeText(rawInput),
    check: checkPromptImportJsonInput(corrected)
  };
};

export const checkPromptImportJsonInput = (rawInput: string): PromptImportJsonCheck => {
  const input = normalizeText(rawInput);
  if (!input) {
    return {
      ok: false,
      count: 0,
      message: 'Paste a JSON array to check it.'
    };
  }

  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        count: 0,
        message: 'Prompt import JSON must be an array.'
      };
    }
    if (parsed.length === 0) {
      return {
        ok: false,
        count: 0,
        message: 'Prompt import JSON is empty.'
      };
    }

    const records = parsed.map((entry, index) => normalizeImportObject(entry, index));
    return {
      ok: true,
      count: records.length,
      message: `${records.length} prompt draft${records.length === 1 ? '' : 's'} ready to import.`
    };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      message: error instanceof Error ? error.message : 'Invalid JSON manifest.'
    };
  }
};

export const filterPromptDrafts = (drafts: PromptDraft[], query: string) => {
  const normalizedQuery = normalizeText(query).toLowerCase();
  if (!normalizedQuery) return drafts;

  return drafts.filter((draft) => (
    draft.title.toLowerCase().includes(normalizedQuery)
    || draft.prompt.toLowerCase().includes(normalizedQuery)
    || (draft.raw || '').toLowerCase().includes(normalizedQuery)
    || (draft.label || '').toLowerCase().includes(normalizedQuery)
    || (draft.tags || '').toLowerCase().includes(normalizedQuery)
  ));
};

export interface PromptDraftDuplicateGroup {
  normalizedKey: string;
  title: string;
  items: PromptDraft[];
}

export const getPromptDraftDuplicateGroups = (drafts: PromptDraft[]): PromptDraftDuplicateGroup[] => {
  const groups = new Map<string, PromptDraft[]>();

  drafts.forEach((draft) => {
    const normalizedTitle = normalizeDuplicateText(draft.title);
    const normalizedPrompt = normalizeDuplicateText(draft.prompt);
    if (!normalizedTitle || !normalizedPrompt) return;
    const key = `${normalizedTitle}::${normalizedPrompt}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(draft);
    } else {
      groups.set(key, [draft]);
    }
  });

  return Array.from(groups.entries())
    .map(([normalizedKey, items]) => ({
      normalizedKey,
      title: items[0]?.title?.trim() || 'Untitled Prompt',
      items: [...items].sort((a, b) => (
        (a.createdAt - b.createdAt)
        || (a.updatedAt - b.updatedAt)
        || a.title.localeCompare(b.title)
      ))
    }))
    .filter((group) => group.items.length > 1)
    .sort((a, b) => (
      (a.items[0]?.createdAt || 0) - (b.items[0]?.createdAt || 0)
    ));
};

export const resolvePromptImportVariables = (
  rawInput: string,
  variables: Array<{ key: string; value: string }>
) => {
  let processed = rawInput;

  variables.forEach((variable) => {
    const key = normalizeText(variable.key);
    const value = typeof variable.value === 'string' ? variable.value.trim() : '';
    if (!key) return;

    const keyTokens = key.split(/[\s_-]+/).filter(Boolean);
    const escapedKeyPattern = keyTokens
      .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s_-]*');
    const pattern = new RegExp(`\\{\\{\\s*${escapedKeyPattern}\\s*\\}\\}`, 'gi');
    processed = processed.replace(pattern, value);
  });

  return processed;
};

export const getPromptExportPayload = (drafts: PromptDraft[]): PromptExportPayload[] => (
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
    thumbnailBlur: draft.thumbnailBlur
  }))
);
