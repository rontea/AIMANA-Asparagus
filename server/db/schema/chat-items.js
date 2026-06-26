import { dbRun } from '../connection.js';

export const initChatItemSchema = async () => {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS chat_items (
            id TEXT PRIMARY KEY,
            projectId TEXT NOT NULL,
            title TEXT,
            sessionId TEXT,
            modelId TEXT,
            systemPrompt TEXT,
            temperature REAL,
            maxTokens INTEGER,
            useSearch INTEGER DEFAULT 0,
            useLinks INTEGER DEFAULT 0,
            useReasoning INTEGER DEFAULT 0,
            messageCount INTEGER DEFAULT 0,
            payloadJson TEXT,
            transcriptText TEXT,
            isArchived INTEGER DEFAULT 0,
            isPinned INTEGER DEFAULT 0,
            createdAt INTEGER,
            updatedAt INTEGER,
            FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS chat_item_attachments (
            id TEXT PRIMARY KEY,
            chatItemId TEXT NOT NULL,
            messageId TEXT,
            inputId TEXT,
            referenceItemId TEXT,
            fileUrl TEXT,
            mimeType TEXT,
            size INTEGER,
            createdAt INTEGER,
            FOREIGN KEY(chatItemId) REFERENCES chat_items(id) ON DELETE CASCADE,
            FOREIGN KEY(referenceItemId) REFERENCES items(id) ON DELETE SET NULL
        )
    `);

    try { await dbRun("ALTER TABLE chat_items ADD COLUMN useLinks INTEGER DEFAULT 0"); } catch (e) {}

    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_items_project ON chat_items(projectId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_items_updated ON chat_items(updatedAt DESC)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_chat_item_attachments_chat ON chat_item_attachments(chatItemId)");
};
