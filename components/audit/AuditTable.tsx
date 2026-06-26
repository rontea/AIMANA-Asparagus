
import React from 'react';
import { Clock, User } from 'lucide-react';
import { SystemLog } from '../../types';
import { AuditTableRow } from './AuditTableRow';

interface AuditTableProps {
    logs: SystemLog[];
    isLoading: boolean;
    onInspect: (log: SystemLog) => void;
}

export const AuditTable: React.FC<AuditTableProps> = ({ logs, isLoading, onInspect }) => (
    <div className="overflow-x-auto flex-1">
        <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-slate-950 text-slate-500 uppercase text-[9px] font-black tracking-widest border-b border-slate-700">
                <tr>
                    <th className="p-4 w-40 flex items-center gap-2"><Clock size={12}/> Timestamp</th>
                    <th className="p-4 w-24 text-center">Level</th>
                    <th className="p-4 w-32">Module</th>
                    <th className="p-4">Event Description</th>
                    <th className="p-4 w-32 text-right flex items-center justify-end gap-2"><User size={12}/> Actor</th>
                    <th className="p-4 w-16 text-center">Action</th>
                </tr>
            </thead>
            <tbody className={`divide-y divide-slate-700/50 bg-slate-900/30 transition-opacity duration-200 ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
                {logs.length === 0 && !isLoading ? (
                    <tr>
                        <td colSpan={6} className="p-20 text-center text-slate-600 italic font-medium">
                            No system events recorded.
                        </td>
                    </tr>
                ) : (
                    logs.map((log) => (
                        <AuditTableRow 
                            key={log.id} 
                            log={log} 
                            onInspect={onInspect} 
                        />
                    ))
                )}
            </tbody>
        </table>
    </div>
);
