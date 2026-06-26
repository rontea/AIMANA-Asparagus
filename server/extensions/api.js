import express from 'express';
import {
    SERVER_EXTENSION_ACCESS_LEVEL,
    SERVER_EXTENSION_BRIDGE_ACCESS,
    SERVER_EXTENSION_BRIDGE_RESOURCE
} from '@aimana/extension-sdk/server';
import { dbGet } from '../db/connection.js';
import { createErrorReport, logSystemEvent } from '../db/logger.js';
import { canAccessItem, canAccessProject } from '../utils/access.js';
import { extensionServerHostConfig } from './hostConfig.js';
import { createExtensionStorage } from './storage.js';

const ACCESS_LEVEL_PRIORITY = {
    [SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED]: 0,
    [SERVER_EXTENSION_ACCESS_LEVEL.ADMIN]: 1,
    [SERVER_EXTENSION_ACCESS_LEVEL.SUPER_ADMIN]: 2
};
const ALLOWED_HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const KNOWN_BRIDGE_RESOURCES = new Set(Object.values(SERVER_EXTENSION_BRIDGE_RESOURCE));
const KNOWN_BRIDGE_ACCESS_VALUES = new Set(Object.values(SERVER_EXTENSION_BRIDGE_ACCESS));

export class ExtensionServerApiRegistrationError extends Error {
    constructor(message, context = {}) {
        super(message);
        this.name = 'ExtensionServerApiRegistrationError';
        this.context = context;
    }
}

export class ExtensionRequestError extends Error {
    constructor(status, message, code = 'extension_request_error', details = null) {
        super(message);
        this.name = 'ExtensionRequestError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const normalizeRoutePath = (routePath) => String(routePath || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
const isAdminUser = (user) => user?.role === 'admin' || user?.id === 'admin-root';
const hasRequiredAccessLevel = (requiredAccessLevel, user) => {
    const resolvedAccessLevel = user?.id === 'admin-root'
        ? SERVER_EXTENSION_ACCESS_LEVEL.SUPER_ADMIN
        : user?.role === 'admin'
            ? SERVER_EXTENSION_ACCESS_LEVEL.ADMIN
            : user?.id
                ? SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED
                : null;

    if (!resolvedAccessLevel) {
        return false;
    }

    return ACCESS_LEVEL_PRIORITY[resolvedAccessLevel] >= ACCESS_LEVEL_PRIORITY[requiredAccessLevel];
};

const buildStructuredLogPrefix = (extensionId, ownerType, ownerId) =>
    `[extension:${extensionId}][${ownerType}:${ownerId}]`;

const createRouteLogger = (extensionId, routeId, userId, logEvent = logSystemEvent) => async (level, message, context = null) => {
    const contextSuffix = context ? ` ${JSON.stringify(context)}` : '';
    await logEvent(level, 'EXTENSION_API', `${buildStructuredLogPrefix(extensionId, 'route', routeId)} ${message}${contextSuffix}`, userId || 'system');
};

const createRequestError = (status, message, code = 'extension_request_error', details = null) =>
    new ExtensionRequestError(status, message, code, details);

const validateBridgeScopes = (manifest, ownerType, ownerId, authLevel, bridgeScopes) => {
    const seenScopes = new Set();

    for (const bridgeScope of bridgeScopes) {
        if (!KNOWN_BRIDGE_RESOURCES.has(bridgeScope?.resource)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" ${ownerType} "${ownerId}" declares unsupported bridge resource "${bridgeScope?.resource}".`,
                { extensionId: manifest.id, ownerType, ownerId, bridgeScope }
            );
        }

        if (!KNOWN_BRIDGE_ACCESS_VALUES.has(bridgeScope?.access)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" ${ownerType} "${ownerId}" declares unsupported bridge access "${bridgeScope?.access}".`,
                { extensionId: manifest.id, ownerType, ownerId, bridgeScope }
            );
        }

        const scopeKey = `${bridgeScope.resource}:${bridgeScope.access}`;
        if (seenScopes.has(scopeKey)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" ${ownerType} "${ownerId}" reuses bridge scope "${scopeKey}".`,
                { extensionId: manifest.id, ownerType, ownerId, bridgeScope }
            );
        }
        seenScopes.add(scopeKey);

        const requiresAdmin = bridgeScope.resource === SERVER_EXTENSION_BRIDGE_RESOURCE.USERS
            || bridgeScope.resource === SERVER_EXTENSION_BRIDGE_RESOURCE.SETTINGS;
        if (requiresAdmin && authLevel === SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" ${ownerType} "${ownerId}" must require admin access before reading host ${bridgeScope.resource}.`,
                { extensionId: manifest.id, ownerType, ownerId, authLevel, bridgeScope }
            );
        }
    }
};

export const validateExtensionServerApiManifest = (manifest) => {
    if (!manifest || typeof manifest !== 'object') {
        throw new ExtensionServerApiRegistrationError('Invalid extension server API manifest payload.');
    }

    if (!manifest.id || typeof manifest.id !== 'string') {
        throw new ExtensionServerApiRegistrationError('Extension server API manifests must define a string id.', { manifest });
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
        throw new ExtensionServerApiRegistrationError(`Extension "${manifest.id}" must define a string version.`, { extensionId: manifest.id });
    }

    const apiRoutes = Array.isArray(manifest.apiRoutes) ? manifest.apiRoutes : [];
    const backgroundJobs = Array.isArray(manifest.backgroundJobs) ? manifest.backgroundJobs : [];
    const seenRouteIds = new Set();
    const seenRouteMethodsAndPaths = new Set();
    const seenJobIds = new Set();

    const normalizedApiRoutes = apiRoutes.map((route) => {
        const routeId = String(route?.id || '').trim();
        const method = String(route?.method || 'get').trim().toLowerCase();
        const path = normalizeRoutePath(route?.path);
        const authLevel = route?.authLevel || SERVER_EXTENSION_ACCESS_LEVEL.AUTHENTICATED;
        const bridge = Array.isArray(route?.bridge) ? route.bridge : [];

        if (!routeId) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" defines an API route without an id.`,
                { extensionId: manifest.id, route }
            );
        }

        if (seenRouteIds.has(routeId)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" reuses API route id "${routeId}".`,
                { extensionId: manifest.id, routeId }
            );
        }
        seenRouteIds.add(routeId);

        if (!ALLOWED_HTTP_METHODS.has(method)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" API route "${routeId}" uses unsupported HTTP method "${method}".`,
                { extensionId: manifest.id, routeId, method }
            );
        }

        if (!path) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" API route "${routeId}" must define a relative path.`,
                { extensionId: manifest.id, routeId }
            );
        }

        if (String(route?.path || '').startsWith('/')) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" API route "${routeId}" must not start with "/".`,
                { extensionId: manifest.id, routeId, path: route.path }
            );
        }

        if (!(authLevel in ACCESS_LEVEL_PRIORITY)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" API route "${routeId}" uses unsupported authLevel "${authLevel}".`,
                { extensionId: manifest.id, routeId, authLevel }
            );
        }

        if (typeof route?.handler !== 'function') {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" API route "${routeId}" must define a handler(context).`,
                { extensionId: manifest.id, routeId }
            );
        }

        const routeKey = `${method}:${path}`;
        if (seenRouteMethodsAndPaths.has(routeKey)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" reuses API route "${routeKey}".`,
                { extensionId: manifest.id, routeId, routeKey }
            );
        }
        seenRouteMethodsAndPaths.add(routeKey);

        validateBridgeScopes(manifest, 'route', routeId, authLevel, bridge);

        return {
            ...route,
            id: routeId,
            method,
            path,
            authLevel,
            bridge
        };
    });

    const normalizedBackgroundJobs = backgroundJobs.map((job) => {
        const jobId = String(job?.id || '').trim();
        const authLevel = job?.authLevel || SERVER_EXTENSION_ACCESS_LEVEL.ADMIN;
        const bridge = Array.isArray(job?.bridge) ? job.bridge : [];

        if (!jobId) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" defines a background job without an id.`,
                { extensionId: manifest.id, job }
            );
        }

        if (seenJobIds.has(jobId)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" reuses background job id "${jobId}".`,
                { extensionId: manifest.id, jobId }
            );
        }
        seenJobIds.add(jobId);

        if (!(authLevel in ACCESS_LEVEL_PRIORITY)) {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" background job "${jobId}" uses unsupported authLevel "${authLevel}".`,
                { extensionId: manifest.id, jobId, authLevel }
            );
        }

        validateBridgeScopes(manifest, 'background job', jobId, authLevel, bridge);

        if (job.handler !== undefined && typeof job.handler !== 'function') {
            throw new ExtensionServerApiRegistrationError(
                `Extension "${manifest.id}" background job "${jobId}" must define handler(context) when provided.`,
                { extensionId: manifest.id, jobId }
            );
        }

        return {
            ...job,
            id: jobId,
            authLevel,
            bridge
        };
    });

    return {
        ...manifest,
        apiRoutes: normalizedApiRoutes,
        backgroundJobs: normalizedBackgroundJobs
    };
};

const createProjectBridge = (user) => ({
    async getById(projectId) {
        if (!await canAccessProject(projectId, user)) {
            return null;
        }

        return dbGet(
            `SELECT id, name, description, storageType, projectType, createdAt, updatedAt, color, isArchived, isPinned, pinnedOrder,
                    driveFolderId, ownerId, ownerName, defaultEngine, isSystem
             FROM projects
             WHERE id = ?
             LIMIT 1`,
            [projectId]
        );
    },
    async requireAccess(projectId) {
        const project = await this.getById(projectId);
        if (!project) {
            throw createRequestError(403, 'Project access required.', 'project_access_denied', { projectId });
        }
        return project;
    }
});

const createItemBridge = (user) => ({
    async getById(itemId) {
        if (!await canAccessItem(itemId, user)) {
            return null;
        }

        return dbGet(
            `SELECT id, projectId, currentRevisionId, isArchived, isPinned, createdAt, updatedAt
             FROM items
             WHERE id = ?
             LIMIT 1`,
            [itemId]
        );
    },
    async requireAccess(itemId) {
        const item = await this.getById(itemId);
        if (!item) {
            throw createRequestError(403, 'Item access required.', 'item_access_denied', { itemId });
        }
        return item;
    }
});

const createUserBridge = (user) => ({
    async getById(userId) {
        if (!isAdminUser(user)) {
            throw createRequestError(403, 'Admin privileges required to read host users.', 'admin_required');
        }

        return dbGet(
            `SELECT id, email, name, avatar, role, provider, isBlocked, lastLogin, createdAt
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );
    }
});

const createSettingsBridge = (user) => ({
    async getAppConfig() {
        if (!isAdminUser(user)) {
            throw createRequestError(403, 'Admin privileges required to read host settings.', 'admin_required');
        }

        const row = await dbGet(`SELECT value FROM settings WHERE key = 'app_config' LIMIT 1`);
        if (!row?.value) {
            return {};
        }

        try {
            return JSON.parse(row.value);
        } catch {
            return {};
        }
    }
});

const createExtensionRouteBridge = (route, user) => {
    const resources = new Set(route.bridge.map((bridgeScope) => bridgeScope.resource));

    return {
        items: resources.has(SERVER_EXTENSION_BRIDGE_RESOURCE.ITEMS) ? createItemBridge(user) : undefined,
        projects: resources.has(SERVER_EXTENSION_BRIDGE_RESOURCE.PROJECTS) ? createProjectBridge(user) : undefined,
        users: resources.has(SERVER_EXTENSION_BRIDGE_RESOURCE.USERS) ? createUserBridge(user) : undefined,
        settings: resources.has(SERVER_EXTENSION_BRIDGE_RESOURCE.SETTINGS) ? createSettingsBridge(user) : undefined
    };
};

export const buildExtensionApiRouteMountPath = (extensionId, routePath) => {
    const normalizedPath = normalizeRoutePath(routePath);
    return normalizedPath ? `/${extensionId}/${normalizedPath}` : `/${extensionId}`;
};

export const loadExtensionServerServices = (hostConfig = extensionServerHostConfig) => {
    const enabledInstalledExtensions = hostConfig.installedExtensions.filter((entry) => entry.enabled);
    const manifestEntries = enabledInstalledExtensions.flatMap((entry) =>
        entry.manifests.map((manifest) => ({
            packageName: entry.packageName,
            manifest: validateExtensionServerApiManifest(manifest)
        }))
    );
    const manifests = manifestEntries.map((entry) => entry.manifest);
    const apiRoutes = manifestEntries.flatMap(({ packageName, manifest }) =>
        manifest.apiRoutes.map((route) => ({
            extensionId: manifest.id,
            extensionVersion: manifest.version,
            packageName,
            routeId: route.id,
            method: route.method,
            path: route.path,
            authLevel: route.authLevel,
            mountPath: buildExtensionApiRouteMountPath(manifest.id, route.path)
        }))
    );
    const backgroundJobs = manifestEntries.flatMap(({ packageName, manifest }) =>
        manifest.backgroundJobs.map((job) => ({
            extensionId: manifest.id,
            extensionVersion: manifest.version,
            packageName,
            jobId: job.id,
            authLevel: job.authLevel,
            bridge: job.bridge
        }))
    );

    return {
        manifests,
        apiRoutes,
        backgroundJobs
    };
};

export const createExtensionApiRouter = (
    hostConfig = extensionServerHostConfig,
    {
        logEvent = logSystemEvent,
        reportError = createErrorReport
    } = {}
) => {
    const router = express.Router();
    const { manifests } = loadExtensionServerServices(hostConfig);

    manifests.forEach((manifest) => {
        manifest.apiRoutes.forEach((route) => {
            const mountPath = buildExtensionApiRouteMountPath(manifest.id, route.path);

            router[route.method](mountPath, async (req, res) => {
                const startedAt = Date.now();
                const routeLogger = createRouteLogger(manifest.id, route.id, req.user?.id, logEvent);

                try {
                    if (!hasRequiredAccessLevel(route.authLevel, req.user)) {
                        throw createRequestError(403, 'Insufficient privileges for this extension endpoint.', 'extension_access_denied', {
                            requiredAccessLevel: route.authLevel
                        });
                    }

                    const response = await route.handler({
                        extension: { id: manifest.id, version: manifest.version },
                        route: {
                            id: route.id,
                            method: route.method,
                            path: route.path,
                            authLevel: route.authLevel,
                            mountPath
                        },
                        user: req.user,
                        params: req.params,
                        query: req.query,
                        body: req.body,
                        request: {
                            method: req.method,
                            path: req.path,
                            originalUrl: req.originalUrl,
                            ip: req.ip
                        },
                        bridge: createExtensionRouteBridge(route, req.user),
                        storage: createExtensionStorage(manifest.id),
                        log: routeLogger,
                        fail: createRequestError
                    });

                    const status = Number.isInteger(response?.status) ? response.status : 200;
                    if (response?.headers && typeof response.headers === 'object') {
                        Object.entries(response.headers).forEach(([headerName, headerValue]) => {
                            res.setHeader(headerName, headerValue);
                        });
                    }

                    await routeLogger('INFO', `Completed ${req.method} ${req.originalUrl}`, {
                        status,
                        durationMs: Date.now() - startedAt
                    });

                    if (status === 204 || response?.body === undefined) {
                        res.status(status).end();
                        return;
                    }

                    res.status(status).json(response.body);
                } catch (error) {
                    const status = error instanceof ExtensionRequestError ? error.status : 500;
                    const code = error instanceof ExtensionRequestError ? error.code : 'extension_api_failure';
                    const message = error instanceof ExtensionRequestError
                        ? error.message
                        : 'Extension API request failed.';

                    await routeLogger(status >= 500 ? 'ERROR' : 'WARN', message, {
                        status,
                        code,
                        durationMs: Date.now() - startedAt
                    });

                    if (!(error instanceof ExtensionRequestError)) {
                        await reportError({
                            level: 'ERROR',
                            module: 'EXTENSION_API',
                            source: 'server',
                            errorName: error?.name || 'ExtensionApiError',
                            message: `${buildStructuredLogPrefix(manifest.id, 'route', route.id)} ${error?.message || error}`,
                            stack: error?.stack || '',
                            route: `${req.method} ${req.originalUrl}`,
                            userId: req.user?.id || 'system',
                            context: {
                                extensionId: manifest.id,
                                extensionVersion: manifest.version,
                                routeId: route.id,
                                method: route.method,
                                path: route.path
                            }
                        });
                    }

                    res.status(status).json({
                        error: message,
                        code,
                        details: error instanceof ExtensionRequestError ? error.details : undefined
                    });
                }
            });
        });
    });

    return router;
};
