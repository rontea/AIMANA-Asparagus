import {
    defineServerApiRoute,
    defineServerExtensionManifest,
    SERVER_EXTENSION_ACCESS_LEVEL,
    SERVER_EXTENSION_BRIDGE_ACCESS,
    SERVER_EXTENSION_BRIDGE_RESOURCE
} from '@aimana/extension-sdk/server';

const asOptionalString = (value) => {
    const normalizedValue = String(value || '').trim();
    return normalizedValue ? normalizedValue : null;
};

const yourExtensionServer = defineServerExtensionManifest({
    id: 'your-extension',
    version: '0.1.0',
    apiRoutes: [
        defineServerApiRoute({
            id: 'your-extension-summary',
            method: 'get',
            path: 'summary',
            authLevel: SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
            bridge: [
                {
                    resource: SERVER_EXTENSION_BRIDGE_RESOURCE.PROJECTS,
                    access: SERVER_EXTENSION_BRIDGE_ACCESS.READ
                }
            ],
            handler: async ({ query, bridge, storage }) => {
                const projectId = asOptionalString(query?.projectId);

                if (projectId) {
                    await bridge.projects?.requireAccess(projectId);
                }

                const summary = await storage.get(
                    `SELECT COUNT(*) AS totalRuns
                     FROM ext_your_extension_runs`
                );

                return {
                    body: {
                        projectId,
                        totalRuns: Number(summary?.totalRuns || 0)
                    }
                };
            }
        })
    ],
    migrations: [
        {
            version: 1,
            name: '001_create_ext_your_extension_runs',
            description: 'Creates the extension-owned starter table.',
            statements: [
                `CREATE TABLE IF NOT EXISTS ext_your_extension_runs (
                    id TEXT PRIMARY KEY,
                    projectId TEXT,
                    status TEXT NOT NULL DEFAULT 'queued',
                    createdAt INTEGER NOT NULL,
                    updatedAt INTEGER NOT NULL
                )`,
                `CREATE INDEX IF NOT EXISTS ext_your_extension_runs_project_id
                 ON ext_your_extension_runs (projectId, createdAt DESC)`
            ]
        }
    ]
});

export default yourExtensionServer;
export { yourExtensionServer };
