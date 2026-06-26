
import React from 'react';
import { Terminal, Info } from 'lucide-react';

interface SidebarBlockProps {
    title: string;
    icon: any;
    children: React.ReactNode;
    muted?: boolean;
}

const SidebarBlock: React.FC<SidebarBlockProps> = ({ title, icon: Icon, children, muted }) => (
    <div className={`${muted ? 'bg-slate-800/30' : 'bg-slate-800/50'} border border-slate-700 p-6 rounded-2xl`}>
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Icon size={12} /> {title}
        </h3>
        {children}
    </div>
);

interface AuditSidebarProps {
    totalLogs: number;
    itemsPerPage: number;
    onItemsPerPageChange: (val: number) => void;
}

const legendEntries = [
    { level: 'INFO', desc: 'Normal Activity', textClass: 'text-indigo-400', dotClass: 'bg-indigo-500' },
    { level: 'WARN', desc: 'Security/Deletes', textClass: 'text-amber-400', dotClass: 'bg-amber-500' },
    { level: 'ERROR', desc: 'System Failures', textClass: 'text-red-400', dotClass: 'bg-red-500' }
] as const;

export const AuditSidebar: React.FC<AuditSidebarProps> = ({ totalLogs, itemsPerPage, onItemsPerPageChange }) => (
    <div className="md:col-span-1 space-y-4">
        <SidebarBlock title="Log Summary" icon={Terminal}>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Total History</span>
                    <span className="text-sm font-bold text-white">{totalLogs}</span>
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-700/50">
                    <label className="text-[10px] font-black uppercase text-slate-600">Rows Per Page</label>
                    <select 
                        value={itemsPerPage}
                        onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                        {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v} rows</option>)}
                    </select>
                </div>
            </div>
        </SidebarBlock>

        <SidebarBlock title="Legend" icon={Info} muted>
            <div className="space-y-2">
                 {legendEntries.map(l => (
                    <div key={l.level} className={`flex items-center gap-2 text-[10px] font-bold ${l.textClass}`}>
                        <div className={`w-2 h-2 rounded-full ${l.dotClass}`}></div> {l.level}: {l.desc}
                    </div>
                 ))}
            </div>
        </SidebarBlock>
    </div>
);
