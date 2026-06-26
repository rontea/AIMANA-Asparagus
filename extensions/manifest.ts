import { APP_METADATA } from '../utils/appMetadata';
import {
    createExtensionRegistry as createSdkExtensionRegistry,
    type CreateExtensionRegistryOptions,
    type ExtensionManifestInput
} from '@aimana/extension-sdk';

export * from '@aimana/extension-sdk';

export const createHostExtensionRegistry = (
    manifestInputs: ExtensionManifestInput[],
    options: CreateExtensionRegistryOptions = {}
) => createSdkExtensionRegistry(manifestInputs, {
    ...options,
    hostVersion: options.hostVersion ?? APP_METADATA.version
});
