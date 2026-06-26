import React, { useCallback } from 'react';
import { api } from '../services/api';
import { ItemWithCurrentRevision } from '../types';

interface UseItemActionsProps {
    // Added React namespace prefix to Dispatch and SetStateAction
    setItems: React.Dispatch<React.SetStateAction<ItemWithCurrentRevision[]>>;
    showToast: (msg: string, type?: 'success' | 'error') => void;
}

export const useItemActions = ({ setItems, showToast }: UseItemActionsProps) => {
    
    const handlePinToggle = useCallback(async (item: ItemWithCurrentRevision) => {
        try {
            const updated = { ...item, isPinned: !item.isPinned };
            await api.items.update(updated);
            setItems(prev => prev.map(i => i.id === item.id ? updated : i));
            showToast(updated.isPinned ? "Asset pinned" : "Asset unpinned");
        } catch (e) {
            showToast("Pin operation failed", "error");
        }
    }, [setItems, showToast]);

    const handleArchiveItem = useCallback(async (item: ItemWithCurrentRevision) => {
        try {
            await api.items.update({ ...item, isArchived: true, isPinned: false });
            setItems(prev => prev.filter(i => i.id !== item.id));
            showToast("Asset moved to trash");
        } catch (e) {
            showToast("Delete operation failed", "error");
        }
    }, [setItems, showToast]);

    return {
        handlePinToggle,
        handleArchiveItem
    };
};
