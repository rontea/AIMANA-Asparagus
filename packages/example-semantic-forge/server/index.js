import { randomUUID } from 'node:crypto';
import {
    defineServerApiRoute,
    defineServerExtensionManifest,
    SERVER_EXTENSION_ACCESS_LEVEL,
    SERVER_EXTENSION_BRIDGE_ACCESS,
    SERVER_EXTENSION_BRIDGE_RESOURCE
} from '@aimana/extension-sdk/server';

const RUN_COLUMNS = `id, projectId, itemId, userId, sourceRevisionId, status, promptText, outputSummary, createdAt, updatedAt`;

const asOptionalString = (value) => {
    const normalizedValue = String(value || '').trim();
    return normalizedValue ? normalizedValue : null;
};

const semanticForgeServerExtension = defineServerExtensionManifest({
    id: 'semantic-forge',
    version: '0.1.0',
    apiRoutes: [
        defineServerApiRoute({
            id: 'semantic-forge-list-runs',
            method: 'get',
            path: 'runs',
            authLevel: SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
            bridge: [
                {
                    resource: SERVER_EXTENSION_BRIDGE_RESOURCE.PROJECTS,
                    access: SERVER_EXTENSION_BRIDGE_ACCESS.READ
                },
                {
                    resource: SERVER_EXTENSION_BRIDGE_RESOURCE.ITEMS,
                    access: SERVER_EXTENSION_BRIDGE_ACCESS.READ
                }
            ],
            handler: async ({ query, user, bridge, storage }) => {
                const projectId = asOptionalString(query?.projectId);
                const itemId = asOptionalString(query?.itemId);
                const conditions = [];
                const params = [];

                if (projectId) {
                    await bridge.projects?.requireAccess(projectId);
                    conditions.push('projectId = ?');
                    params.push(projectId);
                }

                if (itemId) {
                    const item = await bridge.items?.requireAccess(itemId);
                    conditions.push('itemId = ?');
                    params.push(item.id);
                }

                if (!projectId && !itemId && user?.id !== 'admin-root' && user?.role !== 'admin') {
                    conditions.push('userId = ?');
                    params.push(user.id);
                }

                const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
                const runs = await storage.all(
                    `SELECT ${RUN_COLUMNS}
                     FROM ext_semantic_forge_runs
                     ${whereClause}
                     ORDER BY createdAt DESC
                     LIMIT 100`,
                    params
                );

                return {
                    body: { runs }
                };
            }
        }),
        defineServerApiRoute({
            id: 'semantic-forge-create-run',
            method: 'post',
            path: 'runs',
            authLevel: SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
            bridge: [
                {
                    resource: SERVER_EXTENSION_BRIDGE_RESOURCE.PROJECTS,
                    access: SERVER_EXTENSION_BRIDGE_ACCESS.READ
                },
                {
                    resource: SERVER_EXTENSION_BRIDGE_RESOURCE.ITEMS,
                    access: SERVER_EXTENSION_BRIDGE_ACCESS.READ
                }
            ],
            handler: async ({ body, user, bridge, storage, fail, log }) => {
                const requestedProjectId = asOptionalString(body?.projectId);
                const itemId = asOptionalString(body?.itemId);
                const sourceRevisionId = asOptionalString(body?.sourceRevisionId);
                const promptText = asOptionalString(body?.promptText);

                if (!requestedProjectId && !itemId) {
                    throw fail(400, 'Semantic Forge runs require either projectId or itemId.', 'missing_run_target');
                }

                const item = itemId ? await bridge.items?.requireAccess(itemId) : null;
                const projectId = item?.projectId || requestedProjectId;

                if (!projectId) {
                    throw fail(400, 'Semantic Forge could not resolve a projectId for this run.', 'missing_project_id');
                }

                await bridge.projects?.requireAccess(projectId);

                const now = Date.now();
                const run = {
                    id: randomUUID(),
                    projectId,
                    itemId,
                    userId: user.id,
                    sourceRevisionId,
                    status: 'queued',
                    promptText,
                    outputSummary: null,
                    createdAt: now,
                    updatedAt: now
                };

                await storage.run(
                    `INSERT INTO ext_semantic_forge_runs
                     (id, projectId, itemId, userId, sourceRevisionId, status, promptText, outputSummary, createdAt, updatedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        run.id,
                        run.projectId,
                        run.itemId,
                        run.userId,
                        run.sourceRevisionId,
                        run.status,
                        run.promptText,
                        run.outputSummary,
                        run.createdAt,
                        run.updatedAt
                    ]
                );

                await log('INFO', 'Queued Semantic Forge run.', {
                    runId: run.id,
                    projectId: run.projectId,
                    itemId: run.itemId
                });

                return {
                    status: 201,
                    body: { run }
                };
            }
        })
    ],
    migrations: [
        {
            version: 1,
            name: '001_create_ext_semantic_forge_runs',
            description: 'Creates extension-owned run tracking tables under the ext_semantic_forge_* namespace.',
            statements: [
                `CREATE TABLE IF NOT EXISTS ext_semantic_forge_runs (
                    id TEXT PRIMARY KEY,
                    projectId TEXT,
                    itemId TEXT,
                    userId TEXT,
                    sourceRevisionId TEXT,
                    status TEXT NOT NULL DEFAULT 'queued',
                    promptText TEXT,
                    outputSummary TEXT,
                    createdAt INTEGER NOT NULL,
                    updatedAt INTEGER NOT NULL
                )`,
                `CREATE INDEX IF NOT EXISTS ext_semantic_forge_runs_project_id
                 ON ext_semantic_forge_runs (projectId, createdAt DESC)`,
                `CREATE INDEX IF NOT EXISTS ext_semantic_forge_runs_item_id
                 ON ext_semantic_forge_runs (itemId, createdAt DESC)`,
                `CREATE INDEX IF NOT EXISTS ext_semantic_forge_runs_user_id
                 ON ext_semantic_forge_runs (userId, createdAt DESC)`
            ]
        }
    ]
});

export default semanticForgeServerExtension;
export { semanticForgeServerExtension };
