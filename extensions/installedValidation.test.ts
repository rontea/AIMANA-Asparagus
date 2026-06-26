import { describe, expect, it } from 'vitest';
import { extensionHostConfig } from './hostConfig';
import { loadExtensionRegistry } from './loader';

describe('installed extension host config validation', () => {
    it('loads every enabled installed extension manifest declared in host config', () => {
        const enabledInstalledExtensions = extensionHostConfig.installedExtensions.filter((entry) => entry.enabled);
        const loadedRegistry = loadExtensionRegistry(extensionHostConfig);
        const installedExtensionIds = new Set(loadedRegistry.installedExtensions.map((manifest) => manifest.id));

        enabledInstalledExtensions.forEach((entry) => {
            expect(entry.manifests.length).toBeGreaterThan(0);
            entry.manifests.forEach((manifest) => {
                expect(installedExtensionIds.has(manifest.id)).toBe(true);
            });
        });
    });
});
