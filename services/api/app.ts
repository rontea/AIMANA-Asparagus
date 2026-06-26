import { API_BASE, handleResponse } from './utils';
import type { InstallStatus, InstallerRuntimeConfig, InstallSummary } from '../../types';

export interface AppVersionPayload {
    name: string;
    version: string;
    checkedAt: number;
}

export const app = {
    getVersion: async (): Promise<AppVersionPayload> => {
        const res = await fetch(`${API_BASE}/app/version`, {
            cache: 'no-store'
        });
        return handleResponse(res);
    },
    getInstallStatus: async (): Promise<InstallStatus> => {
        const res = await fetch(`${API_BASE}/app/install-status`, {
            cache: 'no-store'
        });
        return handleResponse(res);
    },
    bootstrapAdmin: async (payload: { email: string; password: string; name?: string }) => {
        const res = await fetch(`${API_BASE}/app/bootstrap/admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return handleResponse(res);
    },
    saveInstallConfig: async (payload: { instanceName: string; mode?: string; notes?: string }) => {
        const res = await fetch(`${API_BASE}/app/bootstrap/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return handleResponse(res);
    },
    finalizeInstall: async () => {
        const res = await fetch(`${API_BASE}/app/bootstrap/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        return handleResponse(res);
    },
    getRuntimeConfig: async (): Promise<InstallerRuntimeConfig> => {
        const res = await fetch(`${API_BASE}/app/bootstrap/runtime-config`, {
            cache: 'no-store'
        });
        return handleResponse(res);
    },
    getInstallSummary: async (): Promise<InstallSummary> => {
        const res = await fetch(`${API_BASE}/app/install-summary`, {
            cache: 'no-store'
        });
        return handleResponse(res);
    },
    saveRuntimeConfig: async (payload: Record<string, string | boolean>) => {
        const res = await fetch(`${API_BASE}/app/bootstrap/runtime-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return handleResponse(res);
    }
};
