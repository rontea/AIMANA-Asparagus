import express from 'express';
import { logSystemEvent } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { getRagIndexStatus, indexRagSources } from '../services/ragIndexService.js';
import { runPromptAssistant } from '../services/promptAssistantService.js';

const router = express.Router();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CHAT_RATE_LIMIT = 20;
const INDEX_RATE_LIMIT = 4;
const MAX_FILTER_BYTES = 4000;
const MAX_SOURCE_COUNT = 4;
const rateBuckets = new Map();

const isRagEnabled = () => {
    const raw = String(process.env.RAG_ENABLED || '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
};

const requireRagEnabled = (req, res, next) => {
    if (isRagEnabled()) return next();
    return res.status(503).json({
        error: 'Prompt Assistant is disabled. Set RAG_ENABLED=true to enable local RAG retrieval.'
    });
};

const parseSources = (value) => {
    if (!value) return undefined;
    const sources = Array.isArray(value) ? value.map(String) : String(value).split(',').map((part) => part.trim()).filter(Boolean);
    return sources.slice(0, MAX_SOURCE_COUNT);
};

const getRateLimitKey = (req, scope) => `${scope}:${req.user?.id || req.ip || 'anonymous'}`;

const requireRateLimit = (scope, limit) => (req, res, next) => {
    const now = Date.now();
    const key = getRateLimitKey(req, scope);
    const current = rateBuckets.get(key);
    if (!current || now >= current.resetAt) {
        rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return next();
    }
    if (current.count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Prompt Assistant rate limit exceeded. Try again shortly.' });
    }
    current.count += 1;
    return next();
};

const sanitizeFilters = (value = {}) => {
    const raw = value && typeof value === 'object' ? value : {};
    if (JSON.stringify(raw).length > MAX_FILTER_BYTES) {
        const err = new Error('Retrieval filters are too large.');
        err.status = 413;
        throw err;
    }
    const filters = {};
    if (raw.projectId) filters.projectId = String(raw.projectId).slice(0, 120);
    if (raw.sourceType) filters.sourceType = String(raw.sourceType).slice(0, 40);
    return filters;
};

const applyDirectFilters = (filters, body = {}) => {
    const next = { ...filters };
    if (body.projectId) next.projectId = String(body.projectId).slice(0, 120);
    if (body.sourceType) next.sourceType = String(body.sourceType).slice(0, 40);
    return next;
};

router.get('/status', async (_req, res, next) => {
    try {
        res.json(await getRagIndexStatus());
    } catch (error) {
        next(error);
    }
});

router.post('/index', requireAdmin, requireRagEnabled, requireRateLimit('prompt-assistant-index', INDEX_RATE_LIMIT), async (req, res, next) => {
    try {
        const sources = parseSources(req.body?.sources || req.query?.sources);
        const useLocalEmbeddings = req.body?.useLocalEmbeddings === true
            || String(req.query?.useLocalEmbeddings || '').toLowerCase() === 'true'
            || String(req.query?.embeddingMode || '').toLowerCase() === 'local';
        const summary = await indexRagSources({ sources, useLocalEmbeddings });
        await logSystemEvent(
            'INFO',
            'PROMPT_ASSISTANT',
            `RAG index updated (${summary.chunksUpdated} chunks, ${summary.failures} failures, embeddings=${useLocalEmbeddings ? 'local' : 'remote'})`,
            req.user?.id || 'system'
        );
        res.json({ success: true, ...summary });
    } catch (error) {
        await logSystemEvent(
            'ERROR',
            'PROMPT_ASSISTANT',
            `RAG index failed: ${error.message}`,
            req.user?.id || 'system'
        );
        next(error);
    }
});

router.post('/chat', requireRagEnabled, requireRateLimit('prompt-assistant-chat', CHAT_RATE_LIMIT), async (req, res, next) => {
    try {
        const body = req.body || {};
        const filters = applyDirectFilters(sanitizeFilters(body.filters), body);
        const result = await runPromptAssistant({
            message: body.message || body.prompt || '',
            user: req.user,
            intent: body.intent,
            filters,
            topK: body.topK
        });
        await logSystemEvent(
            'INFO',
            'PROMPT_ASSISTANT',
            `Prompt assistant ${result.intent} request (${result.matchCount || 0} matches)`,
            req.user?.id || 'system'
        );
        res.json({ success: true, ...result });
    } catch (error) {
        if (error?.status) {
            return res.status(error.status).json({ error: error.message });
        }
        next(error);
    }
});

export default router;
