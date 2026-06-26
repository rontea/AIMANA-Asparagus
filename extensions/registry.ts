import { AssetType } from '../types';
import { loadExtensionRegistry } from './loader';
import type {
    AssetLaunchExtension,
    ExtensionAccessLevel,
    ExtensionAccessSubject,
    ExtensionManifest,
    ExtensionRouteDefinition,
    ExtensionSidebarDefinition
} from '@aimana/extension-sdk';
import { isExtensionAccessAllowed } from '@aimana/extension-sdk';

export type {
    ExtensionCapabilityDefinition,
    ExtensionCapabilityKey,
    ExtensionCapabilityRegistrationMode,
    ExtensionBridgeAccess,
    ExtensionBridgeResource,
    ExtensionBridgeScopeDefinition,
    ExtensionManifest,
    ExtensionManifestInput,
    ExtensionManifestValidationIssue,
    ExtensionMigrationDefinition,
    ExtensionRouteDefinition,
    ExtensionSidebarDefinition,
    ExtensionAccessLevel,
    ExtensionAccessSubject,
    ExtensionStatus
} from '@aimana/extension-sdk';
export {
    createExtensionRegistry,
    defineAssetLaunch,
    defineExtensionBridgeScope,
    defineExtensionCapability,
    defineExtensionMigration,
    defineExtensionManifest,
    defineExtensionRoute,
    EXTENSION_ASSET_KIND,
    EXTENSION_ACCESS_LEVEL,
    EXTENSION_BRIDGE_ACCESS,
    EXTENSION_BRIDGE_RESOURCE,
    EXTENSION_CAPABILITY,
    EXTENSION_CAPABILITY_REGISTRATION_MODE,
    EXTENSION_PACKAGE_PREFIX,
    HOST_EXTENSION_SDK_VERSION,
    ExtensionManifestValidationError,
    getBridgeScopeMinimumAccessLevel,
    getDefaultRegistrationModeForCapability,
    isVersionCompatible,
    isExtensionAccessAllowed,
    validateExtensionManifest,
    validateExtensionRegistry
} from '@aimana/extension-sdk';
export { builtInExtensionManifests } from './builtIn';
export { extensionHostConfig, type ExtensionHostConfig, type InstalledExtensionConfigEntry } from './hostConfig';
export { loadExtensionRegistry, ExtensionRegistryLoadError, type LoadedExtensionRegistry } from './loader';

export interface RegisteredExtensionRouteEntry {
    extension: ExtensionManifest;
    route: ExtensionRouteDefinition;
}

const loadedExtensionRegistry = loadExtensionRegistry();

export const extensionRegistry = loadedExtensionRegistry.extensionRegistry;
export const builtInExtensionRegistry = loadedExtensionRegistry.builtInExtensions;
export const installedExtensionRegistry = loadedExtensionRegistry.installedExtensions;

export const registeredExtensionRouteEntries = extensionRegistry.flatMap((extension) =>
    extension.routes.map((route) => ({
        extension,
        route
    }))
);

export const registeredExtensionRoutes = registeredExtensionRouteEntries.map(({ route }) => route);

export const sidebarExtensionLinks = extensionRegistry.flatMap((extension) => extension.sidebar);

export const readyExtensions = extensionRegistry.filter((extension) => extension.status === 'ready');

export const isExtensionAccessibleToUser = (
    extension: Pick<ExtensionManifest, 'accessLevel'>,
    user?: ExtensionAccessSubject | null
): boolean => isExtensionAccessAllowed(extension.accessLevel, user);

export const getAccessibleExtensionRegistry = (
    user?: ExtensionAccessSubject | null
): ExtensionManifest[] => extensionRegistry.filter((extension) => isExtensionAccessibleToUser(extension, user));

export const getAccessibleRegisteredExtensionRouteEntries = (
    user?: ExtensionAccessSubject | null
): RegisteredExtensionRouteEntry[] => registeredExtensionRouteEntries.filter(({ extension }) => isExtensionAccessibleToUser(extension, user));

export const getAccessibleRegisteredExtensionRoutes = (
    user?: ExtensionAccessSubject | null
): ExtensionRouteDefinition[] => getAccessibleRegisteredExtensionRouteEntries(user).map(({ route }) => route);

export const getAccessibleSidebarExtensionLinks = (
    user?: ExtensionAccessSubject | null
): ExtensionSidebarDefinition[] => extensionRegistry.flatMap((extension) =>
    isExtensionAccessibleToUser(extension, user) ? extension.sidebar : []
);

export const getAccessibleReadyExtensions = (
    user?: ExtensionAccessSubject | null
): ExtensionManifest[] => readyExtensions.filter((extension) => isExtensionAccessibleToUser(extension, user));

export const getAssetLaunchExtensionsForItem = (
    assetType: AssetType,
    itemId: string,
    user?: ExtensionAccessSubject | null
): AssetLaunchExtension[] => {
    return getAccessibleReadyExtensions(user)
        .filter((extension) => extension.assetTypes?.some((supportedAssetType) => supportedAssetType === assetType) && extension.buildAssetLaunchPath)
        .flatMap((extension) => {
            if (!extension.buildAssetLaunchPath) {
                return [];
            }

            return [{
                id: extension.id,
                label: extension.label,
                icon: extension.icon,
                actionClassName: extension.actionClassName,
                href: extension.buildAssetLaunchPath(itemId)
            }];
        });
};
