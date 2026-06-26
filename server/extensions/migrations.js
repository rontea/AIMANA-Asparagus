import { createHash } from 'crypto';
import { dbAll, dbGet, dbRun, withTransaction } from '../db/connection.js';
import { createErrorReport, logSystemEvent } from '../db/logger.js';
import { extensionServerHostConfig } from './hostConfig.js';

const PROTECTED_HOST_TABLES = new Set([
    'users',
    'projects',
    'project_members',
    'custom_project_types',
    'items',
    'revisions',
    'item_references',
    'reference_assets',
    'chat_items',
    'chat_item_attachments',
    'chat_memory',
    'custom_engines',
    'bulk_presets',
    'neural_variable_registry_lists',
    'settings',
    'system_logs',
    'error_reports',
    'extension_migrations',
    'extension_migration_failures'
]);

const CREATE_TABLE_PATTERN = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?)/i;
const CREATE_INDEX_PATTERN = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?)[\s\S]+?\bON\s+(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?)/i;
const TABLE_REFERENCE_PATTERN = /\b(?:TABLE|INTO|UPDATE|JOIN|ON|REFERENCES)\s+(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?)/gi;

export class ExtensionMigrationError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'ExtensionMigrationError';
        this.context = context;
    }
}

const normalizeExtensionId = (extensionId) =>
    String(extensionId || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

export const getExtensionTablePrefix = (extensionId) => `ext_${normalizeExtensionId(extensionId)}_`;

export const computeExtensionMigrationChecksum = (migration) =>
    createHash('sha256')
        .update(JSON.stringify({
            version: migration.version,
            name: migration.name,
            statements: migration.statements
        }))
        .digest('hex');

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

const ensureNoProtectedTables = (sql, extensionId) => {
    const referencedTables = extractReferencedTables(sql);
    const violatingTable = referencedTables.find((tableName) => PROTECTED_HOST_TABLES.has(tableName));

    if (violatingTable) {
        throw new ExtensionMigrationError(
            `Extension "${extensionId}" migration SQL references protected host table "${violatingTable}".`,
            { extensionId, violatingTable, sql }
        );
    }
};

const validateMigrationStatement = (sql, extensionId) => {
    const prefix = getExtensionTablePrefix(extensionId);
    const trimmedSql = String(sql || '').trim().replace(/;+\s*$/g, '');

    if (!trimmedSql) {
        throw new ExtensionMigrationError(`Extension "${extensionId}" contains an empty migration statement.`, { extensionId, sql });
    }

    ensureNoProtectedTables(trimmedSql, extensionId);

    const createTableMatch = trimmedSql.match(CREATE_TABLE_PATTERN);
    if (createTableMatch) {
        const tableName = createTableMatch[1];
        if (!tableName?.startsWith(prefix)) {
            throw new ExtensionMigrationError(
                `Extension "${extensionId}" can only create namespaced tables with prefix "${prefix}".`,
                { extensionId, sql, tableName, expectedPrefix: prefix }
            );
        }
        return;
    }

    const createIndexMatch = trimmedSql.match(CREATE_INDEX_PATTERN);
    if (createIndexMatch) {
        const indexName = createIndexMatch[1];
        const targetTable = createIndexMatch[2];
        if (!targetTable?.startsWith(prefix)) {
            throw new ExtensionMigrationError(
                `Extension "${extensionId}" can only index namespaced tables with prefix "${prefix}".`,
                { extensionId, sql, targetTable, expectedPrefix: prefix }
            );
        }
        if (!indexName?.startsWith(prefix)) {
            throw new ExtensionMigrationError(
                `Extension "${extensionId}" can only create namespaced indexes with prefix "${prefix}".`,
                { extensionId, sql, indexName, expectedPrefix: prefix }
            );
        }
        return;
    }

    throw new ExtensionMigrationError(
        `Extension "${extensionId}" uses an unsupported migration statement. Only CREATE TABLE and CREATE INDEX are allowed right now.`,
        { extensionId, sql }
    );
};

export const validateExtensionServerManifest = (manifest) => {
    if (!manifest || typeof manifest !== 'object') {
        throw new ExtensionMigrationError('Invalid extension server manifest payload.');
    }

    if (!manifest.id || typeof manifest.id !== 'string') {
        throw new ExtensionMigrationError('Extension server manifests must define a string id.', { manifest });
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
        throw new ExtensionMigrationError(`Extension "${manifest.id}" must define a string version.`, { extensionId: manifest.id });
    }

    const migrations = Array.isArray(manifest.migrations) ? [...manifest.migrations] : [];
    const seenVersions = new Set();
    const seenNames = new Set();

    migrations.sort((left, right) => left.version - right.version);

    for (const migration of migrations) {
        if (!Number.isInteger(migration?.version) || migration.version <= 0) {
            throw new ExtensionMigrationError(
                `Extension "${manifest.id}" has an invalid migration version.`,
                { extensionId: manifest.id, migration }
            );
        }

        if (seenVersions.has(migration.version)) {
            throw new ExtensionMigrationError(
                `Extension "${manifest.id}" reuses schemaVersion ${migration.version}.`,
                { extensionId: manifest.id, schemaVersion: migration.version }
            );
        }
        seenVersions.add(migration.version);

        if (!migration?.name || typeof migration.name !== 'string') {
            throw new ExtensionMigrationError(
                `Extension "${manifest.id}" migration ${migration.version} is missing a name.`,
                { extensionId: manifest.id, schemaVersion: migration.version }
            );
        }

        if (seenNames.has(migration.name)) {
            throw new ExtensionMigrationError(
                `Extension "${manifest.id}" reuses migration name "${migration.name}".`,
                { extensionId: manifest.id, schemaVersion: migration.version, migrationName: migration.name }
            );
        }
        seenNames.add(migration.name);

        if (!Array.isArray(migration.statements) || migration.statements.length === 0) {
            throw new ExtensionMigrationError(
                `Extension "${manifest.id}" migration "${migration.name}" must define one or more SQL statements.`,
                { extensionId: manifest.id, schemaVersion: migration.version, migrationName: migration.name }
            );
        }

        for (const statement of migration.statements) {
            validateMigrationStatement(statement, manifest.id);
        }
    }

    return {
        ...manifest,
        migrations: migrations.map((migration) => ({
            ...migration,
            checksum: migration.checksum || computeExtensionMigrationChecksum(migration)
        }))
    };
};

const recordMigrationFailure = async ({
    extensionId,
    extensionVersion,
    schemaVersion,
    migrationName,
    checksum,
    error,
    failedStatementIndex = null,
    failedSql = null
}) => {
    const errorMessage = String(error?.message || error || 'Unknown extension migration failure');
    await dbRun(
        `INSERT INTO extension_migration_failures
         (extensionId, extensionVersion, schemaVersion, migrationName, checksum, errorMessage, failedStatementIndex, failedSql, failedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            extensionId,
            extensionVersion,
            schemaVersion,
            migrationName,
            checksum,
            errorMessage,
            failedStatementIndex,
            failedSql,
            Date.now()
        ]
    );
};

const persistStartupMigrationError = async ({
    extensionId,
    extensionVersion = 'unknown',
    schemaVersion = 0,
    migrationName = 'unknown',
    checksum = 'unknown',
    error,
    failedStatementIndex = null,
    failedSql = null
}) => {
    await logSystemEvent(
        'ERROR',
        'EXTENSION_MIGRATIONS',
        `Extension migration startup failure for ${extensionId}:${schemaVersion} (${migrationName}) - ${error?.message || error}`,
        'system'
    );

    if (schemaVersion > 0) {
        await recordMigrationFailure({
            extensionId,
            extensionVersion,
            schemaVersion,
            migrationName,
            checksum,
            error,
            failedStatementIndex,
            failedSql
        });
    }

    await createErrorReport({
        level: 'ERROR',
        module: 'EXTENSION_MIGRATIONS',
        source: 'server',
        errorName: error?.name || 'ExtensionMigrationError',
        message: `Extension migration startup failure for ${extensionId}:${schemaVersion} (${migrationName}) - ${error?.message || error}`,
        stack: error?.stack || '',
        route: 'startup:initDB',
        userId: 'system',
        context: {
            extensionId,
            extensionVersion,
            schemaVersion,
            migrationName,
            checksum,
            failedStatementIndex,
            failedSql
        }
    });
};

const applyExtensionMigration = async (manifest, migration) => {
    let activeStatementIndex = null;
    let activeStatementSql = null;

    try {
        await withTransaction(async () => {
            for (let index = 0; index < migration.statements.length; index += 1) {
                activeStatementIndex = index;
                activeStatementSql = migration.statements[index];
                await dbRun(activeStatementSql);
            }

            await dbRun(
                `INSERT INTO extension_migrations
                 (extensionId, extensionVersion, schemaVersion, migrationName, checksum, appliedAt)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    manifest.id,
                    manifest.version,
                    migration.version,
                    migration.name,
                    migration.checksum,
                    Date.now()
                ]
            );
        });
    } catch (error) {
        await recordMigrationFailure({
            extensionId: manifest.id,
            extensionVersion: manifest.version,
            schemaVersion: migration.version,
            migrationName: migration.name,
            checksum: migration.checksum,
            error,
            failedStatementIndex: activeStatementIndex,
            failedSql: activeStatementSql
        });

        await createErrorReport({
            level: 'ERROR',
            module: 'EXTENSION_MIGRATIONS',
            source: 'server',
            errorName: error?.name || 'ExtensionMigrationError',
            message: `Extension migration failed for ${manifest.id} v${migration.version}: ${error?.message || error}`,
            stack: error?.stack || '',
            route: 'startup:initDB',
            userId: 'system',
            context: {
                extensionId: manifest.id,
                extensionVersion: manifest.version,
                schemaVersion: migration.version,
                migrationName: migration.name,
                failedStatementIndex: activeStatementIndex,
                failedSql: activeStatementSql
            }
        });

        throw new ExtensionMigrationError(
            `Failed to apply extension migration ${manifest.id}:${migration.version} (${migration.name}).`,
            {
                extensionId: manifest.id,
                extensionVersion: manifest.version,
                schemaVersion: migration.version,
                migrationName: migration.name,
                cause: error
            }
        );
    }
};

export const runInstalledExtensionMigrations = async () => {
    const enabledInstalledExtensions = extensionServerHostConfig.installedExtensions.filter((entry) => entry.enabled);
    const manifests = enabledInstalledExtensions.flatMap((entry) => entry.manifests);
    const appliedMigrations = [];

    for (const manifestInput of manifests) {
        let manifest;

        try {
            manifest = validateExtensionServerManifest(manifestInput);
        } catch (error) {
            await persistStartupMigrationError({
                extensionId: manifestInput?.id || 'unknown-extension',
                extensionVersion: manifestInput?.version || 'unknown',
                migrationName: 'manifest-validation',
                error
            });
            throw error;
        }

        for (const migration of manifest.migrations) {
            const existing = await dbGet(
                `SELECT extensionId, extensionVersion, schemaVersion, checksum
                 FROM extension_migrations
                 WHERE extensionId = ? AND schemaVersion = ?`,
                [manifest.id, migration.version]
            );

            if (existing) {
                if (existing.checksum !== migration.checksum) {
                    const error = new ExtensionMigrationError(
                        `Installed extension migration checksum changed for ${manifest.id}:${migration.version}. Existing checksum "${existing.checksum}" does not match "${migration.checksum}".`,
                        {
                            extensionId: manifest.id,
                            extensionVersion: manifest.version,
                            schemaVersion: migration.version,
                            migrationName: migration.name,
                            storedChecksum: existing.checksum,
                            currentChecksum: migration.checksum
                        }
                    );
                    await persistStartupMigrationError({
                        extensionId: manifest.id,
                        extensionVersion: manifest.version,
                        schemaVersion: migration.version,
                        migrationName: migration.name,
                        checksum: migration.checksum,
                        error
                    });
                    throw error;
                }
                continue;
            }

            await applyExtensionMigration(manifest, migration);
            appliedMigrations.push({
                extensionId: manifest.id,
                extensionVersion: manifest.version,
                schemaVersion: migration.version,
                migrationName: migration.name
            });
            await logSystemEvent(
                'INFO',
                'EXTENSION_MIGRATIONS',
                `Applied extension migration ${manifest.id}:${migration.version} (${migration.name})`,
                'system'
            );
        }
    }

    if (appliedMigrations.length === 0) {
        await logSystemEvent('INFO', 'EXTENSION_MIGRATIONS', 'No pending installed extension migrations found.', 'system');
    }

    return appliedMigrations;
};

export const getExtensionMigrationDiagnostics = async () => {
    const applied = await dbAll(
        `SELECT extensionId, extensionVersion, schemaVersion, migrationName, checksum, appliedAt
         FROM extension_migrations
         ORDER BY extensionId ASC, schemaVersion ASC`
    );
    const failures = await dbAll(
        `SELECT id, extensionId, extensionVersion, schemaVersion, migrationName, checksum, errorMessage, failedStatementIndex, failedSql, failedAt
         FROM extension_migration_failures
         ORDER BY failedAt DESC`
    );

    return {
        applied,
        failures
    };
};
