import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { ConfirmConfig } from './useModalDialogs';

type BackupMode = 'full' | 'incremental';

type BackupState = {
    lastSuccessfulBackupAt: number | null;
    lastBackupType: BackupMode | null;
    lastBackupId: string | null;
    lastBackupStatus?: 'complete' | 'partial' | null;
    lastBackupWarningCount?: number;
    updatedAt: number;
};

interface UseMaintenanceOptions {
    confirm?: (config: ConfirmConfig) => Promise<boolean>;
}

const MAX_TERMINAL_LOG_LINES = 2000;

export const useMaintenance = (options: UseMaintenanceOptions = {}) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const [isDbDownloading, setIsDbDownloading] = useState(false);
    const [statusLog, setStatusLog] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [stats, setStats] = useState<any>(null);
    const [backupState, setBackupState] = useState<BackupState | null>(null);
    const [isBackupStateLoading, setIsBackupStateLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        try {
            const dump = await api.admin.getSystemBackupData();
            const s = dump.data;

            let totalLinks = 0;
            s.revisions.forEach((r: any) => {
                try {
                    if (r.secondaryFilesJson) {
                        const links = JSON.parse(r.secondaryFilesJson);
                        totalLinks += Array.isArray(links) ? links.length : 0;
                    }
                } catch {}
            });

            setStats({
                users: s.users.length,
                projects: s.projects.length,
                items: s.items.length,
                revisions: s.revisions.length,
                localFiles: s.revisions.filter((r: any) => r.storage === 'local' && r.fileUrl).length,
                neuralAssets: (s.custom_engines?.length || s.engines?.length || 0)
                    + (s.custom_project_types?.length || s.intents?.length || 0)
                    + (s.bulk_presets?.length || s.bulkPresets?.length || 0),
                manifestLinks: totalLinks
            });
        } catch {
            setError("Unable to communicate with System API.");
        }
    }, []);

    const loadBackupState = useCallback(async () => {
        setIsBackupStateLoading(true);
        try {
            const state = await api.admin.getBackupState();
            setBackupState(state);
        } catch {
            // Best effort only; backup actions still work even when this metadata call fails.
        } finally {
            setIsBackupStateLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
        loadBackupState();
    }, [loadStats, loadBackupState]);

    const addLog = (msg: string) => {
        setStatusLog(prev => [...prev, msg].slice(-MAX_TERMINAL_LOG_LINES));
    };

    const handleRawDbDownload = async () => {
        setIsDbDownloading(true);
        setError(null);
        try {
            await api.admin.downloadRawDatabase();
        } catch (err: any) {
            setError(err.message || "Failed to download raw database.");
        } finally {
            setIsDbDownloading(false);
        }
    };

    const handleAutomatedRestore = async (files: File[]) => {
        if (!Array.isArray(files) || files.length === 0) {
            setError('Select at least one backup ZIP to restore.');
            return false;
        }

        const confirm = options.confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
        const ok = await confirm({
            title: 'Initialize Automated Restore',
            description: `This operation will overwrite live metadata with backup data (${files.length} ZIP file${files.length > 1 ? 's' : ''}). Continue only if you are restoring a known-good backup set.`,
            confirmLabel: 'Run Restore',
            tone: 'danger'
        });
        if (!ok) return false;

        setIsExecuting(true);
        setStatusLog([]);
        setProgress(0);
        setError(null);

        try {
            addLog('Initializing Automated Restore Protocol v1.0...');
            addLog(`Bundles queued: ${files.map((f) => f.name).join(', ')}`);
            setProgress(10);

            const result = await api.admin.restoreBackupBundles(files, { clearUploadsOnFull: true });
            setProgress(70);

            if (result.applied.full) {
                addLog(`Full bundle applied: ${result.applied.full.fileName}`);
                addLog(`Full restore wrote ${result.applied.full.totalRowsTouched} rows and ${result.applied.full.uploadsRestored} upload binaries.`);
            }

            if (result.applied.incrementals.length > 0) {
                addLog(`Incremental bundles applied: ${result.applied.incrementals.length}`);
                result.applied.incrementals.forEach((inc, idx) => {
                    addLog(`[INC ${idx + 1}] ${inc.fileName} -> ${inc.totalRowsTouched} rows, ${inc.uploadsRestored} binaries`);
                    if (inc.movement) {
                        addLog(`[INC ${idx + 1}] movement detected: ${inc.movement.itemProjectMoves} item project move(s), ${inc.movement.revisionPathMoves} revision path update(s)`);
                    }
                });
            }

            addLog(`Total restored upload binaries: ${result.applied.uploadsRestored}`);
            if (result.applied.warnings.length > 0) {
                addLog(`Restore completed with ${result.applied.warnings.length} warning(s).`);
                result.applied.warnings.forEach((warning) => addLog(`Warning: ${warning}`));
                setError(`Restore completed with warnings (${result.applied.warnings.length}). Review terminal output before continuing.`);
            } else {
                addLog('Restore completed successfully with no warnings.');
            }

            setBackupState(result.backupState);
            await loadStats();
            setProgress(100);
            addLog('Restore pipeline complete.');
            await api.admin.reportError('ADMIN', 'Automated restore completed from backup bundles', result.applied.warnings.length > 0 ? 'WARN' : 'INFO');
            return true;
        } catch (err: any) {
            setError(err.message || 'Automated restore failed.');
            addLog('CRITICAL FAILURE: Restore Pipeline Terminated.');
            await api.admin.reportError('ADMIN', `Automated restore failure: ${err.message}`, 'ERROR');
            return false;
        } finally {
            setIsExecuting(false);
        }
    };

    const runBackup = async (mode: BackupMode) => {
        const confirm = options.confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
        const prompt = mode === 'full'
            ? {
                title: 'Initialize System Backup',
                description: 'Initialize system-wide binary and metadata backup? This will preserve your directory structure, multi-asset manifests, and forged neural logic.',
                confirmLabel: 'Initialize Backup',
                tone: 'danger' as const
            }
            : {
                title: 'Initialize Incremental Backup',
                description: 'Generate incremental backup with newly created/updated records and binaries since the last successful backup?',
                confirmLabel: 'Generate Incremental',
                tone: 'primary' as const
            };

        const ok = await confirm(prompt);
        if (!ok) return;

        setIsExecuting(true);
        setStatusLog([]);
        setProgress(0);
        setError(null);

        try {
            if (mode === 'incremental') {
                const state = await api.admin.getBackupState();
                const sinceCursor = state?.lastSuccessfulBackupAt || null;
                if (!sinceCursor) {
                    const msg = "Incremental backup requires a completed baseline backup first. Run Full Backup once.";
                    addLog(`Warning: ${msg}`);
                    setError(msg);
                    return;
                }
                addLog(`Incremental window start: ${new Date(sinceCursor).toISOString()}`);
            }

            await api.admin.reportError('ADMIN', `${mode === 'full' ? 'Full' : 'Incremental'} backup sequence initiated`, 'INFO');
            addLog(mode === 'full'
                ? 'Initializing Structured Backup Protocol v1.7 (server-streamed)...'
                : 'Initializing Incremental Backup Protocol v1.1 (server-streamed)...');
            addLog('Handing bundle assembly to the backend to avoid client memory exhaustion.');
            setProgress(20);

            await api.admin.downloadBackupBundle(mode);

            setProgress(85);
            addLog('Download stream started. Your browser should receive the ZIP directly.');

            window.setTimeout(async () => {
                try {
                    const latestState = await api.admin.getBackupState();
                    setBackupState(latestState);
                } catch {
                    // Best effort refresh only.
                }
            }, 1500);

            setProgress(100);
            addLog('Transmission Complete.');
            await api.admin.reportError('ADMIN', `${mode === 'full' ? 'Full' : 'Incremental'} backup download started via server stream`, 'INFO');
        } catch (err: any) {
            setError(err.message || "Critical failure during backup orchestration.");
            addLog("CRITICAL FAILURE: Pipeline Terminated.");
            await api.admin.reportError('ADMIN', `Backup pipeline failure: ${err.message}`, 'ERROR');
        } finally {
            setIsExecuting(false);
        }
    };

    const handleFullBackup = async () => {
        await runBackup('full');
    };

    const handleIncrementalBackup = async () => {
        await runBackup('incremental');
    };

    return {
        isExecuting,
        isDbDownloading,
        statusLog,
        progress,
        stats,
        backupState,
        isBackupStateLoading,
        error,
        handleRawDbDownload,
        handleFullBackup,
        handleIncrementalBackup,
        handleAutomatedRestore,
        refreshStats: loadStats,
        refreshBackupState: loadBackupState
    };
};
