import React, { useMemo } from 'react';
import { RotateCcw, Upload, Loader2, AlertTriangle, Files } from 'lucide-react';

interface RestoreAutomationCardProps {
    restoreFiles: File[];
    isExecuting: boolean;
    onSelectFiles: (files: FileList | null) => void;
    onStartRestore: () => void;
}

const byPreferredRestoreOrder = (a: File, b: File) => {
    const isFullA = /full_backup/i.test(a.name);
    const isFullB = /full_backup/i.test(b.name);
    if (isFullA !== isFullB) return isFullA ? -1 : 1;
    return a.name.localeCompare(b.name);
};

export const RestoreAutomationCard: React.FC<RestoreAutomationCardProps> = ({
    restoreFiles,
    isExecuting,
    onSelectFiles,
    onStartRestore
}) => {
    const fileSummary = useMemo(() => {
        if (!restoreFiles.length) return 'No backup files selected';
        const ordered = [...restoreFiles].sort(byPreferredRestoreOrder);
        return ordered.map((file) => file.name).join(', ');
    }, [restoreFiles]);

    return (
        <div className="bg-amber-900/10 border border-amber-500/25 rounded-2xl p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-1">Automated Restore</h3>
            <p className="text-xs text-slate-400">
                Upload one Full backup ZIP, then every Incremental ZIP created after it. The server applies Full first and rejects restore chains with gaps, overlap, or baseline mismatches.
            </p>

            <label className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900/70 hover:bg-slate-900 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer">
                <Upload size={14} />
                Select Backup ZIPs
                <input
                    type="file"
                    accept=".zip,application/zip"
                    multiple
                    className="hidden"
                    onChange={(event) => onSelectFiles(event.target.files)}
                    disabled={isExecuting}
                />
            </label>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">
                    <Files size={12} />
                    Selected Bundles ({restoreFiles.length})
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed break-words">{fileSummary}</p>
            </div>

            <button
                onClick={onStartRestore}
                disabled={isExecuting || restoreFiles.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all ${isExecuting || restoreFiles.length === 0 ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border-amber-400/40'}`}
            >
                {isExecuting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {isExecuting ? 'Restoring...' : 'Run Automated Restore'}
            </button>

            <div className="flex items-start gap-2 text-[10px] text-amber-300/80 font-semibold">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>Restore only applies the bundles you upload here. To recover all updates, include the full baseline plus each incremental backup in the chain.</span>
            </div>
        </div>
    );
};

