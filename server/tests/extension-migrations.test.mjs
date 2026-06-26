import test from 'node:test';
import assert from 'node:assert/strict';
import semanticForgeServerExtension from '@aimana/extension-semantic-forge/server';
import {
    computeExtensionMigrationChecksum,
    ExtensionMigrationError,
    getExtensionTablePrefix,
    validateExtensionServerManifest
} from '../extensions/migrations.js';

test('validates the example extension server manifest and preserves migration order', () => {
    const manifest = validateExtensionServerManifest(semanticForgeServerExtension);

    assert.equal(manifest.id, 'semantic-forge');
    assert.equal(manifest.migrations.length, 1);
    assert.equal(manifest.migrations[0].version, 1);
    assert.equal(getExtensionTablePrefix(manifest.id), 'ext_semantic_forge_');
    assert.ok(manifest.migrations[0].checksum);
});

test('computes stable checksums for extension migrations', () => {
    const migration = semanticForgeServerExtension.migrations[0];
    const first = computeExtensionMigrationChecksum(migration);
    const second = computeExtensionMigrationChecksum(migration);

    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
});

test('rejects migrations that touch protected host tables', () => {
    assert.throws(
        () =>
            validateExtensionServerManifest({
                id: 'bad-extension',
                version: '0.1.0',
                migrations: [
                    {
                        version: 1,
                        name: '001_break_core_schema',
                        statements: [
                            'UPDATE users SET name = name'
                        ]
                    }
                ]
            }),
        (error) =>
            error instanceof ExtensionMigrationError
            && error.message.includes('protected host table')
    );
});

test('rejects non-namespaced extension tables', () => {
    assert.throws(
        () =>
            validateExtensionServerManifest({
                id: 'bad-extension',
                version: '0.1.0',
                migrations: [
                    {
                        version: 1,
                        name: '001_create_misc_table',
                        statements: [
                            'CREATE TABLE IF NOT EXISTS misc_runs (id TEXT PRIMARY KEY)'
                        ]
                    }
                ]
            }),
        (error) =>
            error instanceof ExtensionMigrationError
            && error.message.includes('namespaced tables')
    );
});

test('rejects extension migrations that reference host tables through foreign keys', () => {
    assert.throws(
        () =>
            validateExtensionServerManifest({
                id: 'bad-extension',
                version: '0.1.0',
                migrations: [
                    {
                        version: 1,
                        name: '001_create_ext_bad_extension_runs',
                        statements: [
                            `CREATE TABLE IF NOT EXISTS ext_bad_extension_runs (
                                id TEXT PRIMARY KEY,
                                projectId TEXT,
                                FOREIGN KEY(projectId) REFERENCES projects(id)
                            )`
                        ]
                    }
                ]
            }),
        (error) =>
            error instanceof ExtensionMigrationError
            && error.message.includes('protected host table "projects"')
    );
});

test('the example extension links back to host entities through id columns instead of host schema references', () => {
    const migrationSql = semanticForgeServerExtension.migrations[0]?.statements[0] ?? '';

    assert.match(migrationSql, /\bprojectId\b/);
    assert.match(migrationSql, /\bitemId\b/);
    assert.match(migrationSql, /\buserId\b/);
    assert.match(migrationSql, /\bsourceRevisionId\b/);
    assert.doesNotMatch(migrationSql, /\bREFERENCES\s+(users|projects|items|revisions)\b/i);
});
