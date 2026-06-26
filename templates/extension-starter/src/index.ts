import { WandSparkles } from 'lucide-react';
import {
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
import YourExtensionHome from './YourExtensionHome';

export const yourExtension = defineExtensionManifest({
    id: 'your-extension',
    label: 'Your Extension',
    version: '0.1.0',
    sdkVersion: `^${HOST_EXTENSION_SDK_VERSION}`,
    description: 'Describe what this package adds to the host app.',
    icon: WandSparkles,
    colorClass: 'text-sky-300',
    actionClassName: 'text-sky-300 hover:bg-sky-500/10',
    status: 'ready',
    statusLabel: 'Launch Extension',
    tierLabel: 'Package Extension',
    accessLevel: EXTENSION_ACCESS_LEVEL.AUTHENTICATED,
    launchPath: '/extensions/your-extension',
    ...defineAssetLaunch({
        assetTypes: [EXTENSION_ASSET_KIND.IMAGE],
        buildAssetLaunchPath: (itemId) => `/extensions/your-extension?itemId=${encodeURIComponent(itemId)}`
    }),
    routes: [
        defineExtensionRoute({
            id: 'your-extension-main',
            path: '/extensions/your-extension',
            label: 'Your Extension',
            component: YourExtensionHome,
            icon: WandSparkles,
            showInSidebar: true
        })
    ],
    migrations: [
        defineExtensionMigration({
            version: 1,
            name: '001_create_ext_your_extension_runs',
            checksum: 'your-extension:001',
            description: 'Declares the first server-side namespaced schema change for this extension.'
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
            description: 'Adds the extension entry point to the host sidebar.'
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.HUB_CARDS,
            description: 'Shows the extension in the host Extensions hub.'
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS,
            description: 'Allows the extension to launch from compatible assets.',
            bridge: [
                defineExtensionBridgeScope({
                    resource: EXTENSION_BRIDGE_RESOURCE.ITEMS,
                    access: EXTENSION_BRIDGE_ACCESS.READ
                })
            ]
        }),
        defineExtensionCapability({
            key: EXTENSION_CAPABILITY.DB_MIGRATIONS,
            description: 'Declares host-run namespaced migrations for extension-owned tables.'
        })
    ],
    requiredHostVersion: '>=0.16.0'
});

export default yourExtension;
