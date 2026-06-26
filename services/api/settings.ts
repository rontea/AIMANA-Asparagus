
import { AppSettings } from '../../types';
import type { PromptDraft } from '../../components/prompt-manager/types';
import type { ArchivedRegistryVariable, RegistryVariable } from '../../utils/variableRegistryStorage';
import { API_BASE, handleResponse, getHeaders } from './utils';

export interface AppUpdateSnapshot {
    currentVersion: string;
    latestVersion: string;
    checkedAt: number | null;
    updateAvailable: boolean;
    updatedAt: number;
}

export const settings = {
    get: async (): Promise<AppSettings> => {
        return handleResponse(await fetch(`${API_BASE}/settings`, { headers: getHeaders() }));
    },
    update: async (data: AppSettings): Promise<void> => {
        await fetch(`${API_BASE}/settings`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(data)
        }).then(handleResponse);
    },
    listPresets: async (): Promise<any[]> => {
        return handleResponse(await fetch(`${API_BASE}/settings/bulk-presets`, { headers: getHeaders() }));
    },
    savePreset: async (name: string, variables: any[], manifest?: string, inputMode?: string): Promise<any> => {
        return handleResponse(await fetch(`${API_BASE}/settings/bulk-presets`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ name, variables, manifest, inputMode })
        }));
    },
    updatePreset: async (id: string, name: string, variables: any[], manifest: string, inputMode: string): Promise<void> => {
        await fetch(`${API_BASE}/settings/bulk-presets/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ name, variables, manifest, inputMode })
        }).then(handleResponse);
    },
    deletePreset: async (id: string): Promise<void> => {
        await fetch(`${API_BASE}/settings/bulk-presets/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        }).then(handleResponse);
    },
    listVariableRegistryLists: async (): Promise<any[]> => {
        return handleResponse(await fetch(`${API_BASE}/settings/variable-registry-lists`, { headers: getHeaders() }));
    },
    saveVariableRegistryList: async (name: string, variables: any[]): Promise<any> => {
        return handleResponse(await fetch(`${API_BASE}/settings/variable-registry-lists`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ name, variables })
        }));
    },
    updateVariableRegistryList: async (id: string, name: string, variables: any[]): Promise<{ success: boolean; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/variable-registry-lists/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ name, variables })
        }));
    },
    deleteVariableRegistryList: async (id: string): Promise<void> => {
        await fetch(`${API_BASE}/settings/variable-registry-lists/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        }).then(handleResponse);
    },
    listPromptManagerDrafts: async (): Promise<PromptDraft[]> => {
        return handleResponse(await fetch(`${API_BASE}/settings/prompt-manager-drafts`, { headers: getHeaders() }));
    },
    replacePromptManagerDrafts: async (drafts: PromptDraft[]): Promise<{ success: boolean; count: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/prompt-manager-drafts`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ drafts })
        }));
    },
    appendPromptManagerDrafts: async (drafts: PromptDraft[]): Promise<{ success: boolean; count: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/prompt-manager-drafts/append`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ drafts })
        }));
    },
    deletePromptManagerDrafts: async (ids: string[]): Promise<{ success: boolean; count: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/prompt-manager-drafts/delete`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ ids })
        }));
    },
    uploadPromptManagerDraftImage: async (
        draftId: string,
        dataUrl: string,
        mimeType?: string
    ): Promise<{ fileUrl: string; mimeType: string; size: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/prompt-manager-drafts/upload-image`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ draftId, dataUrl, mimeType })
        }));
    },
    getActiveVariableRegistry: async (): Promise<RegistryVariable[]> => {
        return handleResponse(await fetch(`${API_BASE}/settings/active-variable-registry`, { headers: getHeaders() }));
    },
    replaceActiveVariableRegistry: async (variables: RegistryVariable[]): Promise<{ success: boolean; count: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/active-variable-registry`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ variables })
        }));
    },
    getArchivedVariableRegistry: async (): Promise<ArchivedRegistryVariable[]> => {
        return handleResponse(await fetch(`${API_BASE}/settings/archived-variable-registry`, { headers: getHeaders() }));
    },
    replaceArchivedVariableRegistry: async (entries: ArchivedRegistryVariable[]): Promise<{ success: boolean; count: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/archived-variable-registry`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ entries })
        }));
    },
    getBulkStudioState: async (): Promise<{
        variables: any[];
        tasks: any[];
        failedTasks: any[];
        archivedTasks: any[];
        isActive: boolean;
        batchModelId: string | null;
        updatedAt: number;
    }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/bulk-studio-state`, { headers: getHeaders() }));
    },
    replaceBulkStudioState: async (state: {
        variables: any[];
        tasks: any[];
        failedTasks: any[];
        archivedTasks: any[];
        isActive: boolean;
        batchModelId: string | null;
    }): Promise<{ success: boolean; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/bulk-studio-state`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(state)
        }));
    },
    appendBulkStudioTasks: async (tasks: any[]): Promise<{ success: boolean; count: number; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/bulk-studio-state/append-tasks`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ tasks })
        }));
    },
    getLabWorkspaceState: async (): Promise<{ state: Record<string, unknown> | null; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/lab-workspace-state`, { headers: getHeaders() }));
    },
    replaceLabWorkspaceState: async (state: Record<string, unknown>): Promise<{ success: boolean; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/lab-workspace-state`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ state })
        }));
    },
    getAppUpdateState: async (): Promise<AppUpdateSnapshot> => {
        return handleResponse(await fetch(`${API_BASE}/settings/app-update-state`, { headers: getHeaders() }));
    },
    updateAppUpdateState: async (state: {
        currentVersion: string;
        latestVersion: string;
        checkedAt: number | null;
        updateAvailable: boolean;
    }): Promise<AppUpdateSnapshot> => {
        return handleResponse(await fetch(`${API_BASE}/settings/app-update-state`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(state)
        }));
    },
    verifyPin: async (pin: string): Promise<{ success: boolean; deleteVerificationToken?: string }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/verify-pin`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ pin })
        }));
    },
    verifyTotp: async (code: string): Promise<{ success: boolean; deleteVerificationToken?: string }> => {
        return handleResponse(await fetch(`${API_BASE}/settings/verify-totp`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ code })
        }));
    },
    syncGoogleModels: async (): Promise<any> => {
        return handleResponse(await fetch(`${API_BASE}/settings/registry/sync/google-models`, {
            method: 'POST',
            headers: getHeaders()
        }));
    }
};
