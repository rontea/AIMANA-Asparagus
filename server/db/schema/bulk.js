
import { dbRun } from '../connection.js';

export const initBulkSchema = async () => {
    /**
     * Neural Variable Presets for Bulk Engine
     * Stores full synthesis manifests (input text, mode, and variable mappings)
     * for rapid workflow restoration.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS bulk_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            manifest TEXT,
            inputMode TEXT DEFAULT 'text',
            variablesJson TEXT NOT NULL,
            createdAt INTEGER,
            userId TEXT
        )
    `);

    /**
     * Neural Variable Registry saved lists
     * Stores reusable variable sets for Prompt Manager manifests
     * while the active in-editor registry can stay lightweight client-side.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS neural_variable_registry_lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            variablesJson TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL,
            userId TEXT NOT NULL
        )
    `);

    /**
     * Prompt Manager drafts
     * Stores the user's staging, ready, and recycled prompt drafts so the
     * queue survives browser refreshes and device changes.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS prompt_manager_drafts (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            raw TEXT,
            label TEXT,
            tags TEXT,
            note TEXT,
            source TEXT,
            status TEXT NOT NULL,
            ingestionState TEXT,
            queueLetter TEXT,
            queueNumber TEXT,
            previewImageUrl TEXT,
            previewMimeType TEXT,
            thumbnailBlur INTEGER DEFAULT 0,
            revisionHistoryJson TEXT,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        )
    `);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_prompt_manager_drafts_user ON prompt_manager_drafts(userId, updatedAt DESC)`);
    try { await dbRun(`ALTER TABLE prompt_manager_drafts ADD COLUMN previewError TEXT`); } catch (e) {}
    try { await dbRun(`ALTER TABLE prompt_manager_drafts ADD COLUMN previewErrorDetails TEXT`); } catch (e) {}
    try { await dbRun(`ALTER TABLE prompt_manager_drafts ADD COLUMN tags TEXT`); } catch (e) {}
    try { await dbRun(`ALTER TABLE prompt_manager_drafts ADD COLUMN revisionHistoryJson TEXT`); } catch (e) {}
    try { await dbRun(`ALTER TABLE prompt_manager_drafts ADD COLUMN thumbnailBlur INTEGER DEFAULT 0`); } catch (e) {}

    /**
     * Active Neural Variable Registry
     * Keeps the working registry in SQLite instead of browser-only storage.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS active_variable_registry_entries (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            variableKey TEXT NOT NULL,
            variableValue TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        )
    `);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_active_variable_registry_entries_user ON active_variable_registry_entries(userId, position ASC, updatedAt DESC)`);

    /**
     * Archived Neural Variable Registry entries
     * Persists recycle-bin entries for active/vault variables.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS archived_variable_registry_entries (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            variableId TEXT NOT NULL,
            variableKey TEXT NOT NULL,
            variableValue TEXT NOT NULL,
            deletedAt INTEGER NOT NULL,
            source TEXT NOT NULL,
            collectionId TEXT,
            collectionName TEXT,
            position INTEGER NOT NULL DEFAULT 0
        )
    `);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_archived_variable_registry_entries_user ON archived_variable_registry_entries(userId, deletedAt DESC, position ASC)`);

    /**
     * Bulk Studio workspace state
     * Persists queue, failure lab, archive tray, variables, and control flags.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS bulk_studio_state (
            userId TEXT PRIMARY KEY,
            variablesJson TEXT NOT NULL,
            tasksJson TEXT NOT NULL,
            failedTasksJson TEXT NOT NULL,
            archivedTasksJson TEXT NOT NULL,
            isActive INTEGER NOT NULL DEFAULT 0,
            batchModelId TEXT,
            updatedAt INTEGER NOT NULL
        )
    `);
};
