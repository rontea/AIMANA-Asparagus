import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus,
    Activity,
    Loader2,
    Search,
    LayoutGrid,
    List as ListIcon,
    X,
    Filter,
    CheckCircle2,
    AlertCircle,
    BrainCircuit,
    DollarSign,
    RefreshCcw,
    Cpu,
    ImageIcon,
    Type as TypeIcon,
    Mic,
    Video,
    ArrowUpRight
} from 'lucide-react';
import { ModelOption, loadDynamicRegistry } from '../project/lab/ModelSelector/registry/index';
import { RegistryGrid } from './RegistryGrid';
import { ManagementModal } from './ManagementModal/index';
import { api } from '../../services/api';

type CategoryFilter = 'all' | 'Visual' | 'Motion' | 'Language' | 'Audio' | 'Static';
type ProviderFilter = 'all' | 'google' | 'pollinations' | 'nvidia' | 'custom';
type StatusFilter = 'all' | 'tested' | 'untested';
type CapabilityFilter =
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'tools'
    | 'reasoning'
    | 'search'
    | 'code'
    | 'specialized';

export const IntelligenceHubContent: React.FC = () => {
    const [allModels, setAllModels] = useState<ModelOption[]>([]);
    const [dbEngines, setDbEngines] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedEngine, setSelectedEngine] = useState<any | null>(null);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [isSyncingGoogleModels, setIsSyncingGoogleModels] = useState(false);
    const [isSyncingImageModels, setIsSyncingImageModels] = useState(false);
    const [isSyncingTextModels, setIsSyncingTextModels] = useState(false);
    const [isSyncingAudioModels, setIsSyncingAudioModels] = useState(false);
    const [isSyncingVideoModels, setIsSyncingVideoModels] = useState(false);
    const [googleSyncSummary, setGoogleSyncSummary] = useState<string | null>(null);
    const [imageSyncSummary, setImageSyncSummary] = useState<string | null>(null);
    const [syncSummary, setSyncSummary] = useState<string | null>(null);
    const [audioSyncSummary, setAudioSyncSummary] = useState<string | null>(null);
    const [videoSyncSummary, setVideoSyncSummary] = useState<string | null>(null);
    const [googleSyncError, setGoogleSyncError] = useState<string | null>(null);
    const [imageSyncError, setImageSyncError] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [audioSyncError, setAudioSyncError] = useState<string | null>(null);
    const [videoSyncError, setVideoSyncError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
    const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [capabilityFilters, setCapabilityFilters] = useState<CapabilityFilter[]>([]);
    const [viewType, setViewType] = useState<'grid' | 'list'>(
        () => (localStorage.getItem('aimana_hub_view') as 'grid' | 'list') || 'grid'
    );
    const [showFilters, setShowFilters] = useState(false);

    const refreshHub = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        try {
            const registry = await loadDynamicRegistry();
            setAllModels(registry);

            const res = await fetch('/api/settings/registry/admin', {
                headers: api.auth.getAuthHeaders()
            });
            if (res.ok) setDbEngines(await res.json());
        } catch (e) {
            console.error('Hub refresh failure', e);
        } finally {
            if (showLoading) setIsLoading(false);
        }
    }, []);

    const notifySyncError = useCallback((title: string, message: string) => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('aimana-notification', {
            detail: {
                type: 'error',
                title,
                message,
                source: 'registry-sync'
            }
        }));
    }, []);

    useEffect(() => {
        refreshHub();

        const syncListener = () => refreshHub(false);
        window.addEventListener('aimana-registry-updated', syncListener);
        return () => window.removeEventListener('aimana-registry-updated', syncListener);
    }, [refreshHub]);

    useEffect(() => {
        localStorage.setItem('aimana_hub_view', viewType);
    }, [viewType]);

    const stats = useMemo(() => {
        return {
            total: allModels.length,
            tested: allModels.filter((m) => m.isTested).length,
            untested: allModels.filter((m) => !m.isTested).length
        };
    }, [allModels]);

    const filteredModels = useMemo(() => {
        return allModels.filter((m) => {
            const modelCapabilities = new Set<string>([
                ...(m.capabilities || []).map((cap) => String(cap || '').trim().toLowerCase()),
                ...(m.textInputModalities || []).map((modality) => String(modality || '').trim().toLowerCase()),
                ...(m.textOutputModalities || []).map((modality) => String(modality || '').trim().toLowerCase())
            ]);

            if (m.category === 'Language') modelCapabilities.add('text');
            if (m.category === 'Visual') modelCapabilities.add('image');
            if (m.category === 'Motion') modelCapabilities.add('video');
            if (m.category === 'Audio') modelCapabilities.add('audio');
            if (m.textTools) modelCapabilities.add('tools');
            if (m.textReasoning) {
                modelCapabilities.add('reasoning');
                modelCapabilities.add('logic');
            }
            if (m.textSpecialized) modelCapabilities.add('specialized');

            const lowSearch = searchTerm.toLowerCase();
            const matchesSearch =
                !searchTerm.trim() ||
                m.label.toLowerCase().includes(lowSearch) ||
                m.desc.toLowerCase().includes(lowSearch) ||
                (m.id as string).toLowerCase().includes(lowSearch);

            const matchesCategory =
                categoryFilter === 'all' ||
                (categoryFilter === 'Audio'
                    ? m.category === 'Audio' ||
                      (m.capabilities || []).includes('audio') ||
                      (m.textInputModalities || []).includes('audio') ||
                      (m.textOutputModalities || []).includes('audio')
                    : m.category === categoryFilter);

            const matchesProvider =
                providerFilter === 'all' ||
                (providerFilter === 'custom' ? (m as any).isCustom : m.provider === providerFilter);

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'tested' ? m.isTested : !m.isTested);

            const matchesCapability =
                capabilityFilters.length === 0 ||
                capabilityFilters.every((capability) => modelCapabilities.has(capability));

            return matchesSearch && matchesCategory && matchesProvider && matchesStatus && matchesCapability;
        });
    }, [allModels, searchTerm, categoryFilter, providerFilter, statusFilter, capabilityFilters]);

    const resetFilters = () => {
        setSearchTerm('');
        setCategoryFilter('all');
        setProviderFilter('all');
        setStatusFilter('all');
        setCapabilityFilters([]);
    };

    const hasActiveFilters =
        searchTerm !== '' ||
        categoryFilter !== 'all' ||
        providerFilter !== 'all' ||
        statusFilter !== 'all' ||
        capabilityFilters.length > 0;

    const gatewayStats = useMemo(() => {
        const pollinationsModels = allModels.filter((m) => m.provider === 'pollinations');
        const languageModels = pollinationsModels.filter((m) => m.category === 'Language');
        return {
            visual: pollinationsModels.filter((m) => m.category === 'Visual').length,
            language: languageModels.length,
            motion: pollinationsModels.filter((m) => m.category === 'Motion').length,
            audio: pollinationsModels.filter((m) => m.category === 'Audio').length,
            paid: pollinationsModels.filter((m) => m.isPaid || m.textPaidOnly).length,
            multimodalLanguage: languageModels.filter((m) => (m.textInputModalities || []).length > 1).length
        };
    }, [allModels]);

    const googleStats = useMemo(() => {
        const googleModels = allModels.filter((m) => m.provider === 'google');
        return {
            total: googleModels.length,
            language: googleModels.filter((m) => m.category === 'Language').length,
            visual: googleModels.filter((m) => m.category === 'Visual').length,
            audio: googleModels.filter((m) => m.category === 'Audio').length,
            paid: googleModels.filter((m) => m.isPaid || m.textPaidOnly).length
        };
    }, [allModels]);

    const syncGoogleModels = useCallback(async () => {
        setIsSyncingGoogleModels(true);
        setGoogleSyncError(null);
        setGoogleSyncSummary(null);
        try {
            const payload = await api.settings.syncGoogleModels();
            const inserted = Number(payload.inserted || 0);
            const updated = Number(payload.updated || 0);
            const totalSynced = Number(payload.totalSynced || 0);
            setGoogleSyncSummary(
                `Google sync complete: ${inserted} inserted, ${updated} updated, ${totalSynced} active models synced.`
            );
            setProviderFilter('google');
            setCategoryFilter('all');
            await refreshHub(false);
            window.dispatchEvent(new CustomEvent('aimana-registry-updated'));
        } catch (e: any) {
            const message = e?.message || 'Google model sync failed';
            setGoogleSyncError(message);
            notifySyncError('Google Sync Failed', message);
        } finally {
            setIsSyncingGoogleModels(false);
        }
    }, [notifySyncError, refreshHub]);

    const syncPollinationsImageModels = useCallback(async () => {
        setIsSyncingImageModels(true);
        setImageSyncError(null);
        setImageSyncSummary(null);
        try {
            const res = await fetch('/api/settings/registry/sync/pollinations-image', {
                method: 'POST',
                headers: api.auth.getAuthHeaders()
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || 'Failed to sync Pollinations image models');
            }
            const inserted = Number(payload.inserted || 0);
            const updated = Number(payload.updated || 0);
            const skipped = Number(payload.skipped || 0);
            setImageSyncSummary(`Pollinations image sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
            setCategoryFilter('Visual');
            await refreshHub(false);
            window.dispatchEvent(new CustomEvent('aimana-registry-updated'));
        } catch (e: any) {
            const message = e?.message || 'Pollinations image sync failed';
            setImageSyncError(message);
            notifySyncError('Pollinations Image Sync Failed', message);
        } finally {
            setIsSyncingImageModels(false);
        }
    }, [notifySyncError, refreshHub]);

    const syncPollinationsTextModels = useCallback(async () => {
        setIsSyncingTextModels(true);
        setSyncError(null);
        setSyncSummary(null);
        try {
            const res = await fetch('/api/settings/registry/sync/pollinations-text', {
                method: 'POST',
                headers: api.auth.getAuthHeaders()
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || 'Failed to sync Pollinations text models');
            }

            const inserted = Number(payload.inserted || 0);
            const updated = Number(payload.updated || 0);
            const skipped = Number(payload.skipped || 0);
            setSyncSummary(`Pollinations text sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
            setCategoryFilter('Language');
            await refreshHub(false);
            window.dispatchEvent(new CustomEvent('aimana-registry-updated'));
        } catch (e: any) {
            const message = e?.message || 'Pollinations text sync failed';
            setSyncError(message);
            notifySyncError('Pollinations Text Sync Failed', message);
        } finally {
            setIsSyncingTextModels(false);
        }
    }, [notifySyncError, refreshHub]);

    const syncPollinationsAudioModels = useCallback(async () => {
        setIsSyncingAudioModels(true);
        setAudioSyncError(null);
        setAudioSyncSummary(null);
        try {
            const res = await fetch('/api/settings/registry/sync/pollinations-audio', {
                method: 'POST',
                headers: api.auth.getAuthHeaders()
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || 'Failed to sync Pollinations audio models');
            }

            const inserted = Number(payload.inserted || 0);
            const updated = Number(payload.updated || 0);
            const skipped = Number(payload.skipped || 0);
            setAudioSyncSummary(`Pollinations audio sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
            setCategoryFilter('Audio');
            await refreshHub(false);
            window.dispatchEvent(new CustomEvent('aimana-registry-updated'));
        } catch (e: any) {
            const message = e?.message || 'Pollinations audio sync failed';
            setAudioSyncError(message);
            notifySyncError('Pollinations Audio Sync Failed', message);
        } finally {
            setIsSyncingAudioModels(false);
        }
    }, [notifySyncError, refreshHub]);

    const syncPollinationsVideoModels = useCallback(async () => {
        setIsSyncingVideoModels(true);
        setVideoSyncError(null);
        setVideoSyncSummary(null);
        try {
            const res = await fetch('/api/settings/registry/sync/pollinations-video', {
                method: 'POST',
                headers: api.auth.getAuthHeaders()
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || 'Failed to sync Pollinations video models');
            }

            const inserted = Number(payload.inserted || 0);
            const updated = Number(payload.updated || 0);
            const skipped = Number(payload.skipped || 0);
            setVideoSyncSummary(`Pollinations video sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped.`);
            setCategoryFilter('Motion');
            await refreshHub(false);
            window.dispatchEvent(new CustomEvent('aimana-registry-updated'));
        } catch (e: any) {
            const message = e?.message || 'Pollinations video sync failed';
            setVideoSyncError(message);
            notifySyncError('Pollinations Video Sync Failed', message);
        } finally {
            setIsSyncingVideoModels(false);
        }
    }, [notifySyncError, refreshHub]);

    const categoryOptions: Array<{ id: CategoryFilter; label: string }> = [
        { id: 'all', label: 'Every Cluster' },
        { id: 'Visual', label: 'Visual' },
        { id: 'Motion', label: 'Motion' },
        { id: 'Language', label: 'Language' },
        { id: 'Audio', label: 'Audio' },
        { id: 'Static', label: 'Static' }
    ];

    const providerOptions: Array<{ id: ProviderFilter; label: string }> = [
        { id: 'all', label: 'All Providers' },
        { id: 'google', label: 'Google' },
        { id: 'pollinations', label: 'Pollinations' },
        { id: 'nvidia', label: 'NVIDIA' },
        { id: 'custom', label: 'User Forged' }
    ];

    const statusOptions: Array<{
        id: StatusFilter;
        label: string;
        icon: typeof Activity;
        activeClasses: string;
    }> = [
        {
            id: 'all',
            label: 'Any Status',
            icon: Activity,
            activeClasses: 'bg-indigo-500 text-white border-indigo-400 shadow-[0_0_14px_rgba(99,102,241,0.25)]'
        },
        {
            id: 'tested',
            label: 'Verified',
            icon: CheckCircle2,
            activeClasses: 'bg-emerald-500/90 text-white border-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.25)]'
        },
        {
            id: 'untested',
            label: 'Awaiting',
            icon: AlertCircle,
            activeClasses: 'bg-rose-500/90 text-white border-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.25)]'
        }
    ];

    const capabilityOptions: Array<{ id: CapabilityFilter; label: string }> = [
        { id: 'text', label: 'Text' },
        { id: 'image', label: 'Image' },
        { id: 'video', label: 'Video' },
        { id: 'audio', label: 'Audio' },
        { id: 'tools', label: 'Tools' },
        { id: 'reasoning', label: 'Reasoning' },
        { id: 'search', label: 'Search' },
        { id: 'code', label: 'Code' },
        { id: 'specialized', label: 'Specialized' }
    ];

    const capabilityLabelMap: Record<CapabilityFilter, string> = Object.fromEntries(
        capabilityOptions.map((cap) => [cap.id, cap.label])
    ) as Record<CapabilityFilter, string>;

    const activeFilterPills = [
        categoryFilter !== 'all' ? `Tier: ${categoryFilter}` : null,
        providerFilter !== 'all'
            ? `Origin: ${providerFilter === 'custom' ? 'User Forged' : providerFilter}`
            : null,
        statusFilter !== 'all' ? `Status: ${statusFilter === 'tested' ? 'Verified' : 'Awaiting'}` : null,
        capabilityFilters.length > 0
            ? `Capabilities: ${capabilityFilters.map((cap) => capabilityLabelMap[cap] || cap).join(', ')}`
            : null,
        searchTerm.trim() ? `Search: ${searchTerm}` : null
    ].filter(Boolean) as string[];

    const syncCards = [
        {
            title: 'Google Models',
            count: `${googleStats.total} Models`,
            icon: BrainCircuit,
            panelClasses: 'border-indigo-500/25 bg-indigo-500/[0.07] hover:border-indigo-400/50 hover:bg-indigo-500/[0.09]',
            iconClasses: 'border-indigo-400/25 bg-indigo-500/15 text-indigo-300',
            badgeClasses: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-200',
            buttonClasses: 'bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30 shadow-[0_0_16px_rgba(79,70,229,0.28)]',
            tags: [
                `Language ${googleStats.language}`,
                `Visual ${googleStats.visual}`,
                `Audio ${googleStats.audio}`,
                `Paid ${googleStats.paid}`
            ],
            syncing: isSyncingGoogleModels,
            onSync: syncGoogleModels
        },
        {
            title: 'Pollinations Image',
            count: `${gatewayStats.visual} Models`,
            icon: ImageIcon,
            panelClasses: 'border-amber-500/25 bg-amber-500/[0.07] hover:border-amber-400/50 hover:bg-amber-500/[0.09]',
            iconClasses: 'border-amber-400/25 bg-amber-500/15 text-amber-300',
            badgeClasses: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
            buttonClasses: 'bg-amber-600 hover:bg-amber-500 border-amber-400/30 shadow-[0_0_16px_rgba(245,158,11,0.26)]',
            tags: [`Visual ${gatewayStats.visual}`, `Paid ${gatewayStats.paid}`],
            syncing: isSyncingImageModels,
            onSync: syncPollinationsImageModels
        },
        {
            title: 'Pollinations Text',
            count: `${gatewayStats.language} Models`,
            icon: TypeIcon,
            panelClasses: 'border-cyan-500/25 bg-cyan-500/[0.07] hover:border-cyan-400/50 hover:bg-cyan-500/[0.09]',
            iconClasses: 'border-cyan-400/25 bg-cyan-500/15 text-cyan-300',
            badgeClasses: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200',
            buttonClasses: 'bg-cyan-600 hover:bg-cyan-500 border-cyan-400/30 shadow-[0_0_16px_rgba(6,182,212,0.26)]',
            tags: [`Language ${gatewayStats.language}`, `Multimodal ${gatewayStats.multimodalLanguage}`],
            syncing: isSyncingTextModels,
            onSync: syncPollinationsTextModels
        },
        {
            title: 'Pollinations Audio',
            count: `${gatewayStats.audio} Models`,
            icon: Mic,
            panelClasses: 'border-pink-500/25 bg-pink-500/[0.07] hover:border-pink-400/50 hover:bg-pink-500/[0.09]',
            iconClasses: 'border-pink-400/25 bg-pink-500/15 text-pink-300',
            badgeClasses: 'border-pink-500/25 bg-pink-500/10 text-pink-200',
            buttonClasses: 'bg-pink-600 hover:bg-pink-500 border-pink-400/30 shadow-[0_0_16px_rgba(236,72,153,0.26)]',
            tags: [`Audio ${gatewayStats.audio}`],
            syncing: isSyncingAudioModels,
            onSync: syncPollinationsAudioModels
        },
        {
            title: 'Pollinations Video',
            count: `${gatewayStats.motion} Models`,
            icon: Video,
            panelClasses: 'border-emerald-500/25 bg-emerald-500/[0.07] hover:border-emerald-400/50 hover:bg-emerald-500/[0.09]',
            iconClasses: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300',
            badgeClasses: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
            buttonClasses: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400/30 shadow-[0_0_16px_rgba(16,185,129,0.26)]',
            tags: [`Motion ${gatewayStats.motion}`],
            syncing: isSyncingVideoModels,
            onSync: syncPollinationsVideoModels
        }
    ];

    const syncMessages = [
        { tone: 'success' as const, message: googleSyncSummary },
        { tone: 'success' as const, message: imageSyncSummary },
        { tone: 'success' as const, message: syncSummary },
        { tone: 'success' as const, message: audioSyncSummary },
        { tone: 'success' as const, message: videoSyncSummary },
        { tone: 'error' as const, message: googleSyncError },
        { tone: 'error' as const, message: imageSyncError },
        { tone: 'error' as const, message: syncError },
        { tone: 'error' as const, message: audioSyncError },
        { tone: 'error' as const, message: videoSyncError }
    ].filter((item): item is { tone: 'success' | 'error'; message: string } => Boolean(item.message));

    return (
        <section className="mt-8 mb-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#050b18] px-4 py-4 md:px-6 md:py-5 shadow-[0_24px_80px_rgba(2,6,23,0.4)]">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
                <div className="absolute -right-16 top-0 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="absolute left-1/3 top-8 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl" />

                <div className="relative z-10 flex flex-col gap-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-300 shadow-[0_0_18px_rgba(99,102,241,0.22)]">
                                <Activity size={20} className="animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                <div>
                                    <h2 className="text-lg font-black uppercase tracking-[0.28em] text-white">
                                        Neural Registry
                                    </h2>
                                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                                        Infrastructure view of every AI checkpoint lane
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="rounded-full border border-slate-700/80 bg-slate-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">
                                        Matches {filteredModels.length}
                                    </span>
                                    <span className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]" />
                                        {stats.tested} Verified
                                    </span>
                                    <span className="flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]" />
                                        {stats.untested} Pending
                                    </span>
                                    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
                                        Total {stats.total}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full flex-col gap-3 xl:max-w-[920px] xl:flex-row xl:items-center xl:justify-end">
                            <div className="relative w-full xl:max-w-xl group">
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 transition-colors group-focus-within:text-indigo-300"
                                    size={16}
                                />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search registry..."
                                    className="w-full rounded-2xl border border-slate-800/80 bg-slate-950/70 py-3 pl-10 pr-10 text-sm text-white outline-none transition-all placeholder:text-slate-600 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/30"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 transition-colors hover:text-white"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] transition-all ${
                                        showFilters || hasActiveFilters
                                            ? 'border-indigo-400/40 bg-indigo-600 text-white shadow-[0_0_18px_rgba(79,70,229,0.3)]'
                                            : 'border-slate-800/80 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:text-white'
                                    }`}
                                >
                                    <Filter size={14} />
                                    Filters
                                    {hasActiveFilters && <span className="ml-1 h-2 w-2 rounded-full bg-white" />}
                                </button>

                                <div className="flex items-center rounded-2xl border border-slate-800/80 bg-slate-950/70 p-1.5 shadow-inner">
                                    <button
                                        onClick={() => setViewType('grid')}
                                        className={`rounded-xl p-2 transition-all ${
                                            viewType === 'grid'
                                                ? 'bg-indigo-600 text-white shadow-[0_0_16px_rgba(79,70,229,0.25)]'
                                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                                        }`}
                                        title="Grid View"
                                    >
                                        <LayoutGrid size={16} />
                                    </button>
                                    <button
                                        onClick={() => setViewType('list')}
                                        className={`rounded-xl p-2 transition-all ${
                                            viewType === 'list'
                                                ? 'bg-indigo-600 text-white shadow-[0_0_16px_rgba(79,70,229,0.25)]'
                                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
                                        }`}
                                        title="Technical List"
                                    >
                                        <ListIcon size={16} />
                                    </button>
                                </div>

                                <button
                                    onClick={() => {
                                        setSelectedEngine(null);
                                        setIsManageModalOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-3 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-indigo-100 transition-all hover:bg-indigo-500/20 hover:text-white shadow-[0_0_22px_rgba(79,70,229,0.2)]"
                                >
                                    <Plus size={16} />
                                    Forge New Checkpoint
                                </button>
                            </div>
                        </div>
                    </div>

                    {(activeFilterPills.length > 0 || showFilters) && (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800/70 bg-slate-950/55 px-4 py-3">
                            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                                Active Surface
                            </span>
                            {activeFilterPills.length > 0 ? (
                                activeFilterPills.map((pill) => (
                                    <span
                                        key={pill}
                                        className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200"
                                    >
                                        {pill}
                                    </span>
                                ))
                            ) : (
                                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                                    Filters drawer open with no active constraints
                                </span>
                            )}
                            {hasActiveFilters && (
                                <button
                                    onClick={resetFilters}
                                    className="ml-auto inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 transition-colors hover:text-white"
                                >
                                    Reset
                                    <ArrowUpRight size={12} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showFilters && (
                <div className="rounded-[2rem] border border-slate-800/70 bg-[#08111f]/95 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)] animate-in slide-in-from-top-2">
                    <div className="grid gap-6 xl:grid-cols-[1.2fr_1.1fr_1fr_1.3fr_auto] xl:items-start">
                        <div className="space-y-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                                Infrastructure Tier
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {categoryOptions.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setCategoryFilter(cat.id)}
                                        className={`rounded-2xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] transition-all ${
                                            categoryFilter === cat.id
                                                ? 'border-indigo-400 bg-indigo-500 text-white shadow-[0_0_16px_rgba(99,102,241,0.24)]'
                                                : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                                Origin Protocol
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {providerOptions.map((prov) => (
                                    <button
                                        key={prov.id}
                                        onClick={() => setProviderFilter(prov.id)}
                                        className={`rounded-2xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] transition-all ${
                                            providerFilter === prov.id
                                                ? 'border-indigo-400 bg-indigo-500 text-white shadow-[0_0_16px_rgba(99,102,241,0.24)]'
                                                : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        {prov.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                                Testing Status
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {statusOptions.map((status) => (
                                    <button
                                        key={status.id}
                                        onClick={() => setStatusFilter(status.id)}
                                        className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] transition-all ${
                                            statusFilter === status.id
                                                ? status.activeClasses
                                                : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        <status.icon size={12} />
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">
                                Model Capabilities
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setCapabilityFilters([])}
                                    className={`rounded-2xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] transition-all ${
                                        capabilityFilters.length === 0
                                            ? 'border-indigo-400 bg-indigo-500 text-white shadow-[0_0_16px_rgba(99,102,241,0.24)]'
                                            : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                    }`}
                                >
                                    All Capabilities
                                </button>
                                {capabilityOptions.map((cap) => (
                                    <button
                                        key={cap.id}
                                        onClick={() =>
                                            setCapabilityFilters((prev) =>
                                                prev.includes(cap.id)
                                                    ? prev.filter((entry) => entry !== cap.id)
                                                    : [...prev, cap.id]
                                            )
                                        }
                                        className={`rounded-2xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.22em] transition-all ${
                                            capabilityFilters.includes(cap.id)
                                                ? 'border-indigo-400 bg-indigo-500 text-white shadow-[0_0_16px_rgba(99,102,241,0.24)]'
                                                : 'border-slate-800/80 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        {cap.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex h-full flex-col justify-end">
                            <button
                                onClick={resetFilters}
                                disabled={!hasActiveFilters}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-6 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 transition-all hover:border-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <X size={14} />
                                Clear Active Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className="relative overflow-hidden rounded-[2rem] border border-slate-800/70 bg-slate-900/50 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-sm md:p-8">
                <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-indigo-500/10 blur-[110px]" />
                <div className="relative z-10 space-y-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">
                                <RefreshCcw size={12} />
                                Registry Sync
                            </div>
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-[0.14em] text-white">
                                    Provider Lanes
                                </h3>
                                <p className="mt-2 text-sm uppercase tracking-[0.18em] text-slate-400">
                                    Pull current Google Gemini and Pollinations model lanes into Configuration Hub.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">
                                <Cpu size={12} />
                                Google {googleStats.total}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                                <TypeIcon size={12} />
                                Text {gatewayStats.language}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
                                <ImageIcon size={12} />
                                Visual {gatewayStats.visual}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-pink-500/20 bg-pink-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-pink-200">
                                <Mic size={12} />
                                Audio {gatewayStats.audio}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                                <Video size={12} />
                                Motion {gatewayStats.motion}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
                                <DollarSign size={12} />
                                Paid {googleStats.paid + gatewayStats.paid}
                            </span>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {syncCards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <div
                                    key={card.title}
                                    className={`group flex h-full flex-col rounded-[1.6rem] border p-4 transition-all ${card.panelClasses}`}
                                >
                                    <div className="mb-4 flex items-start justify-between gap-3">
                                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${card.iconClasses}`}>
                                            <Icon size={18} />
                                        </div>
                                        <span className={`rounded-xl border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${card.badgeClasses}`}>
                                            {card.count}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                                                {card.title}
                                            </h4>
                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                                Sync and refresh registry metadata
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5">
                                            {card.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-300"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        onClick={card.onSync}
                                        disabled={card.syncing}
                                        className={`mt-6 inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-white transition-all disabled:cursor-not-allowed disabled:opacity-60 ${card.buttonClasses}`}
                                    >
                                        {card.syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} className="transition-transform group-hover:rotate-180" />}
                                        Sync
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setCategoryFilter('Visual')}
                            className="rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/20"
                        >
                            Filter Visual
                        </button>
                        <button
                            onClick={() => setCategoryFilter('Language')}
                            className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200 transition-all hover:bg-cyan-500/20"
                        >
                            Filter Language
                        </button>
                        <button
                            onClick={() => setCategoryFilter('Motion')}
                            className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-all hover:bg-emerald-500/20"
                        >
                            Filter Motion
                        </button>
                        <button
                            onClick={() => setCategoryFilter('Audio')}
                            className="rounded-full border border-pink-500/20 bg-pink-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-pink-200 transition-all hover:bg-pink-500/20"
                        >
                            Filter Audio
                        </button>
                    </div>

                    {syncMessages.length > 0 && (
                        <div className="space-y-3">
                            {syncMessages.map((item) => (
                                <div
                                    key={`${item.tone}-${item.message}`}
                                    className={`inline-flex max-w-full items-center gap-2 rounded-2xl border px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] ${
                                        item.tone === 'success'
                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                                            : 'border-rose-500/20 bg-rose-500/10 text-rose-200'
                                    }`}
                                >
                                    {item.tone === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                    <span>{item.message}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {isLoading ? (
                <div className="flex h-56 items-center justify-center rounded-[2rem] border border-slate-800/70 bg-[#050b18]">
                    <Loader2 size={32} className="animate-spin text-indigo-400" />
                </div>
            ) : filteredModels.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-slate-800/80 bg-slate-900/30 py-24 text-center animate-in zoom-in-95">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-slate-700">
                        <Search size={40} />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-[0.24em] text-slate-400">
                        No Matching Neural Checkpoints
                    </h3>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                        Try adjusting your status or provider filters
                    </p>
                    <button
                        onClick={resetFilters}
                        className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-indigo-300 underline underline-offset-8 transition-colors hover:text-indigo-200"
                    >
                        Clear Environment Filter
                    </button>
                </div>
            ) : (
                <RegistryGrid
                    models={filteredModels}
                    customEngines={dbEngines}
                    viewType={viewType}
                    onConfigure={(model) => {
                        const dynamic = dbEngines.find((c) => c.id === model.id);
                        setSelectedEngine(dynamic ? { ...dynamic, isProgrammable: !!dynamic.isProgrammable } : { ...model, isProgrammable: false });
                        setIsManageModalOpen(true);
                    }}
                />
            )}

            {isManageModalOpen && (
                <ManagementModal
                    isOpen={isManageModalOpen}
                    onClose={() => {
                        setIsManageModalOpen(false);
                        refreshHub();
                    }}
                    engine={selectedEngine}
                />
            )}
        </section>
    );
};
