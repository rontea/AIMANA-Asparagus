import semanticForgeServerExtension from '@aimana/extension-semantic-forge/server';
import { extensionHostConfigState } from '../../extensions/hostConfig.shared.js';

const installedServerExtensionManifestCatalog = {
    '@aimana/extension-semantic-forge': [semanticForgeServerExtension]
};

export const extensionServerHostConfig = {
    disabledBuiltInExtensionIds: extensionHostConfigState.disabledBuiltInExtensionIds,
    installedExtensions: extensionHostConfigState.installedExtensions.map((entry) => ({
        ...entry,
        manifests: installedServerExtensionManifestCatalog[entry.packageName] ?? []
    }))
};
