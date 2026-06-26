import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun, UPLOADS_DIR } from '../db.js';
import { getPhysicalPathFromUrl, normalizeWebSlashes, sanitizeDirName } from '../utils/paths.js';

const SYSTEM_ARCHIVE_KEY = 'neural-saved';
const SYSTEM_ARCHIVE_NAME = 'Neural Saved';
const SYSTEM_ARCHIVE_DESCRIPTION = 'Automatic history of all generated content.';

const parseDataUri = (dataUri = '') => {
    const matches = String(dataUri).match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
    if (!matches) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (!buffer.length) return null;
    return { mimeType, buffer };
};

const extFromMime = (mimeType = '') => {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    if (mimeType === 'audio/mpeg') return '.mp3';
    if (mimeType === 'audio/mp4') return '.m4a';
    if (mimeType === 'audio/wav') return '.wav';
    if (mimeType === 'audio/webm') return '.webm';
    if (mimeType === 'audio/flac') return '.flac';
    if (mimeType === 'audio/ogg') return '.ogg';
    if (mimeType === 'audio/opus') return '.opus';
    if (mimeType === 'audio/aac') return '.aac';
    return '.bin';
};

const ensureUserArchiveProject = async (ownerId) => {
    let archive = await dbGet(
        "SELECT * FROM projects WHERE isSystem = 1 AND ownerId = ? AND systemKey = ?",
        [ownerId, SYSTEM_ARCHIVE_KEY]
    );
    if (!archive) {
        archive = await dbGet(
            "SELECT * FROM projects WHERE isSystem = 1 AND ownerId = ? AND name IN (?, 'Neural Archive') ORDER BY updatedAt DESC LIMIT 1",
            [ownerId, SYSTEM_ARCHIVE_NAME]
        );
    }
    if (archive) {
        if (archive.name !== SYSTEM_ARCHIVE_NAME || archive.systemKey !== SYSTEM_ARCHIVE_KEY) {
            const updatedAt = Date.now();
            await dbRun(
                "UPDATE projects SET name = ?, systemKey = ?, updatedAt = ? WHERE id = ?",
                [SYSTEM_ARCHIVE_NAME, SYSTEM_ARCHIVE_KEY, updatedAt, archive.id]
            );
            archive = { ...archive, name: SYSTEM_ARCHIVE_NAME, systemKey: SYSTEM_ARCHIVE_KEY, updatedAt };
        }
        return archive;
    }

    const now = Date.now();
    const id = uuidv4();
    await dbRun(
        `INSERT INTO projects (id, name, description, storageType, color, isSystem, systemKey, createdAt, updatedAt, ownerId)
         VALUES (?, ?, ?, 'Local Drive', '#4f46e5', 1, ?, ?, ?, ?)`,
        [id, SYSTEM_ARCHIVE_NAME, SYSTEM_ARCHIVE_DESCRIPTION, SYSTEM_ARCHIVE_KEY, now, now, ownerId]
    );
    await dbRun(
        `INSERT OR IGNORE INTO project_members (projectId, userId, role) VALUES (?, ?, 'owner')`,
        [id, ownerId]
    );
    archive = await dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    return archive;
};

export const ensureReferenceAsset = async ({ ownerId, dataUri }) => {
    if (!ownerId) throw new Error('Owner is required');
    const parsed = parseDataUri(dataUri);
    if (!parsed) throw new Error('Invalid reference data URI');

    const { mimeType, buffer } = parsed;
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const now = Date.now();

    const existing = await dbGet(
        `SELECT
            ra.*,
            i.id as itemExists,
            r.fileUrl as currentFileUrl,
            r.mimeType as currentMimeType,
            r.size as currentSize
         FROM reference_assets ra
         LEFT JOIN items i ON i.id = ra.itemId
         LEFT JOIN revisions r ON r.id = i.currentRevisionId
         WHERE ra.ownerId = ? AND ra.hash = ?`,
        [ownerId, hash]
    );

    if (existing && existing.itemExists) {
        const candidateUrls = [existing.currentFileUrl, existing.fileUrl].filter(Boolean);
        const resolvedFileUrl = candidateUrls.find((url) => {
            const physicalPath = getPhysicalPathFromUrl(url);
            return !!physicalPath && fs.existsSync(physicalPath);
        });

        if (resolvedFileUrl) {
            const nextMimeType = existing.currentMimeType || existing.mimeType || mimeType;
            const nextSize = Number.isFinite(existing.currentSize) ? existing.currentSize : (existing.size || buffer.length);
            await dbRun(
                `UPDATE reference_assets
                 SET fileUrl = ?, mimeType = ?, size = ?, useCount = COALESCE(useCount, 0) + 1, updatedAt = ?
                 WHERE ownerId = ? AND hash = ?`,
                [resolvedFileUrl, nextMimeType, nextSize, now, ownerId, hash]
            );
            return {
                referenceItemId: existing.itemId,
                referenceHash: hash,
                fileUrl: resolvedFileUrl,
                mimeType: nextMimeType,
                size: nextSize,
                deduped: true
            };
        }

        // Stale/missing physical file: continue to recreate the reference asset below.
    }

    const archive = await ensureUserArchiveProject(ownerId);
    if (!archive?.id) throw new Error('Unable to resolve Neural Saved project');

    const itemId = uuidv4();
    const revisionId = uuidv4();
    const ext = extFromMime(mimeType);
    const safeProjectName = sanitizeDirName(archive.name || SYSTEM_ARCHIVE_NAME);
    const relativeParts = ['Neural_Reference', safeProjectName, itemId];
    const physicalDir = path.join(UPLOADS_DIR, ...relativeParts);
    fs.mkdirSync(physicalDir, { recursive: true });
    const fileName = `${itemId}${ext}`;
    const physicalPath = path.join(physicalDir, fileName);
    fs.writeFileSync(physicalPath, buffer);

    const fileUrl = normalizeWebSlashes(`/storage/uploads/${relativeParts.join('/')}/${fileName}`);

    await dbRun(
        `INSERT INTO items (id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt)
         VALUES (?, ?, ?, 0, 0, ?, ?)`,
        [itemId, archive.id, revisionId, now, now]
    );

    const aiParameters = JSON.stringify({
        advanced_params: {
            referenceHash: hash,
            referenceAsset: true
        }
    });

    await dbRun(
        `INSERT INTO revisions (
            id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
            thumbnailLink, mimeType, size, originalFilename, title, label, tags, prompt, engine, note,
            aiParameters, secondaryFilesJson, createdAt, isArchived
        ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
        [
            revisionId,
            itemId,
            fileUrl,
            mimeType,
            buffer.length,
            fileName,
            `Reference ${hash.slice(0, 8)}`,
            'Reference Asset',
            '',
            '',
            'reference-upload',
            '',
            aiParameters,
            now
        ]
    );

    await dbRun(
        `INSERT OR REPLACE INTO reference_assets
         (ownerId, hash, itemId, projectId, fileUrl, mimeType, size, createdAt, updatedAt, useCount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT useCount FROM reference_assets WHERE ownerId = ? AND hash = ?), 0) + 1)`,
        [ownerId, hash, itemId, archive.id, fileUrl, mimeType, buffer.length, now, now, ownerId, hash]
    );

    return {
        referenceItemId: itemId,
        referenceHash: hash,
        fileUrl,
        mimeType,
        size: buffer.length,
        deduped: false
    };
};
