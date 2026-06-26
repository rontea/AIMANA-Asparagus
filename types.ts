
export enum ProjectStorageType {
  GOOGLE_DRIVE = 'Google Drive',
  LOCAL_DRIVE = 'Local Drive',
  GOOGLE_KEEP = 'Google Keep',
}

export enum ProjectType {
  ALL = 'all',
  image = 'image',
  video = 'video',
  text = 'text',
  files = 'files',
  prompt = 'prompt'
}

export interface Project {
  id: string;
  name: string;
  description: string;
  storageType: ProjectStorageType;
  projectType: string;
  createdAt: number;
  updatedAt: number;
  color: string;
  isArchived?: boolean;
  isPinned?: boolean;
  pinnedOrder?: number; // New field for sorting
  driveFolderId?: string;
  ownerId?: string;
  ownerName?: string;
  defaultEngine?: string;
  isSystem?: boolean;
  systemKey?: string;
  itemCount?: number;
  collectionCount?: number;
  chatItemCount?: number;
  imageItemCount?: number;
  videoItemCount?: number;
  audioItemCount?: number;
  otherItemCount?: number;
}

export interface AppSettings {
  isTwoFactorEnabled: boolean;
  isTwoFactorLoginEnabled?: boolean;
  isTwoFactorRequiredForDelete?: boolean; 
  twoFactorSecret?: string;
  isPinProtectionEnabled?: boolean;
  pinHash?: string;
  hasPinConfigured?: boolean;
  newRawPin?: string;
  isItemProtectionEnabled?: boolean;
  maxUsers?: number; 
  inactivityTimeout?: number; 
  aiEngines?: string[];
  assetIngestionEngines?: string[];
  bulkLimit?: number;
  manualPollenHourlyRate?: number;
  dashboardResultLimit?: number;
  defaultReadAloudVoiceURI?: string;
  defaultReadAloudVoiceName?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'user';
  provider?: 'email' | 'google';
}

export interface InstallIssue {
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  meta?: Record<string, unknown> | null;
}

export interface InstallStatus {
  name: string;
  version: string;
  checkedAt: number;
  state: 'uninitialized' | 'needs-config' | 'needs-admin-setup' | 'needs-finalize' | 'ready' | 'degraded';
  issues: InstallIssue[];
  admin: {
    exists: boolean;
    user: Pick<User, 'id' | 'email' | 'name' | 'role'> | null;
  };
  runtime: {
    nodeVersion: string;
    environment: string;
    production: boolean;
  };
  capabilities: {
    allowDemoAdminBootstrap: boolean;
    allowDemoAdminLogin: boolean;
    allowAdminBootstrap: boolean;
  };
  installer: {
    instanceName: string;
    installStartedAt: number | null;
    bootstrapCompletedAt: number | null;
    configCompletedAt: number | null;
    finalizedAt: number | null;
    installedAt: number | null;
    installedBy: string | null;
  };
}

export interface InstallerRuntimeField {
  key: string;
  label: string;
  category: 'core' | 'ai' | 'identity' | 'search';
  kind: 'secret' | 'text' | 'select' | 'url';
  required: boolean;
  description: string;
  impact: string;
  configured: boolean;
  currentValue: string;
  maskedValue: string;
  options: { label: string; value: string }[] | null;
}

export interface InstallerRuntimeCategory {
  id: 'core' | 'ai' | 'identity' | 'search';
  label: string;
  description: string;
  fields: InstallerRuntimeField[];
}

export interface InstallerRuntimeImpact {
  key: string;
  status: 'configured' | 'missing' | 'optional';
  message: string;
}

export interface InstallerRuntimeConfig {
  envFile: {
    exists: boolean;
    path: string;
  };
  categories: InstallerRuntimeCategory[];
  impacts: InstallerRuntimeImpact[];
}

export interface InstallSummary {
  name: string;
  version: string;
  state: 'uninitialized' | 'needs-config' | 'needs-admin-setup' | 'needs-finalize' | 'ready' | 'degraded';
  instanceName: string;
  appUrl: string;
  loginUrl: string;
  adminAccount: {
    id: string;
    email: string;
    name: string;
  } | null;
  storage: {
    root: string;
    uploads: string;
    database: string;
    envFile: string;
  };
  enabledIntegrations: Array<{
    key: string;
    label: string;
    enabled: boolean;
    detail: string;
  }>;
  backup: {
    lastSuccessfulBackupAt: number | null;
    lastBackupType: 'full' | 'incremental' | null;
    lastBackupId: string | null;
    lastBackupStatus?: 'complete' | 'partial' | null;
    lastBackupWarningCount?: number;
    updatedAt: number;
  };
  recommendedHardeningSteps: string[];
}

export interface StoredUser extends User {
  password?: string;
  isBlocked?: boolean;
  createdAt: number;
  lastLogin?: number;
}

export enum AssetType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  UNKNOWN = 'unknown',
}

export interface Item {
  id: string;
  projectId: string;
  collectionId?: string | null;
  currentRevisionId: string;
  isArchived: boolean;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type StorageProvider = 'local' | 'google-drive' | 'google-keep';

export interface Revision {
  id: string;
  itemId: string;
  versionNumber: number;
  title: string;
  label: string;
  tags?: string;
  prompt: string;
  engine: string;
  note: string;
  aiParameters?: string;
  storage: StorageProvider;
  blob?: Blob;
  fileUrl?: string;
  remoteId?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  mimeType: string;
  size: number;
  maxSize?: number;
  originalFilename: string;
  aiSummary?: string; 
  createdAt: number;
  isArchived?: boolean;
  secondaryFiles?: { id: string, url: string, mimeType: string }[];
}

export interface SystemLog {
  id: number;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  userId?: string;
}

export interface ErrorReport {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  source: string;
  errorName: string;
  message: string;
  stack?: string;
  route?: string;
  userId?: string;
  fingerprint?: string;
  context?: Record<string, unknown> | null;
}

export interface ItemWithCurrentRevision extends Item {
  currentRevision?: Revision;
}

export interface ProjectCollectionThumbnail {
  itemId: string;
  fileUrl?: string;
  thumbnailLink?: string;
  mimeType?: string;
  title?: string;
  aiParameters?: string;
}

export interface ProjectCollection {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  thumbnailItemId?: string | null;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
  isArchived?: boolean;
  isPinned?: boolean;
  thumbnail?: ProjectCollectionThumbnail | null;
}

export interface ReferenceUsage {
  parentItemId: string;
  parentProjectId: string;
  parentProjectName: string;
  parentTitle: string;
  parentMimeType?: string;
  parentPreviewUrl?: string | null;
  relationKind: 'linked' | 'neural' | 'both' | 'reference_image';
  updatedAt: number;
}

export interface PromptDuplicateItem {
  itemId: string;
  revisionId: string;
  collectionId?: string | null;
  collectionName?: string | null;
  title: string;
  prompt: string;
  label: string;
  engine: string;
  note: string;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  previewUrl?: string | null;
}

export interface PromptDuplicateGroup {
  key: string;
  collectionId?: string | null;
  collectionName?: string | null;
  normalizedTitle: string;
  normalizedPrompt: string;
  items: PromptDuplicateItem[];
}

export interface PromptDuplicateScanResult {
  success: boolean;
  duplicateGroups: number;
  duplicateItems: number;
  groups: PromptDuplicateGroup[];
}

export interface PromptDuplicateMergeResult {
  success: boolean;
  duplicateGroups: number;
  mergedItems: number;
  updatedPrimaryItems: number;
  archivedDuplicateIds: string[];
}

export interface ToastMessage {
  id: string;
  title: string;
  type: 'success' | 'error' | 'info';
}

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
  itemId?: string; // Reference to the successfully created item
}
