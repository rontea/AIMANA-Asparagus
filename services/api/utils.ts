import { authService } from '../auth';

export const API_BASE = '/api';

export const handleResponse = async (res: Response) => {
    if (!res.ok) {
        if (res.status === 401) {
            authService.logout();
            if (typeof window !== 'undefined' && !window.location.hash.includes('/login')) {
                window.location.hash = '#/login';
            }
            throw new Error('Session expired. Please sign in again.');
        }
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const errorLabel = String(err.error || `Request failed: ${res.status}`);
        const serverMessage = String(err.message || '').trim();
        const serverMessageSuffix = serverMessage && serverMessage !== errorLabel ? `: ${serverMessage}` : '';
        const details = Array.isArray(err.details)
            ? err.details.map((detail: unknown) => String(detail || '').trim()).filter(Boolean)
            : [];
        const detailMessage = details.length > 0 ? `: ${details.slice(0, 3).join('; ')}` : '';
        throw new Error(`${errorLabel}${serverMessageSuffix}${detailMessage}`);
    }
    return res.json();
};

export const getHeaders = (overrides: Record<string, string> = {}) => {
    return {
        'Content-Type': 'application/json',
        ...overrides
    };
};

export const getAuthHeaders = (overrides: Record<string, string> = {}) => {
    return {
        ...overrides
    };
};
