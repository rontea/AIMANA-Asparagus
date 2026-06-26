import { ChatSession } from '../components/chat/types';

export type ChatItemPayload = ChatSession;

export interface ChatItemAttachment {
    id: string;
    chatItemId: string;
    messageId: string;
    inputId: string;
    referenceItemId: string;
    fileUrl: string;
    mimeType: string;
    size: number;
    createdAt: number;
}

export interface ChatItem {
    id: string;
    projectId: string;
    title: string;
    sessionId: string;
    modelId: string;
    modelIds: string[];
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    useSearch: boolean;
    useLinks: boolean;
    useReasoning: boolean;
    messageCount: number;
    transcriptText?: string;
    isArchived: boolean;
    isPinned: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ChatItemDetail extends ChatItem {
    payload?: ChatItemPayload | null;
    attachments?: ChatItemAttachment[];
}
