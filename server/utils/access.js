import { dbGet } from '../db.js';

const isAdminUser = (user) => user?.role === 'admin' || user?.id === 'admin-root';

export const canAccessProject = async (projectId, user) => {
    if (!projectId || !user) return false;
    if (isAdminUser(user)) return true;

    const row = await dbGet(
        `SELECT p.id
         FROM projects p
         LEFT JOIN project_members pm ON p.id = pm.projectId
         WHERE p.id = ? AND (p.ownerId = ? OR pm.userId = ? OR p.ownerId IS NULL)
         LIMIT 1`,
        [projectId, user.id, user.id]
    );
    return !!row;
};

export const canManageProject = async (projectId, user) => {
    if (!projectId || !user) return false;
    if (isAdminUser(user)) return true;

    const row = await dbGet(
        `SELECT id FROM projects WHERE id = ? AND ownerId = ? LIMIT 1`,
        [projectId, user.id]
    );
    return !!row;
};

export const getProjectForItem = async (itemId) => {
    return dbGet('SELECT projectId FROM items WHERE id = ? LIMIT 1', [itemId]);
};

export const getProjectForRevision = async (revisionId) => {
    return dbGet(
        `SELECT i.projectId
         FROM revisions r
         JOIN items i ON r.itemId = i.id
         WHERE r.id = ?
         LIMIT 1`,
        [revisionId]
    );
};

export const canAccessItem = async (itemId, user) => {
    const row = await getProjectForItem(itemId);
    if (!row?.projectId) return false;
    return canAccessProject(row.projectId, user);
};

export const canAccessRevision = async (revisionId, user) => {
    const row = await getProjectForRevision(revisionId);
    if (!row?.projectId) return false;
    return canAccessProject(row.projectId, user);
};

export const canManageItem = async (itemId, user) => {
    const row = await getProjectForItem(itemId);
    if (!row?.projectId) return false;
    return canManageProject(row.projectId, user);
};

export const canManageRevision = async (revisionId, user) => {
    const row = await getProjectForRevision(revisionId);
    if (!row?.projectId) return false;
    return canManageProject(row.projectId, user);
};

