import { APP_METADATA } from '../utils/appMetadata';
import {
    createExtensionRegistry,
    ExtensionManifestValidationError,
    HOST_EXTENSION_SDK_VERSION,
    type ExtensionManifest,
    type ExtensionManifestValidationIssue
} from '@aimana/extension-sdk';
import { builtInExtensionManifests } from './builtIn';
import { extensionHostConfig, type ExtensionHostConfig } from './hostConfig';

export interface LoadedExtensionRegistry {
    builtInExtensions: ExtensionManifest[];
    installedExtensions: ExtensionManifest[];
    extensionRegistry: ExtensionManifest[];
}

export class ExtensionRegistryLoadError extends Error {
    readonly issues: ExtensionManifestValidationIssue[];
    readonly diagnostics: {
        disabledBuiltInExtensionIds: string[];
        enabledInstalledPackageNames: string[];
        builtInExtensionIds: string[];
        installedExtensionIds: string[];
    };

    constructor(
        issues: ExtensionManifestValidationIssue[],
        diagnostics: {
            disabledBuiltInExtensionIds: string[];
            enabledInstalledPackageNames: string[];
            builtInExtensionIds: string[];
            installedExtensionIds: string[];
        }
    ) {
        const diagnosticLines = [
            'Failed to load the host extension registry.',
            diagnostics.disabledBuiltInExtensionIds.length
                ? `Disabled built-in extension ids: ${diagnostics.disabledBuiltInExtensionIds.join(', ')}`
                : 'Disabled built-in extension ids: none',
            diagnostics.enabledInstalledPackageNames.length
                ? `Enabled installed extension packages: ${diagnostics.enabledInstalledPackageNames.join(', ')}`
                : 'Enabled installed extension packages: none',
            diagnostics.builtInExtensionIds.length
                ? `Resolved built-in extension ids: ${diagnostics.builtInExtensionIds.join(', ')}`
                : 'Resolved built-in extension ids: none',
            diagnostics.installedExtensionIds.length
                ? `Resolved installed extension ids: ${diagnostics.installedExtensionIds.join(', ')}`
                : 'Resolved installed extension ids: none',
            'Validation issues:',
            ...issues.map((issue) => `- [${issue.code}] ${issue.message}`)
        ];

        super(diagnosticLines.join('\n'));
        this.name = 'ExtensionRegistryLoadError';
        this.issues = issues;
        this.diagnostics = diagnostics;
    }
}

const createIssue = (
    code: string,
    message: string,
    extensionId?: string
): ExtensionManifestValidationIssue => ({
    code,
    message,
    extensionId
});

const getEnabledInstalledExtensions = (hostConfig: ExtensionHostConfig) =>
    hostConfig.installedExtensions.filter((extensionEntry) => extensionEntry.enabled);

export const loadExtensionRegistry = (
    hostConfig: ExtensionHostConfig = extensionHostConfig
): LoadedExtensionRegistry => {
    const disabledBuiltInIds = new Set(hostConfig.disabledBuiltInExtensionIds);
    const enabledInstalledExtensions = getEnabledInstalledExtensions(hostConfig);
    const knownBuiltInIds = new Set(builtInExtensionManifests.map((manifest) => manifest.id));
    const configIssues = hostConfig.disabledBuiltInExtensionIds
        .filter((extensionId) => !knownBuiltInIds.has(extensionId))
        .map((extensionId) =>
            createIssue(
                'unknown-disabled-built-in-id',
                `Host config disables built-in extension "${extensionId}" but no built-in extension uses that id.`,
                extensionId
            )
        );

    const builtInManifestInputs = builtInExtensionManifests.filter((manifest) => !disabledBuiltInIds.has(manifest.id));
    const installedManifestInputs = enabledInstalledExtensions.flatMap((entry) => entry.manifests);
    const diagnostics = {
        disabledBuiltInExtensionIds: hostConfig.disabledBuiltInExtensionIds,
        enabledInstalledPackageNames: enabledInstalledExtensions.map((entry) => entry.packageName),
        builtInExtensionIds: builtInManifestInputs.map((manifest) => manifest.id),
        installedExtensionIds: installedManifestInputs.map((manifest) => manifest.id)
    };

    if (configIssues.length > 0) {
        throw new ExtensionRegistryLoadError(configIssues, diagnostics);
    }

    try {
        const extensionRegistry = createExtensionRegistry(
            [...builtInManifestInputs, ...installedManifestInputs],
            {
                hostVersion: APP_METADATA.version,
                sdkVersion: HOST_EXTENSION_SDK_VERSION
            }
        );
        const builtInExtensions = extensionRegistry.slice(0, builtInManifestInputs.length);
        const installedExtensions = extensionRegistry.slice(builtInManifestInputs.length);

        return {
            builtInExtensions,
            installedExtensions,
            extensionRegistry
        };
    } catch (error) {
        if (error instanceof ExtensionManifestValidationError) {
            throw new ExtensionRegistryLoadError(error.issues, diagnostics);
        }

        throw error;
    }
};
