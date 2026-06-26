import { dbAll, dbGet, dbRun } from '../db/connection.js';
import { getExtensionTablePrefix } from './migrations.js';

const ALLOWED_QUERY_TYPES = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
const TABLE_REFERENCE_PATTERN = /\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?)/gi;

export class ExtensionStorageError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'ExtensionStorageError';
        this.context = context;
    }
}

const extractReferencedTables = (sql) => {
    const tableNames = new Set();
    let match;

    while ((match = TABLE_REFERENCE_PATTERN.exec(sql)) !== null) {
        if (match[1]) {
            tableNames.add(match[1]);
        }
    }

    return [...tableNames];
};

export const validateExtensionStorageQuery = (extensionId, sql) => {
    const prefix = getExtensionTablePrefix(extensionId);
    const trimmedSql = String(sql || '').trim().replace(/;+\s*$/g, '');

    if (!trimmedSql) {
        throw new ExtensionStorageError(`Extension "${extensionId}" attempted an empty storage query.`, { extensionId, sql });
    }

    if (trimmedSql.includes(';')) {
        throw new ExtensionStorageError(
            `Extension "${extensionId}" storage queries must contain a single SQL statement.`,
            { extensionId, sql }
        );
    }

    const queryTypeMatch = trimmedSql.match(/^([A-Z]+)/i);
    const queryType = queryTypeMatch?.[1]?.toUpperCase();

    if (!queryType || !ALLOWED_QUERY_TYPES.has(queryType)) {
        throw new ExtensionStorageError(
            `Extension "${extensionId}" used unsupported storage query type "${queryType || 'unknown'}".`,
            { extensionId, sql, queryType }
        );
    }

    const referencedTables = extractReferencedTables(trimmedSql);
    if (referencedTables.length === 0) {
        throw new ExtensionStorageError(
            `Extension "${extensionId}" storage queries must reference at least one extension-owned table.`,
            { extensionId, sql }
        );
    }

    const invalidTable = referencedTables.find((tableName) => !tableName.startsWith(prefix));
    if (invalidTable) {
        throw new ExtensionStorageError(
            `Extension "${extensionId}" can only query namespaced tables with prefix "${prefix}".`,
            { extensionId, sql, invalidTable, expectedPrefix: prefix }
        );
    }

    return trimmedSql;
};

export const createExtensionStorage = (extensionId) => ({
    async get(sql, params = []) {
        return dbGet(validateExtensionStorageQuery(extensionId, sql), params);
    },
    async all(sql, params = []) {
        return dbAll(validateExtensionStorageQuery(extensionId, sql), params);
    },
    async run(sql, params = []) {
        const result = await dbRun(validateExtensionStorageQuery(extensionId, sql), params);

        return {
            changes: result?.changes ?? 0,
            lastID: result?.lastID ?? null
        };
    }
});
