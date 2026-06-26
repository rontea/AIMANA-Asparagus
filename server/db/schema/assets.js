
import { dbGet, dbRun } from '../connection.js';
import { rebuildItemReferenceIndex } from '../../logic/referenceIndex.js';

export const initAssetSchema = async () => {
    // Logical Item Containers
    await dbRun(`
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY, 
            projectId TEXT, 
            collectionId TEXT,
            currentRevisionId TEXT, 
            isArchived INTEGER DEFAULT 0, 
            isPinned INTEGER DEFAULT 0, 
            createdAt INTEGER, 
            updatedAt INTEGER, 
            FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);

    // Physical Revisions (History & Binaries)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS revisions (
            id TEXT PRIMARY KEY, 
            itemId TEXT, 
            versionNumber INTEGER, 
            storage TEXT, 
            fileUrl TEXT, 
            remoteId TEXT, 
            webViewLink TEXT, 
            webContentLink TEXT, 
            thumbnailLink TEXT, 
            mimeType TEXT, 
            size INTEGER, 
            originalFilename TEXT, 
            title TEXT, 
            label TEXT, 
            tags TEXT,
            prompt TEXT, 
            engine TEXT, 
            note TEXT, 
            aiParameters TEXT, 
            secondaryFilesJson TEXT,
            createdAt INTEGER, 
            blob BLOB, 
            isArchived INTEGER DEFAULT 0, 
            FOREIGN KEY(itemId) REFERENCES items(id) ON DELETE CASCADE
        )
    `);

    // Migration to add secondaryFilesJson if missing
    try {
        await dbRun("ALTER TABLE revisions ADD COLUMN secondaryFilesJson TEXT");
    } catch (e) {
        // Column likely already exists
    }

    try {
        await dbRun("ALTER TABLE revisions ADD COLUMN tags TEXT");
    } catch (e) {
        // Column likely already exists
    }

    try {
        await dbRun("ALTER TABLE items ADD COLUMN collectionId TEXT");
    } catch (e) {
        // Column likely already exists
    }

    await dbRun(`
        CREATE TABLE IF NOT EXISTS project_collections (
            id TEXT PRIMARY KEY,
            projectId TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            thumbnailItemId TEXT,
            isPinned INTEGER DEFAULT 0,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL,
            FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);

    try {
        await dbRun("ALTER TABLE project_collections ADD COLUMN thumbnailItemId TEXT");
    } catch (e) {
        // Column likely already exists
    }

    try {
        await dbRun("ALTER TABLE project_collections ADD COLUMN description TEXT DEFAULT ''");
    } catch (e) {
        // Column likely already exists
    }

    try {
        await dbRun("ALTER TABLE project_collections ADD COLUMN isArchived INTEGER DEFAULT 0");
    } catch (e) {
        // Column likely already exists
    }

    try {
        await dbRun("ALTER TABLE project_collections ADD COLUMN isPinned INTEGER DEFAULT 0");
    } catch (e) {
        // Column likely already exists
    }

    await dbRun("CREATE INDEX IF NOT EXISTS idx_items_project_updated ON items(projectId, updatedAt DESC)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_items_collection_updated ON items(collectionId, updatedAt DESC)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_items_current_revision ON items(currentRevisionId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_revisions_item_created ON revisions(itemId, createdAt DESC)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_project_collections_project_updated ON project_collections(projectId, updatedAt DESC)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_project_collections_project_pinned_updated ON project_collections(projectId, isPinned DESC, updatedAt DESC)");

    // Denormalized index for fast "Referenced In" and project reference tab lookups.
    await dbRun(`
        CREATE TABLE IF NOT EXISTS item_references (
            sourceItemId TEXT NOT NULL,
            targetItemId TEXT NOT NULL,
            relationKind TEXT NOT NULL CHECK (relationKind IN ('linked', 'neural', 'reference_image')),
            sourceProjectId TEXT,
            updatedAt INTEGER,
            PRIMARY KEY (sourceItemId, targetItemId, relationKind),
            FOREIGN KEY(sourceItemId) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY(targetItemId) REFERENCES items(id) ON DELETE CASCADE
        )
    `);

    const refsTable = await dbGet("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'item_references'");
    const refsSql = String(refsTable?.sql || '').toLowerCase();
    const hasReferenceImageKind = refsSql.includes('reference_image');

    let didMigrateReferenceKinds = false;
    if (refsTable?.sql && !hasReferenceImageKind) {
        await dbRun('BEGIN TRANSACTION');
        try {
            await dbRun('ALTER TABLE item_references RENAME TO item_references_legacy');
            await dbRun(`
                CREATE TABLE item_references (
                    sourceItemId TEXT NOT NULL,
                    targetItemId TEXT NOT NULL,
                    relationKind TEXT NOT NULL CHECK (relationKind IN ('linked', 'neural', 'reference_image')),
                    sourceProjectId TEXT,
                    updatedAt INTEGER,
                    PRIMARY KEY (sourceItemId, targetItemId, relationKind),
                    FOREIGN KEY(sourceItemId) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY(targetItemId) REFERENCES items(id) ON DELETE CASCADE
                )
            `);
            await dbRun(`
                INSERT OR IGNORE INTO item_references
                (sourceItemId, targetItemId, relationKind, sourceProjectId, updatedAt)
                SELECT sourceItemId, targetItemId, relationKind, sourceProjectId, updatedAt
                FROM item_references_legacy
                WHERE relationKind IN ('linked', 'neural', 'reference_image')
            `);
            await dbRun('DROP TABLE item_references_legacy');
            await dbRun('COMMIT');
            didMigrateReferenceKinds = true;
        } catch (migrationError) {
            await dbRun('ROLLBACK');
            throw migrationError;
        }
    }

    await dbRun("CREATE INDEX IF NOT EXISTS idx_item_refs_source ON item_references(sourceItemId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_item_refs_target ON item_references(targetItemId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_item_refs_source_project ON item_references(sourceProjectId)");

    // Deduplicated reference assets indexed by owner + content hash.
    await dbRun(`
        CREATE TABLE IF NOT EXISTS reference_assets (
            ownerId TEXT NOT NULL,
            hash TEXT NOT NULL,
            itemId TEXT NOT NULL,
            projectId TEXT NOT NULL,
            fileUrl TEXT NOT NULL,
            mimeType TEXT,
            size INTEGER,
            createdAt INTEGER,
            updatedAt INTEGER,
            useCount INTEGER DEFAULT 1,
            PRIMARY KEY (ownerId, hash),
            FOREIGN KEY(itemId) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_reference_assets_item ON reference_assets(itemId)");
    await dbRun("CREATE INDEX IF NOT EXISTS idx_reference_assets_project ON reference_assets(projectId)");

    const refCount = await dbGet("SELECT COUNT(*) as count FROM item_references");
    if (didMigrateReferenceKinds || !refCount || !refCount.count) {
        await rebuildItemReferenceIndex();
    }
};
