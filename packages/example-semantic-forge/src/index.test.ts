import { describe, expect, it } from 'vitest';
import semanticForgeExtension, { semanticForgeValidatedRegistry } from './index';
import { EXTENSION_ACCESS_LEVEL } from '@aimana/extension-sdk';

describe('semantic forge example extension package', () => {
    it('exports a manifest that validates through the shared sdk', () => {
        expect(semanticForgeValidatedRegistry).toHaveLength(1);
        expect(semanticForgeValidatedRegistry[0]?.id).toBe('semantic-forge');
        expect(semanticForgeValidatedRegistry[0]?.launchPath).toBe('/extensions/semantic-forge');
    });

    it('uses helper builders to derive route hrefs and asset launch support', () => {
        expect(semanticForgeExtension.routes.map((route) => route.href)).toEqual([
            '/extensions/semantic-forge',
            '/extensions/semantic-forge/recipes'
        ]);
        expect(semanticForgeExtension.assetTypes).toEqual(['image']);
        expect(semanticForgeExtension.buildAssetLaunchPath?.('asset-123')).toBe('/extensions/semantic-forge?itemId=asset-123');
    });

    it('declares safe host capabilities and authenticated access defaults', () => {
        expect(semanticForgeValidatedRegistry[0]?.accessLevel).toBe(EXTENSION_ACCESS_LEVEL.AUTHENTICATED);
        expect(semanticForgeValidatedRegistry[0]?.capabilities.map((capability) => capability.key)).toEqual([
            'routes',
            'sidebar-links',
            'hub-cards',
            'asset-launch-actions',
            'db-migrations'
        ]);
    });
});
