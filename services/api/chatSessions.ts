import type { ChatAudioInput, ChatImageInput, ChatSession } from '../../components/chat/types';
import { API_BASE, getHeaders, handleResponse } from './utils';

const dataUrlToBase64 = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            const split = result.split(',');
            if (split.length < 2) {
                reject(new Error('Failed to encode audio attachment.'));
                return;
            }
            resolve(split[1]);
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to encode audio attachment.'));
        reader.readAsDataURL(blob);
    });
};

const inferAudioFormat = (mimeType = '', fallback = '') => {
    const explicit = String(fallback || '').trim().toLowerCase();
    if (explicit) return explicit;
    const subtype = String(mimeType || '').split('/')[1] || '';
    const normalizedSubtype = subtype.toLowerCase();
    const formatMap: Record<string, string> = {
        mpeg: 'mp3',
        mp3: 'mp3',
        wav: 'wav',
        'x-wav': 'wav',
        webm: 'webm',
        flac: 'flac',
        ogg: 'ogg',
        opus: 'opus',
        aac: 'aac',
        mp4: 'm4a',
        m4a: 'm4a'
    };
    return formatMap[normalizedSubtype] || 'mp3';
};

export const chatSessions = {
    list: async (): Promise<{ sessions: ChatSession[]; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/chat-sessions`, { headers: getHeaders() }));
    },
    replace: async (
        sessions: ChatSession[],
        options: { keepalive?: boolean } = {}
    ): Promise<{ success: boolean; updatedAt: number }> => {
        return handleResponse(await fetch(`${API_BASE}/chat-sessions`, {
            method: 'PUT',
            keepalive: options.keepalive,
            headers: getHeaders(),
            body: JSON.stringify({ sessions })
        }));
    },
    uploadImageAttachment: async (payload: {
        id?: string;
        name?: string;
        dataUrl: string;
        mimeType?: string;
        size?: number;
    }): Promise<ChatImageInput> => {
        return handleResponse(await fetch(`${API_BASE}/chat-sessions/attachments/image`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        }));
    },
    uploadAudioAttachment: async (payload: {
        id?: string;
        name?: string;
        data: string;
        format?: string;
        mimeType?: string;
        size?: number;
    }): Promise<ChatAudioInput> => {
        return handleResponse(await fetch(`${API_BASE}/chat-sessions/attachments/audio`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        }));
    },
    fetchAudioAttachmentData: async (
        audio: Pick<ChatAudioInput, 'url' | 'format' | 'mimeType'>
    ): Promise<Required<Pick<ChatAudioInput, 'data' | 'format'>> & Pick<ChatAudioInput, 'mimeType' | 'size'>> => {
        if (!audio.url) throw new Error('Audio attachment URL is required.');
        const res = await fetch(audio.url, { credentials: 'same-origin' });
        if (!res.ok) {
            throw new Error(`Audio attachment fetch failed: ${res.status}`);
        }
        const blob = await res.blob();
        const data = await dataUrlToBase64(blob);
        const mimeType = String(blob.type || audio.mimeType || '').trim() || undefined;
        return {
            data,
            format: inferAudioFormat(mimeType || '', audio.format || ''),
            mimeType,
            size: Number.isFinite(blob.size) ? blob.size : undefined
        };
    }
};
