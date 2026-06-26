export type ChatRole = 'user' | 'assistant';
export type ChatStatus = 'done' | 'loading' | 'error' | 'stopped';

export interface ChatImageInput {
    id: string;
    name: string;
    url?: string;
    mimeType?: string;
    size?: number;
}

export interface ChatAudioInput {
    id: string;
    name: string;
    url?: string;
    data?: string;
    format?: string;
    mimeType?: string;
    size?: number;
}

export interface ChatSourceLink {
    title: string;
    url: string;
    snippet?: string;
    source?: string;
    publishedAt?: string;
}

export type ChatSearchMode = 'off' | 'native' | 'fallback';
export type MemoryProfile = 'light' | 'balanced' | 'deep';

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    status: ChatStatus;
    imageInputs?: ChatImageInput[];
    audioInputs?: ChatAudioInput[];
    modelId?: string;
    requestId?: string;
    latencyMs?: number;
    pollenUsed?: string;
    searchApplied?: boolean;
    searchMode?: ChatSearchMode;
    searchProvider?: string;
    searchWarning?: string;
    linkApplied?: boolean;
    linkWarning?: string;
    sources?: ChatSourceLink[];
}

export interface ChatSession {
    id: string;
    title: string;
    source: string;
    projectId: string;
    modelId: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    useSearch: boolean;
    useLinks: boolean;
    useReasoning: boolean;
    useMemory: boolean;
    memoryProfile?: MemoryProfile;
    memoryProfileUpdatedAt?: number;
    showSources: boolean;
    pinnedMemory?: string;
    pinnedMemoryUpdatedAt?: number;
    memorySummary?: string;
    memorySummaryUpdatedAt?: number;
    memorySummaryMessageCount?: number;
    readAloudVoiceURI?: string;
    readAloudVoiceName?: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface ChatContext {
    source: string;
    projectId: string;
}

export interface ConfirmDialogState {
    title: string;
    description: string;
    confirmLabel: string;
    tone?: 'neutral' | 'danger';
    onConfirm: () => void;
}
