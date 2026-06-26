
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { useAuditLogs } from '../hooks/useAuditLogs';
import { AuditHeader } from '../components/audit/AuditHeader';
import { AuditSidebar } from '../components/audit/AuditSidebar';
import { AuditTable } from '../components/audit/AuditTable';
import { AuditPagination } from '../components/audit/AuditPagination';
import { AuditDetailModal } from '../components/audit/AuditDetailModal';
import SecurityChallengeModal from '../components/SecurityChallengeModal';
import { privilegedAuth } from '../services/privilegedAuth';
import { SystemLog } from '../types';

type ChallengeMode = 'view' | 'clear' | null;

const AuditLogs: React.FC = () => {
    const navigate = useNavigate();
    const [isElevated, setIsElevated] = useState(() => privilegedAuth.isAuthorized());
    const [challengeMode, setChallengeMode] = useState<ChallengeMode>(isElevated ? null : 'view');
    const {
        logs, isLoading, isScanning, isDownloading, isClearing, error, total,
        currentPage, itemsPerPage, setItemsPerPage,
        refresh, runScan, clearLogs, downloadCSV, changePage, totalPages
    } = useAuditLogs(25, isElevated);

    const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

    const handleClearInitiated = () => {
        if (logs.length === 0) return;
        setChallengeMode('clear');
    };

    const handleSecuritySuccess = () => {
        if (challengeMode === 'view') {
            setIsElevated(true);
            refresh();
        } else if (challengeMode === 'clear') {
            clearLogs();
        }
        setChallengeMode(null);
    };

    const handleSecurityClose = () => {
        if (challengeMode === 'view') {
            navigate('/', { replace: true });
            return;
        }
        setChallengeMode(null);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <AuditHeader 
                onRefresh={refresh} 
                onScan={runScan}
                onDownload={downloadCSV}
                onClear={handleClearInitiated}
                isLoading={isLoading} 
                isScanning={isScanning}
                isDownloading={isDownloading}
                isClearing={isClearing}
            />

            {error && (
                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-2xl flex items-center gap-4 text-red-200 animate-in shake">
                    <AlertCircle className="text-red-500 shrink-0" size={24} />
                    <div className="text-sm font-medium">{error}</div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <AuditSidebar 
                    totalLogs={total} 
                    itemsPerPage={itemsPerPage} 
                    onItemsPerPageChange={setItemsPerPage} 
                />

                <div className="md:col-span-3 space-y-6">
                    <div className="bg-slate-800 rounded-[2rem] border border-slate-700 shadow-2xl overflow-hidden flex flex-col min-h-[600px]">
                        <AuditTable 
                            logs={logs} 
                            isLoading={isLoading} 
                            onInspect={(log) => setSelectedLog(log)}
                        />
                        
                        <AuditPagination 
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalLogs={total}
                            itemsPerPage={itemsPerPage}
                            isLoading={isLoading}
                            onPageChange={changePage}
                        />
                    </div>
                </div>
            </div>

            {selectedLog && (
                <AuditDetailModal 
                    log={selectedLog} 
                    onClose={() => setSelectedLog(null)} 
                />
            )}

            {challengeMode !== null && (
                <SecurityChallengeModal 
                    isOpen={challengeMode !== null}
                    onClose={handleSecurityClose}
                    onSuccess={handleSecuritySuccess}
                    title={challengeMode === 'view' ? "Access Audit Trail" : "Purge Audit Trail"}
                    description={
                        challengeMode === 'view'
                            ? "This zone contains security-critical forensic records. Verify your Super Admin password to continue."
                            : "This action will permanently delete all chronological event records from the database. Please verify your Super Admin credentials to authorize destruction."
                    }
                />
            )}
        </div>
    );
};

export default AuditLogs;
