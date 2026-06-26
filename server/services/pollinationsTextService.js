import { getRuntimeEnvValue, getRuntimePollinationsApiKey } from '../utils/runtimeEnv.js';

const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
const DEFAULT_EMBEDDING_MODEL = 'openai-3-small';
const DEFAULT_CHAT_MODEL = 'openai';
const DEFAULT_TIMEOUT_MS = 60000;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 120000;

export const getPollinationsKey = () => (
    getRuntimeEnvValue('POLLINATIONS_KEY', '')
    || getRuntimePollinationsApiKey()
);

const resolveTimeoutMs = (value, fallback = DEFAULT_TIMEOUT_MS) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, numeric));
};

const createTimeoutError = (label, timeoutMs) => {
    const err = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds. Try again, choose a shorter request, or check Pollinations availability.`);
    err.status = 504;
    err.code = 'POLLINATIONS_TIMEOUT';
    return err;
};

const withTimeout = (timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const resolvedTimeoutMs = resolveTimeoutMs(timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolvedTimeoutMs);
    return {
        signal: controller.signal,
        timeoutMs: resolvedTimeoutMs,
        clear: () => clearTimeout(timer)
    };
};

const readJsonResponse = async (response) => {
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const message = payload?.error?.message || payload?.message || text || `Pollinations request failed (${response.status})`;
        const err = new Error(message);
        err.status = response.status;
        throw err;
    }

    return payload;
};

export const createPollinationsEmbeddings = async ({
    input,
    model = process.env.RAG_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    dimensions,
    timeoutMs
} = {}) => {
    const values = Array.isArray(input) ? input : [input];
    const cleanValues = values.map((value) => String(value || '').trim()).filter(Boolean);
    if (cleanValues.length === 0) return [];
    if (cleanValues.length > 32) {
        throw new Error('Pollinations embeddings accepts at most 32 inputs per batch.');
    }

    const key = getPollinationsKey();
    if (!key) {
        throw new Error('POLLINATIONS_KEY or POLLINATIONS_API_KEY is required for embeddings.');
    }

    const timeout = withTimeout(timeoutMs ?? process.env.RAG_EMBEDDING_TIMEOUT_MS);
    try {
        const response = await fetch(`${POLLINATIONS_BASE_URL}/embeddings`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                input: cleanValues,
                ...(dimensions ? { dimensions } : {})
            }),
            signal: timeout.signal
        });

        const payload = await readJsonResponse(response);
        const data = Array.isArray(payload?.data) ? payload.data : [];
        return data
            .sort((a, b) => Number(a?.index || 0) - Number(b?.index || 0))
            .map((entry) => ({
                embedding: Array.isArray(entry?.embedding) ? entry.embedding.map(Number) : [],
                model: payload?.model || model
            }));
    } catch (error) {
        if (error?.name === 'AbortError') throw createTimeoutError('Pollinations embeddings request', timeout.timeoutMs);
        throw error;
    } finally {
        timeout.clear();
    }
};

export const createPollinationsChatCompletion = async ({
    messages,
    model = process.env.RAG_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    temperature = 0.35,
    maxTokens = 1400,
    responseFormat,
    timeoutMs
} = {}) => {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Pollinations chat requires messages.');
    }

    const key = getPollinationsKey();
    if (!key) {
        throw new Error('POLLINATIONS_KEY or POLLINATIONS_API_KEY is required for chat completion.');
    }

    const timeout = withTimeout(timeoutMs ?? process.env.RAG_CHAT_TIMEOUT_MS);
    try {
        const response = await fetch(`${POLLINATIONS_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: false,
                ...(responseFormat ? { response_format: responseFormat } : {})
            }),
            signal: timeout.signal
        });

        const payload = await readJsonResponse(response);
        return {
            content: payload?.choices?.[0]?.message?.content || '',
            raw: payload,
            model: payload?.model || model,
            usage: payload?.usage || null
        };
    } catch (error) {
        if (error?.name === 'AbortError') throw createTimeoutError('Pollinations chat completion', timeout.timeoutMs);
        throw error;
    } finally {
        timeout.clear();
    }
};
