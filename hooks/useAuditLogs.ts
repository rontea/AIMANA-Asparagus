
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { SystemLog } from '../types';

const escapeCsvCell = (value: unknown): string => {
    const raw = String(value ?? '');
    const formulaSafe = /^[\s\t]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${formulaSafe.replace(/"/g, '""')}"`;
};

export const useAuditLogs = (initialLimit: number = 25, enabled: boolean = true) => {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPageState] = useState(initialLimit);

    const fetchLogs = useCallback(async () => {
        if (!enabled) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await api.admin.getLogs(currentPage, itemsPerPage);
            setLogs(result.logs);
            setTotal(result.total);
        } catch (e) {
            setError("Failed to fetch system logs. Super Admin privileges required.");
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, itemsPerPage, enabled]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const refresh = () => {
        if (currentPage === 1) fetchLogs();
        else setCurrentPage(1);
    };

    const runScan = async () => {
        setIsScanning(true);
        try {
            await api.admin.runDiagnostics();
            refresh();
        } catch (e) {
            setError("Diagnostic scan failed.");
        } finally {
            setIsScanning(false);
        }
    };

    const clearLogs = async () => {
        setIsClearing(true);
        try {
            await api.admin.clearLogs();
            refresh();
        } catch (e) {
            setError("Log purge failed.");
        } finally {
            setIsClearing(false);
        }
    };

    const downloadCSV = async () => {
        setIsDownloading(true);
        try {
            const allLogs = await api.admin.fetchAllLogs();
            
            // CSV Header
            const headers = ['ID', 'Timestamp', 'UTC Date', 'Level', 'Module', 'Actor', 'Message'];
            
            // Map rows and handle quotes for CSV safety
            const rows = allLogs.map(log => {
                const utcDate = new Date(log.timestamp).toUTCString();
                const actor = log.userId === 'admin-root' ? 'ROOT_AUTHORITY' : log.userId || 'SYSTEM';
                return [
                    escapeCsvCell(log.id),
                    escapeCsvCell(log.timestamp),
                    escapeCsvCell(utcDate),
                    escapeCsvCell(log.level),
                    escapeCsvCell(log.module),
                    escapeCsvCell(actor),
                    escapeCsvCell(log.message)
                ];
            });

            const csvContent = [
                headers.join(','),
                ...rows.map(r => r.join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `aimana_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            setError("Log export failed.");
        } finally {
            setIsDownloading(false);
        }
    };

    const changePage = (page: number) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return {
        logs,
        isLoading,
        isScanning,
        isDownloading,
        isClearing,
        error,
        total,
        currentPage,
        itemsPerPage,
        setItemsPerPage: (val: number) => { 
            setItemsPerPageState(val); 
            setCurrentPage(1); 
        },
        refresh,
        runScan,
        clearLogs,
        downloadCSV,
        changePage,
        totalPages: Math.ceil(total / itemsPerPage)
    };
};
