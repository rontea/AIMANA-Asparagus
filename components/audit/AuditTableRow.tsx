
import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { SystemLog } from '../../types';
import { truncateAuditMessage } from './auditMessage';

interface AuditTableRowProps {
    log: SystemLog;
    onInspect: (log: SystemLog) => void;
}

const getLevelStyle = (level: string) => {
    switch (level) {
        case 'ERROR': return 'text-red-500 border-red-500/20 bg-red-900/10';
        case 'WARN': return 'text-amber-500 border-amber-500/20 bg-amber-900/10';
        default: return 'text-indigo-400 border-indigo-500/20 bg-indigo-900/10';
    }
};

export const AuditTableRow: React.FC<AuditTableRowProps> = ({ log, onInspect }) => {
    const timestamp = new Date(log.timestamp).toLocaleString(undefined, {
        month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });

    const actorDisplay = log.userId === 'admin-root' 
        ? 'SUPER_ADMIN' 
        : log.userId === 'system' 
            ? 'SYSTEM' 
            : log.userId?.substring(0, 8) || '---';
    const previewMessage = truncateAuditMessage(log.message, 160);

    return (
        <tr className="hover:bg-slate-800/40 transition-colors group">
            <td className="p-4 font-mono text-slate-500 text-[10px]">
                {timestamp}
            </td>
            <td className="p-4 text-center">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-tighter border ${getLevelStyle(log.level)}`}>
                    {log.level}
                </span>
            </td>
            <td className="p-4">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 group-hover:border-indigo-500/30 transition-colors uppercase tracking-tight">
                    {log.module}
                </span>
            </td>
            <td className="p-4 min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    {log.level === 'ERROR' && <AlertCircle size={14} className="text-red-500 shrink-0" />}
                    <span className={`block min-w-0 truncate font-medium ${log.level === 'ERROR' ? 'text-red-200' : 'text-slate-300'}`} title={previewMessage}>
                        {previewMessage}
                    </span>
                </div>
            </td>
            <td className="p-4 text-right">
                <span className="text-[10px] font-mono text-slate-500 bg-slate-950/50 px-2 py-1 rounded border border-slate-800" title={log.userId}>
                    {actorDisplay}
                </span>
            </td>
            <td className="p-4 text-center">
                <button 
                    onClick={() => onInspect(log)}
                    className="p-2 text-slate-500 hover:text-indigo-400 transition-all hover:bg-indigo-500/10 rounded-lg active:scale-90"
                    title="View Complete Detail"
                >
                    <Info size={16} />
                </button>
            </td>
        </tr>
    );
};
