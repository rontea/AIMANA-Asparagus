import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDeltaManifest,
    CORE_BACKUP_TABLES,
    normalizeBackupState,
    upsertDumpSetting
} from '../routes/admin.js';

test('backup manifest helpers include the completed backup cursor in incremental settings', () => {
    const since = 1000;
    const until = 2000;
    const completedState = normalizeBackupState(
        {
            lastSuccessfulBackupAt: 900,
            lastBackupType: 'full',
            lastBackupId: 'AIMANA_FULL_BACKUP_old.zip',
            updatedAt: 900
        },
        {
            lastSuccessfulBackupAt: until,
            lastBackupType: 'incremental',
            lastBackupId: 'AIMANA_INCREMENTAL_BACKUP_new.zip'
        },
        until
    );

    const dump = upsertDumpSetting(
        {
            version: '0.16.99-dev',
            data: {
                settings: [
                    {
                        key: 'app_update_state',
                        value: JSON.stringify({ latestVersion: '0.16.99-dev', updatedAt: 1500 }),
                        updatedAt: 1500
                    },
                    {
                        key: 'backup_state',
                        value: JSON.stringify({ lastSuccessfulBackupAt: 900, updatedAt: 900 }),
                        updatedAt: 900
                    }
                ]
            }
        },
        'backup_state',
        completedState,
        until
    );

    const delta = buildDeltaManifest(dump, since, until);
    const settings = delta.data.settings;

    assert.equal(settings.length, 2);
    const backupRow = settings.find((row) => row.key === 'backup_state');
    assert.ok(backupRow);
    assert.equal(backupRow.updatedAt, until);
    assert.deepEqual(JSON.parse(backupRow.value), completedState);
});

test('core backup table list covers host-owned application tables by real table name', () => {
    const expectedTables = [
        'users',
        'auth_sessions',
        'projects',
        'custom_project_types',
        'project_members',
        'project_collections',
        'items',
        'revisions',
        'item_references',
        'reference_assets',
        'chat_memory',
        'chat_sessions',
        'chat_session_attachments',
        'chat_items',
        'chat_item_attachments',
        'rag_chunks',
        'lab_workspace_state',
        'custom_engines',
        'bulk_presets',
        'neural_variable_registry_lists',
        'prompt_manager_drafts',
        'active_variable_registry_entries',
        'archived_variable_registry_entries',
        'bulk_studio_state',
        'extension_migrations',
        'extension_migration_failures',
        'system_logs',
        'error_reports',
        'settings'
    ];

    assert.deepEqual(CORE_BACKUP_TABLES, expectedTables);
    assert.equal(CORE_BACKUP_TABLES.includes('engines'), false);
    assert.equal(CORE_BACKUP_TABLES.includes('members'), false);
    assert.equal(CORE_BACKUP_TABLES.includes('intents'), false);
});

test('incremental manifest captures updated AIMA Chat rows', () => {
    const since = 1000;
    const until = 2000;
    const delta = buildDeltaManifest({
        version: '0.16.99-dev',
        data: {
            chat_memory: [
                { id: 'mem-old', sessionId: 'chat-old', updatedAt: 900 },
                { id: 'mem-new', sessionId: 'chat-new', updatedAt: 1500 }
            ],
            chat_sessions: [
                { userId: 'user-old', sessionsJson: '[]', updatedAt: 950 },
                { userId: 'user-new', sessionsJson: '[{"id":"chat-new"}]', updatedAt: 1600 }
            ],
            chat_session_attachments: [
                { id: 'session-audio-old', fileUrl: '/storage/uploads/chat_media/user/audio/old.mp3', updatedAt: 999 },
                { id: 'session-audio-new', fileUrl: '/storage/uploads/chat_media/user/audio/new.mp3', updatedAt: 1700 }
            ],
            chat_items: [
                { id: 'item-old', updatedAt: 900 },
                { id: 'item-new', updatedAt: 1800 }
            ],
            chat_item_attachments: [
                { id: 'capture-ref-old', chatItemId: 'item-old', fileUrl: '/storage/uploads/Neural_Reference/old.png', createdAt: 1000 },
                { id: 'capture-ref-new', chatItemId: 'item-new', fileUrl: '/storage/uploads/Neural_Reference/new.png', createdAt: 1900 }
            ]
        }
    }, since, until);

    assert.deepEqual(delta.data.chat_memory.map((row) => row.id), ['mem-new']);
    assert.deepEqual(delta.data.chat_sessions.map((row) => row.userId), ['user-new']);
    assert.deepEqual(delta.data.chat_session_attachments.map((row) => row.id), ['session-audio-new']);
    assert.deepEqual(delta.data.chat_items.map((row) => row.id), ['item-new']);
    assert.deepEqual(delta.data.chat_item_attachments.map((row) => row.id), ['capture-ref-new']);
});

test('incremental manifest captures updated RAG index rows', () => {
    const delta = buildDeltaManifest({
        version: '0.16.99-dev',
        data: {
            rag_chunks: [
                { id: 'rag-old', sourceType: 'projects', updatedAt: 999 },
                { id: 'rag-new', sourceType: 'chat-items', updatedAt: 1500 }
            ]
        }
    }, 1000, 2000);

    assert.deepEqual(delta.data.rag_chunks.map((row) => row.id), ['rag-new']);
});
