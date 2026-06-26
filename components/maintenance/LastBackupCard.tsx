import React from 'react';
import { Archive, CalendarClock, FileArchive, Loader2 } from 'lucide-react';

interface LastBackupCardProps {
    backupState: {
        lastSuccessfulBackupAt: number | null;
        lastBackupType: 'full' | 'incremental' | null;
        lastBackupId: string | null;
        lastBackupStatus?: 'complete' | 'partial' | null;
        lastBackupWarningCount?: number;
        updatedAt: number;
    } | null;
    isLoading: boolean;
}

const formatTimestamp = (value: number | null) => {
    if (!value) return 'No completed backup yet';
    return new Date(value).toLocaleString();
};

const formatRelativeAge = (value: number | null) => {
    if (!value) return 'Run a full backup to establish the first baseline.';

    const deltaMs = Date.now() - value;
    const deltaMinutes = Math.max(0, Math.floor(deltaMs / 60000));
    if (deltaMinutes < 1) return 'Completed just now';
    if (deltaMinutes < 60) return `${deltaMinutes} minute${deltaMinutes === 1 ? '' : 's'} ago`;

    const deltaHours = Math.floor(deltaMinutes / 60);
    if (deltaHours < 24) return `${deltaHours} hour${deltaHours === 1 ? '' : 's'} ago`;

    const deltaDays = Math.floor(deltaHours / 24);
    return `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`;
};

export const LastBackupCard: React.FC<LastBackupCardProps> = ({ backupState, isLoading }) => {
    const lastBackupType = backupState?.lastBackupType
        ? backupState.lastBackupType === 'full' ? 'Full Baseline' : 'Incremental'
        : 'Not available';
    const statusLabel = backupState?.lastBackupStatus
        ? backupState.lastBackupStatus === 'partial'
            ? `Partial (${backupState.lastBackupWarningCount || 0} warning${backupState.lastBackupWarningCount === 1 ? '' : 's'})`
            : 'Complete'
        : 'Status not recorded';

    return (
        <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-2">Latest Backup</h3>
                    <p className="text-xs text-slate-400">
                        View the most recent completed backup cursor recorded by System Operations.
                    </p>
                </div>
                <Archive size={18} className="text-emerald-400 shrink-0" />
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Loader2 size={14} className="animate-spin text-emerald-400" />
                    Checking backup state...
                </div>
            ) : (
                <>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">
                            <CalendarClock size={12} />
                            Last Completed Backup
                        </div>
                        <div className="text-sm font-semibold text-white break-words">
                            {formatTimestamp(backupState?.lastSuccessfulBackupAt ?? null)}
                        </div>
                        <div className="text-[11px] text-emerald-300 mt-1">
                            {formatRelativeAge(backupState?.lastSuccessfulBackupAt ?? null)}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">
                            <FileArchive size={12} />
                            Type and Bundle ID
                        </div>
                        <div className="text-sm font-semibold text-white">{lastBackupType}</div>
                        <div className={backupState?.lastBackupStatus === 'partial' ? 'text-[11px] text-amber-300 mt-1' : 'text-[11px] text-emerald-300 mt-1'}>
                            {statusLabel}
                        </div>
                        <div className="text-[11px] text-slate-300 break-all mt-1">
                            {backupState?.lastBackupId || 'No backup bundle recorded yet'}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
