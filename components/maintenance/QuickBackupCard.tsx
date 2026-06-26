import React from 'react';
import { Download, Loader2 } from 'lucide-react';

interface QuickBackupCardProps {
    onDownload: () => void;
    isDownloading: boolean;
}

export const QuickBackupCard: React.FC<QuickBackupCardProps> = ({ onDownload, isDownloading }) => (
    <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-2xl p-6">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Quick DB Backup</h3>
        <p className="text-xs text-slate-400 mb-4">Instantly download the current <code>aimana.db</code> SQLite file for a point-in-time metadata snapshot. Pair it with the latest ZIP backup before cutover so recent changes are not left behind.</p>
        <button 
            onClick={onDownload}
            disabled={isDownloading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-xl text-xs font-bold border border-indigo-500/30 transition-all"
        >
            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download Raw DB
        </button>
    </div>
);
