import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbGet, dbRun, logSystemEvent } from '../db.js';
import { canAccessProject, canManageProject } from '../utils/access.js';
import { requireDeleteVerification } from '../middleware.js';
import { buildCreateChatItemInsert, listChatSessionModelIds, sanitizeChatSessionPayload } from '../logic/chatItems.js';
import { purgeChatAttachmentPhysicalFiles } from '../logic/itemOps.js';

const router = express.Router();

const mapChatItemRow = (row) => {
    if (!row) return null;
    let payload = null;
    try {
        payload = row.payloadJson ? JSON.parse(row.payloadJson) : null;
    } catch {
        payload = null;
    }

    const modelIds = listChatSessionModelIds(payload);
    if (modelIds.length === 0 && row.modelId) modelIds.push(row.modelId);

    return {
        id: row.id,
        projectId: row.projectId,
        title: row.title || 'Chat Capture',
        sessionId: row.sessionId || '',
        modelId: row.modelId || '',
        modelIds,
        systemPrompt: row.systemPrompt || '',
        temperature: Number.isFinite(row.temperature) ? Number(row.temperature) : 0.7,
        maxTokens: Number.isFinite(row.maxTokens) ? Number(row.maxTokens) : 1024,
        useSearch: !!row.useSearch,
        useLinks: !!row.useLinks,
        useReasoning: !!row.useReasoning,
        messageCount: Number.isFinite(row.messageCount) ? Number(row.messageCount) : 0,
        transcriptText: row.transcriptText || '',
        isArchived: !!row.isArchived,
        isPinned: !!row.isPinned,
        createdAt: Number.isFinite(row.createdAt) ? Number(row.createdAt) : Date.now(),
        updatedAt: Number.isFinite(row.updatedAt) ? Number(row.updatedAt) : Date.now()
    };
};

router.get('/projects/:id/chat-items', async (req, res) => {
    try {
        const projectId = req.params.id;
        const allowed = await canAccessProject(projectId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const rows = await dbAll(
            `SELECT * FROM chat_items WHERE projectId = ? AND isArchived = 0 ORDER BY updatedAt DESC`,
            [projectId]
        );
        res.json(rows.map(mapChatItemRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/chat-items/archived', async (req, res) => {
    try {
        let rows;
        if (req.user.role === 'admin' || req.user.id === 'admin-root') {
            rows = await dbAll(
                `SELECT * FROM chat_items WHERE isArchived = 1 ORDER BY updatedAt DESC`
            );
        } else {
            rows = await dbAll(
                `
                SELECT ci.*
                FROM chat_items ci
                JOIN projects p ON ci.projectId = p.id
                LEFT JOIN project_members pm ON p.id = pm.projectId
                WHERE ci.isArchived = 1 AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
                ORDER BY ci.updatedAt DESC
                `,
                [req.user.id, req.user.id]
            );
        }
        res.json(rows.map(mapChatItemRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/chat-items', async (req, res) => {
    try {
        let rows;
        if (req.user.role === 'admin' || req.user.id === 'admin-root') {
            rows = await dbAll(
                `SELECT * FROM chat_items WHERE isArchived = 0 ORDER BY updatedAt DESC`
            );
        } else {
            rows = await dbAll(
                `
                SELECT ci.*
                FROM chat_items ci
                JOIN projects p ON ci.projectId = p.id
                LEFT JOIN project_members pm ON p.id = pm.projectId
                WHERE ci.isArchived = 0 AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
                ORDER BY ci.updatedAt DESC
                `,
                [req.user.id, req.user.id]
            );
        }
        res.json(rows.map(mapChatItemRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/chat-items/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const row = await dbGet(`SELECT * FROM chat_items WHERE id = ?`, [itemId]);
        if (!row) return res.status(404).json({ error: 'Chat item not found' });

        const allowed = await canAccessProject(row.projectId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        let payload = null;
        try {
            payload = row.payloadJson ? JSON.parse(row.payloadJson) : null;
        } catch {
            payload = null;
        }

        const attachments = await dbAll(
            `SELECT * FROM chat_item_attachments WHERE chatItemId = ? ORDER BY createdAt ASC`,
            [itemId]
        );

        res.json({
            ...mapChatItemRow(row),
            payload,
            attachments: attachments.map((att) => ({
                id: att.id,
                chatItemId: att.chatItemId,
                messageId: att.messageId || '',
                inputId: att.inputId || '',
                referenceItemId: att.referenceItemId || '',
                fileUrl: att.fileUrl || '',
                mimeType: att.mimeType || '',
                size: Number.isFinite(att.size) ? Number(att.size) : 0,
                createdAt: Number.isFinite(att.createdAt) ? Number(att.createdAt) : Date.now()
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/chat-items/:id/snapshot', async (req, res) => {
    try {
        const itemId = req.params.id;
        const row = await dbGet(`SELECT id, projectId FROM chat_items WHERE id = ?`, [itemId]);
        if (!row) return res.status(404).json({ error: 'Chat item not found' });

        const allowed = await canAccessProject(row.projectId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const session = req.body?.session;
        if (!session || typeof session !== 'object' || !Array.isArray(session.messages)) {
            return res.status(400).json({ error: 'Valid chat session payload is required' });
        }

        const { payload, attachments, transcriptText } = await sanitizeChatSessionPayload({
            session,
            ownerId: req.user.id
        });
        payload.projectId = row.projectId;

        const now = Date.now();
        const title = payload.title || 'Chat Capture';
        const sessionId = payload.id || '';
        const messageCount = Array.isArray(payload.messages) ? payload.messages.length : 0;
        const payloadJson = JSON.stringify(payload);

        await dbRun('BEGIN TRANSACTION');
        try {
            await dbRun(
                `UPDATE chat_items
                 SET title = ?, sessionId = ?, modelId = ?, systemPrompt = ?, temperature = ?, maxTokens = ?,
                     useSearch = ?, useLinks = ?, useReasoning = ?, messageCount = ?, payloadJson = ?, transcriptText = ?, updatedAt = ?
                 WHERE id = ?`,
                [
                    title,
                    sessionId,
                    payload.modelId || '',
                    payload.systemPrompt || '',
                    payload.temperature,
                    payload.maxTokens,
                    payload.useSearch ? 1 : 0,
                    payload.useLinks ? 1 : 0,
                    payload.useReasoning ? 1 : 0,
                    messageCount,
                    payloadJson,
                    transcriptText,
                    now,
                    itemId
                ]
            );

            if (attachments.length > 0) {
                const existing = await dbAll(
                    `SELECT referenceItemId, fileUrl FROM chat_item_attachments WHERE chatItemId = ?`,
                    [itemId]
                );
                const seen = new Set(
                    existing.map((att) => `${att.referenceItemId || ''}|${att.fileUrl || ''}`)
                );
                for (const att of attachments) {
                    const key = `${att.referenceItemId || ''}|${att.fileUrl || ''}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    await dbRun(
                        `INSERT INTO chat_item_attachments (
                            id, chatItemId, messageId, inputId, referenceItemId, fileUrl, mimeType, size, createdAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            att.id || uuidv4(),
                            itemId,
                            att.messageId || '',
                            att.inputId || '',
                            att.referenceItemId || '',
                            att.fileUrl || '',
                            att.mimeType || '',
                            Number.isFinite(att.size) ? att.size : 0,
                            att.createdAt || now
                        ]
                    );
                }
            }

            await dbRun('COMMIT');
        } catch (e) {
            await dbRun('ROLLBACK');
            throw e;
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/chat-items', async (req, res) => {
    const userId = req.user.id;
    try {
        const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : '';
        const session = req.body?.session;
        if (!projectId) return res.status(400).json({ error: 'projectId is required' });
        if (!session || typeof session !== 'object' || !Array.isArray(session.messages)) {
            return res.status(400).json({ error: 'Valid chat session payload is required' });
        }

        const allowed = await canAccessProject(projectId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const { payload, attachments, transcriptText } = await sanitizeChatSessionPayload({
            session,
            ownerId: userId
        });
        payload.projectId = projectId;

        const now = Date.now();
        const chatItemId = uuidv4();
        const title = payload.title || 'Chat Capture';
        const sessionId = payload.id || '';
        const messageCount = Array.isArray(payload.messages) ? payload.messages.length : 0;
        const payloadJson = JSON.stringify(payload);

        await dbRun('BEGIN TRANSACTION');
        try {
            const insert = buildCreateChatItemInsert({
                chatItemId,
                projectId,
                title,
                sessionId,
                payload,
                messageCount,
                payloadJson,
                transcriptText,
                now
            });
            await dbRun(insert.sql, insert.params);

            for (const att of attachments) {
                await dbRun(
                    `INSERT INTO chat_item_attachments (
                        id, chatItemId, messageId, inputId, referenceItemId, fileUrl, mimeType, size, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        att.id || uuidv4(),
                        chatItemId,
                        att.messageId || '',
                        att.inputId || '',
                        att.referenceItemId || '',
                        att.fileUrl || '',
                        att.mimeType || '',
                        Number.isFinite(att.size) ? att.size : 0,
                        att.createdAt || now
                    ]
                );
            }

            await dbRun('COMMIT');
        } catch (e) {
            await dbRun('ROLLBACK');
            throw e;
        }

        await logSystemEvent('INFO', 'CHAT', `Chat capture saved (${chatItemId})`, userId);
        res.status(201).json(mapChatItemRow({
            id: chatItemId,
            projectId,
            title,
            sessionId,
            modelId: payload.modelId || '',
            payloadJson,
            systemPrompt: payload.systemPrompt || '',
            temperature: payload.temperature,
            maxTokens: payload.maxTokens,
            useSearch: payload.useSearch ? 1 : 0,
            useLinks: payload.useLinks ? 1 : 0,
            useReasoning: payload.useReasoning ? 1 : 0,
            messageCount,
            transcriptText,
            isArchived: 0,
            isPinned: 0,
            createdAt: now,
            updatedAt: now
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/chat-items/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        const row = await dbGet(`SELECT id, projectId, payloadJson FROM chat_items WHERE id = ?`, [itemId]);
        if (!row) return res.status(404).json({ error: 'Chat item not found' });

        const canManage = await canManageProject(row.projectId, req.user);
        if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

        const updates = req.body || {};
        const nextProjectId = typeof updates.projectId === 'string' ? updates.projectId.trim() : '';
        if (nextProjectId && nextProjectId !== row.projectId) {
            const targetCanManage = await canManageProject(nextProjectId, req.user);
            if (!targetCanManage) {
                return res.status(403).json({ error: 'Target project access denied' });
            }
        }

        const allowedFields = ['title', 'isArchived', 'isPinned', 'projectId'];
        const setClause = [];
        const params = [];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClause.push(`${field} = ?`);
                if (field === 'isArchived' || field === 'isPinned') {
                    params.push(updates[field] ? 1 : 0);
                } else if (field === 'projectId') {
                    params.push(nextProjectId || row.projectId);
                } else {
                    params.push(updates[field]);
                }
            }
        }
        if (nextProjectId && nextProjectId !== row.projectId) {
            try {
                const parsedPayload = row.payloadJson ? JSON.parse(row.payloadJson) : null;
                if (parsedPayload && typeof parsedPayload === 'object') {
                    parsedPayload.projectId = nextProjectId;
                    setClause.push('payloadJson = ?');
                    params.push(JSON.stringify(parsedPayload));
                }
            } catch {
                // Keep the existing payload when legacy JSON is malformed.
            }
        }
        if (setClause.length === 0) return res.json({ success: true });

        setClause.push('updatedAt = ?');
        params.push(Date.now());
        params.push(itemId);
        await dbRun(`UPDATE chat_items SET ${setClause.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/chat-items/:id', requireDeleteVerification, async (req, res) => {
    const userId = req.user.id;
    try {
        const itemId = req.params.id;
        const row = await dbGet(`SELECT id, projectId, isArchived FROM chat_items WHERE id = ?`, [itemId]);
        if (!row) return res.status(404).json({ error: 'Chat item not found' });

        const canManage = await canManageProject(row.projectId, req.user);
        if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });
        if (!row.isArchived) {
            return res.status(409).json({ error: 'Move chat item to Neural Recycle Bin before permanent delete.' });
        }
        const attachments = await dbAll(
            `SELECT id, fileUrl, referenceItemId
             FROM chat_item_attachments
             WHERE chatItemId = ?`,
            [itemId]
        );

        await dbRun('BEGIN TRANSACTION');
        try {
            await dbRun(`DELETE FROM chat_item_attachments WHERE chatItemId = ?`, [itemId]);
            await dbRun(`DELETE FROM chat_items WHERE id = ?`, [itemId]);
            await dbRun('COMMIT');
        } catch (e) {
            await dbRun('ROLLBACK');
            throw e;
        }
        await purgeChatAttachmentPhysicalFiles(itemId, attachments);
        await logSystemEvent('WARN', 'CHAT', `Chat capture deleted (${itemId})`, userId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
