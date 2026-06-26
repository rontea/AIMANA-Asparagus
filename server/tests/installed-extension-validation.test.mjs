import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionServerServices } from '../extensions/api.js';
import { extensionServerHostConfig } from '../extensions/hostConfig.js';
import { validateExtensionServerManifest } from '../extensions/migrations.js';

test('loads installed server extension manifests and validates migration metadata from host config', () => {
    const enabledInstalledExtensions = extensionServerHostConfig.installedExtensions.filter((entry) => entry.enabled);
    const services = loadExtensionServerServices(extensionServerHostConfig);
    const expectedManifestIds = enabledInstalledExtensions.flatMap((entry) =>
        entry.manifests.map((manifestInput) => validateExtensionServerManifest(manifestInput).id)
    );

    assert.deepEqual(
        services.manifests.map((manifest) => manifest.id).sort(),
        expectedManifestIds.sort()
    );
});
