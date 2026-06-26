import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { ChatItem } from '../types/chatItems';

interface UseChatItemsResult {
    items: ChatItem[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export const useChatItems = (projectId: string | undefined): UseChatItemsResult => {
    const [items, setItems] = useState<ChatItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!projectId) {
            setItems([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const next = await api.chatItems.listByProject(projectId);
            setItems(next);
        } catch (e: any) {
            setError(e?.message || 'Failed to load chat captures');
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (!projectId) return;
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!detail || detail.projectId === projectId) refresh();
        };
        window.addEventListener('chat-captures-updated', handler as EventListener);
        return () => window.removeEventListener('chat-captures-updated', handler as EventListener);
    }, [projectId, refresh]);

    return { items, isLoading, error, refresh };
};
