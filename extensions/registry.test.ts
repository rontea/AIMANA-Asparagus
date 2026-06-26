import { describe, expect, it } from 'vitest';
import { AssetType } from '../types';
import {
    builtInExtensionRegistry,
    EXTENSION_ACCESS_LEVEL,
    extensionHostConfig,
    extensionRegistry,
    getAccessibleExtensionRegistry,
    getAssetLaunchExtensionsForItem,
    installedExtensionRegistry,
    isExtensionAccessibleToUser,
    readyExtensions,
    registeredExtensionRoutes,
    sidebarExtensionLinks,
    type ExtensionManifest
} from './registry';

describe('extension registry', () => {
    it('registers built-in and installed extension routes through the host loader', () => {
        const routePaths = registeredExtensionRoutes.map((route) => route.path);

        expect(routePaths).toContain('extensions/image-editor');
        expect(routePaths).toContain('extensions/image-editor/content');
        expect(routePaths).toContain('extensions/semantic-forge');
        expect(sidebarExtensionLinks.map((route) => route.label)).toEqual(['Aesthetic Lab', 'Lab Content', 'Semantic Forge']);
    });

    it('keeps built-in and installed entries in the same normalized manifest shape', () => {
        expect(builtInExtensionRegistry.length).toBeGreaterThan(0);
        expect(installedExtensionRegistry.length).toBeGreaterThan(0);
        expect(builtInExtensionRegistry.every((extension) => Array.isArray(extension.sidebar))).toBe(true);
        expect(installedExtensionRegistry.every((extension) => Array.isArray(extension.capabilities))).toBe(true);
        expect(installedExtensionRegistry[0]?.accessLevel).toBe(EXTENSION_ACCESS_LEVEL.AUTHENTICATED);
    });

    it('exposes image-compatible launch actions for built-in and installed ready extensions', () => {
        const imageLaunches = getAssetLaunchExtensionsForItem(AssetType.IMAGE, 'asset-123');
        const videoLaunches = getAssetLaunchExtensionsForItem(AssetType.VIDEO, 'asset-123');

        expect(imageLaunches).toEqual(
            expect.arrayContaining([
            expect.objectContaining({
                id: 'image-editor',
                label: 'Aesthetic Lab',
                href: '/extensions/image-editor?itemId=asset-123'
            }),
            expect.objectContaining({
                id: 'semantic-forge',
                label: 'Semantic Forge',
                href: '/extensions/semantic-forge?itemId=asset-123'
            })
        ]));
        expect(videoLaunches).toEqual([]);
    });

    it('keeps planned built-ins in the catalog while enabling installed package replacements through host config', () => {
        const plannedExtensions = extensionRegistry.filter((extension) => extension.status === 'planned');
        const liveExtensionIds = readyExtensions.map((extension) => extension.id);

        expect(plannedExtensions.length).toBeGreaterThan(0);
        expect(plannedExtensions.every((extension) => extension.routes.length === 0)).toBe(true);
        expect(liveExtensionIds).toContain('semantic-forge');
        expect(extensionHostConfig.disabledBuiltInExtensionIds).toContain('semantic-forge');
    });

    it('keeps registered route paths globally unique across the resolved host registry', () => {
        const routePaths = registeredExtensionRoutes.map((route) => route.path);

        expect(new Set(routePaths).size).toBe(routePaths.length);
    });

    it('filters extension access based on manifest access levels', () => {
        const adminOnlyExtension = { accessLevel: EXTENSION_ACCESS_LEVEL.ADMIN } as Pick<ExtensionManifest, 'accessLevel'>;
        const superAdminOnlyExtension = { accessLevel: EXTENSION_ACCESS_LEVEL.SUPER_ADMIN } as Pick<ExtensionManifest, 'accessLevel'>;

        expect(isExtensionAccessibleToUser(adminOnlyExtension, { id: 'user-1', role: 'user' })).toBe(false);
        expect(isExtensionAccessibleToUser(adminOnlyExtension, { id: 'admin-1', role: 'admin' })).toBe(true);
        expect(isExtensionAccessibleToUser(superAdminOnlyExtension, { id: 'admin-1', role: 'admin' })).toBe(false);
        expect(isExtensionAccessibleToUser(superAdminOnlyExtension, { id: 'admin-root', role: 'admin' })).toBe(true);
        expect(getAccessibleExtensionRegistry({ id: 'user-1', role: 'user' }).map((extension) => extension.id)).toEqual(
            extensionRegistry.map((extension) => extension.id)
        );
    });
});
