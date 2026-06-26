import type { Project } from '../../types';

export type PromptDraftStatus = 'staging' | 'ready' | 'deleted';
export type PromptManagerTab = 'staging' | 'ready' | 'projects';
export type PromptManagerViewMode = 'grid' | 'gallery' | 'list' | 'workflow';
export type PromptDraftSource = 'json' | 'manual';
export type PromptIngestionState = 'waiting' | 'pending' | 'done';

export interface PromptDraftRevision {
  id: string;
  versionNumber: number;
  title: string;
  prompt: string;
  raw?: string;
  label?: string;
  tags?: string;
  note?: string;
  status: PromptDraftStatus;
  ingestionState?: PromptIngestionState;
  queueLetter?: string;
  queueNumber?: string;
  previewImageUrl?: string;
  previewMimeType?: string;
  thumbnailBlur?: boolean;
  createdAt: number;
  sourceUpdatedAt: number;
}

export interface PromptDraft {
  id: string;
  title: string;
  prompt: string;
  raw?: string;
  label?: string;
  tags?: string;
  note?: string;
  source?: PromptDraftSource;
  status: PromptDraftStatus;
  ingestionState?: PromptIngestionState;
  queueLetter?: string;
  queueNumber?: string;
  previewImageUrl?: string;
  previewMimeType?: string;
  thumbnailBlur?: boolean;
  previewError?: string;
  previewErrorDetails?: string;
  revisionHistory?: PromptDraftRevision[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptImportRecord {
  title?: string;
  prompt: string;
  raw?: string;
  label?: string;
  tags?: string;
  note?: string;
  source?: PromptDraftSource;
}

export interface PromptExportPayload {
  title: string;
  prompt: string;
  raw?: string;
  label?: string;
  tags?: string;
  note?: string;
  source?: PromptDraftSource;
  previewImageUrl?: string;
  previewMimeType?: string;
  thumbnailBlur?: boolean;
}

export interface PromptCollectionSummary {
  project: Project;
  promptCount: number | null;
}

export interface PromptManagerImageModelOption {
  id: string;
  label: string;
  description: string;
}
