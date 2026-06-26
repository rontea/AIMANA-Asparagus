import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { APP_METADATA } from '../utils/appMetadata';

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

const normalizeVersion = (value: string | null | undefined) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || 'unknown';
};

export interface AppUpdateState {
    currentVersion: string;
    latestVersion: string;
    checkedAt: number | null;
    isChecking: boolean;
    updateAvailable: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export const useAppUpdate = (pollIntervalMs = DEFAULT_POLL_INTERVAL_MS): AppUpdateState => {
    const currentVersion = normalizeVersion(APP_METADATA.version);
    const [latestVersion, setLatestVersion] = useState(currentVersion);
    const [checkedAt, setCheckedAt] = useState<number | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setIsChecking(true);
        try {
            const payload = await api.app.getVersion();
            const normalizedLatestVersion = normalizeVersion(payload?.version);
            const normalizedCheckedAt = Number.isFinite(payload?.checkedAt) ? payload.checkedAt : Date.now();
            const nextSnapshot = {
                currentVersion,
                latestVersion: normalizedLatestVersion,
                checkedAt: normalizedCheckedAt,
                updateAvailable: normalizedLatestVersion !== currentVersion
            };

            setLatestVersion(normalizedLatestVersion);
            setCheckedAt(normalizedCheckedAt);
            setError(null);

            try {
                await api.settings.updateAppUpdateState(nextSnapshot);
            } catch {
                // Best effort only; update visibility should not fail because persistence is unavailable.
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to check for updates.');
        } finally {
            setIsChecking(false);
        }
    }, [currentVersion]);

    useEffect(() => {
        let isActive = true;

        const loadPersistedState = async () => {
            try {
                const snapshot = await api.settings.getAppUpdateState();
                if (!isActive) return;
                setLatestVersion(normalizeVersion(snapshot?.latestVersion));
                setCheckedAt(Number.isFinite(snapshot?.checkedAt) ? Number(snapshot.checkedAt) : null);
            } catch {
                // Ignore cached-state failures and fall back to live checks.
            }
        };

        void loadPersistedState();
        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            void refresh();
        }, pollIntervalMs);

        return () => window.clearInterval(intervalId);
    }, [pollIntervalMs, refresh]);

    return {
        currentVersion,
        latestVersion,
        checkedAt,
        isChecking,
        updateAvailable: latestVersion !== currentVersion,
        error,
        refresh
    };
};
