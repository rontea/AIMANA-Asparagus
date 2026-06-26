import { useCallback, useState } from 'react';
import { api } from '../services/api';
import { ChatItem } from '../types/chatItems';

interface CaptureArgs {
    projectId: string;
    session: any;
}

interface UseChatItemCaptureResult {
    isCapturing: boolean;
    error: string | null;
    clearError: () => void;
    captureToProject: (args: CaptureArgs) => Promise<ChatItem>;
}

export const useChatItemCapture = (): UseChatItemCaptureResult => {
    const [isCapturing, setIsCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clearError = useCallback(() => setError(null), []);

    const captureToProject = useCallback(async ({ projectId, session }: CaptureArgs) => {
        setIsCapturing(true);
        setError(null);
        try {
            const item = await api.chatItems.create(projectId, session);
            return item;
        } catch (e: any) {
            const message = e?.message || 'Failed to save chat capture';
            setError(message);
            throw e;
        } finally {
            setIsCapturing(false);
        }
    }, []);

    return {
        isCapturing,
        error,
        clearError,
        captureToProject
    };
};
