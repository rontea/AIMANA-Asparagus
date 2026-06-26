export interface SharedInstalledExtensionConfigStateEntry {
    packageName: string;
    enabled: boolean;
}

export interface ExtensionHostConfigState {
    disabledBuiltInExtensionIds: string[];
    installedExtensions: SharedInstalledExtensionConfigStateEntry[];
}

export const extensionHostConfigState: ExtensionHostConfigState;
