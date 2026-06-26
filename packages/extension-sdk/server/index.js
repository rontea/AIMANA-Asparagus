export const SERVER_EXTENSION_ACCESS_LEVEL = {
    AUTHENTICATED: 'authenticated',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super-admin'
};

export const SERVER_EXTENSION_BRIDGE_RESOURCE = {
    ITEMS: 'items',
    PROJECTS: 'projects',
    USERS: 'users',
    SETTINGS: 'settings'
};

export const SERVER_EXTENSION_BRIDGE_ACCESS = {
    READ: 'read'
};

const normalizeRoutePath = (path) => String(path || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');

export const defineServerApiRoute = (route) => ({
    ...route,
    method: String(route?.method || 'get').trim().toLowerCase(),
    path: normalizeRoutePath(route?.path),
    authLevel: route?.authLevel || SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
    bridge: Array.isArray(route?.bridge) ? route.bridge : []
});

export const defineServerBackgroundJob = (job) => ({
    ...job,
    bridge: Array.isArray(job?.bridge) ? job.bridge : []
});

export const defineServerExtensionManifest = (manifest) => ({
    ...manifest,
    apiRoutes: Array.isArray(manifest?.apiRoutes) ? manifest.apiRoutes.map(defineServerApiRoute) : [],
    backgroundJobs: Array.isArray(manifest?.backgroundJobs) ? manifest.backgroundJobs.map(defineServerBackgroundJob) : []
});
