import React from 'react';
import { Database, ShieldAlert, Loader2, FileCode } from 'lucide-react';

interface MaintenanceHeaderProps {
    onRawDownload: () => void;
    isDownloading: boolean;
}

export const MaintenanceHeader: React.FC<MaintenanceHeaderProps> = ({ onRawDownload, isDownloading }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
        <div className="space-y-1">
            <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
                <Database size={36} className="text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
                System Operations
            </h1>
            <p className="text-slate-400 font-medium">Privileged maintenance tools for capturing the latest system updates with complete backup coverage.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button 
                onClick={onRawDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all border border-slate-700 shadow-lg active:scale-95 disabled:opacity-50"
            >
                {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <FileCode size={18} className="text-indigo-400" />}
                Download .db
            </button>
            <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-xs font-black uppercase tracking-widest">
                <ShieldAlert size={14} /> Super Admin Access
            </div>
        </div>
    </div>
);
