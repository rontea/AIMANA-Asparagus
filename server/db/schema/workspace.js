import { dbRun } from '../connection.js';

export const initWorkspaceSchema = async () => {
    // Project Workspaces
    await dbRun(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, 
            name TEXT, 
            description TEXT, 
            storageType TEXT, 
            projectType TEXT DEFAULT 'all',
            color TEXT, 
            driveFolderId TEXT, 
            isArchived INTEGER DEFAULT 0, 
            isPinned INTEGER DEFAULT 0, 
            pinnedOrder INTEGER DEFAULT 0,
            systemKey TEXT,
            isSystem INTEGER DEFAULT 0, 
            createdAt INTEGER, 
            updatedAt INTEGER, 
            ownerId TEXT, 
            defaultEngine TEXT
        )
    `);

    // Custom Project Type Registry (Intents)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS custom_project_types (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            description TEXT,
            iconName TEXT DEFAULT 'LayoutGrid',
            color TEXT,
            createdAt INTEGER
        )
    `);

    // Project Membership Mapping (RBAC)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS project_members (
            projectId TEXT, 
            userId TEXT, 
            role TEXT, 
            PRIMARY KEY(projectId, userId), 
            FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE, 
            FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Migrations
    try { await dbRun("ALTER TABLE projects ADD COLUMN isSystem INTEGER DEFAULT 0"); } catch(e) {}
    try { await dbRun("ALTER TABLE projects ADD COLUMN projectType TEXT DEFAULT 'all'"); } catch(e) {}
    try { await dbRun("ALTER TABLE projects ADD COLUMN pinnedOrder INTEGER DEFAULT 0"); } catch(e) {}
    try { await dbRun("ALTER TABLE projects ADD COLUMN systemKey TEXT"); } catch(e) {}

    try {
        await dbRun(`
            UPDATE projects
            SET systemKey = 'neural-saved'
            WHERE isSystem = 1
              AND (systemKey IS NULL OR trim(systemKey) = '')
              AND name IN ('Neural Saved', 'Neural Archive')
        `);
    } catch (e) {}

    await dbRun(`CREATE INDEX IF NOT EXISTS idx_projects_owner_system ON projects(ownerId, isSystem)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_projects_owner_system_key ON projects(ownerId, systemKey)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_projects_updatedAt ON projects(updatedAt DESC)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_project_members_user_project ON project_members(userId, projectId)`);
};
