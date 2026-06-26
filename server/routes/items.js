
import express from 'express';
import fs from 'fs';
import { dbAll, dbRun, dbGet, logSystemEvent } from '../db.js';
import { sanitizeDirName } from '../utils/paths.js';
import { upload } from '../middleware/itemUpload.js';
import { migrateItemBinaries, moveQueueCollectionItemBinariesToProjectRoot, purgeItemPhysicalFiles } from '../logic/itemOps.js';
import { refreshItemReferenceIndex } from '../logic/referenceIndex.js';
import path from 'path';
import crypto from 'crypto';
import { canAccessItem, canAccessProject, canManageItem, canManageProject } from '../utils/access.js';
import { normalizeWebSlashes, getPhysicalPathFromUrl } from '../utils/paths.js';
import { requireDeleteVerification } from '../middleware.js';

const router = express.Router();

const parseAiSafe = (aiParameters) => {
  if (!aiParameters || typeof aiParameters !== 'string') return null;
  try {
    return JSON.parse(aiParameters);
  } catch {
    return null;
  }
};

const isUploadedReferenceRevision = (revision) => {
  if (!revision) return false;
  if (revision.engine === 'reference' || revision.engine === 'reference-upload') return true;
  if (String(revision.fileUrl || '').includes('/Neural_Reference/')) return true;

  const parsed = parseAiSafe(revision.aiParameters);
  if (!parsed) return false;
  const adv = parsed.advanced_params || parsed;
  return !!(
    (adv.isReference && !adv.parentItemId) ||
    adv.referenceAsset === true ||
    adv.source === 'reference_upload' ||
    adv.source === 'reference_drop' ||
    (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
  );
};

const extractReferenceHash = (revision) => {
  const parsed = parseAiSafe(revision.aiParameters);
  if (!parsed) return null;
  const adv = parsed.advanced_params || parsed;
  const hash = adv.referenceHash || parsed.referenceHash;
  return typeof hash === 'string' && hash.trim() ? hash.trim().toLowerCase() : null;
};

const computeFileHash = (fileUrl) => {
  const physicalPath = getPhysicalPathFromUrl(fileUrl);
  if (!physicalPath) return null;
  try {
    const buf = fs.readFileSync(physicalPath);
    if (!buf?.length) return null;
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
};

const replaceReferenceIds = (aiParameters, replacementMap) => {
  const parsed = parseAiSafe(aiParameters);
  if (!parsed) return { changed: false, next: aiParameters };

  const replaceId = (id) => (typeof id === 'string' && replacementMap.has(id) ? replacementMap.get(id) : id);
  let changed = false;

  const apply = (target) => {
    if (!target || typeof target !== 'object') return;

    if (typeof target.referenceItemId === 'string') {
      const next = replaceId(target.referenceItemId);
      if (next !== target.referenceItemId) {
        target.referenceItemId = next;
        changed = true;
      }
    }

    if (typeof target.referenceAudioItemId === 'string') {
      const next = replaceId(target.referenceAudioItemId);
      if (next !== target.referenceAudioItemId) {
        target.referenceAudioItemId = next;
        changed = true;
      }
    }

    if (Array.isArray(target.referenceItemIds)) {
      const nextList = [];
      const seen = new Set();
      for (const id of target.referenceItemIds) {
        const next = replaceId(id);
        if (typeof next !== 'string' || !next) continue;
        if (!seen.has(next)) {
          seen.add(next);
          nextList.push(next);
        }
      }
      const prevSerialized = JSON.stringify(target.referenceItemIds);
      const nextSerialized = JSON.stringify(nextList);
      if (prevSerialized !== nextSerialized) {
        target.referenceItemIds = nextList;
        changed = true;
      }
    }

    if (Array.isArray(target.referenceAudioItemIds)) {
      const nextList = [];
      const seen = new Set();
      for (const id of target.referenceAudioItemIds) {
        const next = replaceId(id);
        if (typeof next !== 'string' || !next) continue;
        if (!seen.has(next)) {
          seen.add(next);
          nextList.push(next);
        }
      }
      const prevSerialized = JSON.stringify(target.referenceAudioItemIds);
      const nextSerialized = JSON.stringify(nextList);
      if (prevSerialized !== nextSerialized) {
        target.referenceAudioItemIds = nextList;
        changed = true;
      }
    }
  };

  apply(parsed);
  apply(parsed.advanced_params);

  return { changed, next: changed ? JSON.stringify(parsed, null, 2) : aiParameters };
};

const isImageOrVideoMime = (mimeType) => {
  const normalized = String(mimeType || '').toLowerCase();
  return normalized.startsWith('image/') || normalized.startsWith('video/');
};

const upsertMergeInfo = (aiParameters, mergeInfo) => {
  const parsed = parseAiSafe(aiParameters);
  const root = parsed && typeof parsed === 'object' ? { ...parsed } : {};
  const advSource = root.advanced_params && typeof root.advanced_params === 'object'
    ? root.advanced_params
    : {};
  const nextMergeInfo = {
    ...(root.mergeInfo && typeof root.mergeInfo === 'object' ? root.mergeInfo : {}),
    ...mergeInfo
  };
  root.mergeInfo = nextMergeInfo;
  root.advanced_params = {
    ...advSource,
    mergeInfo: nextMergeInfo
  };
  return JSON.stringify(root, null, 2);
};

// =============================================================================
// 1. DATA MAPPING HELPERS
// =============================================================================

const mapJoinedRowToItem = (row) => {
    const { 
        r_id, r_versionNumber, r_storage, r_fileUrl, r_remoteId, 
        r_webViewLink, r_webContentLink, r_thumbnailLink, r_mimeType, 
        r_size, r_originalFilename, r_title, r_label, r_tags, r_prompt,
        r_engine, r_note, r_aiParameters, r_secondaryFilesJson, r_createdAt,
        ...itemData 
    } = row;

    let secondaryFiles = [];
    try {
        if (r_secondaryFilesJson) {
            secondaryFiles = JSON.parse(r_secondaryFilesJson).map((f) => ({
                ...f,
                url: normalizeWebSlashes(f.url)
            }));
        }
    } catch (e) {
        console.error("Failed to parse secondaryFilesJson", e);
    }

    return {
        ...itemData,
        currentRevision: r_id ? {
            id: r_id,
            itemId: itemData.id,
            versionNumber: r_versionNumber,
            storage: r_storage,
            fileUrl: normalizeWebSlashes(r_fileUrl),
            remoteId: r_remoteId,
            webViewLink: r_webViewLink,
            webContentLink: r_webContentLink,
            thumbnailLink: r_thumbnailLink,
            mimeType: r_mimeType,
            size: r_size,
            originalFilename: r_originalFilename,
            title: r_title,
            label: r_label,
            tags: r_tags,
            prompt: r_prompt,
            engine: r_engine,
            note: r_note,
            aiParameters: r_aiParameters,
            secondaryFiles: secondaryFiles,
            createdAt: r_createdAt
        } : null
    };
};

const mapCollectionRow = (row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description || '',
    thumbnailItemId: row.thumbnailItemId || null,
    itemCount: Number(row.itemCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isArchived: !!row.isArchived,
    isPinned: !!row.isPinned,
    thumbnail: row.thumbnailResolvedItemId ? {
        itemId: row.thumbnailResolvedItemId,
        fileUrl: normalizeWebSlashes(row.thumbnailFileUrl),
        thumbnailLink: row.thumbnailLink || '',
        mimeType: row.thumbnailMimeType || '',
        title: row.thumbnailTitle || '',
        aiParameters: row.thumbnailAiParameters || ''
    } : null
});

const getProjectCollection = async (collectionId) => {
  if (!collectionId) return null;
  return dbGet(
    'SELECT id, projectId, name, description, thumbnailItemId, isArchived, isPinned FROM project_collections WHERE id = ?',
    [collectionId]
  );
};

const JOINED_ITEMS_SQL = `
    SELECT i.*, 
           r.id as r_id, r.versionNumber as r_versionNumber, r.storage as r_storage, 
           r.fileUrl as r_fileUrl, r.remoteId as r_remoteId, r.webViewLink as r_webViewLink, 
           r.webContentLink as r_webContentLink, r.thumbnailLink as r_thumbnailLink, 
           r.mimeType as r_mimeType, r.size as r_size, r.originalFilename as r_originalFilename, 
           r.title as r_title, r.label as r_label, r.tags as r_tags, r.prompt as r_prompt,
           r.engine as r_engine, r.note as r_note, r.aiParameters as r_aiParameters, 
           r.secondaryFilesJson as r_secondaryFilesJson, r.createdAt as r_createdAt
    FROM items i
    LEFT JOIN revisions r ON i.currentRevisionId = r.id
`;

// =============================================================================
// 2. ROUTE HANDLERS
// =============================================================================

router.get('/items', async (req, res) => {
  try { 
    let rows;
    if (req.user.role === 'admin' || req.user.id === 'admin-root') {
      rows = await dbAll(JOINED_ITEMS_SQL + " ORDER BY i.updatedAt DESC");
    } else {
      rows = await dbAll(
        JOINED_ITEMS_SQL + `
          JOIN projects p ON i.projectId = p.id
          LEFT JOIN project_members pm ON p.id = pm.projectId
          WHERE (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
          ORDER BY i.updatedAt DESC`,
        [req.user.id, req.user.id]
      );
    }
    res.json(rows.map(mapJoinedRowToItem)); 
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/items/archived', async (req, res) => {
  try { 
    let rows;
    if (req.user.role === 'admin' || req.user.id === 'admin-root') {
      rows = await dbAll(JOINED_ITEMS_SQL + " WHERE i.isArchived = 1 ORDER BY i.updatedAt DESC");
    } else {
      rows = await dbAll(
        JOINED_ITEMS_SQL + `
          JOIN projects p ON i.projectId = p.id
          LEFT JOIN project_members pm ON p.id = pm.projectId
          WHERE i.isArchived = 1 AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
          ORDER BY i.updatedAt DESC`,
        [req.user.id, req.user.id]
      );
    }
    res.json(rows.map(mapJoinedRowToItem)); 
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/:id/items', async (req, res) => {
  try { 
    const allowed = await canAccessProject(req.params.id, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const rows = await dbAll(JOINED_ITEMS_SQL + " WHERE i.projectId = ? ORDER BY i.updatedAt DESC", [req.params.id]);
    res.json(rows.map(mapJoinedRowToItem));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/projects/:id/collections', async (req, res) => {
  try {
    const projectId = req.params.id;
    const allowed = await canAccessProject(projectId, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const rows = await dbAll(
      `
      SELECT c.*,
             (
               SELECT COUNT(*)
               FROM items i
               WHERE i.collectionId = c.id AND i.isArchived = 0
             ) as itemCount,
             thumb.id as thumbnailResolvedItemId,
             tr.fileUrl as thumbnailFileUrl,
             tr.thumbnailLink as thumbnailLink,
             tr.mimeType as thumbnailMimeType,
             tr.title as thumbnailTitle,
             tr.aiParameters as thumbnailAiParameters
      FROM project_collections c
      LEFT JOIN items thumb ON thumb.id = c.thumbnailItemId AND thumb.isArchived = 0
      LEFT JOIN revisions tr ON tr.id = thumb.currentRevisionId
      WHERE c.projectId = ? AND c.isArchived = 0
      ORDER BY c.isPinned DESC, c.updatedAt DESC, c.createdAt DESC
      `,
      [projectId]
    );

    res.json(rows.map(mapCollectionRow));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/collections/archived', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin' || req.user.id === 'admin-root') {
      rows = await dbAll(
        `
        SELECT c.*,
               (
                 SELECT COUNT(*)
                 FROM items i
                 WHERE i.collectionId = c.id
               ) as itemCount,
               thumb.id as thumbnailResolvedItemId,
               tr.fileUrl as thumbnailFileUrl,
               tr.thumbnailLink as thumbnailLink,
               tr.mimeType as thumbnailMimeType,
               tr.title as thumbnailTitle,
               tr.aiParameters as thumbnailAiParameters
        FROM project_collections c
        LEFT JOIN items thumb ON thumb.id = c.thumbnailItemId
        LEFT JOIN revisions tr ON tr.id = thumb.currentRevisionId
        WHERE c.isArchived = 1
        ORDER BY c.isPinned DESC, c.updatedAt DESC, c.createdAt DESC
        `
      );
    } else {
      rows = await dbAll(
        `
        SELECT c.*,
               (
                 SELECT COUNT(*)
                 FROM items i
                 WHERE i.collectionId = c.id
               ) as itemCount,
               thumb.id as thumbnailResolvedItemId,
               tr.fileUrl as thumbnailFileUrl,
               tr.thumbnailLink as thumbnailLink,
               tr.mimeType as thumbnailMimeType,
               tr.title as thumbnailTitle,
               tr.aiParameters as thumbnailAiParameters
        FROM project_collections c
        JOIN projects p ON c.projectId = p.id
        LEFT JOIN project_members pm ON p.id = pm.projectId
        LEFT JOIN items thumb ON thumb.id = c.thumbnailItemId
        LEFT JOIN revisions tr ON tr.id = thumb.currentRevisionId
        WHERE c.isArchived = 1 AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
        GROUP BY c.id
        ORDER BY c.isPinned DESC, c.updatedAt DESC, c.createdAt DESC
        `,
        [req.user.id, req.user.id]
      );
    }

    res.json(rows.map(mapCollectionRow));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/projects/:id/collections', async (req, res) => {
  try {
    const projectId = req.params.id;
    const canManage = await canManageProject(projectId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Collection name is required.' });
    const description = String(req.body?.description || '').trim().slice(0, 300);

    const now = Date.now();
    const id = crypto.randomUUID();
    await dbRun(
      `INSERT INTO project_collections (id, projectId, name, description, thumbnailItemId, isPinned, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NULL, 0, ?, ?)`,
      [id, projectId, name, description, now, now]
    );

    const row = await dbGet(
      `
      SELECT c.*,
             0 as itemCount,
             NULL as thumbnailResolvedItemId,
             NULL as thumbnailFileUrl,
             NULL as thumbnailLink,
             NULL as thumbnailMimeType,
             NULL as thumbnailTitle,
             NULL as thumbnailAiParameters
      FROM project_collections c
      WHERE c.id = ?
      `,
      [id]
    );

    res.status(201).json(mapCollectionRow(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/projects/:projectId/collections/:collectionId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const collectionId = req.params.collectionId;
    const canManage = await canManageProject(projectId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

    const collection = await getProjectCollection(collectionId);
    if (!collection || collection.projectId !== projectId) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const updates = req.body || {};
    const setClause = [];
    const params = [];
    const now = Date.now();

    if (updates.name !== undefined) {
      const name = String(updates.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Collection name is required.' });
      setClause.push('name = ?');
      params.push(name);
    }

    if (updates.description !== undefined) {
      const description = String(updates.description || '').trim().slice(0, 300);
      setClause.push('description = ?');
      params.push(description);
    }

    if (updates.thumbnailItemId !== undefined) {
      let thumbnailItemId = updates.thumbnailItemId;
      if (thumbnailItemId === null || thumbnailItemId === '') {
        setClause.push('thumbnailItemId = NULL');
      } else {
        const item = await dbGet(
          'SELECT id, projectId, collectionId, isArchived FROM items WHERE id = ?',
          [thumbnailItemId]
        );
        if (!item || item.projectId !== projectId || item.collectionId !== collectionId || item.isArchived) {
          return res.status(400).json({ error: 'Thumbnail item must belong to this collection.' });
        }
        setClause.push('thumbnailItemId = ?');
        params.push(thumbnailItemId);
      }
    }

    let targetProjectId = collection.projectId;
    if (updates.projectId !== undefined) {
      targetProjectId = String(updates.projectId || '').trim();
      if (!targetProjectId) return res.status(400).json({ error: 'Target project is required.' });
      const targetCanManage = await canManageProject(targetProjectId, req.user);
      if (!targetCanManage) return res.status(403).json({ error: 'Target project owner or admin required' });
      setClause.push('projectId = ?');
      params.push(targetProjectId);
    }

    if (updates.isArchived !== undefined) {
      setClause.push('isArchived = ?');
      params.push(updates.isArchived ? 1 : 0);
    }

    if (updates.isPinned !== undefined) {
      setClause.push('isPinned = ?');
      params.push(updates.isPinned ? 1 : 0);
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid collection updates supplied.' });
    }

    setClause.push('updatedAt = ?');
    params.push(now, collectionId);
    await dbRun(`UPDATE project_collections SET ${setClause.join(', ')} WHERE id = ?`, params);

    if (updates.projectId !== undefined) {
      await dbRun(
        'UPDATE items SET projectId = ?, updatedAt = ? WHERE collectionId = ?',
        [targetProjectId, now, collectionId]
      );
    }

    if (updates.isArchived !== undefined) {
      await dbRun(
        'UPDATE items SET isArchived = ?, isPinned = ?, updatedAt = ? WHERE collectionId = ?',
        [updates.isArchived ? 1 : 0, updates.isArchived ? 0 : 0, now, collectionId]
      );
    }

    const row = await dbGet(
      `
      SELECT c.*,
             COUNT(i.id) as itemCount,
             thumb.id as thumbnailResolvedItemId,
             tr.fileUrl as thumbnailFileUrl,
             tr.thumbnailLink as thumbnailLink,
             tr.mimeType as thumbnailMimeType,
             tr.title as thumbnailTitle,
             tr.aiParameters as thumbnailAiParameters
      FROM project_collections c
      LEFT JOIN items i ON i.collectionId = c.id
      LEFT JOIN items thumb ON thumb.id = c.thumbnailItemId
      LEFT JOIN revisions tr ON tr.id = thumb.currentRevisionId
      WHERE c.id = ?
      GROUP BY c.id
      `,
      [collectionId]
    );

    res.json(mapCollectionRow(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/collections/:collectionId', requireDeleteVerification, async (req, res) => {
  try {
    const collectionId = req.params.collectionId;
    const collection = await getProjectCollection(collectionId);
    if (!collection) return res.status(404).json({ error: 'Collection not found' });

    const canManage = await canManageProject(collection.projectId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });
    if (!collection.isArchived) {
      return res.status(409).json({ error: 'Move collection to Neural Recycle Bin before permanent delete.' });
    }

    const childItems = await dbAll('SELECT id FROM items WHERE collectionId = ?', [collectionId]);
    for (const item of childItems) {
      await purgeItemPhysicalFiles(item.id);
    }

    await dbRun('DELETE FROM items WHERE collectionId = ?', [collectionId]);
    await dbRun('DELETE FROM project_collections WHERE id = ?', [collectionId]);
    await logSystemEvent('WARN', 'COLLECTION', `Permanent purge: ${collectionId}`, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/projects/:id/items/merge-selected', async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;
  try {
    const canManage = await canManageProject(projectId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

    const mainItemId = String(req.body?.mainItemId || '').trim();
    const itemIds = Array.isArray(req.body?.itemIds)
      ? req.body.itemIds.filter((id) => typeof id === 'string' && id.trim())
      : [];
    const normalizedItemIds = Array.from(new Set(itemIds.map((id) => id.trim())));

    if (!mainItemId) {
      return res.status(400).json({ error: 'Main item is required.' });
    }
    if (normalizedItemIds.length < 2) {
      return res.status(400).json({ error: 'Select at least two image/video items to merge.' });
    }
    if (!normalizedItemIds.includes(mainItemId)) {
      return res.status(400).json({ error: 'Main item must be part of the selected items.' });
    }

    const placeholders = normalizedItemIds.map(() => '?').join(',');
    const selectedRows = await dbAll(
      `
      SELECT i.id as itemId, i.createdAt as itemCreatedAt, i.currentRevisionId,
             r.id as revisionId, r.storage, r.fileUrl, r.remoteId, r.webViewLink, r.webContentLink,
             r.thumbnailLink, r.mimeType, r.size, r.originalFilename, r.title, r.label, r.tags, r.prompt,
             r.engine, r.note, r.aiParameters, r.secondaryFilesJson, r.createdAt as revisionCreatedAt
      FROM items i
      JOIN revisions r ON i.currentRevisionId = r.id
      WHERE i.projectId = ? AND i.isArchived = 0 AND i.id IN (${placeholders})
      `,
      [projectId, ...normalizedItemIds]
    );

    if (selectedRows.length !== normalizedItemIds.length) {
      return res.status(400).json({ error: 'Some selected items are missing, archived, or inaccessible.' });
    }

    const invalidRows = selectedRows.filter((row) => !isImageOrVideoMime(row.mimeType));
    if (invalidRows.length > 0) {
      return res.status(400).json({ error: 'Merge is only available for image and video items.' });
    }

    const mainRow = selectedRows.find((row) => row.itemId === mainItemId);
    if (!mainRow) return res.status(400).json({ error: 'Main item is invalid.' });

    const mergeRows = selectedRows
      .filter((row) => row.itemId !== mainItemId)
      .sort((a, b) => (a.revisionCreatedAt || 0) - (b.revisionCreatedAt || 0));

    if (mergeRows.length === 0) {
      return res.status(400).json({ error: 'No secondary items were provided for merge.' });
    }

    const replacementMap = new Map();
    mergeRows.forEach((row) => replacementMap.set(row.itemId, mainItemId));

    const now = Date.now();
    const mergedIds = mergeRows.map((row) => row.itemId);

    await dbRun('BEGIN TRANSACTION');
    try {
      const maxVersionRow = await dbGet(
        'SELECT COALESCE(MAX(versionNumber), 0) as maxVersion FROM revisions WHERE itemId = ?',
        [mainItemId]
      );
      let nextVersion = Number(maxVersionRow?.maxVersion || 0);

      const mainMergeInfo = {
        role: 'main',
        mainItemId,
        mergedItemIds: mergedIds,
        mergedAt: now
      };
      const nextMainAiParameters = upsertMergeInfo(mainRow.aiParameters, mainMergeInfo);
      await dbRun('UPDATE revisions SET aiParameters = ? WHERE id = ?', [nextMainAiParameters, mainRow.revisionId]);

      let insertedRevisions = 0;
      for (let idx = 0; idx < mergeRows.length; idx++) {
        const row = mergeRows[idx];
        const mergedAt = now + idx + 1;
        const revisionMergeInfo = {
          role: 'revision',
          mainItemId,
          sourceItemId: row.itemId,
          sourceRevisionId: row.revisionId,
          mergedAt
        };
        const mergedAiParameters = upsertMergeInfo(row.aiParameters, revisionMergeInfo);

        await dbRun('UPDATE revisions SET aiParameters = ? WHERE id = ?', [mergedAiParameters, row.revisionId]);

        nextVersion += 1;
        await dbRun(
          `INSERT INTO revisions
           (id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink, thumbnailLink,
            mimeType, size, originalFilename, title, label, tags, prompt, engine, note, aiParameters,
            secondaryFilesJson, createdAt, isArchived)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(),
            mainItemId,
            nextVersion,
            row.storage,
            row.fileUrl,
            row.remoteId,
            row.webViewLink,
            row.webContentLink,
            row.thumbnailLink,
            row.mimeType,
            row.size,
            row.originalFilename,
            row.title,
            row.label,
            row.tags || '',
            row.prompt,
            row.engine,
            row.note,
            mergedAiParameters,
            row.secondaryFilesJson,
            mergedAt,
            0
          ]
        );
        insertedRevisions++;
      }

      const revisions = await dbAll(
        `
        SELECT r.id, r.itemId, r.aiParameters
        FROM revisions r
        JOIN items i ON i.id = r.itemId
        WHERE i.projectId = ? AND r.aiParameters IS NOT NULL AND r.aiParameters <> ''
        `,
        [projectId]
      );

      let relinkedRevisions = 0;
      const affectedSourceItems = new Set([mainItemId]);
      for (const rev of revisions) {
        const { changed, next } = replaceReferenceIds(rev.aiParameters, replacementMap);
        if (!changed) continue;
        await dbRun('UPDATE revisions SET aiParameters = ? WHERE id = ?', [next, rev.id]);
        affectedSourceItems.add(rev.itemId);
        relinkedRevisions++;
      }

      for (const duplicateId of mergedIds) {
        await dbRun('UPDATE items SET isArchived = 1, isPinned = 0, updatedAt = ? WHERE id = ?', [now, duplicateId]);
        await dbRun(
          'UPDATE reference_assets SET itemId = ?, updatedAt = ? WHERE projectId = ? AND itemId = ?',
          [mainItemId, now, projectId, duplicateId]
        );
        await dbRun('DELETE FROM item_references WHERE sourceItemId = ? OR targetItemId = ?', [duplicateId, duplicateId]);
      }

      await dbRun('UPDATE items SET updatedAt = ? WHERE id = ?', [now, mainItemId]);

      for (const sourceItemId of affectedSourceItems) {
        await refreshItemReferenceIndex(sourceItemId);
      }

      await dbRun('COMMIT');

      await logSystemEvent(
        'INFO',
        'ITEM',
        `Merged ${mergedIds.length} media item(s) into ${mainItemId} in project ${projectId}.`,
        userId
      );

      return res.json({
        success: true,
        mainItemId,
        mergedItems: mergedIds.length,
        insertedRevisions,
        relinkedRevisions,
        archivedItemIds: mergedIds
      });
    } catch (mergeErr) {
      try {
        await dbRun('ROLLBACK');
      } catch {}
      throw mergeErr;
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/projects/:id/reference-assets/merge-duplicates', async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const canManage = await canManageProject(projectId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

    const rows = await dbAll(
      `
      SELECT i.id as itemId, i.createdAt as itemCreatedAt, i.currentRevisionId,
             r.id as revisionId, r.fileUrl, r.engine, r.aiParameters, r.mimeType
      FROM items i
      JOIN revisions r ON i.currentRevisionId = r.id
      WHERE i.projectId = ? AND i.isArchived = 0
      `,
      [projectId]
    );

    const candidates = [];
    for (const row of rows) {
      if (!isUploadedReferenceRevision(row)) continue;
      const hash = extractReferenceHash(row) || computeFileHash(row.fileUrl);
      if (!hash) continue;
      candidates.push({ ...row, hash });
    }

    const grouped = new Map();
    for (const c of candidates) {
      if (!grouped.has(c.hash)) grouped.set(c.hash, []);
      grouped.get(c.hash).push(c);
    }

    const replacementMap = new Map();
    const canonicalByHash = {};
    const duplicateIds = [];

    for (const [hash, group] of grouped.entries()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => (a.itemCreatedAt || 0) - (b.itemCreatedAt || 0));
      const canonical = sorted[0].itemId;
      canonicalByHash[hash] = canonical;
      for (const entry of sorted.slice(1)) {
        replacementMap.set(entry.itemId, canonical);
        duplicateIds.push(entry.itemId);
      }
    }

    if (replacementMap.size === 0) {
      return res.json({
        success: true,
        mergedItems: 0,
        duplicateGroups: 0,
        relinkedRevisions: 0
      });
    }

    const revisions = await dbAll(
      `
      SELECT r.id, r.itemId, r.aiParameters
      FROM revisions r
      JOIN items i ON i.id = r.itemId
      WHERE i.projectId = ? AND r.aiParameters IS NOT NULL AND r.aiParameters <> ''
      `,
      [projectId]
    );

    const affectedSourceItems = new Set();
    let relinkedRevisions = 0;
    for (const rev of revisions) {
      const { changed, next } = replaceReferenceIds(rev.aiParameters, replacementMap);
      if (!changed) continue;
      await dbRun(`UPDATE revisions SET aiParameters = ? WHERE id = ?`, [next, rev.id]);
      affectedSourceItems.add(rev.itemId);
      relinkedRevisions++;
    }

    const now = Date.now();
    for (const [duplicateId, canonicalId] of replacementMap.entries()) {
      await dbRun(`UPDATE items SET isArchived = 1, updatedAt = ? WHERE id = ?`, [now, duplicateId]);
      await dbRun(
        `UPDATE reference_assets SET itemId = ?, updatedAt = ? WHERE projectId = ? AND itemId = ?`,
        [canonicalId, now, projectId, duplicateId]
      );
      await dbRun(`DELETE FROM item_references WHERE sourceItemId = ? OR targetItemId = ?`, [duplicateId, duplicateId]);
    }

    for (const itemId of affectedSourceItems) {
      await refreshItemReferenceIndex(itemId);
    }

    await logSystemEvent(
      'INFO',
      'REFERENCE',
      `Merged ${replacementMap.size} duplicate reference item(s) in project ${projectId}.`,
      userId
    );

    res.json({
      success: true,
      mergedItems: replacementMap.size,
      duplicateGroups: Object.keys(canonicalByHash).length,
      relinkedRevisions,
      archivedDuplicateIds: duplicateIds
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/projects/:id/referenced-target-ids', async (req, res) => {
  try {
    const projectId = req.params.id;
    const allowed = await canAccessProject(projectId, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    let rows;
    if (req.user.role === 'admin' || req.user.id === 'admin-root') {
      rows = await dbAll(
        `
        SELECT DISTINCT ir.targetItemId as itemId
        FROM item_references ir
        JOIN items target ON target.id = ir.targetItemId
        JOIN items source ON source.id = ir.sourceItemId
        WHERE target.projectId = ? AND target.isArchived = 0 AND source.isArchived = 0
        `,
        [projectId]
      );
    } else {
      rows = await dbAll(
        `
        SELECT DISTINCT ir.targetItemId as itemId
        FROM item_references ir
        JOIN items target ON target.id = ir.targetItemId
        JOIN items source ON source.id = ir.sourceItemId
        JOIN projects sp ON source.projectId = sp.id
        LEFT JOIN project_members spm ON sp.id = spm.projectId
        WHERE target.projectId = ? AND target.isArchived = 0 AND source.isArchived = 0
          AND (sp.ownerId = ? OR spm.userId = ? OR sp.ownerId IS NULL)
        `,
        [projectId, req.user.id, req.user.id]
      );
    }

    res.json(rows.map((r) => r.itemId).filter(Boolean));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/projects/:id/referenced-target-relations', async (req, res) => {
  try {
    const projectId = req.params.id;
    const allowed = await canAccessProject(projectId, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    let rows;
    if (req.user.role === 'admin' || req.user.id === 'admin-root') {
      rows = await dbAll(
        `
        SELECT ir.targetItemId as itemId, GROUP_CONCAT(DISTINCT ir.relationKind) as relationKinds
        FROM item_references ir
        JOIN items target ON target.id = ir.targetItemId
        JOIN items source ON source.id = ir.sourceItemId
        WHERE target.projectId = ? AND target.isArchived = 0 AND source.isArchived = 0
        GROUP BY ir.targetItemId
        `,
        [projectId]
      );
    } else {
      rows = await dbAll(
        `
        SELECT ir.targetItemId as itemId, GROUP_CONCAT(DISTINCT ir.relationKind) as relationKinds
        FROM item_references ir
        JOIN items target ON target.id = ir.targetItemId
        JOIN items source ON source.id = ir.sourceItemId
        JOIN projects sp ON source.projectId = sp.id
        LEFT JOIN project_members spm ON sp.id = spm.projectId
        WHERE target.projectId = ? AND target.isArchived = 0 AND source.isArchived = 0
          AND (sp.ownerId = ? OR spm.userId = ? OR sp.ownerId IS NULL)
        GROUP BY ir.targetItemId
        `,
        [projectId, req.user.id, req.user.id]
      );
    }

    const payload = rows.map((r) => ({
      itemId: r.itemId,
      relationKinds: String(r.relationKinds || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    }));

    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items/resolve', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const normalizedIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (normalizedIds.length === 0) return res.json([]);

    const placeholders = normalizedIds.map(() => '?').join(',');
    let rows;

    if (req.user.role === 'admin' || req.user.id === 'admin-root') {
      rows = await dbAll(
        JOINED_ITEMS_SQL + ` WHERE i.id IN (${placeholders}) ORDER BY i.updatedAt DESC`,
        normalizedIds
      );
    } else {
      rows = await dbAll(
        JOINED_ITEMS_SQL + `
          JOIN projects p ON i.projectId = p.id
          LEFT JOIN project_members pm ON p.id = pm.projectId
          WHERE i.id IN (${placeholders}) AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
          ORDER BY i.updatedAt DESC
        `,
        [...normalizedIds, req.user.id, req.user.id]
      );
    }

    res.json(rows.map(mapJoinedRowToItem));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    const allowed = await canAccessItem(req.params.id, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const row = await dbGet(JOINED_ITEMS_SQL + " WHERE i.id = ?", [req.params.id]);
    row ? res.json(mapJoinedRowToItem(row)) : res.status(404).json({ error: "Item not found" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/items/:id/referenced-by', async (req, res) => {
  try {
    const targetItemId = req.params.id;
    const allowed = await canAccessItem(targetItemId, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const rows = await dbAll(
      `
      SELECT i.id as parentItemId, i.projectId as parentProjectId, i.updatedAt as parentUpdatedAt,
             GROUP_CONCAT(DISTINCT ir.relationKind) as relationKinds,
             r.mimeType as parentMimeType, r.fileUrl as parentFileUrl, r.thumbnailLink as parentThumbnailLink,
             r.title as parentTitle,
             p.name as parentProjectName
      FROM item_references ir
      JOIN items i ON i.id = ir.sourceItemId
      JOIN revisions r ON i.currentRevisionId = r.id
      JOIN projects p ON i.projectId = p.id
      LEFT JOIN project_members pm ON p.id = pm.projectId
      WHERE ir.targetItemId = ? AND i.id <> ? AND i.isArchived = 0
        AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
      GROUP BY i.id, i.projectId, i.updatedAt, r.mimeType, r.fileUrl, r.thumbnailLink, r.title, p.name
      ORDER BY i.updatedAt DESC
      `,
      [targetItemId, targetItemId, req.user.id, req.user.id]
    );

    const references = rows.map((row) => {
      const kinds = String(row.relationKinds || '').split(',').map((k) => k.trim()).filter(Boolean);
      const relationKind = kinds.includes('linked') && kinds.includes('neural')
        ? 'both'
        : kinds.includes('linked')
          ? 'linked'
          : kinds.includes('reference_image')
            ? 'reference_image'
            : 'neural';

      return {
        parentItemId: row.parentItemId,
        parentProjectId: row.parentProjectId,
        parentProjectName: row.parentProjectName || 'Unknown Project',
        parentTitle: row.parentTitle || 'Untitled Manifest',
        parentMimeType: row.parentMimeType || '',
        parentPreviewUrl: row.parentThumbnailLink || normalizeWebSlashes(row.parentFileUrl) || null,
        relationKind,
        updatedAt: row.parentUpdatedAt || 0
      };
    });
    res.json(references);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items', async (req, res) => {
  const { item, revision } = req.body;
  const userId = req.user.id;
  try {
    const allowed = await canAccessProject(item?.projectId, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    if (item?.collectionId) {
      const collection = await getProjectCollection(item.collectionId);
      if (!collection || collection.projectId !== item.projectId) {
        return res.status(400).json({ error: 'Collection does not belong to the target project.' });
      }
    }

    const secondaryFilesJson = revision.secondaryFiles ? JSON.stringify(revision.secondaryFiles) : null;
    await dbRun(`INSERT INTO items (id, projectId, collectionId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)`, 
      [item.id, item.projectId, item.collectionId || null, item.currentRevisionId, 0, 0, item.createdAt, item.updatedAt]);
    await dbRun(`INSERT INTO revisions (id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink, thumbnailLink, mimeType, size, originalFilename, title, label, tags, prompt, engine, note, aiParameters, secondaryFilesJson, createdAt, isArchived) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [revision.id, revision.itemId, revision.versionNumber, revision.storage, revision.fileUrl, revision.remoteId, revision.webViewLink, revision.webContentLink, revision.thumbnailLink, revision.mimeType, revision.size, revision.originalFilename, revision.title, revision.label, revision.tags || '', revision.prompt, revision.engine, revision.note, revision.aiParameters, secondaryFilesJson, revision.createdAt, 0]);
    if (item.collectionId) {
      await dbRun('UPDATE project_collections SET updatedAt = ? WHERE id = ?', [Date.now(), item.collectionId]);
    }
    await refreshItemReferenceIndex(item.id);
    await logSystemEvent('INFO', 'ITEM', `Initial ingest: ${revision.title}`, userId);
    res.status(201).json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/items/:id', async (req, res) => {
  const updates = { ...(req.body || {}) };
  const itemId = req.params.id;
  const userId = req.user.id;
  try {
    const canManage = await canManageItem(itemId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

    const currentItem = await dbGet(
      `SELECT i.projectId, i.collectionId, p.systemKey
       FROM items i
       JOIN projects p ON p.id = i.projectId
       WHERE i.id = ?`,
      [itemId]
    );
    if (!currentItem) return res.status(404).json({ error: 'Item not found' });

    if (updates.projectId) {
      const targetAllowed = await canManageProject(updates.projectId, req.user);
      if (!targetAllowed) return res.status(403).json({ error: 'Target project owner or admin required' });
      if (currentItem && currentItem.projectId !== updates.projectId) {
          await migrateItemBinaries(itemId, updates.projectId, userId);
      }
      // Moving an item into another project should make it immediately visible there.
      if (updates.isArchived === undefined) updates.isArchived = false;
      if (currentItem.projectId !== updates.projectId && updates.collectionId === undefined) {
        updates.collectionId = null;
      }
    }

    if (updates.collectionId !== undefined) {
      if (updates.collectionId === null || updates.collectionId === '') {
        updates.collectionId = null;
      } else {
        const targetProjectId = updates.projectId || currentItem.projectId;
        const collection = await getProjectCollection(updates.collectionId);
        if (!collection || collection.projectId !== targetProjectId) {
          return res.status(400).json({ error: 'Collection does not belong to the target project.' });
        }
      }
    }

    const movingQueueItemToProjectRoot =
      currentItem.systemKey === 'asset-ingestion'
      && updates.collectionId === null
      && (!updates.projectId || updates.projectId === currentItem.projectId);

    if (movingQueueItemToProjectRoot) {
      await moveQueueCollectionItemBinariesToProjectRoot(itemId, userId);
    }

    const allowedFields = ['currentRevisionId', 'isArchived', 'isPinned', 'projectId', 'collectionId'];
    const setClause = [];
    const params = [];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`);
        params.push((field === 'isArchived' || field === 'isPinned') ? (updates[field] ? 1 : 0) : updates[field]);
      }
    }
    if (setClause.length > 0) {
      const now = Date.now();
      setClause.push(`updatedAt = ?`);
      params.push(now);
      params.push(itemId);
      await dbRun(`UPDATE items SET ${setClause.join(', ')} WHERE id = ?`, params);

      const movedOutOfCollection = currentItem.collectionId && currentItem.collectionId !== (updates.collectionId ?? currentItem.collectionId);
      if (movedOutOfCollection) {
        await dbRun(
          'UPDATE project_collections SET thumbnailItemId = NULL, updatedAt = ? WHERE id = ? AND thumbnailItemId = ?',
          [now, currentItem.collectionId, itemId]
        );
        const remainingCountRow = await dbGet(
          'SELECT COUNT(*) AS count FROM items WHERE collectionId = ? AND isArchived = 0 AND id != ?',
          [currentItem.collectionId, itemId]
        );
        if (Number(remainingCountRow?.count || 0) === 0) {
          await dbRun(
            'UPDATE project_collections SET thumbnailItemId = NULL, updatedAt = ? WHERE id = ?',
            [now, currentItem.collectionId]
          );
        }
      }
      if (currentItem.collectionId && (updates.collectionId === null || (updates.projectId && updates.projectId !== currentItem.projectId))) {
        await dbRun('UPDATE project_collections SET updatedAt = ? WHERE id = ?', [now, currentItem.collectionId]);
      }
      if (typeof updates.collectionId === 'string' && updates.collectionId.trim()) {
        await dbRun('UPDATE project_collections SET updatedAt = ? WHERE id = ?', [now, updates.collectionId]);
      }

      if (updates.currentRevisionId !== undefined || updates.projectId !== undefined) {
        await refreshItemReferenceIndex(itemId);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/items/:id', requireDeleteVerification, async (req, res) => {
  const itemId = req.params.id;
  const userId = req.user.id;
  try {
    const canManage = await canManageItem(itemId, req.user);
    if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });
    const item = await dbGet("SELECT id, isArchived FROM items WHERE id = ?", [itemId]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!item.isArchived) {
      return res.status(409).json({ error: 'Move item to Neural Recycle Bin before permanent delete.' });
    }

    await dbRun('UPDATE project_collections SET thumbnailItemId = NULL, updatedAt = ? WHERE thumbnailItemId = ?', [Date.now(), itemId]);
    await purgeItemPhysicalFiles(itemId);
    await dbRun("DELETE FROM items WHERE id = ?", [itemId]);
    await logSystemEvent('WARN', 'ITEM', `Permanent purge: ${itemId}`, userId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const ensureProjectAccess = async (req, res, next) => {
  try {
    const allowed = await canManageProject(req.params.id, req.user);
    if (!allowed) return res.status(403).json({ error: 'Project owner or admin required' });
    next();
  } catch (e) {
    next(e);
  }
};

router.post('/projects/:id/upload', ensureProjectAccess, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Empty payload. Binary required." });
  const fileName = path.basename(req.file.path);
  const assetType = req.headers['x-asset-type'];
  const parentItemId = req.headers['x-parent-item-id'];

  dbGet("SELECT name FROM projects WHERE id = ?", [req.params.id]).then(project => {
      const safeName = sanitizeDirName(project?.name || 'uploads');
      let publicUrl = '';
      
      if (assetType === 'reference' || parentItemId) {
          // Base path: /storage/uploads/Neural_Reference/{safeName}
          publicUrl = `/storage/uploads/Neural_Reference/${safeName}`;
          if (parentItemId) {
              publicUrl += `/${parentItemId}`;
          }
          publicUrl += `/${fileName}`;
      } else {
          // Standard path: /storage/uploads/{projectName}/{filename}
          publicUrl = `/storage/uploads/${safeName}/${fileName}`;
      }
      
      res.json({ fileUrl: publicUrl });
  });
});

export default router;
