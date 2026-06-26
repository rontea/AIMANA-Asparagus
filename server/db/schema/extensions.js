import { dbRun } from '../connection.js';

export const initExtensionSchema = async () => {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS extension_migrations (
            extensionId TEXT NOT NULL,
            extensionVersion TEXT NOT NULL,
            schemaVersion INTEGER NOT NULL,
            migrationName TEXT NOT NULL,
            checksum TEXT NOT NULL,
            appliedAt INTEGER NOT NULL,
            PRIMARY KEY (extensionId, schemaVersion)
        )
    `);

    await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_extension_migrations_extension_applied
        ON extension_migrations (extensionId, appliedAt DESC)
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS extension_migration_failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            extensionId TEXT NOT NULL,
            extensionVersion TEXT NOT NULL,
            schemaVersion INTEGER NOT NULL,
            migrationName TEXT NOT NULL,
            checksum TEXT NOT NULL,
            errorMessage TEXT NOT NULL,
            failedStatementIndex INTEGER,
            failedSql TEXT,
            failedAt INTEGER NOT NULL
        )
    `);

    await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_extension_migration_failures_extension_failed
        ON extension_migration_failures (extensionId, failedAt DESC)
    `);
};
