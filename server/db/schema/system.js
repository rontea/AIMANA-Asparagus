
import { dbAll, dbRun } from '../connection.js';

export const initSystemSchema = async () => {
    // Telemetry & Audit Logs
    await dbRun(`
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            timestamp INTEGER, 
            level TEXT, 
            module TEXT, 
            message TEXT, 
            userId TEXT
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS error_reports (
            id TEXT PRIMARY KEY,
            timestamp INTEGER,
            level TEXT,
            module TEXT,
            source TEXT,
            errorName TEXT,
            message TEXT,
            stack TEXT,
            route TEXT,
            userId TEXT,
            fingerprint TEXT,
            contextJson TEXT
        )
    `);

    await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_error_reports_timestamp
        ON error_reports (timestamp DESC)
    `);

    await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_error_reports_fingerprint
        ON error_reports (fingerprint)
    `);

    // Global Key-Value Settings
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY, 
            value TEXT,
            updatedAt INTEGER NOT NULL DEFAULT 0
        )
    `);

    const settingsColumns = await dbAll(`PRAGMA table_info(settings)`);
    const hasUpdatedAt = Array.isArray(settingsColumns)
        && settingsColumns.some((column) => column?.name === 'updatedAt');
    if (!hasUpdatedAt) {
        await dbRun(`ALTER TABLE settings ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0`);
    }
};
