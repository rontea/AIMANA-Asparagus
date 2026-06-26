
import React from 'react';
import { ListChecks, RefreshCw, ShieldAlert, Zap, Loader2, Download, Trash2 } from 'lucide-react';

interface AuditHeaderProps {
    onRefresh: () => void;
    onScan: () => void;
    onDownload: () => void;
    onClear: () => void;
    isLoading: boolean;
    isScanning: boolean;
    isDownloading?: boolean;
    isClearing?: boolean;
}

export const AuditHeader: React.FC<AuditHeaderProps> = ({ 
    onRefresh, onScan, onDownload, onClear, isLoading, isScanning, isDownloading, isClearing 
}) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
        <div className="space-y-1">
            <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
                <ListChecks size={36} className="text-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
                Audit Trail
            </h1>
            <p className="text-slate-400 font-medium">Chronological record of application events and security actions.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button 
                onClick={onClear}
                disabled={isClearing || isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-red-900/20 text-slate-500 hover:text-red-400 rounded-xl text-sm font-bold transition-all border border-slate-700 shadow-lg active:scale-95 disabled:opacity-50"
                title="Purge All Logs"
            >
                {isClearing ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                {isClearing ? 'Purging...' : 'Clear Trail'}
            </button>
            <button 
                onClick={onDownload}
                disabled={isDownloading || isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl text-sm font-bold transition-all border border-slate-700 shadow-lg active:scale-95 disabled:opacity-50"
                title="Export Logs as CSV"
            >
                {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                {isDownloading ? 'Exporting...' : 'Export CSV'}
            </button>
            <button 
                onClick={onScan}
                disabled={isScanning || isLoading}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all border shadow-lg active:scale-95 disabled:opacity-50 ${
                    isScanning ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-200' : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/20'
                }`}
            >
                {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                {isScanning ? 'Scanning Cluster...' : 'Run Integrity Scan'}
            </button>
            <button 
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all border border-slate-700 shadow-lg active:scale-95 disabled:opacity-50"
            >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                Refresh Trail
            </button>
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-xs font-black uppercase tracking-widest">
                <ShieldAlert size={14} /> Privileged View
            </div>
        </div>
    </div>
);
