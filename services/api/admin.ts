
import { StoredUser, SystemLog } from '../../types';
import { API_BASE, handleResponse, getHeaders, getAuthHeaders } from './utils';

export const admin = {
    listUsers: async () => handleResponse(await fetch(`${API_BASE}/admin/users`, { headers: getHeaders() })),
    addUser: async (user: any) => {
        return handleResponse(await fetch(`${API_BASE}/admin/users`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(user)
        }));
    },
    updateUser: async (user: any) => {
        await fetch(`${API_BASE}/admin/users/${user.id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(user)
        }).then(handleResponse);
    },
    deleteUser: async (id: string) => {
        await fetch(`${API_BASE}/admin/users/${id}`, { 
            method: 'DELETE', 
            headers: getHeaders()
        }).then(handleResponse);
    },
    getSystemBackupData: async () => {
        return handleResponse(await fetch(`${API_BASE}/admin/system-dump`, { headers: getHeaders() }));
    },
    getBackupState: async (): Promise<{
        lastSuccessfulBackupAt: number | null;
        lastBackupType: 'full' | 'incremental' | null;
        lastBackupId: string | null;
        lastBackupStatus?: 'complete' | 'partial' | null;
        lastBackupWarningCount?: number;
        updatedAt: number;
    }> => {
        return handleResponse(await fetch(`${API_BASE}/admin/backup/state`, { headers: getHeaders() }));
    },
    updateBackupState: async (payload: {
        lastSuccessfulBackupAt?: number | null;
        lastBackupType?: 'full' | 'incremental' | null;
        lastBackupId?: string | null;
        lastBackupStatus?: 'complete' | 'partial' | null;
        lastBackupWarningCount?: number;
    }): Promise<{
        lastSuccessfulBackupAt: number | null;
        lastBackupType: 'full' | 'incremental' | null;
        lastBackupId: string | null;
        lastBackupStatus?: 'complete' | 'partial' | null;
        lastBackupWarningCount?: number;
        updatedAt: number;
    }> => {
        return handleResponse(await fetch(`${API_BASE}/admin/backup/state`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        }));
    },
    restoreBackupBundles: async (files: File[], options: { clearUploadsOnFull?: boolean } = {}): Promise<{
        success: boolean;
        applied: {
            full: {
                fileName: string;
                tables: Record<string, number>;
                totalRowsTouched: number;
                uploadsRestored: number;
            } | null;
            incrementals: Array<{
                fileName: string;
                fromTimestamp: number;
                toTimestamp: number;
                tables: Record<string, number>;
                totalRowsTouched: number;
                uploadsRestored: number;
                movement: {
                    itemProjectMoves: number;
                    revisionPathMoves: number;
                };
            }>;
            uploadsRestored: number;
            warnings: string[];
        };
        backupState: {
            lastSuccessfulBackupAt: number | null;
            lastBackupType: 'full' | 'incremental' | null;
            lastBackupId: string | null;
            lastBackupStatus?: 'complete' | 'partial' | null;
            lastBackupWarningCount?: number;
            updatedAt: number;
        };
    }> => {
        const form = new FormData();
        files.forEach((file) => form.append('backups', file, file.name));
        form.append('clearUploadsOnFull', options.clearUploadsOnFull === false ? 'false' : 'true');
        const response = await fetch(`${API_BASE}/admin/backup/restore`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: form
        });
        return handleResponse(response);
    },
    getLogs: async (page: number = 1, limit: number = 50): Promise<{logs: SystemLog[], total: number}> => {
        return handleResponse(await fetch(`${API_BASE}/admin/logs?page=${page}&limit=${limit}`, { headers: getHeaders() }));
    },
    clearLogs: async (): Promise<void> => {
        return handleResponse(await fetch(`${API_BASE}/admin/logs`, {
            method: 'DELETE',
            headers: getHeaders()
        }));
    },
    fetchAllLogs: async (): Promise<SystemLog[]> => {
        const pageSize = 500;
        const firstPage: { logs: SystemLog[]; total: number } = await handleResponse(
            await fetch(`${API_BASE}/admin/logs?page=1&limit=${pageSize}`, { headers: getHeaders() })
        );

        const allLogs = [...firstPage.logs];
        const totalPages = Math.ceil((firstPage.total || 0) / pageSize);

        for (let page = 2; page <= totalPages; page++) {
            const result: { logs: SystemLog[]; total: number } = await handleResponse(
                await fetch(`${API_BASE}/admin/logs?page=${page}&limit=${pageSize}`, { headers: getHeaders() })
            );
            allLogs.push(...result.logs);
        }

        return allLogs;
    },
    reportError: async (module: string, message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'ERROR') => {
        return fetch(`${API_BASE}/admin/logs/report`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ module, message, level })
        }).catch(() => {}); // Fire and forget
    },
    runDiagnostics: async () => {
        return handleResponse(await fetch(`${API_BASE}/admin/diagnostics/scan`, {
            method: 'POST',
            headers: getHeaders()
        }));
    },
    downloadRawDatabase: async () => {
        const response = await fetch(`${API_BASE}/admin/database/download`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error("Database download failed");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aimana_backup_${new Date().toISOString().slice(0,10)}.db`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },
    downloadBackupBundle: async (mode: 'full' | 'incremental'): Promise<void> => {
        const url = `${API_BASE}/admin/backup/download?mode=${encodeURIComponent(mode)}`;
        const link = document.createElement('a');
        link.href = url;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
};

export const users = {
    search: async (query: string, projectId?: string, signal?: AbortSignal): Promise<Partial<StoredUser>[]> => {
        const search = new URLSearchParams({ q: query });
        if (projectId) search.set('projectId', projectId);
        return handleResponse(await fetch(`${API_BASE}/projects/users/search?${search.toString()}`, { headers: getHeaders(), signal }));
    }
};
