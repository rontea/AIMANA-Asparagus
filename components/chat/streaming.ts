export interface ParsedSseEvent {
    delta?: string;
    content?: string;
    requestId?: string;
    latencyMs?: number;
    pollenUsed?: string;
    done?: boolean;
    diagnostics?: {
        pollenUsed?: string;
        searchApplied?: boolean;
        searchMode?: 'off' | 'native' | 'fallback';
        searchProvider?: string;
        searchWarning?: string;
        linkApplied?: boolean;
        linkWarning?: string;
        sources?: Array<{
            title: string;
            url: string;
            snippet?: string;
            source?: string;
            publishedAt?: string;
        }>;
    };
}

const parseSseEventBlock = (eventBlock: string): ParsedSseEvent[] => {
    const normalized = eventBlock.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const events: ParsedSseEvent[] = [];

    for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const chunk = line.slice(5).trimStart();
        if (!chunk) continue;
        if (chunk === '[DONE]') {
            events.push({ done: true });
            continue;
        }
        try {
            const parsed = JSON.parse(chunk);
            const event: ParsedSseEvent = {};
            if (typeof parsed?.delta === 'string') event.delta = parsed.delta;
            if (typeof parsed?.content === 'string') event.content = parsed.content;
            if (typeof parsed?.requestId === 'string') event.requestId = parsed.requestId;
            if (Number.isFinite(parsed?.latencyMs)) event.latencyMs = Number(parsed.latencyMs);
            if (typeof parsed?.pollenUsed === 'string') event.pollenUsed = parsed.pollenUsed;
            if (typeof parsed?.done === 'boolean') event.done = parsed.done;
            if (parsed?.diagnostics && typeof parsed.diagnostics === 'object') {
                const diagnostics = parsed.diagnostics;
                const d: NonNullable<ParsedSseEvent['diagnostics']> = {};
                if (typeof diagnostics.pollenUsed === 'string') d.pollenUsed = diagnostics.pollenUsed;
                if (typeof diagnostics.searchApplied === 'boolean') d.searchApplied = diagnostics.searchApplied;
                if (diagnostics.searchMode === 'off' || diagnostics.searchMode === 'native' || diagnostics.searchMode === 'fallback') {
                    d.searchMode = diagnostics.searchMode;
                }
                if (typeof diagnostics.searchProvider === 'string') d.searchProvider = diagnostics.searchProvider;
                if (typeof diagnostics.searchWarning === 'string') d.searchWarning = diagnostics.searchWarning;
                if (typeof diagnostics.linkApplied === 'boolean') d.linkApplied = diagnostics.linkApplied;
                if (typeof diagnostics.linkWarning === 'string') d.linkWarning = diagnostics.linkWarning;
                if (Array.isArray(diagnostics.sources)) {
                    d.sources = diagnostics.sources
                        .filter((src: any) => src && typeof src === 'object' && typeof src.title === 'string' && typeof src.url === 'string')
                        .map((src: any) => ({
                            title: src.title,
                            url: src.url,
                            ...(typeof src.snippet === 'string' ? { snippet: src.snippet } : {}),
                            ...(typeof src.source === 'string' ? { source: src.source } : {}),
                            ...(typeof src.publishedAt === 'string' ? { publishedAt: src.publishedAt } : {})
                        }));
                }
                if (
                    d.pollenUsed !== undefined ||
                    d.searchApplied !== undefined ||
                    d.searchMode !== undefined ||
                    d.searchProvider !== undefined ||
                    d.searchWarning !== undefined ||
                    d.linkApplied !== undefined ||
                    d.linkWarning !== undefined ||
                    d.sources !== undefined
                ) {
                    event.diagnostics = d;
                }
            }
            if (
                event.delta !== undefined
                || event.content !== undefined
                || event.requestId !== undefined
                || event.latencyMs !== undefined
                || event.pollenUsed !== undefined
                || event.done !== undefined
                || event.diagnostics !== undefined
            ) {
                events.push(event);
            }
        } catch {
            // Ignore malformed chunks and continue parsing.
        }
    }

    return events;
};

export const parseSseEvents = (buffer: string): { events: ParsedSseEvent[]; remainder: string } => {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    const remainder = blocks.pop() || '';
    const events: ParsedSseEvent[] = [];

    for (const block of blocks) {
        events.push(...parseSseEventBlock(block));
    }

    return { events, remainder };
};

export const parseSseTrailingEvents = (buffer: string): ParsedSseEvent[] => {
    if (!buffer.trim()) return [];
    return parseSseEventBlock(buffer);
};
