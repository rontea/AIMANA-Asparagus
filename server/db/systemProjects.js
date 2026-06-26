import { v4 as uuidv4 } from 'uuid';

import { dbGet, dbRun } from './connection.js';

const SYSTEM_ARCHIVE_KEY = 'neural-saved';
const SYSTEM_ARCHIVE_NAME = 'Neural Saved';
const ROOT_ADMIN_ID = 'admin-root';

export const ensureRootSystemArchiveProject = async () => {
    const admin = await dbGet("SELECT id FROM users WHERE id = ?", [ROOT_ADMIN_ID]);
    if (!admin) {
        console.log("[DB_BOOT] Neural Saved archive deferred until initial admin setup is complete.");
        return null;
    }

    const archive = await dbGet(
        `SELECT id
         FROM projects
         WHERE isSystem = 1
           AND ownerId = ?
           AND (systemKey = ? OR name IN (?, 'Neural Archive'))`,
        [ROOT_ADMIN_ID, SYSTEM_ARCHIVE_KEY, SYSTEM_ARCHIVE_NAME]
    );

    const now = Date.now();
    const archiveId = archive?.id || uuidv4();

    if (!archive) {
        await dbRun(
            `INSERT INTO projects (id, name, description, storageType, color, isSystem, systemKey, createdAt, updatedAt, ownerId)
             VALUES (?, ?, 'Automatic history of all generated content.', 'Local Drive', '#4f46e5', 1, ?, ?, ?, ?)`,
            [archiveId, SYSTEM_ARCHIVE_NAME, SYSTEM_ARCHIVE_KEY, now, now, ROOT_ADMIN_ID]
        );
    } else {
        await dbRun(
            `UPDATE projects
             SET name = ?, systemKey = ?, ownerId = ?, updatedAt = ?
             WHERE id = ?`,
            [SYSTEM_ARCHIVE_NAME, SYSTEM_ARCHIVE_KEY, ROOT_ADMIN_ID, now, archiveId]
        );
    }

    await dbRun(
        `INSERT INTO project_members (projectId, userId, role)
         VALUES (?, ?, 'owner')
         ON CONFLICT(projectId, userId) DO UPDATE SET role = excluded.role`,
        [archiveId, ROOT_ADMIN_ID]
    );

    return { id: archiveId };
};
