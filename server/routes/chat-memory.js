import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun } from '../db.js';

const router = express.Router();

const normalizeString = (value, maxLen = 8000) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
};

const normalizeNumber = (value, fallback = 0) => (
    Number.isFinite(value) ? Number(value) : fallback
);

const mapRow = (row) => ({
    sessionId: row.sessionId,
    modelId: row.modelId || '',
    pinnedMemory: row.pinnedMemory || '',
    pinnedMemoryUpdatedAt: Number.isFinite(row.pinnedMemoryUpdatedAt) ? Number(row.pinnedMemoryUpdatedAt) : 0,
    memoryProfile: typeof row.memoryProfile === 'string' ? row.memoryProfile : 'balanced',
    memoryProfileUpdatedAt: Number.isFinite(row.memoryProfileUpdatedAt) ? Number(row.memoryProfileUpdatedAt) : 0,
    memorySummary: row.memorySummary || '',
    memorySummaryMessageCount: Number.isFinite(row.memorySummaryMessageCount) ? Number(row.memorySummaryMessageCount) : 0,
    memorySummaryUpdatedAt: Number.isFinite(row.memorySummaryUpdatedAt) ? Number(row.memorySummaryUpdatedAt) : 0,
    updatedAt: Number.isFinite(row.updatedAt) ? Number(row.updatedAt) : 0
});

router.get('/chat-memory/:sessionId', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const sessionId = String(req.params.sessionId || '').trim();
        if (!userId || !sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const row = await dbGet(
            `SELECT * FROM chat_memory WHERE userId = ? AND sessionId = ?`,
            [userId, sessionId]
        );

        if (!row) {
            return res.json({ sessionId, memory: null });
        }

        return res.json({ sessionId, memory: mapRow(row) });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.put('/chat-memory/:sessionId', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const sessionId = String(req.params.sessionId || '').trim();
        if (!userId || !sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const body = req.body || {};
        const modelId = typeof body.modelId === 'string' ? body.modelId : '';
        const pinnedMemory = normalizeString(body.pinnedMemory, 8000);
        const memoryProfile = ['light', 'balanced', 'deep'].includes(String(body.memoryProfile))
            ? String(body.memoryProfile)
            : 'balanced';
        const memorySummary = normalizeString(body.memorySummary, 8000);
        const pinnedMemoryUpdatedAt = (Number.isFinite(body.pinnedMemoryUpdatedAt) && Number(body.pinnedMemoryUpdatedAt) > 0)
            ? Number(body.pinnedMemoryUpdatedAt)
            : (pinnedMemory ? Date.now() : 0);
        const memorySummaryUpdatedAt = (Number.isFinite(body.memorySummaryUpdatedAt) && Number(body.memorySummaryUpdatedAt) > 0)
            ? Number(body.memorySummaryUpdatedAt)
            : (memorySummary ? Date.now() : 0);
        const memorySummaryMessageCount = Math.max(0, normalizeNumber(body.memorySummaryMessageCount, 0));
        const memoryProfileUpdatedAt = (Number.isFinite(body.memoryProfileUpdatedAt) && Number(body.memoryProfileUpdatedAt) > 0)
            ? Number(body.memoryProfileUpdatedAt)
            : (memoryProfile ? Date.now() : 0);
        const now = Date.now();

        await dbRun(
            `INSERT INTO chat_memory (
                id, userId, sessionId, modelId, pinnedMemory, pinnedMemoryUpdatedAt,
                memoryProfile, memoryProfileUpdatedAt,
                memorySummary, memorySummaryMessageCount, memorySummaryUpdatedAt, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId, sessionId) DO UPDATE SET
                modelId = excluded.modelId,
                pinnedMemory = excluded.pinnedMemory,
                pinnedMemoryUpdatedAt = excluded.pinnedMemoryUpdatedAt,
                memoryProfile = excluded.memoryProfile,
                memoryProfileUpdatedAt = excluded.memoryProfileUpdatedAt,
                memorySummary = excluded.memorySummary,
                memorySummaryMessageCount = excluded.memorySummaryMessageCount,
                memorySummaryUpdatedAt = excluded.memorySummaryUpdatedAt,
                updatedAt = excluded.updatedAt`,
            [
                uuidv4(),
                userId,
                sessionId,
                modelId,
                pinnedMemory,
                pinnedMemoryUpdatedAt,
                memoryProfile,
                memoryProfileUpdatedAt,
                memorySummary,
                memorySummaryMessageCount,
                memorySummaryUpdatedAt,
                now,
                now
            ]
        );

        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.delete('/chat-memory/:sessionId', async (req, res) => {
    try {
        const userId = req.user?.id || '';
        const sessionId = String(req.params.sessionId || '').trim();
        if (!userId || !sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        await dbRun(
            `DELETE FROM chat_memory WHERE userId = ? AND sessionId = ?`,
            [userId, sessionId]
        );
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

export default router;
