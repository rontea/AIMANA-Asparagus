
import React, { useEffect, useMemo, useState } from 'react';
import { X, Shield, Clock, User, Terminal, Database, Fingerprint, Calendar, Copy, Loader2 } from 'lucide-react';
import { ErrorReport, SystemLog } from '../../types';
import { api } from '../../services/api';
import { normalizeAuditMessageForDisplay } from './auditMessage';

interface AuditDetailModalProps {
    log: SystemLog;
    onClose: () => void;
}

/**
 * Atomic Sub-components for Internal Organization
 */
const DetailStatBlock: React.FC<{ label: string; value: string; icon: any; colorClass: string }> = ({ label, value, icon: Icon, colorClass }) => (
    <div className="p-4 bg-black/40 border border-slate-800 rounded-2xl flex flex-col gap-1">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Icon size={12} /> {label}
        </span>
        <div className="mt-2">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${colorClass}`}>
                {value}
            </span>
        </div>
    </div>
);

const MetadataRow: React.FC<{ label: string; value: string; icon: any; highlight?: boolean }> = ({ label, value, icon: Icon, highlight }) => (
    <div className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
        <div className="flex items-center gap-3">
            <Icon size={14} className="text-slate-600" />
            <span className="text-xs font-bold text-slate-400">{label}</span>
        </div>
        <span className={`text-xs font-mono font-bold ${highlight ? 'text-indigo-400' : 'text-slate-300'}`}>
            {value}
        </span>
    </div>
);

export const AuditDetailModal: React.FC<AuditDetailModalProps> = ({ log, onClose }) => {
    const [report, setReport] = useState<ErrorReport | null>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const normalizedLogMessage = normalizeAuditMessageForDisplay(log.message);

    const reportId = useMemo(() => {
        const match = String(log.message || '').match(/ERR_REPORT:([a-f0-9-]{36})/i);
        return match?.[1] || null;
    }, [log.message]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!reportId) {
                setReport(null);
                return;
            }
            setIsLoadingReport(true);
            setReportError(null);
            try {
                const result = await api.errors.getReport(reportId);
                if (!cancelled) setReport(result);
            } catch (e: any) {
                if (!cancelled) setReportError(e.message || 'Failed to fetch full error report');
            } finally {
                if (!cancelled) setIsLoadingReport(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, [reportId]);

    const levelColors = {
        ERROR: 'text-red-400 border-red-500/30 bg-red-500/10',
        WARN: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
        INFO: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
    };

    const copyFullReport = async () => {
        const payload = report ? {
            id: report.id,
            timestamp: report.timestamp,
            utcDate: new Date(report.timestamp).toISOString(),
            level: report.level,
            module: report.module,
            source: report.source,
            errorName: report.errorName,
            message: report.message,
            stack: report.stack || '',
            route: report.route || '',
            userId: report.userId || '',
            fingerprint: report.fingerprint || '',
            context: report.context || {}
        } : {
            id: log.id,
            timestamp: log.timestamp,
            utcDate: new Date(log.timestamp).toISOString(),
            level: log.level,
            module: log.module,
            message: log.message,
            userId: log.userId || ''
        };

        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in" onClick={onClose}>
            <div 
                className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/10 animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Event Intelligence</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Audit Signature Detail</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-2.5 rounded-full hover:bg-slate-800 transition-all">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    {/* Primary Identity Section */}
                    <div className="grid grid-cols-2 gap-4">
                        <DetailStatBlock 
                            label="Severity Tier" 
                            value={`${log.level} PROTOCOL`} 
                            icon={Terminal} 
                            colorClass={levelColors[log.level]} 
                        />
                        <div className="p-4 bg-black/40 border border-slate-800 rounded-2xl flex flex-col gap-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Database size={12} /> Registry Module
                            </span>
                            <span className="mt-2 text-sm font-black text-white uppercase tracking-tight">
                                {log.module}
                            </span>
                        </div>
                    </div>

                    {/* Metadata Manifest */}
                    <div className="space-y-4">
                         <div className="flex items-center gap-2 px-1">
                            <Fingerprint size={14} className="text-indigo-500" />
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Neural Manifest</h4>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-inner">
                            <MetadataRow icon={Calendar} label="Timestamp" value={new Date(log.timestamp).toUTCString()} />
                            <MetadataRow icon={Clock} label="Raw Epoch" value={String(log.timestamp)} />
                            <MetadataRow 
                                icon={User} 
                                label="Origin Actor" 
                                highlight 
                                value={log.userId === 'admin-root' ? 'ROOT_AUTHORITY' : log.userId || 'SYSTEM_DAEMON'} 
                            />
                            <MetadataRow icon={Fingerprint} label="System GUID" value={`EVENT_NODE_${log.id}`} />
                        </div>
                    </div>

                    {/* Message Content */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Full Log Payload</label>
                            <button
                                onClick={copyFullReport}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2"
                            >
                                <Copy size={12} />
                                {copied ? 'Copied' : 'Copy Report'}
                            </button>
                        </div>
                        <div className="bg-black border border-slate-800 rounded-2xl p-6 shadow-inner relative group">
                            <p className="max-w-full break-words text-sm md:text-base text-slate-200 font-medium leading-relaxed italic">
                                "{normalizedLogMessage}"
                            </p>
                            <div className="absolute top-4 right-4 opacity-10">
                                <Terminal size={32} />
                            </div>
                        </div>
                    </div>

                    {reportId && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Structured Error Report</label>
                            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 text-xs text-slate-300 space-y-3">
                                {isLoadingReport && (
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Loader2 size={14} className="animate-spin" />
                                        Loading full error payload...
                                    </div>
                                )}
                                {reportError && <div className="text-red-400">{reportError}</div>}
                                {report && (
                                    <>
                                        <div><span className="text-slate-500">Report ID:</span> {report.id}</div>
                                        <div><span className="text-slate-500">Error:</span> {report.errorName}</div>
                                        {report.route && <div><span className="text-slate-500">Route:</span> {report.route}</div>}
                                        {report.fingerprint && <div><span className="text-slate-500">Fingerprint:</span> {report.fingerprint}</div>}
                                        {report.stack && (
                                            <pre className="bg-black/60 border border-slate-800 rounded-xl p-3 overflow-auto max-h-56 whitespace-pre-wrap">{report.stack}</pre>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-slate-800 bg-slate-900/50 flex justify-end shrink-0">
                    <button 
                        onClick={onClose} 
                        className="px-12 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
                    >
                        Dismiss Intelligence
                    </button>
                </div>
            </div>
        </div>
    );
};
