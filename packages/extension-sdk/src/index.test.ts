import { describe, expect, it } from 'vitest';
import { Wand2 } from 'lucide-react';
import {
    buildRouteHref,
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
    EXTENSION_CAPABILITY_REGISTRATION_MODE,
    ExtensionManifestValidationError,
    HOST_EXTENSION_SDK_VERSION,
    isExtensionAccessAllowed,
    isVersionCompatible,
    type ExtensionManifestInput
} from '@aimana/extension-sdk';

const MockComponent = () => null;

const createManifest = (overrides: Partial<ExtensionManifestInput> = {}): ExtensionManifestInput => {
    const launch = defineAssetLaunch({
        assetTypes: [EXTENSION_ASSET_KIND.IMAGE],
        buildAssetLaunchPath: (itemId) => `/extensions/test-extension?itemId=${encodeURIComponent(itemId)}`
    });

    return defineExtensionManifest({
        id: 'test-extension',
        label: 'Test Extension',
        version: '1.2.3',
        sdkVersion: HOST_EXTENSION_SDK_VERSION,
        description: 'A test extension manifest.',
        icon: Wand2,
        colorClass: 'text-indigo-400',
        actionClassName: 'text-indigo-400 hover:bg-indigo-500/10',
        status: 'ready',
        statusLabel: 'Launch Extension',
        tierLabel: 'Plugin Tier-1',
        launchPath: '/extensions/test-extension',
        ...launch,
        migrations: [
            defineExtensionMigration({
                version: 1,
                name: '001_create_ext_test_extension_runs',
                checksum: 'test-extension:001'
            })
        ],
        routes: [
            defineExtensionRoute({
                id: 'test-extension-main',
                path: '/extensions/test-extension',
                label: 'Test Extension',
                component: MockComponent,
                icon: Wand2,
                showInSidebar: true
            })
        ],
        ...overrides
    });
};

describe('extension sdk', () => {
    it('builds route helpers with normalized paths and derived hrefs', () => {
        const route = defineExtensionRoute({
            id: 'route-1',
            path: '/extensions/test-extension',
            label: 'Route',
            component: MockComponent,
            icon: Wand2
        });

        expect(route.path).toBe('extensions/test-extension');
        expect(route.href).toBe('/extensions/test-extension');
        expect(buildRouteHref('/extensions/test-extension')).toBe('/extensions/test-extension');
    });

    it('derives sidebar links from route metadata when sidebar entries are omitted', () => {
        const [manifest] = createExtensionRegistry([createManifest()]);

        expect(manifest.sidebar).toEqual([
            expect.objectContaining({
                id: 'test-extension-main',
                routeId: 'test-extension-main',
                href: '/extensions/test-extension',
                label: 'Test Extension'
            })
        ]);
        expect(manifest.capabilities.map((capability) => capability.key)).toEqual([
            EXTENSION_CAPABILITY.HUB_CARDS,
            EXTENSION_CAPABILITY.ROUTES,
            EXTENSION_CAPABILITY.SIDEBAR_LINKS,
            EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS,
            EXTENSION_CAPABILITY.DB_MIGRATIONS
        ]);
        expect(manifest.accessLevel).toBe(EXTENSION_ACCESS_LEVEL.AUTHENTICATED);
    });

    it('rejects duplicate extension ids and duplicate route paths with clear diagnostics', () => {
        const duplicateId = createManifest();
        const duplicateRoute = createManifest({
            id: 'second-extension',
            launchPath: '/extensions/test-extension',
            routes: [
                defineExtensionRoute({
                    id: 'second-extension-main',
                    path: 'extensions/test-extension',
                    label: 'Second Extension',
                    component: MockComponent,
                    icon: Wand2
                })
            ]
        });

        let thrownError: unknown;

        try {
            createExtensionRegistry([duplicateId, duplicateRoute, createManifest()]);
        } catch (error) {
            thrownError = error;
        }

        expect(thrownError).toBeInstanceOf(ExtensionManifestValidationError);
        expect((thrownError as ExtensionManifestValidationError).issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: 'duplicate-extension-id', extensionId: 'test-extension' }),
                expect.objectContaining({ code: 'duplicate-route-path', extensionId: 'second-extension', routeId: 'second-extension-main' })
            ])
        );
    });

    it('validates sdk and host version compatibility ranges', () => {
        expect(isVersionCompatible('1.4.0', '^1.2.3')).toBe(true);
        expect(isVersionCompatible('1.4.0', '~1.4.0')).toBe(true);
        expect(isVersionCompatible('1.4.0', '~1.5.0')).toBe(false);
        expect(isVersionCompatible('1.4.0', '>=1.3.0')).toBe(true);
        expect(isVersionCompatible('1.4.0', '2.0.0')).toBe(false);

        expect(() =>
            createExtensionRegistry(
                [
                    createManifest({
                        id: 'sdk-mismatch',
                        sdkVersion: '^2.0.0'
                    })
                ],
                {
                    hostVersion: '0.16.0',
                    sdkVersion: '1.0.0'
                }
            )
        ).toThrowError(ExtensionManifestValidationError);

        expect(() =>
            createExtensionRegistry(
                [
                    createManifest({
                        id: 'host-mismatch',
                        requiredHostVersion: '>=2.0.0'
                    })
                ],
                {
                    hostVersion: '0.16.0',
                    sdkVersion: HOST_EXTENSION_SDK_VERSION
                }
            )
        ).toThrowError(ExtensionManifestValidationError);
    });

    it('enforces host-managed versus host-wrapper capability registration modes', () => {
        expect(() =>
            createExtensionRegistry([
                createManifest({
                    capabilities: [
                        defineExtensionCapability({
                            key: EXTENSION_CAPABILITY.ROUTES,
                            registrationMode: EXTENSION_CAPABILITY_REGISTRATION_MODE.HOST_WRAPPER
                        }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.SIDEBAR_LINKS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.HUB_CARDS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.DB_MIGRATIONS })
                    ]
                })
            ])
        ).toThrowError(ExtensionManifestValidationError);

        expect(() =>
            createExtensionRegistry([
                createManifest({
                    capabilities: [
                        defineExtensionCapability({
                            key: EXTENSION_CAPABILITY.API_ENDPOINTS,
                            registrationMode: EXTENSION_CAPABILITY_REGISTRATION_MODE.HOST_MANAGED
                        }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.ROUTES }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.SIDEBAR_LINKS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.HUB_CARDS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.DB_MIGRATIONS })
                    ]
                })
            ])
        ).toThrowError(ExtensionManifestValidationError);
    });

    it('requires elevated extension access before users or settings bridge scopes are declared', () => {
        expect(() =>
            createExtensionRegistry([
                createManifest({
                    capabilities: [
                        defineExtensionCapability({
                            key: EXTENSION_CAPABILITY.ROUTES,
                            bridge: [
                                defineExtensionBridgeScope({
                                    resource: EXTENSION_BRIDGE_RESOURCE.USERS,
                                    access: EXTENSION_BRIDGE_ACCESS.READ
                                })
                            ]
                        }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.SIDEBAR_LINKS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.HUB_CARDS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS }),
                        defineExtensionCapability({ key: EXTENSION_CAPABILITY.DB_MIGRATIONS })
                    ]
                })
            ])
        ).toThrowError(ExtensionManifestValidationError);

        const [adminManifest] = createExtensionRegistry([
            createManifest({
                id: 'admin-bridge-extension',
                accessLevel: EXTENSION_ACCESS_LEVEL.ADMIN,
                capabilities: [
                    defineExtensionCapability({
                        key: EXTENSION_CAPABILITY.ROUTES,
                        bridge: [
                            defineExtensionBridgeScope({
                                resource: EXTENSION_BRIDGE_RESOURCE.USERS,
                                access: EXTENSION_BRIDGE_ACCESS.READ
                            }),
                            defineExtensionBridgeScope({
                                resource: EXTENSION_BRIDGE_RESOURCE.SETTINGS,
                                access: EXTENSION_BRIDGE_ACCESS.READ
                            })
                        ]
                    }),
                    defineExtensionCapability({ key: EXTENSION_CAPABILITY.SIDEBAR_LINKS }),
                    defineExtensionCapability({ key: EXTENSION_CAPABILITY.HUB_CARDS }),
                    defineExtensionCapability({ key: EXTENSION_CAPABILITY.ASSET_LAUNCH_ACTIONS }),
                    defineExtensionCapability({ key: EXTENSION_CAPABILITY.DB_MIGRATIONS })
                ]
            })
        ]);

        expect(adminManifest.capabilities[0]?.bridge).toEqual([
            { resource: 'users', access: 'read' },
            { resource: 'settings', access: 'read' }
        ]);
    });

    it('checks extension access levels against signed-in user roles', () => {
        expect(isExtensionAccessAllowed(EXTENSION_ACCESS_LEVEL.AUTHENTICATED, { role: 'user', id: 'user-1' })).toBe(true);
        expect(isExtensionAccessAllowed(EXTENSION_ACCESS_LEVEL.ADMIN, { role: 'user', id: 'user-1' })).toBe(false);
        expect(isExtensionAccessAllowed(EXTENSION_ACCESS_LEVEL.ADMIN, { role: 'admin', id: 'admin-1' })).toBe(true);
        expect(isExtensionAccessAllowed(EXTENSION_ACCESS_LEVEL.SUPER_ADMIN, { role: 'admin', id: 'admin-1' })).toBe(false);
        expect(isExtensionAccessAllowed(EXTENSION_ACCESS_LEVEL.SUPER_ADMIN, { role: 'admin', id: 'admin-root' })).toBe(true);
    });
});
