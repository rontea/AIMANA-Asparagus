
import fs from 'fs';
import path from 'path';
import { dbAll, dbRun, dbGet, logSystemEvent, UPLOADS_DIR } from '../db.js';
import { sanitizeDirName, getPhysicalPathFromUrl, normalizeWebSlashes } from '../utils/paths.js';

const parseSecondaryFiles = (secondaryFilesJson) => {
  if (!secondaryFilesJson) return [];
  try {
    const parsed = JSON.parse(secondaryFilesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseAiParameters = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const replaceUrlsInJsonText = (value, replacements) => {
  if (!value || typeof value !== 'string' || replacements.size === 0) return value;
  let next = value;
  for (const [oldUrl, newUrl] of replacements.entries()) {
    if (!oldUrl || !newUrl || oldUrl === newUrl) continue;
    next = next.split(oldUrl).join(newUrl);
  }
  return next;
};

const escapeSqlLike = (value) => String(value || '').replace(/[\\%_]/g, (match) => `\\${match}`);

const collectRevisionUrls = ({ fileUrl, thumbnailLink, secondaryFilesJson }) => {
  const urls = new Set();
  if (fileUrl) urls.add(fileUrl);
  if (thumbnailLink) urls.add(thumbnailLink);

  for (const entry of parseSecondaryFiles(secondaryFilesJson)) {
    if (entry?.url) urls.add(entry.url);
  }

  return urls;
};

const cleanupEmptyParentDirs = (physicalPath) => {
  let current = path.dirname(physicalPath);
  const uploadsRoot = path.resolve(UPLOADS_DIR);

  while (current !== uploadsRoot && current.startsWith(uploadsRoot + path.sep)) {
    if (!fs.existsSync(current)) break;
    if (fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
};

export const deletePhysicalFileAtUrl = (fileUrl) => {
  const physicalPath = getPhysicalPathFromUrl(fileUrl);
  if (!physicalPath || !fs.existsSync(physicalPath)) return false;

  try {
    fs.unlinkSync(physicalPath);
    cleanupEmptyParentDirs(physicalPath);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const purgeRevisionPhysicalFiles = ({ fileUrl, secondaryFilesJson }) => {
  const urls = new Set();
  if (fileUrl) urls.add(fileUrl);

  for (const entry of parseSecondaryFiles(secondaryFilesJson)) {
    if (entry?.url) urls.add(entry.url);
  }

  for (const url of urls) {
    deletePhysicalFileAtUrl(url);
  }
};

const isUrlReferencedOutsideScope = async (fileUrl, {
  excludedRevisionIds = [],
  excludedItemIds = [],
  excludedProjectIds = []
} = {}) => {
  if (!fileUrl) return false;

  const where = [
    `(r.fileUrl = ? OR r.thumbnailLink = ? OR r.secondaryFilesJson LIKE ? ESCAPE '\\')`
  ];
  const params = [fileUrl, fileUrl, `%${escapeSqlLike(fileUrl)}%`];

  if (excludedRevisionIds.length > 0) {
    where.push(`r.id NOT IN (${excludedRevisionIds.map(() => '?').join(',')})`);
    params.push(...excludedRevisionIds);
  }

  if (excludedItemIds.length > 0) {
    where.push(`r.itemId NOT IN (${excludedItemIds.map(() => '?').join(',')})`);
    params.push(...excludedItemIds);
  }

  if (excludedProjectIds.length > 0) {
    where.push(`i.projectId NOT IN (${excludedProjectIds.map(() => '?').join(',')})`);
    params.push(...excludedProjectIds);
  }

  const row = await dbGet(
    `SELECT COUNT(*) AS count
     FROM revisions r
     JOIN items i ON i.id = r.itemId
     WHERE ${where.join(' AND ')}`,
    params
  );

  return Number(row?.count || 0) > 0;
};

const purgeRevisionPhysicalFilesIfUnreferenced = async (revision, scope = {}) => {
  for (const url of collectRevisionUrls(revision || {})) {
    if (!(await isUrlReferencedOutsideScope(url, scope))) {
      deletePhysicalFileAtUrl(url);
    }
  }
};

export async function moveQueueCollectionItemBinariesToProjectRoot(itemId, userId) {
  const item = await dbGet(
    `SELECT i.id, i.collectionId, p.name AS projectName, p.systemKey
     FROM items i
     JOIN projects p ON p.id = i.projectId
     WHERE i.id = ?`,
    [itemId]
  );

  if (!item || item.systemKey !== 'asset-ingestion') {
    return false;
  }

  const targetSafeProjectName = sanitizeDirName(item.projectName || 'Asset_Ingestion');
  const targetDir = path.join(UPLOADS_DIR, targetSafeProjectName);
  fs.mkdirSync(targetDir, { recursive: true });

  const revisions = await dbAll(
    `SELECT id, fileUrl, thumbnailLink, aiParameters, secondaryFilesJson
     FROM revisions
     WHERE itemId = ?
       AND lower(replace(replace(trim(storage), '_', ' '), '-', ' ')) IN ('local', 'local drive')`,
    [itemId]
  );

  let movedAny = false;

  for (const revision of revisions) {
    const replacements = new Map();
    const primaryUrls = [revision.fileUrl, revision.thumbnailLink].filter(
      (url) => typeof url === 'string' && url.includes('/storage/uploads/Prompt_Manager/Queue_Asset_Ingestion/')
    );

    for (const sourceUrl of primaryUrls) {
      if (replacements.has(sourceUrl)) continue;

      const oldPath = getPhysicalPathFromUrl(sourceUrl);
      if (!oldPath || !fs.existsSync(oldPath)) continue;

      const parsedPath = path.parse(oldPath);
      let targetFileName = parsedPath.base;
      let newPath = path.join(targetDir, targetFileName);

      if (newPath !== oldPath && fs.existsSync(newPath)) {
        targetFileName = `${parsedPath.name}_${revision.id}${parsedPath.ext}`;
        newPath = path.join(targetDir, targetFileName);
      }

      if (newPath !== oldPath) {
        fs.renameSync(oldPath, newPath);
        cleanupEmptyParentDirs(oldPath);
      }

      const newUrl = normalizeWebSlashes(`/storage/uploads/${targetSafeProjectName}/${targetFileName}`);
      replacements.set(sourceUrl, newUrl);
      movedAny = true;
    }

    if (replacements.size === 0) continue;

    const nextFileUrl = replacements.get(revision.fileUrl) || revision.fileUrl || null;
    const nextThumbnailLink = replacements.get(revision.thumbnailLink) || revision.thumbnailLink || null;
    const nextSecondaryFilesJson = replaceUrlsInJsonText(revision.secondaryFilesJson, replacements);

    const parsedAi = parseAiParameters(revision.aiParameters);
    const nextAiParameters = parsedAi
      ? JSON.stringify(JSON.parse(replaceUrlsInJsonText(JSON.stringify(parsedAi), replacements)), null, 2)
      : replaceUrlsInJsonText(revision.aiParameters, replacements);

    await dbRun(
      `UPDATE revisions
       SET fileUrl = ?, thumbnailLink = ?, secondaryFilesJson = ?, aiParameters = ?
       WHERE id = ?`,
      [nextFileUrl, nextThumbnailLink, nextSecondaryFilesJson, nextAiParameters, revision.id]
    );
  }

  if (movedAny) {
    await logSystemEvent(
      'INFO',
      'STORAGE',
      `Relocated queue collection binaries for item ${itemId} into ${targetSafeProjectName}`,
      userId
    );
  }

  return movedAny;
}

/**
 * Recursively moves an item's binaries and its children to a new project folder.
 */
export async function migrateItemBinaries(itemId, newProjectId, userId, processedItems = new Set()) {
  if (processedItems.has(itemId)) return;
  processedItems.add(itemId);

  const newProject = await dbGet("SELECT name FROM projects WHERE id = ?", [newProjectId]);
  if (!newProject) throw new Error("Destination project not found");
  
  const newSafe = sanitizeDirName(newProject.name);
  const newProjRoot = path.join(UPLOADS_DIR, newSafe);
  
  const itemRevisions = await dbAll(
    `SELECT id, fileUrl, title, secondaryFilesJson, aiParameters
     FROM revisions
     WHERE itemId = ?
       AND lower(replace(replace(trim(storage), '_', ' '), '-', ' ')) IN ('local', 'local drive')`,
    [itemId]
  );
  
  for (const rev of itemRevisions) {
    if (rev.fileUrl) {
      const oldPath = getPhysicalPathFromUrl(rev.fileUrl);
      if (oldPath) {
        const oldUrl = rev.fileUrl;
        const fileName = path.basename(oldPath);
        
        let finalNewDir = newProjRoot;
        let urlSubPath = `${newSafe}/`;

        // Check if the current file is in the Neural_Reference root
        if (rev.fileUrl.includes('/Neural_Reference/')) {
            let parentId = '';
            try {
                const params = JSON.parse(rev.aiParameters || '{}');
                const adv = params.advanced_params || params;
                parentId = adv.parentItemId;
            } catch(e) {}

            finalNewDir = path.join(UPLOADS_DIR, 'Neural_Reference', newSafe);
            urlSubPath = `Neural_Reference/${newSafe}/`;
            
            if (parentId) {
                finalNewDir = path.join(finalNewDir, parentId);
                urlSubPath += `${parentId}/`;
            }
        }

        if (!fs.existsSync(finalNewDir)) fs.mkdirSync(finalNewDir, { recursive: true });

        const newPath = path.join(finalNewDir, fileName);
        const newPublicUrl = `/storage/uploads/${urlSubPath}${fileName}`;
        
        try {
          if (fs.existsSync(oldPath) && oldPath !== newPath) {
            fs.renameSync(oldPath, newPath);
          }
          
          if (fs.existsSync(newPath)) {
            await dbRun("UPDATE revisions SET fileUrl = ? WHERE id = ?", [newPublicUrl, rev.id]);
            await dbRun(
                "UPDATE revisions SET secondaryFilesJson = REPLACE(secondaryFilesJson, ?, ?) WHERE secondaryFilesJson LIKE ?",
                [oldUrl, newPublicUrl, `%${oldUrl}%`]
            );
            await logSystemEvent('INFO', 'STORAGE', `Migrated binary for ${itemId} to project ${newSafe} (Ref Path: ${rev.fileUrl.includes('/Neural_Reference/')})`, userId);
          }
        } catch (err) {
          console.error(`[MIGRATE_FS_ERR]`, err);
        }
      }
    }

    if (rev.secondaryFilesJson) {
        try {
            const children = JSON.parse(rev.secondaryFilesJson);
            for (const child of children) {
                await dbRun("UPDATE items SET projectId = ?, updatedAt = ? WHERE id = ?", [newProjectId, Date.now(), child.id]);
                await migrateItemBinaries(child.id, newProjectId, userId, processedItems);
            }
        } catch (e) {
            console.error("Secondary migration parse fail", e);
        }
    }
  }

  const metaChildren = await dbAll(`
    SELECT DISTINCT itemId FROM revisions 
    WHERE aiParameters LIKE ? AND isArchived = 0`, 
    [`%"parentItemId":"${itemId}"%`]
  );
  
  for (const child of metaChildren) {
    await dbRun("UPDATE items SET projectId = ?, updatedAt = ? WHERE id = ?", [newProjectId, Date.now(), child.itemId]);
    await migrateItemBinaries(child.itemId, newProjectId, userId, processedItems);
  }
}

/**
 * Removes physical files from disk when an item is permanently deleted.
 */
export async function purgeItemPhysicalFiles(itemId) {
  const revs = await dbAll("SELECT id, fileUrl, thumbnailLink, secondaryFilesJson FROM revisions WHERE itemId = ?", [itemId]);
  for (const r of revs) {
    await purgeRevisionPhysicalFilesIfUnreferenced(r, { excludedItemIds: [itemId] });
  }
}

export async function purgeProjectPhysicalFiles(projectId, projectName = '') {
  const revisions = await dbAll(
    `SELECT r.id, r.fileUrl, r.thumbnailLink, r.secondaryFilesJson
     FROM revisions r
     JOIN items i ON i.id = r.itemId
     WHERE i.projectId = ?`,
    [projectId]
  );

  for (const revision of revisions) {
    await purgeRevisionPhysicalFilesIfUnreferenced(revision, { excludedProjectIds: [projectId] });
  }

  const safeName = sanitizeDirName(projectName || 'uploads');
  const candidateDirs = [
    path.join(UPLOADS_DIR, safeName),
    path.join(UPLOADS_DIR, 'Neural_Reference', safeName)
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      let current = dir;
      const uploadsRoot = path.resolve(UPLOADS_DIR);
      while (current !== uploadsRoot && current.startsWith(uploadsRoot + path.sep)) {
        if (!fs.existsSync(current)) break;
        if (fs.readdirSync(current).length > 0) break;
        fs.rmdirSync(current);
        current = path.dirname(current);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

export async function purgeSingleRevisionPhysicalFiles(revisionId) {
  const revision = await dbGet(
    'SELECT id, fileUrl, thumbnailLink, secondaryFilesJson FROM revisions WHERE id = ?',
    [revisionId]
  );
  if (!revision) return;
  await purgeRevisionPhysicalFilesIfUnreferenced(revision, { excludedRevisionIds: [revisionId] });
}

export async function purgeChatAttachmentPhysicalFiles(chatItemId, attachments = null) {
  const rows = Array.isArray(attachments)
    ? attachments
    : await dbAll(
        `SELECT id, fileUrl, referenceItemId
         FROM chat_item_attachments
         WHERE chatItemId = ?`,
        [chatItemId]
      );

  for (const attachment of rows) {
    if (!attachment?.fileUrl || attachment.referenceItemId) continue;

    const sibling = await dbGet(
      `SELECT id
       FROM chat_item_attachments
       WHERE fileUrl = ? AND chatItemId != ?
       LIMIT 1`,
      [attachment.fileUrl, chatItemId]
    );

    if (!sibling) {
      deletePhysicalFileAtUrl(attachment.fileUrl);
    }
  }
}
