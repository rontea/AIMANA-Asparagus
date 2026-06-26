import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export const HOST_EXTENSION_SDK_VERSION = '1.0.0';
export const EXTENSION_PACKAGE_PREFIX = '@aimana/extension-';

export const EXTENSION_ASSET_KIND = {
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    UNKNOWN: 'unknown'
} as const;

export type ExtensionAssetType = (typeof EXTENSION_ASSET_KIND)[keyof typeof EXTENSION_ASSET_KIND];
export type ExtensionStatus = 'ready' | 'planned';
export const EXTENSION_ACCESS_LEVEL = {
    AUTHENTICATED: 'authenticated',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super-admin'
} as const;
export const EXTENSION_CAPABILITY = {
    ROUTES: 'routes',
    SIDEBAR_LINKS: 'sidebar-links',
    HUB_CARDS: 'hub-cards',
    ASSET_LAUNCH_ACTIONS: 'asset-launch-actions',
    BACKGROUND_JOBS: 'background-jobs',
    API_ENDPOINTS: 'api-endpoints',
    DB_MIGRATIONS: 'db-migrations'
} as const;
export const EXTENSION_CAPABILITY_REGISTRATION_MODE = {
    HOST_MANAGED: 'host-managed',
    HOST_WRAPPER: 'host-wrapper'
} as const;
export const EXTENSION_BRIDGE_RESOURCE = {
    ITEMS: 'items',
    PROJECTS: 'projects',
    USERS: 'users',
    SETTINGS: 'settings'
} as const;
export const EXTENSION_BRIDGE_ACCESS = {
    READ: 'read'
} as const;

export type ExtensionAccessLevel = (typeof EXTENSION_ACCESS_LEVEL)[keyof typeof EXTENSION_ACCESS_LEVEL];
export type ExtensionCapabilityKey = (typeof EXTENSION_CAPABILITY)[keyof typeof EXTENSION_CAPABILITY];
export type ExtensionCapabilityRegistrationMode = (typeof EXTENSION_CAPABILITY_REGISTRATION_MODE)[keyof typeof EXTENSION_CAPABILITY_REGISTRATION_MODE];
export type ExtensionBridgeResource = (typeof EXTENSION_BRIDGE_RESOURCE)[keyof typeof EXTENSION_BRIDGE_RESOURCE];
export type ExtensionBridgeAccess = (typeof EXTENSION_BRIDGE_ACCESS)[keyof typeof EXTENSION_BRIDGE_ACCESS];

export interface ExtensionAccessSubject {
    id?: string | null;
    role?: string | null;
}

export interface ExtensionRouteDefinition {
    id: string;
    path: string;
    href: string;
    label: string;
    component: ComponentType;
    icon: LucideIcon;
    showInSidebar?: boolean;
}

export interface ExtensionRouteInput extends Omit<ExtensionRouteDefinition, 'href' | 'path'> {
    href?: string;
    path: string;
}

export interface ExtensionSidebarDefinition {
    id: string;
    href: string;
    label: string;
    icon: LucideIcon;
    routeId: string;
}

export interface ExtensionAssetLaunchDefinition {
    assetTypes: ExtensionAssetType[];
    buildAssetLaunchPath: (itemId: string) => string;
}

export interface ExtensionMigrationDefinition {
    version: number;
    name: string;
    checksum?: string;
    description?: string;
}

export interface ExtensionBridgeScopeDefinition {
    resource: ExtensionBridgeResource;
    access: ExtensionBridgeAccess;
}

export interface ExtensionCapabilityDefinition {
    key: ExtensionCapabilityKey;
    description?: string;
    registrationMode?: ExtensionCapabilityRegistrationMode;
    bridge?: ExtensionBridgeScopeDefinition[];
}

export interface ExtensionCapability extends Omit<ExtensionCapabilityDefinition, 'bridge' | 'registrationMode'> {
    registrationMode: ExtensionCapabilityRegistrationMode;
    bridge: ExtensionBridgeScopeDefinition[];
}

export interface ExtensionManifestInput {
    id: string;
    label: string;
    version: string;
    sdkVersion: string;
    description: string;
    icon: LucideIcon;
    colorClass: string;
    actionClassName: string;
    status: ExtensionStatus;
    statusLabel: string;
    tierLabel: string;
    accessLevel?: ExtensionAccessLevel;
    launchPath?: string;
    assetTypes?: ExtensionAssetType[];
    buildAssetLaunchPath?: (itemId: string) => string;
    routes: ExtensionRouteDefinition[];
    sidebar?: ExtensionSidebarDefinition[];
    migrations?: ExtensionMigrationDefinition[];
    capabilities?: ExtensionCapabilityDefinition[];
    requiredHostVersion?: string;
}

export interface ExtensionManifest extends Omit<ExtensionManifestInput, 'sidebar' | 'capabilities' | 'accessLevel'> {
    accessLevel: ExtensionAccessLevel;
    sidebar: ExtensionSidebarDefinition[];
    capabilities: ExtensionCapability[];
}

export interface AssetLaunchExtension {
    id: string;
    label: string;
    icon: LucideIcon;
    actionClassName: string;
    href: string;
}

export interface ExtensionManifestValidationIssue {
    code: string;
    message: string;
    extensionId?: string;
    routeId?: string;
}

export interface CreateExtensionRegistryOptions {
    hostVersion?: string;
    sdkVersion?: string;
}

export class ExtensionManifestValidationError extends Error {
    readonly issues: ExtensionManifestValidationIssue[];

    constructor(issues: ExtensionManifestValidationIssue[]) {
        super(formatValidationIssues(issues));
        this.name = 'ExtensionManifestValidationError';
        this.issues = issues;
    }
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/;
const ACCESS_LEVEL_PRIORITY: Record<ExtensionAccessLevel, number> = {
    [EXTENSION_ACCESS_LEVEL.AUTHENTICATED]: 0,
    [EXTENSION_ACCESS_LEVEL.ADMIN]: 1,
    [EXTENSION_ACCESS_LEVEL.SUPER_ADMIN]: 2
};
const KNOWN_CAPABILITY_KEYS = new Set<ExtensionCapabilityKey>(Object.values(EXTENSION_CAPABILITY));
const KNOWN_REGISTRATION_MODES = new Set<ExtensionCapabilityRegistrationMode>(Object.values(EXTENSION_CAPABILITY_REGISTRATION_MODE));
const KNOWN_BRIDGE_RESOURCES = new Set<ExtensionBridgeResource>(Object.values(EXTENSION_BRIDGE_RESOURCE));
const KNOWN_BRIDGE_ACCESS_VALUES = new Set<ExtensionBridgeAccess>(Object.values(EXTENSION_BRIDGE_ACCESS));
const SERVER_WRAPPED_CAPABILITY_KEYS = new Set<ExtensionCapabilityKey>([
    EXTENSION_CAPABILITY.BACKGROUND_JOBS,
    EXTENSION_CAPABILITY.API_ENDPOINTS
]);

const isNonEmptyString = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0;
const isValidAccessLevel = (value: string | undefined): value is ExtensionAccessLevel =>
    typeof value === 'string' && value in ACCESS_LEVEL_PRIORITY;
const isKnownCapabilityKey = (value: string): value is ExtensionCapabilityKey => KNOWN_CAPABILITY_KEYS.has(value as ExtensionCapabilityKey);
const isKnownRegistrationMode = (value: string): value is ExtensionCapabilityRegistrationMode =>
    KNOWN_REGISTRATION_MODES.has(value as ExtensionCapabilityRegistrationMode);
const isKnownBridgeResource = (value: string): value is ExtensionBridgeResource =>
    KNOWN_BRIDGE_RESOURCES.has(value as ExtensionBridgeResource);
const isKnownBridgeAccess = (value: string): value is ExtensionBridgeAccess =>
    KNOWN_BRIDGE_ACCESS_VALUES.has(value as ExtensionBridgeAccess);

const parseVersion = (value: string) => {
    const match = value.trim().match(VERSION_PATTERN);

    if (!match) {
        return null;
    }

    return match.slice(1, 4).map((part) => Number.parseInt(part, 10)) as [number, number, number];
};

const compareVersions = (left: string, right: string): number | null => {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);

    if (!leftParts || !rightParts) {
        return null;
    }

    for (let index = 0; index < 3; index += 1) {
        if (leftParts[index] > rightParts[index]) {
            return 1;
        }

        if (leftParts[index] < rightParts[index]) {
            return -1;
        }
    }

    return 0;
};

const normalizeRoutePath = (path: string) => path.replace(/^\/+/, '');

export const buildRouteHref = (path: string) => `/${normalizeRoutePath(path)}`;
export const getDefaultRegistrationModeForCapability = (
    capabilityKey: ExtensionCapabilityKey
): ExtensionCapabilityRegistrationMode =>
    SERVER_WRAPPED_CAPABILITY_KEYS.has(capabilityKey)
        ? EXTENSION_CAPABILITY_REGISTRATION_MODE.HOST_WRAPPER
        : EXTENSION_CAPABILITY_REGISTRATION_MODE.HOST_MANAGED;

export const getBridgeScopeMinimumAccessLevel = (
    resource: ExtensionBridgeResource
): ExtensionAccessLevel =>
    resource === EXTENSION_BRIDGE_RESOURCE.USERS || resource === EXTENSION_BRIDGE_RESOURCE.SETTINGS
        ? EXTENSION_ACCESS_LEVEL.ADMIN
        : EXTENSION_ACCESS_LEVEL.AUTHENTICATED;

export const isExtensionAccessAllowed = (
    requiredAccessLevel: ExtensionAccessLevel = EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
    subject?: ExtensionAccessSubject | null
): boolean => {
    const resolvedAccessLevel: ExtensionAccessLevel = subject?.id === 'admin-root'
        ? EXTENSION_ACCESS_LEVEL.SUPER_ADMIN
        : subject?.role === 'admin'
            ? EXTENSION_ACCESS_LEVEL.ADMIN
            : EXTENSION_ACCESS_LEVEL.AUTHENTICATED;

    return ACCESS_LEVEL_PRIORITY[resolvedAccessLevel] >= ACCESS_LEVEL_PRIORITY[requiredAccessLevel];
};

const isExtensionAccessLevelCompatible = (
    configuredAccessLevel: ExtensionAccessLevel,
    requiredAccessLevel: ExtensionAccessLevel
): boolean => ACCESS_LEVEL_PRIORITY[configuredAccessLevel] >= ACCESS_LEVEL_PRIORITY[requiredAccessLevel];

export const defineExtensionRoute = (route: ExtensionRouteInput): ExtensionRouteDefinition => {
    const path = normalizeRoutePath(route.path);

    return {
        ...route,
        path,
        href: route.href ?? buildRouteHref(path)
    };
};

export const defineAssetLaunch = (assetLaunch: ExtensionAssetLaunchDefinition): ExtensionAssetLaunchDefinition => assetLaunch;

export const defineExtensionMigration = (
    migration: ExtensionMigrationDefinition
): ExtensionMigrationDefinition => migration;

export const defineExtensionBridgeScope = (
    bridgeScope: ExtensionBridgeScopeDefinition
): ExtensionBridgeScopeDefinition => bridgeScope;

export const defineExtensionCapability = (
    capability: ExtensionCapabilityDefinition
): ExtensionCapabilityDefinition => capability;

export const defineExtensionManifest = (
    manifest: ExtensionManifestInput
): ExtensionManifestInput => manifest;

export const isVersionCompatible = (currentVersion: string, requirement: string): boolean => {
    const trimmedRequirement = requirement.trim();

    if (!trimmedRequirement || trimmedRequirement === '*') {
        return true;
    }

    if (trimmedRequirement.startsWith('^')) {
        const minimum = trimmedRequirement.slice(1);
        const currentParts = parseVersion(currentVersion);
        const minimumParts = parseVersion(minimum);

        if (!currentParts || !minimumParts) {
            return false;
        }

        const comparison = compareVersions(currentVersion, minimum);
        return comparison !== null && comparison >= 0 && currentParts[0] === minimumParts[0];
    }

    if (trimmedRequirement.startsWith('~')) {
        const minimum = trimmedRequirement.slice(1);
        const currentParts = parseVersion(currentVersion);
        const minimumParts = parseVersion(minimum);

        if (!currentParts || !minimumParts) {
            return false;
        }

        const comparison = compareVersions(currentVersion, minimum);
        return comparison !== null
            && comparison >= 0
            && currentParts[0] === minimumParts[0]
            && currentParts[1] === minimumParts[1];
    }

    const comparator = ['>=', '<=', '>', '<'].find((operator) => trimmedRequirement.startsWith(operator));

    if (comparator) {
        const targetVersion = trimmedRequirement.slice(comparator.length).trim();
        const comparison = compareVersions(currentVersion, targetVersion);

        if (comparison === null) {
            return false;
        }

        switch (comparator) {
            case '>=':
                return comparison >= 0;
            case '<=':
                return comparison <= 0;
            case '>':
                return comparison > 0;
            case '<':
                return comparison < 0;
            default:
                return false;
        }
    }

    const comparison = compareVersions(currentVersion, trimmedRequirement);
    return comparison === 0;
};

const formatValidationIssues = (issues: ExtensionManifestValidationIssue[]) =>
    `Invalid extension manifest configuration:\n${issues.map((issue) => `- [${issue.code}] ${issue.message}`).join('\n')}`;

const buildSidebarEntries = (routes: ExtensionRouteDefinition[]): ExtensionSidebarDefinition[] =>
    routes
        .filter((route) => route.showInSidebar)
        .map((route) => ({
            id: route.id,
            href: route.href,
            label: route.label,
            icon: route.icon,
            routeId: route.id
        }));

const buildManifestBackedCapabilityKeys = (manifest: Pick<
    ExtensionManifestInput,
    'routes' | 'assetTypes' | 'buildAssetLaunchPath' | 'migrations'
> & { sidebar: ExtensionSidebarDefinition[] }): ExtensionCapabilityKey[] => {
    const capabilityKeys: ExtensionCapabilityKey[] = [EXTENSION_CAPABILITY.HUB_CARDS];

    if (manifest.routes.length > 0) {
        capabilityKeys.push(EXTENSION_CAPABILITY.ROUTES);
    }

    if (manifest.sidebar.length > 0) {
        capabilityKeys.push(EXTENSION_CAPABILITY.SIDEBAR_LINKS);
    }

    if (manifest.assetTypes?.length && manifest.buildAssetLaunchPath) {
        capabilityKeys.push(EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS);
    }

    if (manifest.migrations?.length) {
        capabilityKeys.push(EXTENSION_CAPABILITY.DB_MIGRATIONS);
    }

    return capabilityKeys;
};

const resolveCapability = (capability: ExtensionCapabilityDefinition): ExtensionCapability => ({
    ...capability,
    registrationMode: capability.registrationMode ?? getDefaultRegistrationModeForCapability(capability.key),
    bridge: capability.bridge ?? []
});

const resolveManifest = (manifest: ExtensionManifestInput): ExtensionManifest => {
    const sidebar = manifest.sidebar ?? buildSidebarEntries(manifest.routes);
    const manifestBackedCapabilityKeys = buildManifestBackedCapabilityKeys({
        routes: manifest.routes,
        sidebar,
        assetTypes: manifest.assetTypes,
        buildAssetLaunchPath: manifest.buildAssetLaunchPath,
        migrations: manifest.migrations
    });
    const capabilities = (manifest.capabilities ?? manifestBackedCapabilityKeys.map((key) => ({ key }))).map(resolveCapability);

    return {
        ...manifest,
        accessLevel: manifest.accessLevel ?? EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
        sidebar,
        capabilities
    };
};

const createIssue = (
    code: string,
    message: string,
    extensionId?: string,
    routeId?: string
): ExtensionManifestValidationIssue => ({
    code,
    message,
    extensionId,
    routeId
});

export const getExtensionRegistryValidationIssues = (
    manifestInputs: ExtensionManifestInput[],
    options: CreateExtensionRegistryOptions = {}
): ExtensionManifestValidationIssue[] => {
    const hostVersion = options.hostVersion;
    const sdkVersion = options.sdkVersion ?? HOST_EXTENSION_SDK_VERSION;
    const manifests = manifestInputs.map(resolveManifest);
    const issues: ExtensionManifestValidationIssue[] = [];
    const seenExtensionIds = new Set<string>();
    const seenRoutePaths = new Map<string, string>();

    manifests.forEach((manifest) => {
        if (!isNonEmptyString(manifest.id)) {
            issues.push(createIssue('missing-id', 'Extension manifest ids must be non-empty strings.'));
        } else if (seenExtensionIds.has(manifest.id)) {
            issues.push(createIssue('duplicate-extension-id', `Extension id "${manifest.id}" is already registered.`, manifest.id));
        } else {
            seenExtensionIds.add(manifest.id);
        }

        if (!isNonEmptyString(manifest.label)) {
            issues.push(createIssue('missing-label', `Extension "${manifest.id || 'unknown'}" must define a label.`, manifest.id));
        }

        if (!isNonEmptyString(manifest.version)) {
            issues.push(createIssue('missing-version', `Extension "${manifest.id || 'unknown'}" must define a version.`, manifest.id));
        }

        if (!isNonEmptyString(manifest.sdkVersion)) {
            issues.push(createIssue('missing-sdk-version', `Extension "${manifest.id || 'unknown'}" must define an sdkVersion.`, manifest.id));
        } else if (!isVersionCompatible(sdkVersion, manifest.sdkVersion)) {
            issues.push(
                createIssue(
                    'incompatible-sdk-version',
                    `Extension "${manifest.id}" requires SDK "${manifest.sdkVersion}" but the host provides "${sdkVersion}".`,
                    manifest.id
                )
            );
        }

        if (hostVersion && manifest.requiredHostVersion && !isVersionCompatible(hostVersion, manifest.requiredHostVersion)) {
            issues.push(
                createIssue(
                    'incompatible-host-version',
                    `Extension "${manifest.id}" requires host version "${manifest.requiredHostVersion}" but the app is "${hostVersion}".`,
                    manifest.id
                )
            );
        }

        if (!isNonEmptyString(manifest.description)) {
            issues.push(createIssue('missing-description', `Extension "${manifest.id || 'unknown'}" must define a description.`, manifest.id));
        }

        if (!isValidAccessLevel(manifest.accessLevel)) {
            issues.push(
                createIssue(
                    'invalid-access-level',
                    `Extension "${manifest.id || 'unknown'}" must use a supported accessLevel (${Object.values(EXTENSION_ACCESS_LEVEL).join(', ')}).`,
                    manifest.id
                )
            );
        }

        if (!manifest.routes.length && manifest.status === 'ready' && !manifest.launchPath) {
            issues.push(
                createIssue(
                    'missing-ready-entrypoint',
                    `Ready extension "${manifest.id}" must expose at least one route or a launch path.`,
                    manifest.id
                )
            );
        }

        if (manifest.status === 'planned') {
            if (manifest.routes.length > 0) {
                issues.push(
                    createIssue(
                        'planned-extension-has-routes',
                        `Planned extension "${manifest.id}" cannot expose routes until it is marked ready.`,
                        manifest.id
                    )
                );
            }

            if (manifest.sidebar.length > 0) {
                issues.push(
                    createIssue(
                        'planned-extension-has-sidebar',
                        `Planned extension "${manifest.id}" cannot add sidebar entries until it is marked ready.`,
                        manifest.id
                    )
                );
            }

            if (manifest.launchPath) {
                issues.push(
                    createIssue(
                        'planned-extension-has-launch-path',
                        `Planned extension "${manifest.id}" cannot define a launch path yet.`,
                        manifest.id
                    )
                );
            }
        }

        if (manifest.assetTypes?.length && !manifest.buildAssetLaunchPath) {
            issues.push(
                createIssue(
                    'missing-asset-launch-builder',
                    `Extension "${manifest.id}" declares assetTypes but does not define buildAssetLaunchPath(itemId).`,
                    manifest.id
                )
            );
        }

        if (manifest.buildAssetLaunchPath && !manifest.assetTypes?.length) {
            issues.push(
                createIssue(
                    'missing-asset-types',
                    `Extension "${manifest.id}" defines buildAssetLaunchPath(itemId) but no compatible assetTypes.`,
                    manifest.id
                )
            );
        }

        const manifestBackedCapabilityKeys = new Set(buildManifestBackedCapabilityKeys(manifest));
        const seenCapabilityKeys = new Set<string>();

        manifest.capabilities.forEach((capability) => {
            if (!isNonEmptyString(capability.key)) {
                issues.push(
                    createIssue(
                        'missing-capability-key',
                        `Extension "${manifest.id}" declares a capability without a key.`,
                        manifest.id
                    )
                );
                return;
            }

            if (!isKnownCapabilityKey(capability.key)) {
                issues.push(
                    createIssue(
                        'unknown-capability-key',
                        `Extension "${manifest.id}" declares unsupported capability "${capability.key}".`,
                        manifest.id
                    )
                );
                return;
            }

            if (seenCapabilityKeys.has(capability.key)) {
                issues.push(
                    createIssue(
                        'duplicate-capability-key',
                        `Extension "${manifest.id}" declares capability "${capability.key}" more than once.`,
                        manifest.id
                    )
                );
            } else {
                seenCapabilityKeys.add(capability.key);
            }

            const expectedRegistrationMode = getDefaultRegistrationModeForCapability(capability.key);
            if (!isKnownRegistrationMode(capability.registrationMode)) {
                issues.push(
                    createIssue(
                        'invalid-capability-registration-mode',
                        `Extension "${manifest.id}" capability "${capability.key}" must use a supported registrationMode.`,
                        manifest.id
                    )
                );
            } else if (capability.registrationMode !== expectedRegistrationMode) {
                issues.push(
                    createIssue(
                        'invalid-capability-registration-mode',
                        `Extension "${manifest.id}" capability "${capability.key}" must use registrationMode "${expectedRegistrationMode}".`,
                        manifest.id
                    )
                );
            }

            if (!SERVER_WRAPPED_CAPABILITY_KEYS.has(capability.key) && !manifestBackedCapabilityKeys.has(capability.key)) {
                issues.push(
                    createIssue(
                        'unsupported-capability-for-manifest',
                        `Extension "${manifest.id}" declares capability "${capability.key}" but does not expose the corresponding manifest-backed contribution.`,
                        manifest.id
                    )
                );
            }

            const seenBridgeScopes = new Set<string>();

            capability.bridge.forEach((bridgeScope) => {
                const bridgeScopeKey = `${bridgeScope.resource}:${bridgeScope.access}`;

                if (!isKnownBridgeResource(bridgeScope.resource)) {
                    issues.push(
                        createIssue(
                            'unknown-capability-bridge-resource',
                            `Extension "${manifest.id}" capability "${capability.key}" declares unsupported bridge resource "${bridgeScope.resource}".`,
                            manifest.id
                        )
                    );
                    return;
                }

                if (!isKnownBridgeAccess(bridgeScope.access)) {
                    issues.push(
                        createIssue(
                            'unknown-capability-bridge-access',
                            `Extension "${manifest.id}" capability "${capability.key}" declares unsupported bridge access "${bridgeScope.access}".`,
                            manifest.id
                        )
                    );
                    return;
                }

                if (seenBridgeScopes.has(bridgeScopeKey)) {
                    issues.push(
                        createIssue(
                            'duplicate-capability-bridge-scope',
                            `Extension "${manifest.id}" capability "${capability.key}" reuses bridge scope "${bridgeScopeKey}".`,
                            manifest.id
                        )
                    );
                } else {
                    seenBridgeScopes.add(bridgeScopeKey);
                }

                const minimumBridgeAccessLevel = getBridgeScopeMinimumAccessLevel(bridgeScope.resource);
                if (!isExtensionAccessLevelCompatible(manifest.accessLevel, minimumBridgeAccessLevel)) {
                    issues.push(
                        createIssue(
                            'insufficient-access-level-for-bridge-scope',
                            `Extension "${manifest.id}" must use accessLevel "${minimumBridgeAccessLevel}" or higher to read host ${bridgeScope.resource}.`,
                            manifest.id
                        )
                    );
                }
            });
        });

        manifestBackedCapabilityKeys.forEach((capabilityKey) => {
            if (!seenCapabilityKeys.has(capabilityKey)) {
                issues.push(
                    createIssue(
                        'missing-manifest-capability',
                        `Extension "${manifest.id}" contributes "${capabilityKey}" but does not declare that capability.`,
                        manifest.id
                    )
                );
            }
        });

        const routeIds = new Set<string>();
        const routeHrefs = new Set<string>();

        manifest.routes.forEach((route) => {
            if (!isNonEmptyString(route.id)) {
                issues.push(createIssue('missing-route-id', `Extension "${manifest.id}" has a route without an id.`, manifest.id));
            } else if (routeIds.has(route.id)) {
                issues.push(
                    createIssue(
                        'duplicate-route-id',
                        `Extension "${manifest.id}" reuses the route id "${route.id}".`,
                        manifest.id,
                        route.id
                    )
                );
            } else {
                routeIds.add(route.id);
            }

            if (!isNonEmptyString(route.path)) {
                issues.push(createIssue('missing-route-path', `Route "${route.id || 'unknown'}" in extension "${manifest.id}" must define a path.`, manifest.id, route.id));
            } else {
                if (route.path.startsWith('/')) {
                    issues.push(
                        createIssue(
                            'route-path-must-be-relative',
                            `Route "${route.id}" in extension "${manifest.id}" must use a relative path without a leading slash.`,
                            manifest.id,
                            route.id
                        )
                    );
                }

                const priorExtensionId = seenRoutePaths.get(route.path);
                if (priorExtensionId) {
                    issues.push(
                        createIssue(
                            'duplicate-route-path',
                            `Route path "${route.path}" is already owned by extension "${priorExtensionId}".`,
                            manifest.id,
                            route.id
                        )
                    );
                } else {
                    seenRoutePaths.set(route.path, manifest.id);
                }
            }

            if (!isNonEmptyString(route.href)) {
                issues.push(createIssue('missing-route-href', `Route "${route.id || 'unknown'}" in extension "${manifest.id}" must define an href.`, manifest.id, route.id));
            } else {
                routeHrefs.add(route.href);
                const expectedHref = buildRouteHref(route.path);

                if (route.href !== expectedHref) {
                    issues.push(
                        createIssue(
                            'route-href-mismatch',
                            `Route "${route.id}" in extension "${manifest.id}" must use href "${expectedHref}" to match path "${route.path}".`,
                            manifest.id,
                            route.id
                        )
                    );
                }
            }

            if (!isNonEmptyString(route.label)) {
                issues.push(createIssue('missing-route-label', `Route "${route.id || 'unknown'}" in extension "${manifest.id}" must define a label.`, manifest.id, route.id));
            }
        });

        if (manifest.launchPath && manifest.routes.length > 0 && !routeHrefs.has(manifest.launchPath)) {
            issues.push(
                createIssue(
                    'unresolvable-launch-path',
                    `Extension "${manifest.id}" launchPath "${manifest.launchPath}" does not match any registered route href.`,
                    manifest.id
                )
            );
        }

        const sidebarIds = new Set<string>();
        const sidebarHrefs = new Set<string>();

        manifest.sidebar.forEach((sidebarEntry) => {
            if (sidebarIds.has(sidebarEntry.id)) {
                issues.push(
                    createIssue(
                        'duplicate-sidebar-id',
                        `Extension "${manifest.id}" reuses the sidebar id "${sidebarEntry.id}".`,
                        manifest.id
                    )
                );
            } else {
                sidebarIds.add(sidebarEntry.id);
            }

            if (sidebarHrefs.has(sidebarEntry.href)) {
                issues.push(
                    createIssue(
                        'duplicate-sidebar-href',
                        `Extension "${manifest.id}" reuses the sidebar href "${sidebarEntry.href}".`,
                        manifest.id
                    )
                );
            } else {
                sidebarHrefs.add(sidebarEntry.href);
            }

            if (!routeHrefs.has(sidebarEntry.href)) {
                issues.push(
                    createIssue(
                        'unresolvable-sidebar-href',
                        `Extension "${manifest.id}" sidebar href "${sidebarEntry.href}" does not match any registered route href.`,
                        manifest.id
                    )
                );
            }
        });
    });

    return issues;
};

export const validateExtensionManifest = (
    manifestInput: ExtensionManifestInput,
    options: CreateExtensionRegistryOptions = {}
): ExtensionManifest => {
    const [manifest] = validateExtensionRegistry([manifestInput], options);
    return manifest;
};

export const validateExtensionRegistry = (
    manifestInputs: ExtensionManifestInput[],
    options: CreateExtensionRegistryOptions = {}
): ExtensionManifest[] => {
    const issues = getExtensionRegistryValidationIssues(manifestInputs, options);

    if (issues.length > 0) {
        throw new ExtensionManifestValidationError(issues);
    }

    return manifestInputs.map(resolveManifest);
};

export const createExtensionRegistry = (
    manifestInputs: ExtensionManifestInput[],
    options: CreateExtensionRegistryOptions = {}
): ExtensionManifest[] => validateExtensionRegistry(manifestInputs, options);
