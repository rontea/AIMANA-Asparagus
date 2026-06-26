import { BrainCircuit, LayoutGrid } from 'lucide-react';
import {
    createExtensionRegistry,
    defineAssetLaunch,
    defineExtensionBridgeScope,
    defineExtensionCapability,
    defineExtensionManifest,
    defineExtensionMigration,
    defineExtensionRoute,
    EXTENSION_ACCESS_LEVEL,
    EXTENSION_ASSET_KIND,
    EXTENSION_BRIDGE_ACCESS,
    EXTENSION_BRIDGE_RESOURCE,
    EXTENSION_CAPABILITY,
    HOST_EXTENSION_SDK_VERSION
} from '@aimana/extension-sdk';
import SemanticForgeHome from './SemanticForgeHome';

export const semanticForgeExtension = defineExtensionManifest({
    id: 'semantic-forge',
    label: 'Semantic Forge',
    version: '0.1.0',
    sdkVersion: `^${HOST_EXTENSION_SDK_VERSION}`,
    description: 'Prompt expansion, cleanup, and transformation workflows packaged as an installable AIMANA extension.',
    icon: BrainCircuit,
    colorClass: 'text-emerald-400',
    actionClassName: 'text-emerald-400 hover:bg-emerald-500/10',
    status: 'ready',
    statusLabel: 'Launch Extension',
    tierLabel: 'Package Extension',
    accessLevel: EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
    launchPath: '/extensions/semantic-forge',
    ...defineAssetLaunch({
        assetTypes: [EXTENSION_ASSET_KIND.IMAGE],
        buildAssetLaunchPath: (itemId) => `/extensions/semantic-forge?itemId=${encodeURIComponent(itemId)}`
    }),
    routes: [
        defineExtensionRoute({
            id: 'semantic-forge-main',
            path: '/extensions/semantic-forge',
            label: 'Semantic Forge',
            component: SemanticForgeHome,
            icon: BrainCircuit,
            showInSidebar: true
        }),
        defineExtensionRoute({
            id: 'semantic-forge-recipes',
            path: 'extensions/semantic-forge/recipes',
            label: 'Forge Recipes',
            component: SemanticForgeHome,
            icon: LayoutGrid
        })
    ],
    migrations: [
        defineExtensionMigration({
            version: 1,
            name: '001_create_ext_semantic_forge_runs',
            checksum: 'semantic-forge:001',
            description: 'Creates extension-owned run tracking tables under the ext_semantic_forge_* namespace.'
        })
    ],
    capabilities: [
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.ROUTES,
            description: 'Registers extension UI routes in the host router.',
            bridge: [
                defineExtensionBridgeScope({
                    resource: EXTENSION_BRIDGE_RESOURCE.ITEMS,
                    access: EXTENSION_BRIDGE_ACCESS.READ
                }),
                defineExtensionBridgeScope({
                    resource: EXTENSION_BRIDGE_RESOURCE.PROJECTS,
                    access: EXTENSION_BRIDGE_ACCESS.READ
                })
            ]
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.SIDEBAR_LINKS,
            description: 'Adds the main Semantic Forge entry point to the host sidebar.'
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.HUB_CARDS,
            description: 'Shows Semantic Forge in the Extensions discovery hub.'
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS,
            description: 'Launches Semantic Forge from compatible image assets.',
            bridge: [
                defineExtensionBridgeScope({
                    resource: EXTENSION_BRIDGE_RESOURCE.ITEMS,
                    access: EXTENSION_BRIDGE_ACCESS.READ
                })
            ]
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.DB_MIGRATIONS,
            description: 'Declares host-run extension migrations.'
        })
    ],
    requiredHostVersion: '>=0.16.0'
});

export const semanticForgeValidatedRegistry = createExtensionRegistry([semanticForgeExtension], {
    hostVersion: '0.16.0'
});

export default semanticForgeExtension;
