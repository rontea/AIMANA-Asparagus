import type { ExtensionManifestInput } from '@aimana/extension-sdk';
import semanticForgeExtension from '@aimana/extension-semantic-forge';
import { extensionHostConfigState } from './hostConfig.shared.js';

export interface InstalledExtensionConfigEntry {
    packageName: string;
    enabled: boolean;
    manifests: ExtensionManifestInput[];
}

export interface ExtensionHostConfig {
    disabledBuiltInExtensionIds: string[];
    installedExtensions: InstalledExtensionConfigEntry[];
}

const installedExtensionManifestCatalog: Record<string, ExtensionManifestInput[]> = {
    '@aimana/extension-semantic-forge': [semanticForgeExtension]
};

// package.json controls which extension packages are installed.
// This host config controls which installed packages are enabled in the app.
export const extensionHostConfig: ExtensionHostConfig = {
    disabledBuiltInExtensionIds: extensionHostConfigState.disabledBuiltInExtensionIds,
    installedExtensions: extensionHostConfigState.installedExtensions.map((entry) => ({
        ...entry,
        manifests: installedExtensionManifestCatalog[entry.packageName] ?? []
    }))
};
