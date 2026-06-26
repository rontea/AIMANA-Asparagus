import { api } from './api';

export interface CustomProjectType {
    id: string;
    label: string;
    description: string;
    iconName: string;
    color: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedTypes: CustomProjectType[] | null = null;
let cacheExpiresAt = 0;
let inflight: Promise<CustomProjectType[]> | null = null;

export const clearProjectTypesCache = () => {
    cachedTypes = null;
    cacheExpiresAt = 0;
    inflight = null;
};

export const getProjectTypes = async (forceRefresh = false): Promise<CustomProjectType[]> => {
    const now = Date.now();
    if (!forceRefresh && cachedTypes && now < cacheExpiresAt) {
        return cachedTypes;
    }
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch('/api/settings/project-types', {
                headers: api.auth.getAuthHeaders()
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const rows = (await res.json()) as CustomProjectType[];
            cachedTypes = rows;
            cacheExpiresAt = Date.now() + CACHE_TTL_MS;
            return rows;
        } catch {
            return cachedTypes || [];
        } finally {
            inflight = null;
        }
    })();

    return inflight;
};
