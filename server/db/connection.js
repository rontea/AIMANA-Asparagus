import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// We are in server/db/, so root is ../../
export const ROOT_DIR = path.join(__dirname, '..', '..');

export const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
export const DB_FILE = path.join(STORAGE_DIR, 'aimana.db');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let db;
export const dbReady = new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_FILE, (err) => {
        if (err) {
            console.error('[DB] Connection Failed:', err);
            reject(err);
            return;
        }

        console.log('[DB] SQLite Connected:', DB_FILE);
        db.run('PRAGMA foreign_keys = ON', (pragmaErr) => {
            if (pragmaErr) {
                console.error('[DB] Failed to enable foreign keys:', pragmaErr);
                reject(pragmaErr);
                return;
            }
            resolve();
        });
    });
});

export const dbRun = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

export const dbGet = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

export const dbAll = async (sql, params = []) => {
    await dbReady;
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

let transactionQueue = Promise.resolve();

export const withTransaction = async (callback) => {
    const runTransaction = async () => {
        await dbRun('BEGIN IMMEDIATE TRANSACTION');
        try {
            const result = await callback();
            await dbRun('COMMIT');
            return result;
        } catch (error) {
            try {
                await dbRun('ROLLBACK');
            } catch (rollbackError) {
                console.error('[DB] Transaction rollback failed:', rollbackError);
            }
            throw error;
        }
    };

    const queuedTransaction = transactionQueue.then(runTransaction, runTransaction);
    transactionQueue = queuedTransaction.catch(() => {});
    return queuedTransaction;
};
