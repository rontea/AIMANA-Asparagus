import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
/* Importing useNavigate from core package to fix named export issue */
import { useNavigate } from 'react-router';
import { useMaintenance } from '../hooks/useMaintenance';
import { MaintenanceHeader } from '../components/maintenance/MaintenanceHeader';
import { MaintenanceStats } from '../components/maintenance/MaintenanceStats';
import { QuickBackupCard } from '../components/maintenance/QuickBackupCard';
import { LastBackupCard } from '../components/maintenance/LastBackupCard';
import { RestoreAutomationCard } from '../components/maintenance/RestoreAutomationCard';
import { BackupTerminal } from '../components/maintenance/BackupTerminal';
import { MaintenanceInfo } from '../components/maintenance/MaintenanceInfo';
import { privilegedAuth } from '../services/privilegedAuth';
import SecurityChallengeModal from '../components/SecurityChallengeModal';
import { useModalDialogs } from '../hooks/useModalDialogs';

const Maintenance: React.FC = () => {
    const navigate = useNavigate();
    const { confirm, confirmDialog } = useModalDialogs();
    const {
        isExecuting,
        isDbDownloading,
        statusLog,
        progress,
        stats,
        backupState,
        isBackupStateLoading,
        error,
        handleRawDbDownload,
        handleFullBackup,
        handleIncrementalBackup,
        handleAutomatedRestore
    } = useMaintenance({ confirm });

    // Local trigger for re-rendering when session status changes
    const [isAuthorized, setIsAuthorized] = useState(() => privilegedAuth.isAuthorized());
    const [restoreFiles, setRestoreFiles] = useState<File[]>([]);

    if (!isAuthorized) {
        return (
            <SecurityChallengeModal 
                isOpen={true}
                onClose={() => navigate('/')}
                onSuccess={() => {
                    privilegedAuth.authenticate();
                    setIsAuthorized(true);
                }}
                title="System Operations Access"
                description="This area contains sensitive system data plus backup and restore tools used to capture the latest system updates. Please verify your Super Admin password to proceed."
            />
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <MaintenanceHeader onRawDownload={handleRawDbDownload} isDownloading={isDbDownloading} />

            {error && (
                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-2xl flex items-center gap-4 text-red-200 animate-in shake">
                    <AlertTriangle className="text-red-500 shrink-0" size={24} />
                    <div className="text-sm font-medium">{error}</div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4">
                    <MaintenanceStats stats={stats} />
                    <LastBackupCard backupState={backupState} isLoading={isBackupStateLoading} />
                    <QuickBackupCard onDownload={handleRawDbDownload} isDownloading={isDbDownloading} />
                    <RestoreAutomationCard
                        restoreFiles={restoreFiles}
                        isExecuting={isExecuting}
                        onSelectFiles={(files) => setRestoreFiles(files ? Array.from(files) : [])}
                        onStartRestore={async () => {
                            const ok = await handleAutomatedRestore(restoreFiles);
                            if (ok) setRestoreFiles([]);
                        }}
                    />
                </div>

                <div className="lg:col-span-2">
                    <BackupTerminal 
                        statusLog={statusLog} 
                        isExecuting={isExecuting} 
                        progress={progress} 
                        backupState={backupState}
                        isBackupStateLoading={isBackupStateLoading}
                        onStartBackup={handleFullBackup}
                        onStartIncrementalBackup={handleIncrementalBackup}
                    />
                </div>
            </div>
            
            <MaintenanceInfo />

            {confirmDialog}
        </div>
    );
};

export default Maintenance;
