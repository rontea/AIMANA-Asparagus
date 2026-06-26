import { ChatItem, ChatItemDetail } from '../../types/chatItems';
import { API_BASE, getHeaders, handleResponse } from './utils';

export const chatItems = {
    listAll: async (): Promise<ChatItem[]> => {
        return handleResponse(await fetch(`${API_BASE}/chat-items`, { headers: getHeaders() }));
    },
    listByProject: async (projectId: string): Promise<ChatItem[]> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/chat-items`, { headers: getHeaders() }));
    },
    listArchived: async (): Promise<ChatItem[]> => {
        return handleResponse(await fetch(`${API_BASE}/chat-items/archived`, { headers: getHeaders() }));
    },
    get: async (chatItemId: string): Promise<ChatItemDetail> => {
        return handleResponse(await fetch(`${API_BASE}/chat-items/${chatItemId}`, { headers: getHeaders() }));
    },
    create: async (projectId: string, session: any): Promise<ChatItem> => {
        return handleResponse(await fetch(`${API_BASE}/chat-items`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ projectId, session })
        }));
    },
    update: async (chatItemId: string, updates: Partial<ChatItem>): Promise<void> => {
        await handleResponse(await fetch(`${API_BASE}/chat-items/${chatItemId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(updates)
        }));
    },
    updateSnapshot: async (chatItemId: string, session: any): Promise<void> => {
        await handleResponse(await fetch(`${API_BASE}/chat-items/${chatItemId}/snapshot`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ session })
        }));
    },
    delete: async (chatItemId: string, deleteVerificationToken?: string): Promise<void> => {
        await fetch(`${API_BASE}/chat-items/${chatItemId}`, {
            method: 'DELETE',
            headers: getHeaders({
                ...(deleteVerificationToken ? { 'X-Delete-Verification': deleteVerificationToken } : {})
            })
        }).then(handleResponse);
    }
};
