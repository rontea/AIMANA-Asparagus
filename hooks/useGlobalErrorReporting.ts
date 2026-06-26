import { useEffect, useRef } from 'react';
import { api } from '../services/api';

const REPORT_WINDOW_MS = 15000;

const safeFingerprint = (parts: string[]): string => {
    const raw = parts.join('|').toLowerCase();
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
};

const normalizeReason = (reason: unknown): { errorName: string; message: string; stack: string } => {
    if (reason instanceof Error) {
        return {
            errorName: reason.name || 'Error',
            message: reason.message || 'Unhandled error',
            stack: reason.stack || ''
        };
    }
    if (typeof reason === 'string') {
        return { errorName: 'Error', message: reason, stack: '' };
    }
    try {
        return { errorName: 'Error', message: JSON.stringify(reason), stack: '' };
    } catch {
        return { errorName: 'Error', message: 'Unknown rejection reason', stack: '' };
    }
};

export const useGlobalErrorReporting = () => {
    const recentlySentRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        const maybeSend = async (payload: {
            module: string;
            source: string;
            errorName: string;
            message: string;
            stack?: string;
            context?: Record<string, unknown>;
        }) => {
            try {
                if (!api.auth.isAuthenticated()) return;
                if (!payload.message || payload.message.includes('/api/errors/report')) return;

                const fingerprint = safeFingerprint([
                    payload.module,
                    payload.errorName,
                    payload.message,
                    (payload.stack || '').split('\n')[0] || ''
                ]);
                const now = Date.now();
                const last = recentlySentRef.current.get(fingerprint) || 0;
                if (now - last < REPORT_WINDOW_MS) return;

                recentlySentRef.current.set(fingerprint, now);
                await api.errors.report({
                    level: 'ERROR',
                    module: payload.module,
                    source: payload.source,
                    errorName: payload.errorName,
                    message: payload.message,
                    stack: payload.stack || '',
                    route: window.location.hash || window.location.pathname || '',
                    context: {
                        ...payload.context,
                        userAgent: navigator.userAgent,
                        online: navigator.onLine
                    },
                    fingerprint
                });
            } catch {
                // Never throw from global error reporter.
            }
        };

        const onError = (event: ErrorEvent) => {
            const reason = normalizeReason(event.error || event.message || 'Unhandled client error');
            void maybeSend({
                module: 'FRONTEND',
                source: 'client-window-error',
                errorName: reason.errorName,
                message: reason.message,
                stack: reason.stack,
                context: {
                    filename: event.filename || '',
                    lineno: event.lineno || 0,
                    colno: event.colno || 0
                }
            });
        };

        const onUnhandledRejection = (event: PromiseRejectionEvent) => {
            const reason = normalizeReason(event.reason);
            void maybeSend({
                module: 'FRONTEND',
                source: 'client-unhandled-rejection',
                errorName: reason.errorName,
                message: reason.message,
                stack: reason.stack
            });
        };

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onUnhandledRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
        };
    }, []);
};

