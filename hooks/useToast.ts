
import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastState {
    message: string;
    type: ToastType;
}

export const useToast = () => {
    const [toast, setToast] = useState<ToastState | null>(null);

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        setToast({ message, type });
        if (type !== 'info') {
            setTimeout(() => setToast(null), 3000);
        }
    }, []);

    const hideToast = useCallback(() => {
        setToast(null);
    }, []);

    return { toast, showToast, hideToast };
};
