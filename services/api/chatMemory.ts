import { ChatMemory, ChatMemoryResponse } from '../../types/chatMemory';
import { API_BASE, getHeaders, handleResponse } from './utils';

export const chatMemory = {
    get: async (sessionId: string): Promise<ChatMemory | null> => {
        const result = await handleResponse(
            await fetch(`${API_BASE}/chat-memory/${sessionId}`, { headers: getHeaders() })
        ) as ChatMemoryResponse;
        return result?.memory || null;
    },
    upsert: async (sessionId: string, payload: Partial<ChatMemory>): Promise<void> => {
        await handleResponse(await fetch(`${API_BASE}/chat-memory/${sessionId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        }));
    },
    delete: async (sessionId: string): Promise<void> => {
        await handleResponse(await fetch(`${API_BASE}/chat-memory/${sessionId}`, {
            method: 'DELETE',
            headers: getHeaders()
        }));
    }
};
