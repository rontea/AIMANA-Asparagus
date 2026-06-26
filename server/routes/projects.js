
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dbAll, dbRun, dbGet, logSystemEvent, UPLOADS_DIR } from '../db.js';
import { canAccessProject, canManageProject } from '../utils/access.js';
import { requireDeleteVerification } from '../middleware.js';
import { DEFAULT_GOOGLE_TEXT_MODEL, normalizeGoogleModelId } from '../utils/googleModelIds.js';
import { purgeProjectPhysicalFiles } from '../logic/itemOps.js';
import { getPhysicalPathFromUrl, normalizeWebSlashes } from '../utils/paths.js';

const router = express.Router();

const sanitizeDirName = (name) => name.replace(/[^a-zA-Z0-9]/g, '_');
const MAX_PROMPT_IMPORT_BATCH = 500;
const MAX_TITLE_LEN = 160;
const MAX_PROMPT_LEN = 8000;
const MAX_LABEL_LEN = 80;
const MAX_NOTE_LEN = 4000;
const normalizeProjectEngine = (engine) => normalizeGoogleModelId(engine) || DEFAULT_GOOGLE_TEXT_MODEL;
const SYSTEM_ARCHIVE_KEY = 'neural-saved';
const SYSTEM_ARCHIVE_NAME = 'Neural Saved';
const SYSTEM_ARCHIVE_DESCRIPTION = 'Automatic history of all generated content.';
const ASSET_INGESTION_KEY = 'asset-ingestion';
const ASSET_INGESTION_NAME = 'Asset Ingestion';
const ASSET_INGESTION_DESCRIPTION = 'Manual holding area for assets added from outside the system.';
const ASSET_INGESTION_UNDEFINED_ENGINE = 'engine-undefined';
const PROMPT_MANAGER_EXPORT_ROOT = 'Prompt_Manager';
const PROMPT_MANAGER_QUEUE_EXPORT_DIR = 'Queue_Asset_Ingestion';
const PROMPT_MANAGER_PROMPT_EXPORT_DIR = 'Prompt_Collection';

const normalizeTitleKey = (value) => String(value || '').trim().toLowerCase();
const normalizePromptKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizePromptTextForMerge = (value) => String(value || '').trim();

const isMeaningfulText = (value) => String(value || '').trim().length > 0;

const isPlaceholderEngine = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'default-placeholder';
};

const parseBase64DataUri = (dataUri = '') => {
    const matches = String(dataUri).match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
    if (!matches) return null;
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    if (!buffer.length) return null;
    return { mimeType, buffer };
};

const extensionFromMimeType = (mimeType = '') => {
    const normalized = String(mimeType || '').trim().toLowerCase();
    if (normalized === 'image/png') return '.png';
    if (normalized === 'image/jpeg') return '.jpg';
    if (normalized === 'image/webp') return '.webp';
    if (normalized === 'image/gif') return '.gif';
    if (normalized === 'image/svg+xml') return '.svg';
    if (normalized === 'video/mp4') return '.mp4';
    if (normalized === 'video/webm') return '.webm';
    if (normalized === 'video/quicktime') return '.mov';
    return '.bin';
};

const persistPromptPreviewAsset = ({
    projectName,
    projectType,
    projectSystemKey,
    collectionName,
    itemId,
    sourceUrl,
    mimeType
}) => {
    const trimmedSourceUrl = typeof sourceUrl === 'string' ? sourceUrl.trim() : '';
    const trimmedMimeType = typeof mimeType === 'string' ? mimeType.trim() : '';
    if (!trimmedSourceUrl) {
        return {
            fileUrl: null,
            mimeType: trimmedMimeType || 'image/png'
        };
    }

    let relativeParts;
    if (projectSystemKey === ASSET_INGESTION_KEY) {
        relativeParts = [
            PROMPT_MANAGER_EXPORT_ROOT,
            PROMPT_MANAGER_QUEUE_EXPORT_DIR,
            sanitizeDirName(collectionName || projectName || 'Queue_Prompt_Collection')
        ];
    } else if (String(projectType || '').toLowerCase() === 'prompt') {
        relativeParts = [
            PROMPT_MANAGER_EXPORT_ROOT,
            PROMPT_MANAGER_PROMPT_EXPORT_DIR,
            sanitizeDirName(projectName || 'Prompt_Collection')
        ];
    } else {
        relativeParts = [sanitizeDirName(projectName || 'Prompt_Collection')];
        if (collectionName) {
            relativeParts.push(sanitizeDirName(collectionName));
        }
    }
    const physicalDir = path.join(UPLOADS_DIR, ...relativeParts);
    fs.mkdirSync(physicalDir, { recursive: true });

    const parsed = parseBase64DataUri(trimmedSourceUrl);
    const resolvedMimeType = trimmedMimeType || parsed?.mimeType || 'image/png';
    const ext = extensionFromMimeType(resolvedMimeType);
    const fileName = `${itemId}${ext}`;
    const physicalPath = path.join(physicalDir, fileName);

    if (parsed) {
        fs.writeFileSync(physicalPath, parsed.buffer);
        return {
            fileUrl: normalizeWebSlashes(`/storage/uploads/${relativeParts.join('/')}/${fileName}`),
            mimeType: resolvedMimeType
        };
    }

    const existingPhysicalPath = getPhysicalPathFromUrl(trimmedSourceUrl);
    if (existingPhysicalPath && fs.existsSync(existingPhysicalPath)) {
        fs.copyFileSync(existingPhysicalPath, physicalPath);
        return {
            fileUrl: normalizeWebSlashes(`/storage/uploads/${relativeParts.join('/')}/${fileName}`),
            mimeType: resolvedMimeType
        };
    }

    return {
        fileUrl: trimmedSourceUrl,
        mimeType: resolvedMimeType
    };
};

const mergeDistinctNotes = (primary, duplicate) => {
    const values = [primary, duplicate]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
    return Array.from(new Set(values)).join('\n\n');
};

const parseJsonObject = (value) => {
    if (!value || typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const mergeAiParameters = (primaryRaw, duplicateRaw) => {
    const primary = parseJsonObject(primaryRaw);
    const duplicate = parseJsonObject(duplicateRaw);
    const primaryAdv = primary.advanced_params && typeof primary.advanced_params === 'object'
        ? primary.advanced_params
        : {};
    const duplicateAdv = duplicate.advanced_params && typeof duplicate.advanced_params === 'object'
        ? duplicate.advanced_params
        : {};

    const merged = { ...duplicate, ...primary };
    merged.advanced_params = { ...duplicateAdv, ...primaryAdv };

    return JSON.stringify(merged);
};

const buildPromptDuplicateGroups = (rows) => {
    const grouped = new Map();

    for (const row of rows) {
        const normalizedTitle = normalizeTitleKey(row.title);
        const normalizedPrompt = normalizePromptKey(row.prompt);
        if (!normalizedTitle || !normalizedPrompt) continue;

        const collectionScope = row.collectionId || '__root__';
        const groupKey = `${collectionScope}::${normalizedTitle}::${normalizedPrompt}`;
        if (!grouped.has(groupKey)) {
            grouped.set(groupKey, {
                key: groupKey,
                collectionId: row.collectionId || null,
                collectionName: row.collectionName || null,
                normalizedTitle,
                normalizedPrompt,
                items: []
            });
        }

        grouped.get(groupKey).items.push({
            itemId: row.itemId,
            revisionId: row.revisionId,
            collectionId: row.collectionId || null,
            collectionName: row.collectionName || null,
            title: row.title,
            prompt: row.prompt,
            label: row.label || '',
            engine: row.engine || '',
            note: row.note || '',
            mimeType: row.mimeType || '',
            createdAt: row.itemCreatedAt || row.revisionCreatedAt || 0,
            updatedAt: row.itemUpdatedAt || 0,
            previewUrl: row.thumbnailLink || row.fileUrl || null
        });
    }

    return Array.from(grouped.values())
        .map((group) => ({
            ...group,
            items: [...group.items].sort((a, b) => (
                (a.createdAt || 0) - (b.createdAt || 0)
                || (a.updatedAt || 0) - (b.updatedAt || 0)
                || a.itemId.localeCompare(b.itemId)
            ))
        }))
        .filter((group) => group.items.length > 1)
        .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
};

const buildUniquePromptTitle = (baseTitle, usedTitleKeys) => {
    const trimmedBaseTitle = String(baseTitle || '').trim() || 'Untitled Prompt';
    const baseKey = normalizeTitleKey(trimmedBaseTitle);
    if (!usedTitleKeys.has(baseKey)) {
        usedTitleKeys.add(baseKey);
        return { title: trimmedBaseTitle, renamed: false };
    }

    const maxBaseLength = Math.max(1, MAX_TITLE_LEN - ' Copy'.length);
    const truncatedBase = trimmedBaseTitle.slice(0, maxBaseLength).trim() || 'Untitled Prompt';
    let copyIndex = 1;
    while (copyIndex < 10000) {
        const suffix = copyIndex === 1 ? ' Copy' : ` Copy ${copyIndex}`;
        const allowedBaseLength = Math.max(1, MAX_TITLE_LEN - suffix.length);
        const candidate = `${truncatedBase.slice(0, allowedBaseLength).trim() || 'Untitled Prompt'}${suffix}`;
        const candidateKey = normalizeTitleKey(candidate);
        if (!usedTitleKeys.has(candidateKey)) {
            usedTitleKeys.add(candidateKey);
            return { title: candidate, renamed: true };
        }
        copyIndex += 1;
    }

    const fallback = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.slice(0, MAX_TITLE_LEN);
    usedTitleKeys.add(normalizeTitleKey(fallback));
    return { title: fallback, renamed: true };
};

const ensureSystemProject = async ({
    userId,
    systemKey,
    name,
    description,
    color = '#4f46e5',
    projectType = 'all'
}) => {
    let project = await dbGet(
        "SELECT * FROM projects WHERE isSystem = 1 AND ownerId = ? AND systemKey = ?",
        [userId, systemKey]
    );

    if (!project) {
        const legacyName = systemKey === SYSTEM_ARCHIVE_KEY ? 'Neural Archive' : name;
        project = await dbGet(
            "SELECT * FROM projects WHERE isSystem = 1 AND ownerId = ? AND name IN (?, ?) ORDER BY updatedAt DESC LIMIT 1",
            [userId, name, legacyName]
        );
    }

    if (!project) {
        const id = uuidv4();
        const now = Date.now();
        await dbRun(
            `INSERT INTO projects (id, name, description, storageType, projectType, color, isSystem, systemKey, createdAt, updatedAt, ownerId)
             VALUES (?, ?, ?, 'Local Drive', ?, ?, 1, ?, ?, ?, ?)`,
            [id, name, description, projectType, color, systemKey, now, now, userId]
        );
        await dbRun(`INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, 'owner')`, [id, userId]);
        project = await dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    }

    const shouldUpdate =
        project.name !== name
        || project.description !== description
        || project.systemKey !== systemKey;

    if (shouldUpdate) {
        const updatedAt = Date.now();
        await dbRun(
            "UPDATE projects SET name = ?, description = ?, systemKey = ?, updatedAt = ? WHERE id = ?",
            [name, description, systemKey, updatedAt, project.id]
        );
        project = { ...project, name, description, systemKey, updatedAt };
    }

    return project;
};

const normalizeAssetIngestionEngine = (engine) => {
    const normalized = String(engine || '').trim();
    return normalized || ASSET_INGESTION_UNDEFINED_ENGINE;
};

router.get('/archive', async (req, res) => {
    try {
        const archive = await ensureSystemProject({
            userId: req.user.id,
            systemKey: SYSTEM_ARCHIVE_KEY,
            name: SYSTEM_ARCHIVE_NAME,
            description: SYSTEM_ARCHIVE_DESCRIPTION,
            color: '#4f46e5'
        });
        res.json(archive);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/asset-ingestion', async (req, res) => {
    try {
        const project = await ensureSystemProject({
            userId: req.user.id,
            systemKey: ASSET_INGESTION_KEY,
            name: ASSET_INGESTION_NAME,
            description: ASSET_INGESTION_DESCRIPTION,
            color: '#0f766e'
        });
        res.json(project);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const rows = await dbAll(`
            SELECT
                p.*,
                u.name as ownerName,
                COALESCE(item_stats.itemCount, 0) as itemCount,
                COALESCE(item_stats.imageItemCount, 0) as imageItemCount,
                COALESCE(item_stats.videoItemCount, 0) as videoItemCount,
                COALESCE(item_stats.audioItemCount, 0) as audioItemCount,
                COALESCE(item_stats.otherItemCount, 0) as otherItemCount,
                COALESCE(collection_stats.collectionCount, 0) as collectionCount,
                COALESCE(chat_stats.chatItemCount, 0) as chatItemCount
            FROM projects p
            LEFT JOIN users u ON p.ownerId = u.id
            LEFT JOIN (
                SELECT
                    i.projectId,
                    COUNT(*) as itemCount,
                    SUM(CASE WHEN LOWER(COALESCE(r.mimeType, '')) LIKE 'image/%' THEN 1 ELSE 0 END) as imageItemCount,
                    SUM(CASE WHEN LOWER(COALESCE(r.mimeType, '')) LIKE 'video/%' THEN 1 ELSE 0 END) as videoItemCount,
                    SUM(CASE WHEN LOWER(COALESCE(r.mimeType, '')) LIKE 'audio/%' THEN 1 ELSE 0 END) as audioItemCount,
                    SUM(
                        CASE
                            WHEN LOWER(COALESCE(r.mimeType, '')) LIKE 'image/%' THEN 0
                            WHEN LOWER(COALESCE(r.mimeType, '')) LIKE 'video/%' THEN 0
                            WHEN LOWER(COALESCE(r.mimeType, '')) LIKE 'audio/%' THEN 0
                            ELSE 1
                        END
                    ) as otherItemCount
                FROM items i
                LEFT JOIN revisions r ON r.id = i.currentRevisionId
                WHERE i.isArchived = 0
                GROUP BY i.projectId
            ) item_stats ON item_stats.projectId = p.id
            LEFT JOIN (
                SELECT projectId, COUNT(*) as collectionCount
                FROM project_collections
                WHERE isArchived = 0
                GROUP BY projectId
            ) collection_stats ON collection_stats.projectId = p.id
            LEFT JOIN (
                SELECT projectId, COUNT(*) as chatItemCount
                FROM chat_items
                WHERE isArchived = 0
                GROUP BY projectId
            ) chat_stats ON chat_stats.projectId = p.id
            WHERE p.isSystem = 0
              AND (
                p.ownerId = ?
                OR p.ownerId IS NULL
                OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.projectId = p.id AND pm.userId = ?
                )
              )
            ORDER BY p.updatedAt DESC
        `, [userId, userId]);
        res.json(rows);
    } catch (e) { 
        console.error("[PROJECT_LIST_ERR]", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

router.get('/users/search', async (req, res) => {
    try {
        const actor = req.user;
        const actorId = actor.id;
        const rawQuery = String(req.query.q || '').trim().toLowerCase();
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';

        if (projectId) {
            const allowed = await canAccessProject(projectId, actor);
            if (!allowed) return res.status(403).json({ error: 'Access denied' });
        }

        const where = ["isBlocked = 0", "id <> ?"];
        const params = [actorId];

        if (projectId) {
            where.push("id NOT IN (SELECT userId FROM project_members WHERE projectId = ?)");
            params.push(projectId);
        }

        if (rawQuery) {
            where.push("(lower(email) LIKE ? OR lower(name) LIKE ?)");
            const likeQuery = `%${rawQuery}%`;
            params.push(likeQuery, likeQuery);
        }

        const limit = rawQuery ? 15 : 10;
        const rows = await dbAll(
            `SELECT id, email, name, avatar, lastLogin, createdAt
             FROM users
             WHERE ${where.join(' AND ')}
             ORDER BY COALESCE(lastLogin, 0) DESC, createdAt DESC
             LIMIT ?`,
            [...params, limit]
        );

        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/share', async (req, res) => {
    const projectId = req.params.id;
    const actor = req.user;
    const actorId = actor.id;

    try {
        const allowed = await canAccessProject(projectId, actor);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'Email is required' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        const target = await dbGet(
            "SELECT id, email, name, isBlocked FROM users WHERE lower(email) = ? LIMIT 1",
            [email]
        );
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (target.isBlocked) return res.status(403).json({ error: 'Cannot share with blocked user' });
        if (target.id === actorId) return res.status(400).json({ error: 'You already have access' });

        const existing = await dbGet(
            "SELECT role FROM project_members WHERE projectId = ? AND userId = ? LIMIT 1",
            [projectId, target.id]
        );
        if (existing) {
            return res.json({
                success: true,
                alreadyMember: true,
                message: 'User already has access',
                sharedWith: { id: target.id, email: target.email, name: target.name }
            });
        }

        await dbRun(
            "INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)",
            [projectId, target.id, 'member']
        );

        const project = await dbGet("SELECT name FROM projects WHERE id = ? LIMIT 1", [projectId]);
        await logSystemEvent(
            'INFO',
            'PROJECT',
            `Shared workspace "${project?.name || projectId}" with ${target.email}`,
            actorId
        );

        res.status(201).json({
            success: true,
            sharedWith: { id: target.id, email: target.email, name: target.name }
        });
    } catch (e) {
        console.error("[PROJECT_SHARE_ERR]", e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/import-prompts', async (req, res) => {
    const projectId = req.params.id;
    const actor = req.user;
    const actorId = actor.id;

    try {
        const allowed = await canAccessProject(projectId, actor);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const engineRaw = String(req.body?.engine || '').trim();
        const engine = engineRaw ? normalizeGoogleModelId(engineRaw) : 'default-placeholder';
        const prompts = req.body?.prompts;
        const skipDuplicates = req.body?.skipDuplicates !== false;
        const duplicateStrategy = String(req.body?.duplicateStrategy || 'skip').trim().toLowerCase() === 'suffix'
            ? 'suffix'
            : 'skip';
        const collectionIdRaw = req.body?.collectionId;
        const collectionId = typeof collectionIdRaw === 'string' && collectionIdRaw.trim()
            ? collectionIdRaw.trim()
            : null;

        if (!Array.isArray(prompts) || prompts.length === 0) {
            return res.status(400).json({ error: 'Prompts array is required' });
        }
        if (prompts.length > MAX_PROMPT_IMPORT_BATCH) {
            return res.status(400).json({ error: `Import limit exceeded (${MAX_PROMPT_IMPORT_BATCH} max per request)` });
        }
        if (collectionId) {
            const collection = await dbGet(
                'SELECT id, projectId, isArchived FROM project_collections WHERE id = ? LIMIT 1',
                [collectionId]
            );
            if (!collection || collection.projectId !== projectId) {
                return res.status(400).json({ error: 'Collection not found for this project.' });
            }
            if (collection.isArchived) {
                return res.status(409).json({ error: 'Collection is archived.' });
            }
        }

        const normalized = [];
        const validationErrors = [];
        const seenTitles = new Set();
        let inputDuplicateCount = 0;

        for (let i = 0; i < prompts.length; i++) {
            const p = prompts[i];
            const rowLabel = `row ${i + 1}`;
            if (!p || typeof p !== 'object') {
                validationErrors.push(`${rowLabel}: must be an object`);
                continue;
            }

            if (typeof p.title !== 'string' || typeof p.prompt !== 'string') {
                validationErrors.push(`${rowLabel}: title and prompt must be strings`);
                continue;
            }

            const title = p.title.trim();
            const prompt = p.prompt.trim();
            if (!title || !prompt) {
                validationErrors.push(`${rowLabel}: title and prompt are required`);
                continue;
            }
            if (title.length > MAX_TITLE_LEN) {
                validationErrors.push(`${rowLabel}: title exceeds ${MAX_TITLE_LEN} characters`);
                continue;
            }
            if (prompt.length > MAX_PROMPT_LEN) {
                validationErrors.push(`${rowLabel}: prompt exceeds ${MAX_PROMPT_LEN} characters`);
                continue;
            }

            let label = '';
            if (p.label !== undefined && p.label !== null) {
                if (typeof p.label !== 'string') {
                    validationErrors.push(`${rowLabel}: label must be a string`);
                    continue;
                }
                label = p.label.trim();
                if (label.length > MAX_LABEL_LEN) {
                    validationErrors.push(`${rowLabel}: label exceeds ${MAX_LABEL_LEN} characters`);
                    continue;
                }
            }

            let tags = '';
            if (p.tags !== undefined && p.tags !== null) {
                if (typeof p.tags !== 'string') {
                    validationErrors.push(`${rowLabel}: tags must be a string`);
                    continue;
                }
                tags = p.tags.trim();
            }

            const noteInput = p.note ?? p.notes;
            let note = '';
            if (noteInput !== undefined && noteInput !== null) {
                if (typeof noteInput !== 'string') {
                    validationErrors.push(`${rowLabel}: note must be a string`);
                    continue;
                }
                note = noteInput.trim();
                if (note.length > MAX_NOTE_LEN) {
                    validationErrors.push(`${rowLabel}: note exceeds ${MAX_NOTE_LEN} characters`);
                    continue;
                }
            }

            let raw = '';
            if (p.raw !== undefined && p.raw !== null) {
                if (typeof p.raw !== 'string') {
                    validationErrors.push(`${rowLabel}: raw must be a string`);
                    continue;
                }
                raw = p.raw.trim();
            }

            let source = 'manual';
            if (p.source !== undefined && p.source !== null) {
                if (typeof p.source !== 'string') {
                    validationErrors.push(`${rowLabel}: source must be a string`);
                    continue;
                }
                const normalizedSource = p.source.trim().toLowerCase();
                if (normalizedSource !== 'json' && normalizedSource !== 'manual') {
                    validationErrors.push(`${rowLabel}: source must be "json" or "manual"`);
                    continue;
                }
                source = normalizedSource;
            }

            let previewImageUrl = null;
            if (p.previewImageUrl !== undefined && p.previewImageUrl !== null) {
                if (typeof p.previewImageUrl !== 'string') {
                    validationErrors.push(`${rowLabel}: previewImageUrl must be a string`);
                    continue;
                }
                const trimmedPreview = p.previewImageUrl.trim();
                previewImageUrl = trimmedPreview || null;
            }

            let previewMimeType = '';
            if (p.previewMimeType !== undefined && p.previewMimeType !== null) {
                if (typeof p.previewMimeType !== 'string') {
                    validationErrors.push(`${rowLabel}: previewMimeType must be a string`);
                    continue;
                }
                previewMimeType = p.previewMimeType.trim();
            }

            let ingestionState = 'waiting';
            if (p.ingestionState !== undefined && p.ingestionState !== null) {
                if (typeof p.ingestionState !== 'string') {
                    validationErrors.push(`${rowLabel}: ingestionState must be a string`);
                    continue;
                }
                const normalizedIngestionState = p.ingestionState.trim().toLowerCase();
                if (!['waiting', 'pending', 'done'].includes(normalizedIngestionState)) {
                    validationErrors.push(`${rowLabel}: ingestionState must be waiting, pending, or done`);
                    continue;
                }
                ingestionState = normalizedIngestionState;
            }

            let thumbnailBlur = false;
            if (p.thumbnailBlur !== undefined && p.thumbnailBlur !== null) {
                if (typeof p.thumbnailBlur !== 'boolean') {
                    validationErrors.push(`${rowLabel}: thumbnailBlur must be a boolean`);
                    continue;
                }
                thumbnailBlur = p.thumbnailBlur;
            }

            let queueLetter = 'A-Z';
            if (p.queueLetter !== undefined && p.queueLetter !== null) {
                if (typeof p.queueLetter !== 'string') {
                    validationErrors.push(`${rowLabel}: queueLetter must be a string`);
                    continue;
                }
                const normalizedQueueLetter = p.queueLetter.trim().toUpperCase();
                if (!(normalizedQueueLetter === 'A-Z' || /^[A-Z]$/.test(normalizedQueueLetter))) {
                    validationErrors.push(`${rowLabel}: queueLetter must be A-Z or a single letter`);
                    continue;
                }
                queueLetter = normalizedQueueLetter;
            }

            let queueNumber = '0-9';
            if (p.queueNumber !== undefined && p.queueNumber !== null) {
                if (typeof p.queueNumber !== 'string') {
                    validationErrors.push(`${rowLabel}: queueNumber must be a string`);
                    continue;
                }
                const normalizedQueueNumber = p.queueNumber.trim();
                if (!(normalizedQueueNumber === '0-9' || /^[0-9]$/.test(normalizedQueueNumber))) {
                    validationErrors.push(`${rowLabel}: queueNumber must be 0-9 or a single digit`);
                    continue;
                }
                queueNumber = normalizedQueueNumber;
            }

            const titleNorm = title.toLowerCase();
            const duplicateInInput = seenTitles.has(titleNorm);
            if (!duplicateInInput) seenTitles.add(titleNorm);
            else inputDuplicateCount++;

            normalized.push({
                title,
                prompt,
                raw,
                label,
                tags,
                note,
                source,
                previewImageUrl,
                previewMimeType,
                thumbnailBlur,
                ingestionState,
                queueLetter,
                queueNumber,
                titleNorm,
                duplicateInInput
            });
        }

        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Prompt import validation failed',
                details: validationErrors
            });
        }

        const existingRows = collectionId
            ? await dbAll(`
                SELECT lower(trim(r.title)) AS titleNorm
                FROM items i
                JOIN revisions r ON r.id = i.currentRevisionId
                WHERE i.projectId = ? AND i.collectionId = ?
            `, [projectId, collectionId])
            : await dbAll(`
                SELECT lower(trim(r.title)) AS titleNorm
                FROM items i
                JOIN revisions r ON r.id = i.currentRevisionId
                WHERE i.projectId = ? AND i.collectionId IS NULL
            `, [projectId]);
        const existingTitles = new Set(existingRows.map((r) => String(r.titleNorm || '')));

        const withDuplicateFlags = normalized.map((p) => ({
            ...p,
            duplicateExisting: existingTitles.has(p.titleNorm),
            isDuplicate: p.duplicateInInput || existingTitles.has(p.titleNorm)
        }));

        const duplicateCount = withDuplicateFlags.filter((p) => p.isDuplicate).length;
        const targetProject = await dbGet("SELECT name, projectType, systemKey FROM projects WHERE id = ? LIMIT 1", [projectId]);
        const targetCollection = collectionId
            ? await dbGet("SELECT name FROM project_collections WHERE id = ? AND projectId = ? LIMIT 1", [collectionId, projectId])
            : null;
        const targetProjectName = targetProject?.name || projectId;
        const targetCollectionName = targetCollection?.name || null;

        if (duplicateStrategy === 'suffix') {
            const usedTitleKeys = new Set(existingTitles);
            let renamedCount = 0;
            const toCreate = withDuplicateFlags.map((p) => {
                const unique = buildUniquePromptTitle(p.title, usedTitleKeys);
                if (unique.renamed) {
                    renamedCount += 1;
                }
                return {
                    ...p,
                    title: unique.title,
                    titleNorm: normalizeTitleKey(unique.title),
                    duplicateExisting: false,
                    isDuplicate: false
                };
            });

            if (toCreate.length === 0) {
                return res.json({
                    success: true,
                    created: 0,
                    skipped: 0,
                    renamed: renamedCount,
                    inputDuplicates: inputDuplicateCount
                });
            }

            await dbRun('BEGIN TRANSACTION');
            try {
                const timestamp = Date.now();
                for (let i = 0; i < toCreate.length; i++) {
                    const p = toCreate[i];
                    const itemId = uuidv4();
                    const revId = uuidv4();
                    const createdAt = timestamp + i;
                    const persistedPreview = persistPromptPreviewAsset({
                        projectName: targetProjectName,
                        projectType: targetProject?.projectType || '',
                        projectSystemKey: targetProject?.systemKey || '',
                        collectionName: targetCollectionName,
                        itemId,
                        sourceUrl: p.previewImageUrl || null,
                        mimeType: p.previewMimeType
                    });
                    const resolvedPreviewUrl = persistedPreview.fileUrl || null;
                    const resolvedPreviewMimeType = persistedPreview.mimeType;
                    const advancedParams = {
                        ...(resolvedPreviewUrl ? {
                            parentItemThumbnail: resolvedPreviewUrl,
                            previewImageUrl: resolvedPreviewUrl,
                            previewMimeType: resolvedPreviewMimeType
                        } : {}),
                        promptSource: p.source || 'manual',
                        rawPrompt: p.raw || '',
                        thumbnailBlur: Boolean(p.thumbnailBlur),
                        ingestionState: p.ingestionState || 'waiting',
                        queueLetter: p.queueLetter || 'A-Z',
                        queueNumber: p.queueNumber || '0-9'
                    };
                    const aiParameters = JSON.stringify({ advanced_params: advancedParams });

                    await dbRun(
                        `INSERT INTO items (id, projectId, collectionId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt)
                         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
                        [itemId, projectId, collectionId, revId, createdAt, createdAt]
                    );

                    await dbRun(
                        `INSERT INTO revisions (
                            id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                            thumbnailLink, mimeType, size, originalFilename, title, label, tags, prompt, engine,
                            note, aiParameters, secondaryFilesJson, createdAt, isArchived
                        ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, ?, ?, 0, 'prompt-preview', ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
                        [
                            revId,
                            itemId,
                            resolvedPreviewUrl,
                            resolvedPreviewUrl,
                            resolvedPreviewMimeType,
                            p.title,
                            p.label,
                            p.tags || '',
                            p.prompt,
                            engine,
                            p.note,
                            aiParameters,
                            createdAt
                        ]
                    );
                }

                if (collectionId) {
                    await dbRun('UPDATE project_collections SET updatedAt = ? WHERE id = ?', [Date.now(), collectionId]);
                }

                await dbRun('COMMIT');
            } catch (e) {
                await dbRun('ROLLBACK');
                throw e;
            }

            await logSystemEvent(
                'INFO',
                'PROJECT',
                `Imported ${toCreate.length} prompt drafts into "${targetProjectName}" with duplicate renaming (${renamedCount} renamed)`,
                actorId
            );

            return res.status(201).json({
                success: true,
                created: toCreate.length,
                skipped: 0,
                renamed: renamedCount,
                inputDuplicates: inputDuplicateCount
            });
        }

        if (!skipDuplicates && duplicateCount > 0) {
            return res.status(409).json({
                error: 'Duplicates detected in import payload',
                created: 0,
                skipped: duplicateCount
            });
        }

        const toCreate = skipDuplicates ? withDuplicateFlags.filter((p) => !p.isDuplicate) : withDuplicateFlags;
        if (toCreate.length === 0) {
            return res.json({
                success: true,
                created: 0,
                skipped: duplicateCount
            });
        }

        await dbRun('BEGIN TRANSACTION');
        try {
            const timestamp = Date.now();
            for (let i = 0; i < toCreate.length; i++) {
                const p = toCreate[i];
                const itemId = uuidv4();
                const revId = uuidv4();
                const createdAt = timestamp + i;
                const persistedPreview = persistPromptPreviewAsset({
                    projectName: targetProjectName,
                    projectType: targetProject?.projectType || '',
                    projectSystemKey: targetProject?.systemKey || '',
                    collectionName: targetCollectionName,
                    itemId,
                    sourceUrl: p.previewImageUrl || null,
                    mimeType: p.previewMimeType
                });
                const resolvedPreviewUrl = persistedPreview.fileUrl || null;
                const resolvedPreviewMimeType = persistedPreview.mimeType;
                const advancedParams = {
                    ...(resolvedPreviewUrl ? {
                        parentItemThumbnail: resolvedPreviewUrl,
                        previewImageUrl: resolvedPreviewUrl,
                        previewMimeType: resolvedPreviewMimeType
                    } : {}),
                    promptSource: p.source || 'manual',
                    rawPrompt: p.raw || '',
                    thumbnailBlur: Boolean(p.thumbnailBlur),
                    ingestionState: p.ingestionState || 'waiting',
                    queueLetter: p.queueLetter || 'A-Z',
                    queueNumber: p.queueNumber || '0-9'
                };
                const aiParameters = JSON.stringify({ advanced_params: advancedParams });

                await dbRun(
                    `INSERT INTO items (id, projectId, collectionId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
                    [itemId, projectId, collectionId, revId, createdAt, createdAt]
                );

                await dbRun(
                    `INSERT INTO revisions (
                        id, itemId, versionNumber, storage, fileUrl, remoteId, webViewLink, webContentLink,
                        thumbnailLink, mimeType, size, originalFilename, title, label, tags, prompt, engine,
                        note, aiParameters, secondaryFilesJson, createdAt, isArchived
                    ) VALUES (?, ?, 1, 'local', ?, NULL, NULL, NULL, ?, ?, 0, 'prompt-preview', ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
                    [
                        revId,
                        itemId,
                        resolvedPreviewUrl,
                        resolvedPreviewUrl,
                        resolvedPreviewMimeType,
                        p.title,
                        p.label,
                        p.tags || '',
                        p.prompt,
                        engine,
                        p.note,
                        aiParameters,
                        createdAt
                    ]
                );
            }

            if (collectionId) {
                await dbRun('UPDATE project_collections SET updatedAt = ? WHERE id = ?', [Date.now(), collectionId]);
            }

            await dbRun('COMMIT');
        } catch (e) {
            await dbRun('ROLLBACK');
            throw e;
        }

        await logSystemEvent(
            'INFO',
            'PROJECT',
            `Imported ${toCreate.length} prompt drafts into "${targetProjectName}" (skipped: ${duplicateCount})`,
            actorId
        );

        res.status(201).json({
            success: true,
            created: toCreate.length,
            skipped: duplicateCount,
            inputDuplicates: inputDuplicateCount
        });
    } catch (e) {
        console.error("[PROJECT_IMPORT_PROMPTS_ERR]", e);
        await logSystemEvent('ERROR', 'PROMPT_MANAGER', `Prompt import failed for project ${projectId}: ${e.message}`, actorId);
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id/prompt-duplicates', async (req, res) => {
    const projectId = req.params.id;

    try {
        const allowed = await canAccessProject(projectId, req.user);
        if (!allowed) return res.status(403).json({ error: 'Access denied' });

        const project = await dbGet('SELECT id, projectType FROM projects WHERE id = ? LIMIT 1', [projectId]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (String(project.projectType || '').toLowerCase() !== 'prompt') {
            return res.status(400).json({ error: 'Prompt duplicate scan is only available for prompt projects.' });
        }

        const rows = await dbAll(`
            SELECT
                i.id AS itemId,
                i.collectionId,
                i.createdAt AS itemCreatedAt,
                i.updatedAt AS itemUpdatedAt,
                r.id AS revisionId,
                r.title,
                r.prompt,
                r.label,
                r.engine,
                r.note,
                r.mimeType,
                r.fileUrl,
                r.thumbnailLink,
                r.createdAt AS revisionCreatedAt,
                c.name AS collectionName
            FROM items i
            JOIN revisions r ON r.id = i.currentRevisionId
            LEFT JOIN project_collections c ON c.id = i.collectionId
            WHERE i.projectId = ? AND i.isArchived = 0
        `, [projectId]);

        const groups = buildPromptDuplicateGroups(rows);
        const duplicateItems = groups.reduce((sum, group) => sum + group.items.length, 0);

        res.json({
            success: true,
            duplicateGroups: groups.length,
            duplicateItems,
            groups
        });
    } catch (e) {
        console.error('[PROJECT_PROMPT_DUPLICATES_ERR]', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/prompt-duplicates/merge', async (req, res) => {
    const projectId = req.params.id;
    const userId = req.user.id;

    try {
        const canManage = await canManageProject(projectId, req.user);
        if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

        const project = await dbGet('SELECT id, name, projectType FROM projects WHERE id = ? LIMIT 1', [projectId]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (String(project.projectType || '').toLowerCase() !== 'prompt') {
            return res.status(400).json({ error: 'Prompt duplicate merge is only available for prompt projects.' });
        }

        const rows = await dbAll(`
            SELECT
                i.id AS itemId,
                i.collectionId,
                i.currentRevisionId,
                i.createdAt AS itemCreatedAt,
                i.updatedAt AS itemUpdatedAt,
                r.id AS revisionId,
                r.title,
                r.prompt,
                r.label,
                r.engine,
                r.note,
                r.mimeType,
                r.fileUrl,
                r.thumbnailLink,
                r.aiParameters,
                c.name AS collectionName
            FROM items i
            JOIN revisions r ON r.id = i.currentRevisionId
            LEFT JOIN project_collections c ON c.id = i.collectionId
            WHERE i.projectId = ? AND i.isArchived = 0
        `, [projectId]);

        const groups = buildPromptDuplicateGroups(rows);
        if (groups.length === 0) {
            return res.json({
                success: true,
                duplicateGroups: 0,
                mergedItems: 0,
                updatedPrimaryItems: 0,
                archivedDuplicateIds: []
            });
        }

        const rowByItemId = new Map(rows.map((row) => [row.itemId, row]));
        const archivedDuplicateIds = [];
        const touchedCollectionIds = new Set();
        let updatedPrimaryItems = 0;
        const now = Date.now();

        await dbRun('BEGIN TRANSACTION');
        try {
            for (const group of groups) {
                const [primaryCandidate, ...duplicateCandidates] = group.items;
                if (!primaryCandidate || duplicateCandidates.length === 0) continue;

                const primaryRow = rowByItemId.get(primaryCandidate.itemId);
                if (!primaryRow) continue;

                let nextLabel = String(primaryRow.label || '').trim();
                let nextPrompt = normalizePromptTextForMerge(primaryRow.prompt);
                let nextEngine = String(primaryRow.engine || '').trim();
                let nextNote = String(primaryRow.note || '').trim();
                let nextAiParameters = primaryRow.aiParameters || '';

                for (const duplicateCandidate of duplicateCandidates) {
                    const duplicateRow = rowByItemId.get(duplicateCandidate.itemId);
                    if (!duplicateRow) continue;

                    if (!isMeaningfulText(nextLabel) && isMeaningfulText(duplicateRow.label)) {
                        nextLabel = String(duplicateRow.label || '').trim();
                    }
                    if (!isMeaningfulText(nextPrompt) && isMeaningfulText(duplicateRow.prompt)) {
                        nextPrompt = normalizePromptTextForMerge(duplicateRow.prompt);
                    }
                    if (isPlaceholderEngine(nextEngine) && !isPlaceholderEngine(duplicateRow.engine)) {
                        nextEngine = String(duplicateRow.engine || '').trim();
                    }
                    nextNote = mergeDistinctNotes(nextNote, duplicateRow.note);
                    nextAiParameters = mergeAiParameters(nextAiParameters, duplicateRow.aiParameters || '');

                    await dbRun(
                        'UPDATE items SET isArchived = 1, isPinned = 0, updatedAt = ? WHERE id = ?',
                        [now, duplicateCandidate.itemId]
                    );
                    await dbRun(
                        'UPDATE project_collections SET thumbnailItemId = ?, updatedAt = ? WHERE id = ? AND thumbnailItemId = ?',
                        [primaryCandidate.itemId, now, duplicateCandidate.collectionId, duplicateCandidate.itemId]
                    );

                    archivedDuplicateIds.push(duplicateCandidate.itemId);
                    if (duplicateCandidate.collectionId) touchedCollectionIds.add(duplicateCandidate.collectionId);
                }

                await dbRun(
                    'UPDATE revisions SET label = ?, prompt = ?, engine = ?, note = ?, aiParameters = ? WHERE id = ?',
                    [nextLabel, nextPrompt, nextEngine || 'default-placeholder', nextNote, nextAiParameters, primaryRow.revisionId]
                );
                await dbRun(
                    'UPDATE items SET updatedAt = ? WHERE id = ?',
                    [now, primaryCandidate.itemId]
                );

                if (primaryCandidate.collectionId) touchedCollectionIds.add(primaryCandidate.collectionId);
                updatedPrimaryItems += 1;
            }

            for (const collectionId of touchedCollectionIds) {
                if (!collectionId) continue;
                await dbRun('UPDATE project_collections SET updatedAt = ? WHERE id = ?', [now, collectionId]);
            }

            await dbRun('COMMIT');
        } catch (mergeErr) {
            try {
                await dbRun('ROLLBACK');
            } catch {}
            throw mergeErr;
        }

        await logSystemEvent(
            'INFO',
            'PROJECT',
            `Merged ${archivedDuplicateIds.length} duplicate prompt item(s) in "${project.name || projectId}".`,
            userId
        );

        res.json({
            success: true,
            duplicateGroups: groups.length,
            mergedItems: archivedDuplicateIds.length,
            updatedPrimaryItems,
            archivedDuplicateIds
        });
    } catch (e) {
        console.error('[PROJECT_PROMPT_DUPLICATE_MERGE_ERR]', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;

        const id = uuidv4();
        const { name, description, storageType, projectType, color, driveFolderId, defaultEngine } = req.body;
        
        if (!name) return res.status(400).json({ error: "Project name is mandatory." });

        const normalizedDefaultEngine = normalizeProjectEngine(defaultEngine);

        await dbRun(`INSERT INTO projects (id, name, description, storageType, projectType, color, driveFolderId, createdAt, updatedAt, ownerId, defaultEngine, isPinned, pinnedOrder, isSystem, systemKey) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
            [id, name, description || "", storageType || "Local Drive", projectType || "all", color || "#1e293b", driveFolderId || null, Date.now(), Date.now(), userId, normalizedDefaultEngine, 0, 0, 0, null]);
        
        await dbRun(`INSERT INTO project_members (projectId, userId, role) VALUES (?, ?, ?)`, [id, userId, 'owner']);
        
        await logSystemEvent('INFO', 'PROJECT', `Created project: ${name} (Type: ${projectType})`, userId);
        res.status(201).json({ id, name, description, storageType, projectType, color, driveFolderId, defaultEngine: normalizedDefaultEngine });
    } catch (e) { 
        console.error("[PROJECT_CREATE_ERR]", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

router.get('/:id', async (req, res) => {
    const allowed = await canAccessProject(req.params.id, req.user);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const p = await dbGet(`SELECT p.*, u.name as ownerName FROM projects p LEFT JOIN users u ON p.ownerId = u.id WHERE p.id = ?`, [req.params.id]);
    p ? res.json(p) : res.status(404).send();
});

router.put('/:id', async (req, res) => {
    const updates = req.body;
    const projectId = req.params.id;
    const userId = req.user.id;

    try {
        const canManage = await canManageProject(projectId, req.user);
        if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });
        const currentProject = await dbGet("SELECT id, name, systemKey FROM projects WHERE id = ?", [projectId]);
        if (!currentProject) return res.status(404).json({ error: 'Project not found' });

        // Physical Folder Sync on Rename
        if (updates.name) {
            if (currentProject && currentProject.name !== updates.name) {
                const oldSafe = sanitizeDirName(currentProject.name);
                const newSafe = sanitizeDirName(updates.name);
                const oldDir = path.join(UPLOADS_DIR, oldSafe);
                const newDir = path.join(UPLOADS_DIR, newSafe);

                if (fs.existsSync(oldDir) && oldSafe !== newSafe) {
                    try {
                        if (!fs.existsSync(newDir)) {
                            fs.renameSync(oldDir, newDir);
                            
                            const oldUrlBase = `/storage/uploads/${oldSafe}/`;
                            const newUrlBase = `/storage/uploads/${newSafe}/`;
                            const oldUrlBaseLegacy = `/uploads/${oldSafe}/`;

                            // 1. Update OWN items' fileUrls
                            const revs = await dbAll(`
                                SELECT r.id, r.fileUrl 
                                FROM revisions r 
                                JOIN items i ON r.itemId = i.id 
                                WHERE i.projectId = ? AND (r.fileUrl LIKE ? OR r.fileUrl LIKE ?)`, 
                                [projectId, `${oldUrlBase}%`, `${oldUrlBaseLegacy}%`]);
                            
                            for (const r of revs) {
                                const newUrl = r.fileUrl.replace(oldUrlBase, newUrlBase).replace(oldUrlBaseLegacy, newUrlBase);
                                await dbRun("UPDATE revisions SET fileUrl = ? WHERE id = ?", [newUrl, r.id]);
                            }

                            // 2. CRITICAL: Update GLOBAL references in all manifests
                            // Since all files in this directory moved, we can replace the base path string
                            await dbRun(
                                "UPDATE revisions SET secondaryFilesJson = REPLACE(secondaryFilesJson, ?, ?) WHERE secondaryFilesJson LIKE ?",
                                [oldUrlBase, newUrlBase, `%${oldUrlBase}%`]
                            );
                            
                            await logSystemEvent('INFO', 'PROJECT', `Synchronized directory rename and global manifests for project ${projectId}`, userId);
                        }
                    } catch (fsErr) {
                        console.error("[PROJECT_RENAME_FS_ERR]", fsErr);
                    }
                }
            }
        }

        const allowedFields = ['name', 'description', 'color', 'isArchived', 'isPinned', 'pinnedOrder', 'defaultEngine', 'projectType'];
        const setClause = [];
        const params = [];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClause.push(`${field} = ?`);
                if (field === 'isArchived' || field === 'isPinned') params.push(updates[field] ? 1 : 0);
                else if (field === 'defaultEngine') {
                    params.push(
                        currentProject.systemKey === ASSET_INGESTION_KEY
                            ? normalizeAssetIngestionEngine(updates[field])
                            : normalizeProjectEngine(updates[field])
                    );
                }
                else params.push(updates[field]);
            }
        }
        
        if (setClause.length > 0) {
            setClause.push(`updatedAt = ?`);
            params.push(Date.now());
            params.push(projectId);
            await dbRun(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`, params);
            if (updates.isArchived) await logSystemEvent('INFO', 'PROJECT', `Archived project ID: ${projectId}`, userId);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error("[PROJECT_UPDATE_ERR]", err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireDeleteVerification, async (req, res) => {
    const userId = req.user.id;
    const projectId = req.params.id;

    try {
        const canManage = await canManageProject(projectId, req.user);
        if (!canManage) return res.status(403).json({ error: 'Project owner or admin required' });

        const project = await dbGet("SELECT name, storageType, isArchived FROM projects WHERE id = ?", [projectId]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (!project.isArchived) {
            return res.status(409).json({ error: 'Move project to Neural Recycle Bin before permanent delete.' });
        }
        if (project) {
            if (project.storageType === 'Local Drive' || project.storageType === 'Google Keep') {
                try {
                    await purgeProjectPhysicalFiles(projectId, project.name);
                    await logSystemEvent('INFO', 'STORAGE', `Physically purged storage directories for project: ${project.name}`, userId);
                } catch (fsErr) {
                    console.error(`[STORAGE_PURGE_ERR] Project: ${projectId}`, fsErr);
                }
            }
        }
        await dbRun(`DELETE FROM projects WHERE id = ?`, [projectId]);
        await logSystemEvent('WARN', 'PROJECT', `Permanently deleted project: ${project?.name || projectId}`, userId);
        res.json({ success: true });
    } catch (e) {
        console.error("[PROJECT_DELETE_ERR]", e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
