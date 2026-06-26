import { dbAll, dbGet, dbRun, withTransaction } from './connection.js';
import { logSystemEvent } from './logger.js';

export const INTEGRITY_CLEANUP_STEPS = [
    {
        key: 'project_members_missing_project',
        mode: 'delete',
        table: 'project_members',
        sql: `DELETE FROM project_members
              WHERE NOT EXISTS (
                  SELECT 1 FROM projects
                  WHERE projects.id = project_members.projectId
              )`
    },
    {
        key: 'project_members_missing_user',
        mode: 'delete',
        table: 'project_members',
        sql: `DELETE FROM project_members
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = project_members.userId
              )`
    },
    {
        key: 'chat_item_attachments_missing_chat_item',
        mode: 'delete',
        table: 'chat_item_attachments',
        sql: `DELETE FROM chat_item_attachments
              WHERE NOT EXISTS (
                  SELECT 1 FROM chat_items
                  WHERE chat_items.id = chat_item_attachments.chatItemId
              )`
    },
    {
        key: 'chat_item_attachments_missing_reference_item',
        mode: 'update',
        table: 'chat_item_attachments',
        sql: `UPDATE chat_item_attachments
              SET referenceItemId = NULL
              WHERE referenceItemId IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM items
                    WHERE items.id = chat_item_attachments.referenceItemId
                )`
    },
    {
        key: 'item_references_missing_source',
        mode: 'delete',
        table: 'item_references',
        sql: `DELETE FROM item_references
              WHERE NOT EXISTS (
                  SELECT 1 FROM items
                  WHERE items.id = item_references.sourceItemId
              )`
    },
    {
        key: 'item_references_missing_target',
        mode: 'delete',
        table: 'item_references',
        sql: `DELETE FROM item_references
              WHERE NOT EXISTS (
                  SELECT 1 FROM items
                  WHERE items.id = item_references.targetItemId
              )`
    },
    {
        key: 'reference_assets_missing_item',
        mode: 'delete',
        table: 'reference_assets',
        sql: `DELETE FROM reference_assets
              WHERE NOT EXISTS (
                  SELECT 1 FROM items
                  WHERE items.id = reference_assets.itemId
              )`
    },
    {
        key: 'reference_assets_missing_project',
        mode: 'delete',
        table: 'reference_assets',
        sql: `DELETE FROM reference_assets
              WHERE NOT EXISTS (
                  SELECT 1 FROM projects
                  WHERE projects.id = reference_assets.projectId
              )`
    },
    {
        key: 'reference_assets_stale_file_url',
        mode: 'update',
        table: 'reference_assets',
        sql: `UPDATE reference_assets
              SET fileUrl = (
                      SELECT revisions.fileUrl
                      FROM items
                      JOIN revisions ON revisions.id = items.currentRevisionId
                      WHERE items.id = reference_assets.itemId
                  ),
                  mimeType = COALESCE((
                      SELECT revisions.mimeType
                      FROM items
                      JOIN revisions ON revisions.id = items.currentRevisionId
                      WHERE items.id = reference_assets.itemId
                  ), mimeType),
                  size = COALESCE((
                      SELECT revisions.size
                      FROM items
                      JOIN revisions ON revisions.id = items.currentRevisionId
                      WHERE items.id = reference_assets.itemId
                  ), size),
                  updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000
              WHERE EXISTS (
                  SELECT 1
                  FROM items
                  JOIN revisions ON revisions.id = items.currentRevisionId
                  WHERE items.id = reference_assets.itemId
                    AND revisions.fileUrl IS NOT NULL
                    AND revisions.fileUrl != reference_assets.fileUrl
              )`
    },
    {
        key: 'revisions_missing_item',
        mode: 'delete',
        table: 'revisions',
        sql: `DELETE FROM revisions
              WHERE NOT EXISTS (
                  SELECT 1 FROM items
                  WHERE items.id = revisions.itemId
              )`
    },
    {
        key: 'items_missing_project',
        mode: 'delete',
        table: 'items',
        sql: `DELETE FROM items
              WHERE NOT EXISTS (
                  SELECT 1 FROM projects
                  WHERE projects.id = items.projectId
              )`
    },
    {
        key: 'items_missing_current_revision',
        mode: 'update',
        table: 'items',
        sql: `UPDATE items
              SET currentRevisionId = NULL
              WHERE currentRevisionId IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM revisions
                    WHERE revisions.id = items.currentRevisionId
                )`
    },
    {
        key: 'auth_sessions_missing_user',
        mode: 'delete',
        table: 'auth_sessions',
        sql: `DELETE FROM auth_sessions
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = auth_sessions.userId
              )`
    },
    {
        key: 'chat_sessions_missing_user',
        mode: 'delete',
        table: 'chat_sessions',
        sql: `DELETE FROM chat_sessions
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = chat_sessions.userId
              )`
    },
    {
        key: 'chat_session_attachments_missing_user',
        mode: 'delete',
        table: 'chat_session_attachments',
        sql: `DELETE FROM chat_session_attachments
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = chat_session_attachments.userId
              )`
    },
    {
        key: 'bulk_presets_missing_user',
        mode: 'delete',
        table: 'bulk_presets',
        sql: `DELETE FROM bulk_presets
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = bulk_presets.userId
              )`
    },
    {
        key: 'prompt_manager_drafts_missing_user',
        mode: 'delete',
        table: 'prompt_manager_drafts',
        sql: `DELETE FROM prompt_manager_drafts
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = prompt_manager_drafts.userId
              )`
    },
    {
        key: 'active_variable_registry_entries_missing_user',
        mode: 'delete',
        table: 'active_variable_registry_entries',
        sql: `DELETE FROM active_variable_registry_entries
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = active_variable_registry_entries.userId
              )`
    },
    {
        key: 'archived_variable_registry_entries_missing_user',
        mode: 'delete',
        table: 'archived_variable_registry_entries',
        sql: `DELETE FROM archived_variable_registry_entries
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = archived_variable_registry_entries.userId
              )`
    },
    {
        key: 'neural_variable_registry_lists_missing_user',
        mode: 'delete',
        table: 'neural_variable_registry_lists',
        sql: `DELETE FROM neural_variable_registry_lists
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = neural_variable_registry_lists.userId
              )`
    },
    {
        key: 'bulk_studio_state_missing_user',
        mode: 'delete',
        table: 'bulk_studio_state',
        sql: `DELETE FROM bulk_studio_state
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = bulk_studio_state.userId
              )`
    },
    {
        key: 'lab_workspace_state_missing_user',
        mode: 'delete',
        table: 'lab_workspace_state',
        sql: `DELETE FROM lab_workspace_state
              WHERE NOT EXISTS (
                  SELECT 1 FROM users
                  WHERE users.id = lab_workspace_state.userId
              )`
    }
];

const countQuery = (table, predicateSql) => `
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE ${predicateSql}
`;

export const collectDatabaseIntegrityDiagnostics = async () => {
    const foreignKeysRow = await dbGet('PRAGMA foreign_keys');
    const integrityRows = await dbAll('PRAGMA integrity_check');

    const queries = [
        {
            key: 'project_members_missing_project',
            sql: countQuery('project_members', `NOT EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.projectId)`)
        },
        {
            key: 'project_members_missing_user',
            sql: countQuery('project_members', `NOT EXISTS (SELECT 1 FROM users WHERE users.id = project_members.userId)`)
        },
        {
            key: 'chat_item_attachments_missing_chat_item',
            sql: countQuery('chat_item_attachments', `NOT EXISTS (SELECT 1 FROM chat_items WHERE chat_items.id = chat_item_attachments.chatItemId)`)
        },
        {
            key: 'chat_item_attachments_missing_reference_item',
            sql: countQuery('chat_item_attachments', `referenceItemId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM items WHERE items.id = chat_item_attachments.referenceItemId)`)
        },
        {
            key: 'item_references_missing_source',
            sql: countQuery('item_references', `NOT EXISTS (SELECT 1 FROM items WHERE items.id = item_references.sourceItemId)`)
        },
        {
            key: 'item_references_missing_target',
            sql: countQuery('item_references', `NOT EXISTS (SELECT 1 FROM items WHERE items.id = item_references.targetItemId)`)
        },
        {
            key: 'reference_assets_missing_item',
            sql: countQuery('reference_assets', `NOT EXISTS (SELECT 1 FROM items WHERE items.id = reference_assets.itemId)`)
        },
        {
            key: 'reference_assets_missing_project',
            sql: countQuery('reference_assets', `NOT EXISTS (SELECT 1 FROM projects WHERE projects.id = reference_assets.projectId)`)
        },
        {
            key: 'reference_assets_stale_file_url',
            sql: countQuery(
                'reference_assets',
                `EXISTS (
                    SELECT 1
                    FROM items
                    JOIN revisions ON revisions.id = items.currentRevisionId
                    WHERE items.id = reference_assets.itemId
                      AND revisions.fileUrl IS NOT NULL
                      AND revisions.fileUrl != reference_assets.fileUrl
                )`
            )
        },
        {
            key: 'revisions_missing_item',
            sql: countQuery('revisions', `NOT EXISTS (SELECT 1 FROM items WHERE items.id = revisions.itemId)`)
        },
        {
            key: 'items_missing_project',
            sql: countQuery('items', `NOT EXISTS (SELECT 1 FROM projects WHERE projects.id = items.projectId)`)
        },
        {
            key: 'items_missing_current_revision',
            sql: countQuery('items', `currentRevisionId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM revisions WHERE revisions.id = items.currentRevisionId)`)
        }
    ];

    const counts = {};
    for (const query of queries) {
        const row = await dbGet(query.sql);
        counts[query.key] = Number(row?.count || 0);
    }

    return {
        foreignKeysEnabled: Number(foreignKeysRow?.foreign_keys || 0) === 1,
        integrityCheck: integrityRows.map((row) => row.integrity_check).filter(Boolean),
        counts
    };
};

export const cleanupDatabaseIntegrityIssues = async () => {
    const summary = {
        deleted: {},
        updated: {},
        totalDeleted: 0,
        totalUpdated: 0
    };

    await withTransaction(async () => {
        for (const step of INTEGRITY_CLEANUP_STEPS) {
            const result = await dbRun(step.sql);
            const changes = Number(result?.changes || 0);
            if (step.mode === 'update') {
                summary.updated[step.key] = changes;
                summary.totalUpdated += changes;
            } else {
                summary.deleted[step.key] = changes;
                summary.totalDeleted += changes;
            }
        }
    });

    if (summary.totalDeleted > 0 || summary.totalUpdated > 0) {
        await logSystemEvent(
            'WARN',
            'DB_INTEGRITY',
            `Database integrity cleanup removed ${summary.totalDeleted} orphaned row(s) and normalized ${summary.totalUpdated} row(s).`,
            'system'
        );
    } else {
        await logSystemEvent(
            'INFO',
            'DB_INTEGRITY',
            'Database integrity cleanup found no orphaned rows.',
            'system'
        );
    }

    return summary;
};
