import { API_BASE, getHeaders, handleResponse } from './utils';
import { ErrorReport } from '../../types';

export interface ErrorReportPayload {
    level?: 'INFO' | 'WARN' | 'ERROR';
    module?: string;
    source?: 'client' | 'server' | string;
    errorName?: string;
    message: string;
    stack?: string;
    route?: string;
    context?: Record<string, unknown> | null;
    fingerprint?: string;
}

export const errors = {
    report: async (payload: ErrorReportPayload): Promise<{ success: boolean; reportId: string }> => {
        return handleResponse(await fetch(`${API_BASE}/errors/report`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        }));
    },
    getReport: async (id: string): Promise<ErrorReport> => {
        return handleResponse(await fetch(`${API_BASE}/errors/${encodeURIComponent(id)}`, {
            headers: getHeaders()
        }));
    }
};
