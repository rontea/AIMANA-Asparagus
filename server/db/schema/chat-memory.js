import { dbRun } from '../connection.js';

export const initChatMemorySchema = async () => {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS chat_memory (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            modelId TEXT,
            pinnedMemory TEXT,
            pinnedMemoryUpdatedAt INTEGER DEFAULT 0,
            memoryProfile TEXT DEFAULT 'balanced',
            memoryProfileUpdatedAt INTEGER DEFAULT 0,
            memorySummary TEXT,
            memorySummaryMessageCount INTEGER DEFAULT 0,
            memorySummaryUpdatedAt INTEGER DEFAULT 0,
            createdAt INTEGER,
            updatedAt INTEGER,
            UNIQUE(userId, sessionId)
        )
    `);

    try { await dbRun("ALTER TABLE chat_memory ADD COLUMN memoryProfile TEXT DEFAULT 'balanced'"); } catch (e) {}
    try { await dbRun("ALTER TABLE chat_memory ADD COLUMN memoryProfileUpdatedAt INTEGER DEFAULT 0"); } catch (e) {}

    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_memory_user ON chat_memory(userId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_memory_session ON chat_memory(sessionId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_memory_updated ON chat_memory(updatedAt DESC)");

    await dbRun(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
            userId TEXT PRIMARY KEY,
            sessionsJson TEXT NOT NULL,
            updatedAt INTEGER NOT NULL
        )
    `);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updatedAt DESC)");

    await dbRun(`
        CREATE TABLE IF NOT EXISTS chat_session_attachments (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            kind TEXT NOT NULL,
            name TEXT,
            mimeType TEXT,
            size INTEGER,
            format TEXT,
            fileUrl TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL
        )
    `);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_session_attachments_user ON chat_session_attachments(userId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_session_attachments_kind ON chat_session_attachments(kind)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_session_attachments_updated ON chat_session_attachments(updatedAt DESC)");

    await dbRun(`
        CREATE TABLE IF NOT EXISTS lab_workspace_state (
            userId TEXT PRIMARY KEY,
            stateJson TEXT NOT NULL,
            updatedAt INTEGER NOT NULL
        )
    `);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_lab_workspace_state_updated ON lab_workspace_state(updatedAt DESC)");
};
