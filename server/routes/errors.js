import express from 'express';
import { createErrorReport, dbGet } from '../db.js';

const router = express.Router();

const allowedLevels = new Set(['INFO', 'WARN', 'ERROR']);

router.post('/report', async (req, res) => {
    try {
        const userId = req.user?.id || 'anonymous';
        const payload = req.body || {};
        const level = allowedLevels.has(payload.level) ? payload.level : 'ERROR';
        const moduleName = String(payload.module || 'FRONTEND').slice(0, 64);
        const message = String(payload.message || '').trim();

        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }

        const reportId = await createErrorReport({
            level,
            module: moduleName,
            source: String(payload.source || 'client').slice(0, 32),
            errorName: String(payload.errorName || 'Error').slice(0, 128),
            message,
            stack: String(payload.stack || ''),
            route: String(payload.route || ''),
            userId,
            context: payload.context || null,
            fingerprint: String(payload.fingerprint || '').slice(0, 64)
        });

        if (!reportId) {
            return res.status(500).json({ error: 'Failed to persist error report' });
        }

        return res.json({ success: true, reportId });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const report = await dbGet(`SELECT * FROM error_reports WHERE id = ?`, [id]);
        if (!report) return res.status(404).json({ error: 'Error report not found' });

        const actorId = req.user?.id || '';
        const isSuperUser = actorId === 'admin-root';
        const isOwner = report.userId === actorId;
        if (!isSuperUser && !isOwner) {
            return res.status(403).json({ error: 'Privileged action required' });
        }

        let context = null;
        try {
            context = report.contextJson ? JSON.parse(report.contextJson) : null;
        } catch {
            context = null;
        }

        return res.json({
            id: report.id,
            timestamp: report.timestamp,
            level: report.level,
            module: report.module,
            source: report.source,
            errorName: report.errorName,
            message: report.message,
            stack: report.stack,
            route: report.route,
            userId: report.userId,
            fingerprint: report.fingerprint,
            context
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

export default router;
