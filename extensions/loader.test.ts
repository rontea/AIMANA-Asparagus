import { describe, expect, it } from 'vitest';
import { Wand2 } from 'lucide-react';
import {
    defineExtensionManifest,
    defineExtensionRoute,
    HOST_EXTENSION_SDK_VERSION,
    type ExtensionManifestInput
} from '@aimana/extension-sdk';
import { type ExtensionHostConfig } from './hostConfig';
import { ExtensionRegistryLoadError, loadExtensionRegistry } from './loader';

const MockComponent = () => null;

const createInstalledManifest = (overrides: Partial<ExtensionManifestInput> = {}): ExtensionManifestInput =>
    defineExtensionManifest({
        id: 'installed-test-extension',
        label: 'Installed Test Extension',
        version: '0.1.0',
        sdkVersion: `^${HOST_EXTENSION_SDK_VERSION}`,
        description: 'Installed test extension.',
        icon: Wand2,
        colorClass: 'text-cyan-400',
        actionClassName: 'text-cyan-400 hover:bg-cyan-500/10',
        status: 'ready',
        statusLabel: 'Launch Extension',
        tierLabel: 'Package Extension',
        launchPath: '/extensions/installed-test-extension',
        routes: [
            defineExtensionRoute({
                id: 'installed-test-extension-main',
                path: '/extensions/installed-test-extension',
                label: 'Installed Test Extension',
                component: MockComponent,
                icon: Wand2,
                showInSidebar: true
            })
        ],
        ...overrides
    });

describe('extension loader', () => {
    it('loads built-ins plus enabled installed packages through host config', () => {
        const hostConfig: ExtensionHostConfig = {
            disabledBuiltInExtensionIds: ['semantic-forge'],
            installedExtensions: [
                {
                    packageName: '@aimana/extension-installed-test',
                    enabled: true,
                    manifests: [createInstalledManifest()]
                }
            ]
        };

        const loadedRegistry = loadExtensionRegistry(hostConfig);

        expect(loadedRegistry.extensionRegistry.map((extension) => extension.id)).toContain('installed-test-extension');
        expect(loadedRegistry.builtInExtensions.map((extension) => extension.id)).not.toContain('semantic-forge');
        expect(loadedRegistry.installedExtensions.map((extension) => extension.id)).toEqual(['installed-test-extension']);
        expect(loadedRegistry.builtInExtensions.every((extension) => Array.isArray(extension.sidebar))).toBe(true);
        expect(loadedRegistry.installedExtensions.every((extension) => Array.isArray(extension.sidebar))).toBe(true);
        expect(loadedRegistry.installedExtensions[0]?.accessLevel).toBe('authenticated');
    });

    it('fails with clear diagnostics when host config disables an unknown built-in id', () => {
        const hostConfig: ExtensionHostConfig = {
            disabledBuiltInExtensionIds: ['missing-built-in'],
            installedExtensions: []
        };

        expect(() => loadExtensionRegistry(hostConfig)).toThrowError(ExtensionRegistryLoadError);

        try {
            loadExtensionRegistry(hostConfig);
        } catch (error) {
            const resolvedError = error as ExtensionRegistryLoadError;
            expect(resolvedError.message).toContain('Failed to load the host extension registry.');
            expect(resolvedError.message).toContain('missing-built-in');
            expect(resolvedError.issues[0]?.code).toBe('unknown-disabled-built-in-id');
        }
    });

    it('fails with clear diagnostics when merged manifests conflict', () => {
        const hostConfig: ExtensionHostConfig = {
            disabledBuiltInExtensionIds: [],
            installedExtensions: [
                {
                    packageName: '@aimana/extension-duplicate-image-editor',
                    enabled: true,
                    manifests: [
                        createInstalledManifest({
                            id: 'image-editor',
                            launchPath: '/extensions/image-editor',
                            routes: [
                                defineExtensionRoute({
                                    id: 'duplicate-image-editor-main',
                                    path: '/extensions/image-editor',
                                    label: 'Duplicate Image Editor',
                                    component: MockComponent,
                                    icon: Wand2
                                })
                            ]
                        })
                    ]
                }
            ]
        };

        expect(() => loadExtensionRegistry(hostConfig)).toThrowError(ExtensionRegistryLoadError);

        try {
            loadExtensionRegistry(hostConfig);
        } catch (error) {
            const resolvedError = error as ExtensionRegistryLoadError;
            expect(resolvedError.message).toContain('@aimana/extension-duplicate-image-editor');
            expect(resolvedError.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ code: 'duplicate-extension-id', extensionId: 'image-editor' }),
                    expect.objectContaining({ code: 'duplicate-route-path', extensionId: 'image-editor' })
                ])
            );
        }
    });
});
