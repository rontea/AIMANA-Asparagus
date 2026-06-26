import { Layers, LayoutGrid, Music, Scissors, Type, Wand2 } from 'lucide-react';
import { APP_METADATA } from '../utils/appMetadata';
import AestheticLabContent from '../pages/AestheticLabContent';
import AestheticLab from './image-editor/AestheticLab';
import {
    defineAssetLaunch,
    defineExtensionManifest,
    defineExtensionRoute,
    EXTENSION_ASSET_KIND,
    HOST_EXTENSION_SDK_VERSION,
    type ExtensionManifestInput
} from '@aimana/extension-sdk';

export const builtInExtensionManifests: ExtensionManifestInput[] = [
    defineExtensionManifest({
        id: 'image-editor',
        label: 'Aesthetic Lab',
        version: APP_METADATA.version,
        sdkVersion: HOST_EXTENSION_SDK_VERSION,
        description: 'Professional image manipulation toolset. Refine filters, transformations, and aesthetic markers for visual artifacts.',
        icon: Wand2,
        colorClass: 'text-indigo-400',
        actionClassName: 'text-indigo-400 hover:bg-indigo-500/10',
        status: 'ready',
        statusLabel: 'Launch Extension',
        tierLabel: 'Plugin Tier-1',
        launchPath: '/extensions/image-editor',
        ...defineAssetLaunch({
            assetTypes: [EXTENSION_ASSET_KIND.IMAGE],
            buildAssetLaunchPath: (itemId: string) => `/extensions/image-editor?itemId=${encodeURIComponent(itemId)}`
        }),
        routes: [
            defineExtensionRoute({
                id: 'image-editor-main',
                path: '/extensions/image-editor',
                label: 'Aesthetic Lab',
                component: AestheticLab,
                icon: Wand2,
                showInSidebar: true
            }),
            defineExtensionRoute({
                id: 'image-editor-content',
                path: 'extensions/image-editor/content',
                label: 'Lab Content',
                component: AestheticLabContent,
                icon: LayoutGrid,
                showInSidebar: true
            })
        ]
    }),
    defineExtensionManifest({
        id: 'temporal-trim',
        label: 'Temporal Trim',
        version: APP_METADATA.version,
        sdkVersion: HOST_EXTENSION_SDK_VERSION,
        description: 'Clip and sequence video manifests with frame-accurate precision. Essential for cinematic output refinement.',
        icon: Scissors,
        colorClass: 'text-blue-400',
        actionClassName: 'text-blue-400 hover:bg-blue-500/10',
        status: 'planned',
        statusLabel: 'Staged for v1.6',
        tierLabel: 'Plugin Tier-1',
        routes: []
    }),
    defineExtensionManifest({
        id: 'semantic-forge',
        label: 'Semantic Forge',
        version: APP_METADATA.version,
        sdkVersion: HOST_EXTENSION_SDK_VERSION,
        description: 'Automated prompt expansion and linguistic cleanup for high-fidelity neural input optimization.',
        icon: Type,
        colorClass: 'text-emerald-400',
        actionClassName: 'text-emerald-400 hover:bg-emerald-500/10',
        status: 'planned',
        statusLabel: 'Staged for v1.6',
        tierLabel: 'Plugin Tier-1',
        routes: []
    }),
    defineExtensionManifest({
        id: 'acoustic-node',
        label: 'Acoustic Node',
        version: APP_METADATA.version,
        sdkVersion: HOST_EXTENSION_SDK_VERSION,
        description: 'Audio waveform analysis and trimming. Synchronize neural speech artifacts with project timelines.',
        icon: Music,
        colorClass: 'text-pink-400',
        actionClassName: 'text-pink-400 hover:bg-pink-500/10',
        status: 'planned',
        statusLabel: 'Staged for v1.6',
        tierLabel: 'Plugin Tier-1',
        routes: []
    }),
    defineExtensionManifest({
        id: 'ecosystem-bridge',
        label: 'Ecosystem Bridge',
        version: APP_METADATA.version,
        sdkVersion: HOST_EXTENSION_SDK_VERSION,
        description: 'Multi-project asset synchronizer. Batch migration and cross-cluster linkage for large asset families.',
        icon: Layers,
        colorClass: 'text-amber-400',
        actionClassName: 'text-amber-400 hover:bg-amber-500/10',
        status: 'planned',
        statusLabel: 'Staged for v1.6',
        tierLabel: 'Plugin Tier-1',
        routes: []
    })
];
