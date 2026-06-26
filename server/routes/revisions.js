
import express from 'express';
import { dbAll, dbRun, dbGet, logSystemEvent } from '../db.js';
import { canAccessItem, canAccessProject, canAccessRevision, canManageItem, canManageRevision } from '../utils/access.js';
import { normalizeWebSlashes } from '../utils/paths.js';
import { normalizeRevisionStorage } from '../utils/storage.js';
import { requireDeleteVerification } from '../middleware.js';
import { refreshItemReferenceIndex } from '../logic/referenceIndex.js';
import { purgeSingleRevisionPhysicalFiles } from '../logic/itemOps.js';

const router = express.Router();

const mapRevisionRowForClient = (row) => {
    let secondaryFiles = [];
    try { if (row.secondaryFilesJson) secondaryFiles = JSON.parse(row.secondaryFilesJson); } catch (e) {}
    return {
        ...row,
        storage: normalizeRevisionStorage(row.storage),
        fileUrl: normalizeWebSlashes(row.fileUrl),
        secondaryFiles: secondaryFiles.map((f) => ({ ...f, url: normalizeWebSlashes(f.url) }))
    };
};

// 1. Static/Global Routes (Must come BEFORE parameterized routes)
router.get('/revisions/archived', async (req, res) => {
    try {
        let rows;
        if (req.user.role === 'admin' || req.user.id === 'admin-root') {
            rows = await dbAll("SELECT * FROM revisions WHERE isArchived = 1 ORDER BY createdAt DESC");
        } else {
            rows = await dbAll(
                `SELECT r.* FROM revisions r
                 JOIN items i ON r.itemId = i.id
                 JOIN projects p ON i.projectId = p.id
                 LEFT JOIN project_members pm ON p.id = pm.projectId
                 WHERE r.isArchived = 1 AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
                 ORDER BY r.createdAt DESC`,
                [req.user.id, req.user.id]
            );
        }
        const mapped = rows.map(mapRevisionRowForClient);
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Project/Item specific lists
router.get('/projects/:projectId/revisions/archived', async (req, res) => {
    try {
        const allowed = await canAccessProject(req.params.projectId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const rows = await dbAll(`
            SELECT r.* FROM revisions r 
            JOIN items i ON r.itemId = i.id 
            WHERE i.projectId = ? AND r.isArchived = 1 
            ORDER BY r.createdAt DESC
        `, [req.params.projectId]);
        const mapped = rows.map(mapRevisionRowForClient);
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/items/:id/revisions', async (req, res) => {
    try {
        const allowed = await canAccessItem(req.params.id, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const rows = await dbAll("SELECT * FROM revisions WHERE itemId = ? ORDER BY versionNumber DESC", [req.params.id]);
        const mapped = rows.map(mapRevisionRowForClient);
        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Parameterized detail route (Captures everything after /revisions/)
router.get('/revisions/:id', async (req, res) => {
    try {
        const allowed = await canAccessRevision(req.params.id, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const r = await dbGet("SELECT * FROM revisions WHERE id = ?", [req.params.id]);
        if (r) {
            res.json(mapRevisionRowForClient(r));
        } else res.status(404).json({ error: "Revision not found" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Mutation Routes
router.post('/revisions', async (req, res) => {
    const { revision, updateItem } = req.body;
    const userId = req.user.id;
    try {
        const allowed = await canManageItem(revision?.itemId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Project owner or admin required' });

        const secondaryFilesJson = revision.secondaryFiles ? JSON.stringify(revision.secondaryFiles) : null;
        await dbRun(`INSERT INTO revisions (id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink, thumbnailLink, mimeType, size, originalFilename, title, label, tags, prompt, engine, note, aiParameters, secondaryFilesJson, createdAt, isArchived) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [revision.id, revision.itemId, revision.versionNumber, revision.storage, revision.fileUrl, revision.remoteId, revision.webViewLink, revision.webContentLink, revision.thumbnailLink, revision.mimeType, revision.size, revision.originalFilename, revision.title, revision.label, revision.tags || '', revision.prompt, revision.engine, revision.note, revision.aiParameters, secondaryFilesJson, revision.createdAt, 0]);
        
        if (updateItem) {
            await dbRun(`UPDATE items SET currentRevisionId = ?, updatedAt = ? WHERE id = ?`, [updateItem.revId, Date.now(), updateItem.itemId]);
            await refreshItemReferenceIndex(updateItem.itemId);
        }
        
        await logSystemEvent('INFO', 'REVISION', `Created version v${revision.versionNumber} for item ${revision.itemId}`, userId);
        res.status(201).json(revision);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/revisions/:id', async (req, res) => {
    const updates = req.body;
    const allowedFields = ['title', 'label', 'tags', 'prompt', 'engine', 'note', 'aiParameters', 'originalFilename', 'fileUrl', 'mimeType', 'size', 'remoteId', 'webViewLink', 'thumbnailLink', 'isArchived', 'secondaryFiles'];
    const setClause = [];
    const params = [];
    
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            if (field === 'secondaryFiles') {
                setClause.push(`secondaryFilesJson = ?`);
                params.push(JSON.stringify(updates[field]));
            } else {
                setClause.push(`${field} = ?`);
                if (field === 'isArchived') params.push(updates[field] ? 1 : 0);
                else params.push(updates[field]);
            }
        }
    }
    
    if (setClause.length === 0) return res.json({ success: true });
    
    params.push(req.params.id);
    try {
        const allowed = await canManageRevision(req.params.id, req.user);
        if (!allowed) return res.status(403).json({ error: 'Project owner or admin required' });

        await dbRun(`UPDATE revisions SET ${setClause.join(', ')} WHERE id = ?`, params);
        if (updates.aiParameters !== undefined || updates.secondaryFiles !== undefined) {
            const holder = await dbGet("SELECT i.id as itemId FROM items i WHERE i.currentRevisionId = ? LIMIT 1", [req.params.id]);
            if (holder?.itemId) await refreshItemReferenceIndex(holder.itemId);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/revisions/:id', requireDeleteVerification, async (req, res) => {
    const userId = req.user.id;
    const revisionId = req.params.id;
    try {
        const allowed = await canManageRevision(revisionId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Project owner or admin required' });

        const rev = await dbGet("SELECT itemId, isArchived FROM revisions WHERE id = ?", [revisionId]);
        if (!rev) return res.status(404).json({ error: "Revision not found" });
        if (!rev.isArchived) {
            return res.status(409).json({ error: 'Move revision to Neural Recycle Bin before permanent delete.' });
        }

        await purgeSingleRevisionPhysicalFiles(revisionId);

        const item = await dbGet("SELECT id, currentRevisionId FROM items WHERE currentRevisionId = ?", [revisionId]);
        await dbRun("DELETE FROM revisions WHERE id = ?", [revisionId]);

        if (item) {
            const nextBest = await dbGet("SELECT id FROM revisions WHERE itemId = ? ORDER BY versionNumber DESC LIMIT 1", [item.id]);
            if (nextBest) {
                await dbRun("UPDATE items SET currentRevisionId = ? WHERE id = ?", [nextBest.id, item.id]);
                await refreshItemReferenceIndex(item.id);
            } else {
                await dbRun("DELETE FROM item_references WHERE sourceItemId = ?", [item.id]);
                await dbRun("DELETE FROM items WHERE id = ?", [item.id]);
            }
        }

        await logSystemEvent('WARN', 'REVISION', `Permanently purged revision ID: ${revisionId}`, userId);
        res.json({ success: true });
    } catch (e) {
        console.error("[PURGE_REVISION_ERR]", e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
