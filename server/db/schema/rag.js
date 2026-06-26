import { dbRun } from '../connection.js';

export const initRagSchema = async () => {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS rag_chunks (
            id TEXT PRIMARY KEY,
            sourceType TEXT NOT NULL,
            sourceId TEXT NOT NULL,
            sourceRoute TEXT,
            title TEXT,
            chunkText TEXT NOT NULL,
            contentHash TEXT NOT NULL,
            metadataJson TEXT,
            visibility TEXT DEFAULT 'project',
            ownerId TEXT,
            projectId TEXT,
            itemId TEXT,
            collectionId TEXT,
            revisionId TEXT,
            accessPolicyJson TEXT,
            allowedRolesJson TEXT,
            embeddingModel TEXT,
            embeddingDimensions INTEGER,
            embeddingJson TEXT,
            indexVersion TEXT DEFAULT 'rag-v1',
            indexedAt INTEGER,
            sourceUpdatedAt INTEGER,
            updatedAt INTEGER
        )
    `);

    try { await dbRun("ALTER TABLE rag_chunks ADD COLUMN accessPolicyJson TEXT"); } catch(e) {}
    try { await dbRun("ALTER TABLE rag_chunks ADD COLUMN allowedRolesJson TEXT"); } catch(e) {}

    await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_chunks_source_hash ON rag_chunks(sourceType, sourceId, contentHash)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_source ON rag_chunks(sourceType, sourceId)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_project ON rag_chunks(projectId, sourceType)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_owner ON rag_chunks(ownerId, sourceType)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_rag_chunks_indexed ON rag_chunks(indexedAt DESC)`);
};
