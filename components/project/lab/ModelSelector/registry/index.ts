import * as Icons from 'lucide-react';
import { ModelOption, SupportedEngine } from '../types';
import { api } from '../../../../../services/api';

/**
 * Technical Neural Asset Map
 * Provides O(1) icon resolution for forged endpoints.
 */
const ICON_CACHE: Record<string, any> = {
    'Zap': Icons.Zap,
    'Cpu': Icons.Cpu,
    'FlaskConical': Icons.FlaskConical,
    'Wind': Icons.Wind,
    'Video': Icons.Video,
    'Image': Icons.Image,
    'Crown': Icons.Crown,
    'Sparkles': Icons.Sparkles,
    'BrainCircuit': Icons.BrainCircuit,
    'Rocket': Icons.Rocket,
    'Activity': Icons.Activity,
    'Layers': Icons.Layers,
    'MessageSquare': Icons.MessageSquare,
    'Type': Icons.Type,
    'Volume2': Icons.Volume2,
    'Wand2': Icons.Wand2,
    'ShieldCheck': Icons.ShieldCheck,
    'Network': Icons.Network,
    'Package': Icons.Package,
    'Default': Icons.Cpu
};

const REGISTRY_CACHE_TTL_MS = 20_000;
let registryCache: { fetchedAt: number; data: ModelOption[] } | null = null;
let inFlightRegistryRequest: Promise<ModelOption[]> | null = null;

/**
 * Dynamic Neural Registry Fetcher
 * Optimized for high-cadence Hub synchronization.
 */
export const loadDynamicRegistry = async (options?: { force?: boolean; livePricing?: boolean }): Promise<ModelOption[]> => {
    const force = options?.force === true;
    const livePricing = options?.livePricing !== false;
    const now = Date.now();

    if (!force && registryCache && (now - registryCache.fetchedAt) < REGISTRY_CACHE_TTL_MS) {
        return registryCache.data;
    }

    if (!force && inFlightRegistryRequest) {
        return inFlightRegistryRequest;
    }

    const request = (async () => {
    try {
        const params = new URLSearchParams({ ts: String(Date.now()) });
        if (!livePricing) params.set('pricing', 'static');
        const res = await fetch(`/api/settings/registry?${params.toString()}`, {
            headers: api.auth.getAuthHeaders(),
            cache: 'no-store'
        });
        
        if (!res.ok) throw new Error("Synchronization failure.");
        const dbData = await res.json();
        
        // Transform and Cache Registry
        const mapped = dbData.map((node: any) => {
            const isStatic = node.category === 'Static';
            const normalizedProvider = node.provider === 'Gateway' ? 'pollinations' : node.provider;
            const isPollinations = normalizedProvider === 'pollinations';
            const ratioSource = Array.isArray(node.supportedRatios)
                ? node.supportedRatios
                : (typeof node.supportedRatios === 'string' ? node.supportedRatios.split(',').map((r: string) => r.trim()).filter(Boolean) : []);
            const supportedRatios = ratioSource.length > 0 ? ratioSource : [];
            
            return {
                id: node.id as SupportedEngine,
                label: node.label,
                desc: node.description,
                upstreamId: typeof node.upstreamId === 'string' ? node.upstreamId : undefined,
                icon: isStatic ? Icons.Package : (ICON_CACHE[node.iconName] || ICON_CACHE.Default),
                color: isStatic ? 'text-slate-500' : (isPollinations ? 'text-cyan-400' : 'text-indigo-400'),
                limits: node.limits || '',
                efficiency: node.efficiencyTier || 'Balanced',
                provider: normalizedProvider,
                category: node.category,
                ratios: supportedRatios,
                isCustom: !!node.isProgrammable,
                isSystem: !!node.isSystem,
                isTested: !!node.isTested,
                isPaid: !!node.isPaid,
                dashboardUrl: typeof node.dashboardUrl === 'string' ? node.dashboardUrl : undefined,
                ratioNotes: typeof node.ratioNotes === 'string' ? node.ratioNotes : undefined,
                imagePricing: node.imagePricing && typeof node.imagePricing === 'object' ? node.imagePricing : undefined,
                videoPricing: node.videoPricing && typeof node.videoPricing === 'object' ? node.videoPricing : undefined,
                textContextLength: Number.isFinite(node.textContextLength) ? Number(node.textContextLength) : undefined,
                textTools: typeof node.textTools === 'boolean' ? node.textTools : undefined,
                textReasoning: typeof node.textReasoning === 'boolean' ? node.textReasoning : undefined,
                textPaidOnly: typeof node.textPaidOnly === 'boolean' ? node.textPaidOnly : undefined,
                textSpecialized: typeof node.textSpecialized === 'boolean' ? node.textSpecialized : undefined,
                textInputModalities: Array.isArray(node.textInputModalities) ? node.textInputModalities : undefined,
                textOutputModalities: Array.isArray(node.textOutputModalities) ? node.textOutputModalities : undefined,
                textAliases: Array.isArray(node.textAliases) ? node.textAliases : undefined,
                textPricing: node.textPricing && typeof node.textPricing === 'object' ? node.textPricing : undefined,
                textVoices: Array.isArray(node.textVoices) ? node.textVoices : undefined,
                capabilities: typeof node.capabilities === 'string'
                    ? node.capabilities.split(',').map((cap: string) => cap.trim().toLowerCase()).filter(Boolean)
                    : (Array.isArray(node.capabilities)
                        ? node.capabilities.map((cap: any) => String(cap || '').trim().toLowerCase()).filter(Boolean)
                        : undefined)
            };
        });

        registryCache = { fetchedAt: Date.now(), data: mapped };
        return mapped;
    } catch (e) {
        console.warn("[HUB_SYNC_ERR] Reverting to local fallback.");
        return registryCache?.data || [];
    }
    })();

    inFlightRegistryRequest = request;
    try {
        return await request;
    } finally {
        if (inFlightRegistryRequest === request) {
            inFlightRegistryRequest = null;
        }
    }
};

export type { ModelOption, SupportedEngine };
