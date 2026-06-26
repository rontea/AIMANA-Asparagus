export type InstallIssue = {
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type InstallState = 'needs-config' | 'needs-admin-setup' | 'needs-finalize' | 'degraded' | 'ready';

export function deriveInstallState(value: {
  issues: InstallIssue[];
  hasAdmin: boolean;
  installRecord?: Record<string, unknown> | null;
  hasExistingWorkspaceData?: boolean;
}): InstallState;

export function readInstallStateRecord(): Promise<Record<string, unknown>>;

export function writeInstallStateRecord(value: Record<string, unknown>): Promise<Record<string, unknown>>;

export function getInstallStatusSnapshot(): Promise<Record<string, any>>;

export function logInstallStatusSummary(snapshot: {
  state: string;
  issues: InstallIssue[];
}): void;
