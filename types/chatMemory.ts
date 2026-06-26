export interface ChatMemory {
    sessionId: string;
    modelId?: string;
    pinnedMemory?: string;
    pinnedMemoryUpdatedAt?: number;
    memoryProfile?: 'light' | 'balanced' | 'deep';
    memoryProfileUpdatedAt?: number;
    memorySummary?: string;
    memorySummaryMessageCount?: number;
    memorySummaryUpdatedAt?: number;
    updatedAt?: number;
}

export interface ChatMemoryResponse {
    sessionId: string;
    memory: ChatMemory | null;
}
