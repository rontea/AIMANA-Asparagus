import { API_BASE, getHeaders, handleResponse } from './utils';

export type PromptAssistantIntent =
    | 'idea_search'
    | 'prompt_discovery'
    | 'prompt_explanation'
    | 'prompt_draft'
    | 'prompt_refinement';

export interface PromptAssistantSource {
    id: string;
    sourceType: string;
    sourceId: string;
    sourceRoute: string;
    title: string;
    snippet: string;
    score: number;
    metadata?: Record<string, unknown>;
}

export interface PromptAssistantDraft {
    title: string;
    prompt: string;
    tags: string[];
    variables: string;
    sources: string;
}

export interface PromptAssistantChatRequest {
    message: string;
    intent?: PromptAssistantIntent;
    projectId?: string;
    sourceType?: string;
    filters?: Record<string, unknown>;
    topK?: number;
}

export interface PromptAssistantChatResponse {
    success: boolean;
    intent: PromptAssistantIntent;
    answer: string;
    draft: PromptAssistantDraft | null;
    sources: PromptAssistantSource[];
    matchCount: number;
    noSource: boolean;
    indexEmpty?: boolean;
    indexRefreshed?: boolean;
    model?: string;
    usage?: Record<string, unknown> | null;
}

export interface PromptAssistantIndexStatus {
    totalChunks: number;
    totalSources: number;
    lastIndexedAt: number;
    byType: Array<{
        sourceType: string;
        chunks: number;
        sources: number;
    }>;
}

export interface PromptAssistantIndexResponse {
    success: boolean;
    recordsScanned: number;
    chunksCreated: number;
    chunksUpdated: number;
    chunksDeleted: number;
    failures: number;
}

interface RequestOptions {
    signal?: AbortSignal;
    useLocalEmbeddings?: boolean;
}

export const promptAssistant = {
    status: async (options: RequestOptions = {}): Promise<PromptAssistantIndexStatus> => {
        return handleResponse(await fetch(`${API_BASE}/prompt-assistant/status`, {
            headers: getHeaders(),
            signal: options.signal
        })) as Promise<PromptAssistantIndexStatus>;
    },
    index: async (sources?: string[], options: RequestOptions = {}): Promise<PromptAssistantIndexResponse> => {
        return handleResponse(await fetch(`${API_BASE}/prompt-assistant/index`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                sources,
                ...(options.useLocalEmbeddings ? { useLocalEmbeddings: true } : {})
            }),
            signal: options.signal
        })) as Promise<PromptAssistantIndexResponse>;
    },
    chat: async (payload: PromptAssistantChatRequest, options: RequestOptions = {}): Promise<PromptAssistantChatResponse> => {
        return handleResponse(await fetch(`${API_BASE}/prompt-assistant/chat`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
            signal: options.signal
        })) as Promise<PromptAssistantChatResponse>;
    }
};
