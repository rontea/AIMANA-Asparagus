import { dbRun } from '../connection.js';

export const initAuthSchema = async () => {
    // Primary User Registry
    await dbRun(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, 
            email TEXT UNIQUE, 
            password TEXT, 
            name TEXT, 
            role TEXT, 
            provider TEXT, 
            isBlocked INTEGER DEFAULT 0, 
            avatar TEXT, 
            lastLogin INTEGER, 
            createdAt INTEGER, 
            googleId TEXT
        )
    `);

    // Per-user deletion security factors
    try {
        await dbRun("ALTER TABLE users ADD COLUMN twoFactorSecret TEXT");
    } catch (e) {
        // Column likely already exists
    }

    try {
        await dbRun("ALTER TABLE users ADD COLUMN pinHash TEXT");
    } catch (e) {
        // Column likely already exists
    }

    // Optional per-user login challenge policy (password + TOTP)
    try {
        await dbRun("ALTER TABLE users ADD COLUMN isTwoFactorLoginEnabled INTEGER DEFAULT 0");
    } catch (e) {
        // Column likely already exists
    }

    await dbRun(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            expiresAt INTEGER NOT NULL,
            revokedAt INTEGER,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
        ON auth_sessions(userId)
    `);

    await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
        ON auth_sessions(expiresAt)
    `);
};
