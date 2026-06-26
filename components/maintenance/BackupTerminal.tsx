import React, { useEffect, useRef } from 'react';
import { HardDrive, Loader2, AlertTriangle, Download } from 'lucide-react';

interface BackupTerminalProps {
    statusLog: string[];
    isExecuting: boolean;
    progress: number;
    backupState: {
        lastSuccessfulBackupAt: number | null;
        lastBackupType: 'full' | 'incremental' | null;
        lastBackupId: string | null;
        lastBackupStatus?: 'complete' | 'partial' | null;
        lastBackupWarningCount?: number;
        updatedAt: number;
    } | null;
    isBackupStateLoading: boolean;
    onStartBackup: () => void;
    onStartIncrementalBackup: () => void;
}

const formatBackupTimestamp = (ts: number | null): string => {
    if (!ts) return 'No completed baseline backup yet';
    return new Date(ts).toLocaleString();
};

export const BackupTerminal: React.FC<BackupTerminalProps> = ({
    statusLog, isExecuting, progress, backupState, isBackupStateLoading, onStartBackup, onStartIncrementalBackup
}) => {
    const logContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = logContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [statusLog]);

    const incrementalReady = Boolean(backupState?.lastSuccessfulBackupAt);
    const lastBackupTypeLabel = backupState?.lastBackupType
        ? backupState.lastBackupType === 'full' ? 'Full' : 'Incremental'
        : 'N/A';
    const statusLabel = backupState?.lastBackupStatus
        ? backupState.lastBackupStatus === 'partial'
            ? `Partial (${backupState.lastBackupWarningCount || 0} warning${backupState.lastBackupWarningCount === 1 ? '' : 's'})`
            : 'Complete'
        : 'N/A';

    return (
    <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[420px] h-[70vh] max-h-[700px]">
        <div className="bg-slate-900 p-5 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="ml-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Backup Terminal v1.0</span>
            </div>
            {isExecuting && (
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold animate-pulse">
                    <Loader2 size={14} className="animate-spin" /> PROVISIONING...
                </div>
            )}
        </div>

        <div className="px-6 py-4 border-b border-slate-900 bg-slate-900/50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] font-semibold">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-slate-500 uppercase tracking-widest text-[9px]">Incremental Baseline</div>
                <div className={incrementalReady ? 'text-emerald-300' : 'text-amber-300'}>
                    {isBackupStateLoading ? 'Checking...' : incrementalReady ? 'Ready' : 'Not ready'}
                </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-slate-500 uppercase tracking-widest text-[9px]">Last Successful Backup</div>
                <div className="text-slate-300 truncate" title={formatBackupTimestamp(backupState?.lastSuccessfulBackupAt ?? null)}>
                    {isBackupStateLoading ? 'Loading...' : formatBackupTimestamp(backupState?.lastSuccessfulBackupAt ?? null)}
                </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <div className="text-slate-500 uppercase tracking-widest text-[9px]">Last Backup Type / Status</div>
                <div className="text-slate-300 truncate" title={`${lastBackupTypeLabel} / ${statusLabel} / ${backupState?.lastBackupId || 'N/A'}`}>
                    {isBackupStateLoading ? 'Loading...' : `${lastBackupTypeLabel} / ${statusLabel}`}
                </div>
            </div>
        </div>

        <div className="px-6 py-3 border-b border-slate-900 bg-emerald-950/20 text-[11px] text-emerald-200/90">
            Run an incremental backup after major edits, imports, or migrations to capture the latest system updates so no recent backup window is left behind.
        </div>

        <div
            ref={logContainerRef}
            className="flex-1 p-6 font-mono text-[11px] leading-relaxed text-slate-400 overflow-y-auto overflow-x-auto space-y-1 custom-scrollbar"
            style={{ scrollbarWidth: 'thin' }}
        >
            {statusLog.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <HardDrive size={48} />
                    <p>Awaiting backup command to capture the latest system state...</p>
                </div>
            )}
            {statusLog.map((log, i) => (
                <div key={i} className={`flex items-start gap-2 ${log.includes('Warning') ? 'text-amber-400' : log.includes('Error') ? 'text-red-400' : i === statusLog.length - 1 ? 'text-emerald-400' : ''}`}>
                    <span className="opacity-30 shrink-0">[{new Date().toLocaleTimeString([], {hour12:false})}]</span>
                    <span>{log}</span>
                </div>
            ))}
        </div>
        {statusLog.length > 0 && (
            <div className="px-6 pb-3 text-[9px] font-bold uppercase tracking-widest text-slate-600">
                Scroll to view full terminal history
            </div>
        )}

        {isExecuting && (
            <div className="p-6 border-t border-slate-900 bg-slate-900/50">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Compilation Progress</span>
                    <span className="text-xs font-black text-white">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)] transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        )}

        <div className="p-6 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-slate-500">
                 <AlertTriangle size={16} className="text-amber-500/50" />
                 <span className="text-[10px] font-bold uppercase leading-tight">Run one last incremental backup before cutover so the newest system updates are included. <br/> Do not close this tab during compression.</span>
            </div>
            <div className="w-full sm:w-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button 
                    onClick={onStartIncrementalBackup}
                    disabled={isExecuting}
                    className={`w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isExecuting ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}
                >
                    {isExecuting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                    {isExecuting ? 'Processing' : 'Capture Latest Updates'}
                </button>
                <button 
                    onClick={onStartBackup}
                    disabled={isExecuting}
                    className={`w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isExecuting ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                >
                    {isExecuting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                    {isExecuting ? 'Processing' : 'Create Full Baseline'}
                </button>
            </div>
        </div>
    </div>
);
};
