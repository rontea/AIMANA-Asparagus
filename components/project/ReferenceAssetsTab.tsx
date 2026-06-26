
import React, { useMemo, useState, useEffect } from 'react';
import { Box, ArrowLeft, Layers, Sparkles, Fingerprint, Link2, Clipboard, Check, FileText, Tag, NotebookText, GitMerge, Loader2 } from 'lucide-react';
import AssetCard from '../AssetCard';
import { ReferenceFolderCard } from './ReferenceFolderCard';
import { ItemWithCurrentRevision } from '../../types';
import { api } from '../../services/api';

interface ReferenceAssetsTabProps {
    items: ItemWithCurrentRevision[];
    viewType: 'grid' | 'list' | 'gallery';
    selectedItemIds: Set<string>;
    onItemClick: (item: ItemWithCurrentRevision, index: number) => void;
    onPinToggle: (item: ItemWithCurrentRevision) => void;
    onArchive: (item: ItemWithCurrentRevision) => void;
    onMove?: (item: ItemWithCurrentRevision) => void;
    onRemixToBulk?: (item: ItemWithCurrentRevision) => void;
    onInspectInfo?: (item: ItemWithCurrentRevision) => void;
    getContextBadges?: (item: ItemWithCurrentRevision) => string[];
    onToggleSelect: (e: React.MouseEvent, id: string) => void;
    onMergeUploadedReferences?: () => void;
    isMergingUploadedReferences?: boolean;
}

export const ReferenceAssetsTab: React.FC<ReferenceAssetsTabProps> = ({
    items, viewType, selectedItemIds, onItemClick, onPinToggle, onArchive, onMove, onRemixToBulk, onInspectInfo, getContextBadges, onToggleSelect, onMergeUploadedReferences, isMergingUploadedReferences = false
}) => {
    const expandThumbnailUrl = (url: string): string => {
        const raw = String(url || '').trim();
        if (!raw) return '';
        return raw.replace(/=s\d+(-c)?/g, '=s1600');
    };

    const isReferenceImageItem = (item: ItemWithCurrentRevision) => {
        const rev = item.currentRevision;
        if (!rev) return false;
        if (rev.engine === 'reference' || rev.engine === 'reference-upload') return true;
        if (rev.fileUrl?.includes('/Neural_Reference/')) return true;
        try {
            if (!rev.aiParameters) return false;
            const params = JSON.parse(rev.aiParameters);
            const adv = params.advanced_params || params;
            return !!(
                (adv.isReference && !adv.parentItemId) ||
                adv.referenceAsset === true ||
                adv.source === 'reference_upload' ||
                adv.source === 'reference_drop' ||
                (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
            );
        } catch (e) {
            return false;
        }
    };

    const composeContextBadges = (item: ItemWithCurrentRevision, hasLinkedRole: boolean, hasNeuralRole: boolean) => {
        const isReferenceImage = isReferenceImageItem(item);
        if (isReferenceImage && (hasLinkedRole || hasNeuralRole)) return ['Forge'];

        const badges: string[] = [];
        if (hasLinkedRole) badges.push('Linked Artifacts');
        if (hasNeuralRole) badges.push('Neural References');
        if (isReferenceImage) badges.push('Reference Image');
        return badges;
    };

    const resolveContextBadges = (item: ItemWithCurrentRevision, hasLinkedRole: boolean, hasNeuralRole: boolean) => {
        const localBadges = composeContextBadges(item, hasLinkedRole, hasNeuralRole);
        const globalBadges = getContextBadges ? getContextBadges(item) : [];
        const merged = Array.from(new Set([...globalBadges, ...localBadges]));
        if (merged.includes('Forge')) return ['Forge'];
        const ordered = ['Linked Artifacts', 'Neural References', 'Reference Image'];
        const standard = ordered.filter((b) => merged.includes(b));
        const custom = merged.filter((b) => !ordered.includes(b) && b !== 'Forge');
        return [...standard, ...custom];
    };

    const resolvePreviewUrl = (item: ItemWithCurrentRevision): string => {
        const rev = item.currentRevision;
        if (!rev) return '';
        if (rev.thumbnailLink) return expandThumbnailUrl(rev.thumbnailLink);
        if (rev.fileUrl) return expandThumbnailUrl(rev.fileUrl);
        try {
            if (rev.aiParameters) {
                const parsed = JSON.parse(rev.aiParameters);
                const adv = parsed?.advanced_params || parsed || {};
                if (typeof adv.parentItemThumbnail === 'string' && adv.parentItemThumbnail.trim()) {
                    return expandThumbnailUrl(adv.parentItemThumbnail);
                }
            }
        } catch (e) {}
        return '';
    };
    // Navigation State for Drill-Down
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [orchestratedItems, setOrchestratedItems] = useState<ItemWithCurrentRevision[]>([]);
    const [isFetchingOrchestration, setIsFetchingOrchestration] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    /**
     * NEURAL CLUSTERING LOGIC (Registry View)
     * Groups items into folders based on whether they contain secondary linked files.
     */
    const { clusters, individuals } = useMemo(() => {
        const clusterMap: Record<string, { parent: ItemWithCurrentRevision, children: ItemWithCurrentRevision[] }> = {};
        const childIdToParentId = new Map<string, string>();
        
        // Phase A: Identify parents and map their children (lineage or manifest)
        items.forEach(item => {
            const rev = item.currentRevision;
            
            // 1. Check if this is a Parent (Has secondary files)
            if (rev?.secondaryFiles && rev.secondaryFiles.length > 0) {
                if (!clusterMap[item.id]) {
                    clusterMap[item.id] = { parent: item, children: [] };
                }
                rev.secondaryFiles.forEach(f => childIdToParentId.set(f.id, item.id));
            }

            // 2. Check for Reference Metadata linkage
            try {
                if (rev?.aiParameters) {
                    const params = JSON.parse(rev.aiParameters);
                    const adv = params.advanced_params || params;
                    if (adv.referenceItemIds?.length > 0) {
                        if (!clusterMap[item.id]) {
                            clusterMap[item.id] = { parent: item, children: [] };
                        }
                        adv.referenceItemIds.forEach((id: string) => childIdToParentId.set(id, item.id));
                    }
                    if (typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()) {
                        if (!clusterMap[item.id]) {
                            clusterMap[item.id] = { parent: item, children: [] };
                        }
                        childIdToParentId.set(adv.referenceItemId.trim(), item.id);
                    }
                }
            } catch (e) {}
        });

        // Phase B: Distribute items into clusters or isolated list
        const isolated: ItemWithCurrentRevision[] = [];
        
        items.forEach(item => {
            const parentId = childIdToParentId.get(item.id);
            
            // If it's a child of a parent present in this set
            if (parentId && clusterMap[parentId]) {
                clusterMap[parentId].children.push(item);
            } 
            // If it's not a root cluster itself and not a child of any cluster in this set
            else if (!clusterMap[item.id]) {
                isolated.push(item);
            }
        });

        return { 
            clusters: Object.values(clusterMap), 
            individuals: isolated 
        };
    }, [items]);

    // AUTO-NAVIGATE: If all children are deleted and the parent is no longer a cluster, 
    // kick the user back to the main list automatically.
    useEffect(() => {
        if (activeFolderId) {
            const stillACluster = clusters.some(c => c.parent.id === activeFolderId);
            if (!stillACluster) {
                setActiveFolderId(null);
            }
        }
    }, [clusters, activeFolderId]);

    // FETCH ORCHESTRATION MANIFEST DATA
    useEffect(() => {
        if (!activeFolderId) {
            setOrchestratedItems([]);
            return;
        }

        const fetchOrchestration = async () => {
            const cluster = clusters.find(c => c.parent.id === activeFolderId);
            if (!cluster) return;

            setIsFetchingOrchestration(true);
            try {
                const rev = cluster.parent.currentRevision;
                const manifestIds = new Set<string>();

                // 1. Gather IDs from Secondary Files (Mosaic)
                rev?.secondaryFiles?.forEach(f => manifestIds.add(f.id));

                // 2. Gather IDs from Metadata References
                try {
                    if (rev?.aiParameters) {
                        const params = JSON.parse(rev.aiParameters);
                        const adv = params.advanced_params || params;
                        adv.referenceItemIds?.forEach((id: string) => manifestIds.add(id));
                        if (typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()) {
                            manifestIds.add(adv.referenceItemId.trim());
                        }
                    }
                } catch (e) {}

                // 3. Resolve Items in a single call for faster folder drill-down
                const idsArray = Array.from(manifestIds);
                const resolved = await api.items.resolve(idsArray);
                setOrchestratedItems(resolved.filter((i): i is ItemWithCurrentRevision => i !== null));
            } catch (e) {
                console.error("Orchestration fetch failed", e);
            } finally {
                setIsFetchingOrchestration(false);
            }
        };

        fetchOrchestration();
    }, [activeFolderId, clusters]);

    const sectionedOrchestration = useMemo(() => {
        if (!activeFolderId) return { linked: [] as ItemWithCurrentRevision[], neural: [] as ItemWithCurrentRevision[], referenceImages: [] as ItemWithCurrentRevision[] };
        const cluster = clusters.find(c => c.parent.id === activeFolderId);
        if (!cluster) return { linked: [] as ItemWithCurrentRevision[], neural: [] as ItemWithCurrentRevision[], referenceImages: [] as ItemWithCurrentRevision[] };

        const linkedIds = new Set<string>();
        const neuralIds = new Set<string>();
        const referenceImageIds = new Set<string>();
        const rev = cluster.parent.currentRevision;

        rev?.secondaryFiles?.forEach(f => linkedIds.add(f.id));
        try {
            if (rev?.aiParameters) {
                const params = JSON.parse(rev.aiParameters);
                const adv = params.advanced_params || params;
                (adv.referenceItemIds || []).forEach((id: string) => neuralIds.add(id));
                if (typeof adv.referenceItemId === 'string' && adv.referenceItemId.trim()) referenceImageIds.add(adv.referenceItemId.trim());
            }
        } catch (e) {}

        const byId = new Map(orchestratedItems.map(i => [i.id, i]));
        const linked = Array.from(linkedIds).map(id => byId.get(id)).filter((i): i is ItemWithCurrentRevision => !!i);
        const neural = Array.from(neuralIds).map(id => byId.get(id)).filter((i): i is ItemWithCurrentRevision => !!i);
        const referenceImages = Array.from(referenceImageIds).map(id => byId.get(id)).filter((i): i is ItemWithCurrentRevision => !!i);
        return { linked, neural, referenceImages };
    }, [activeFolderId, clusters, orchestratedItems]);

    const copyField = async (text: string, key: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1500);
        } catch (e) {}
    };

    const renderManifestGridTable = (sectionTitle: string, records: ItemWithCurrentRevision[], getRowBadges?: (item: ItemWithCurrentRevision) => string[]) => {
        if (records.length === 0) return null;
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">{sectionTitle}</h4>
                    <div className="h-px bg-slate-800 flex-1" />
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{records.length} Nodes</span>
                </div>
                <div className="bg-slate-900 rounded-[2rem] border border-slate-800 overflow-hidden">
                    <div className="grid grid-cols-[148px_1fr_1fr_1fr_44px] gap-4 px-5 py-3 bg-slate-950/70 border-b border-slate-800 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                        <div>Attached</div>
                        <div className="flex items-center gap-1.5"><FileText size={11}/>Reference Concept / Description</div>
                        <div className="flex items-center gap-1.5"><Tag size={11}/>Classification Label</div>
                        <div className="flex items-center gap-1.5"><NotebookText size={11}/>User Notes</div>
                        <div />
                    </div>
                    <div className="divide-y divide-slate-800/80">
                        {records.map((item, idx) => {
                            const rev = item.currentRevision;
                            const prompt = rev?.prompt || '';
                            const label = rev?.label || '';
                            const displayLabel = sectionTitle === 'Linked Artifacts' ? 'Linked Artifacts' : label;
                            const note = rev?.note || '';
                            const keyBase = `${sectionTitle}-${item.id}`;
                            const rowBadges = getRowBadges ? getRowBadges(item) : [];
                            return (
                                <div key={item.id} className="grid grid-cols-[148px_1fr_1fr_1fr_44px] gap-4 px-5 py-4 hover:bg-slate-950/60 transition-colors">
                                    <button
                                        onClick={() => onItemClick(item, idx)}
                                        className="w-32 h-32 rounded-2xl overflow-hidden border border-slate-700 bg-black relative"
                                    >
                                        {resolvePreviewUrl(item) ? (
                                            <img src={resolvePreviewUrl(item)} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-700"><Box size={16} /></div>
                                        )}
                                        {rowBadges.length > 0 && (
                                            <div className="absolute bottom-1 left-1 flex flex-wrap gap-1 max-w-[124px]">
                                                {rowBadges.map((badge) => (
                                                    <span key={`${item.id}-${badge}`} className="text-[7px] font-black uppercase tracking-wide bg-cyan-600/90 text-white px-1 py-0.5 rounded leading-none">
                                                        {badge}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </button>

                                    <div className="flex items-start gap-2">
                                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 hover:text-white transition-colors flex-1">
                                            {prompt || <span className="text-slate-600 italic">No reference concept</span>}
                                        </p>
                                        <button
                                            onClick={() => copyField(prompt, `${keyBase}-prompt`)}
                                            className="p-1.5 rounded-md bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white border border-slate-700 transition-all mt-0.5"
                                            title="Copy Reference Concept / Description"
                                        >
                                            {copiedKey === `${keyBase}-prompt` ? <Check size={12} /> : <Clipboard size={12} />}
                                        </button>
                                    </div>

                                    <div className="flex items-start gap-2">
                                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 hover:text-white transition-colors flex-1">
                                            {displayLabel || <span className="text-slate-600 italic">No classification label</span>}
                                        </p>
                                        <button
                                            onClick={() => copyField(displayLabel, `${keyBase}-label`)}
                                            className="p-1.5 rounded-md bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white border border-slate-700 transition-all mt-0.5"
                                            title="Copy Classification Label"
                                        >
                                            {copiedKey === `${keyBase}-label` ? <Check size={12} /> : <Clipboard size={12} />}
                                        </button>
                                    </div>

                                    <div className="flex items-start gap-2">
                                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 hover:text-white transition-colors flex-1">
                                            {note || <span className="text-slate-600 italic">No user notes</span>}
                                        </p>
                                        <button
                                            onClick={() => copyField(note, `${keyBase}-note`)}
                                            className="p-1.5 rounded-md bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white border border-slate-700 transition-all mt-0.5"
                                            title="Copy User Notes"
                                        >
                                            {copiedKey === `${keyBase}-note` ? <Check size={12} /> : <Clipboard size={12} />}
                                        </button>
                                    </div>

                                    <div className="flex items-start justify-end pt-1">
                                        <button
                                            onClick={() => copyField(`${prompt}\n\n${displayLabel}\n\n${note}`.trim(), `${keyBase}-all`)}
                                            className="p-2 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white border border-slate-700 transition-all"
                                            title="Quick copy all fields"
                                        >
                                            {copiedKey === `${keyBase}-all` ? <Check size={13} /> : <Clipboard size={13} />}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderManifestAssetSection = (title: string, sectionItems: ItemWithCurrentRevision[], getCardBadges?: (item: ItemWithCurrentRevision) => string[]) => {
        if (sectionItems.length === 0) return null;
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">{title}</h4>
                    <div className="h-px bg-slate-800 flex-1" />
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{sectionItems.length} Nodes</span>
                </div>
                <div className={gridClasses}>
                    {viewType === 'list' && (
                        <div className="p-5 bg-slate-900/50 border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase flex gap-4 tracking-widest">
                            <div className="w-10"></div>
                            <div className="w-14">REF</div>
                            <div className="flex-1">Artifact Identity</div>
                            <div className="w-24 hidden md:block">Protocol</div>
                            <div className="w-24 hidden md:block">Storage</div>
                            <div className="w-24 hidden lg:block">Timestamp</div>
                            <div className="w-24 text-right">Actions</div>
                        </div>
                    )}
                    <div className={viewType === 'list' ? 'flex flex-col' : 'contents'}>
                        {sectionItems.map((item, index) => (
                            <AssetCard 
                                key={item.id} 
                                item={item} 
                                onClick={() => onItemClick(item, index)} 
                                onPinToggle={onPinToggle} 
                                onArchive={onArchive} 
                                onMove={onMove}
                                onRemixToBulk={onRemixToBulk}
                                onInspectInfo={onInspectInfo}
                                isSelected={selectedItemIds.has(item.id)} 
                                onToggleSelect={onToggleSelect}
                                viewType={viewType}
                                contextBadges={getCardBadges ? getCardBadges(item) : undefined}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    if (clusters.length === 0 && individuals.length === 0 && !activeFolderId) {
        return (
            <div className="flex flex-col items-center justify-center py-24 bg-slate-800/20 rounded-[3rem] border-2 border-dashed border-slate-800">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500 shadow-inner">
                    <Box size={32} />
                </div>
                <p className="text-slate-400 text-lg font-black uppercase tracking-widest">Vault Registry Empty</p>
                <p className="text-slate-600 text-[10px] mt-1 font-bold uppercase tracking-widest">Link artifacts or use the Mosaic Manager to create manifest clusters.</p>
            </div>
        );
    }

    const gridClasses = 
        viewType === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8" : 
        viewType === 'gallery' ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-8" :
        "bg-slate-800 rounded-[2.5rem] border border-slate-700 overflow-hidden shadow-2xl";

    // --- RENDER: DRILL-DOWN ORCHESTRATION VIEW ---
    if (activeFolderId) {
        const parentCluster = clusters.find(c => c.parent.id === activeFolderId);
        const parentTitle = parentCluster?.parent.currentRevision?.title || "Untitled Manifest";

        const getOrchestrationBadges = (item: ItemWithCurrentRevision) => {
            const hasLinkedRole = sectionedOrchestration.linked.some((i) => i.id === item.id);
            const hasNeuralRole = sectionedOrchestration.neural.some((i) => i.id === item.id);
            const hasReferenceImageRole = sectionedOrchestration.referenceImages.some((i) => i.id === item.id);
            // In manifest drill-down, the section defines the role label.
            // This prevents global Forge tagging from overriding Linked/Neural sections.
            if (hasLinkedRole) return ['Linked Artifacts'];
            if (hasNeuralRole) return ['Neural References'];
            if (hasReferenceImageRole && isReferenceImageItem(item)) return ['Forge'];
            return resolveContextBadges(item, hasLinkedRole, hasNeuralRole);
        };

        return (
            <div className="space-y-10 animate-in fade-in slide-in-from-left-4 duration-500 pb-20">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-800 pb-8 gap-6">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => setActiveFolderId(null)}
                            className="p-4 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-[1.5rem] transition-all shadow-xl border border-white/5 active:scale-95 group"
                        >
                            <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="h-10 w-px bg-slate-800" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Manifest View</span>
                                <span className="text-slate-700 text-[10px] font-black">/</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[200px]">{parentTitle}</span>
                            </div>
                            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4 truncate">
                                <Layers size={32} className="text-indigo-500" />
                                {parentTitle}
                            </h2>
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-3">
                        <div className="px-6 py-3 bg-slate-900 border border-indigo-500/20 rounded-2xl text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl">
                             <Fingerprint size={16} className="opacity-50" /> 
                             {orchestratedItems.length} Constituents
                        </div>
                        <button 
                            onClick={() => parentCluster && onItemClick(parentCluster.parent, 0)}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95"
                        >
                            Inspect Orchestration Root
                        </button>
                    </div>
                </div>

                {isFetchingOrchestration ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4 text-slate-600">
                        <div className="w-12 h-12 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Resolving Manifest Graph...</span>
                    </div>
                ) : orchestratedItems.length === 0 ? (
                    <div className="py-24 text-center bg-slate-900/40 rounded-[3rem] border border-slate-800">
                        <Link2 size={48} className="mx-auto text-slate-700 mb-4" />
                        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">No constituents detected in this manifest orchestration.</p>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {viewType === 'grid' ? (
                            <>
                                {parentCluster?.parent ? renderManifestGridTable('Main Item', [parentCluster.parent]) : null}
                                {renderManifestGridTable('Linked Artifacts', sectionedOrchestration.linked, getOrchestrationBadges)}
                                {renderManifestGridTable('Neural Reference', sectionedOrchestration.neural, getOrchestrationBadges)}
                                {renderManifestGridTable('Reference Image', sectionedOrchestration.referenceImages, getOrchestrationBadges)}
                            </>
                        ) : (
                            <>
                                {parentCluster?.parent && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300">Main Item</h4>
                                            <div className="h-px bg-slate-800 flex-1" />
                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Root Node</span>
                                        </div>
                                        <div className={gridClasses}>
                                            {viewType === 'list' && (
                                                <div className="p-5 bg-slate-900/50 border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase flex gap-4 tracking-widest">
                                                    <div className="w-10"></div>
                                                    <div className="w-14">REF</div>
                                                    <div className="flex-1">Artifact Identity</div>
                                                    <div className="w-24 hidden md:block">Protocol</div>
                                                    <div className="w-24 hidden md:block">Storage</div>
                                                    <div className="w-24 hidden lg:block">Timestamp</div>
                                                    <div className="w-24 text-right">Actions</div>
                                                </div>
                                            )}
                                            <div className={viewType === 'list' ? 'flex flex-col' : 'contents'}>
                                                <AssetCard 
                                                    key={parentCluster.parent.id}
                                                    item={parentCluster.parent}
                                                    onClick={() => onItemClick(parentCluster.parent, 0)}
                                                    onPinToggle={onPinToggle}
                                                    onArchive={onArchive}
                                                    onMove={onMove}
                                                    onRemixToBulk={onRemixToBulk}
                                                    onInspectInfo={onInspectInfo}
                                                    isSelected={selectedItemIds.has(parentCluster.parent.id)}
                                                    onToggleSelect={onToggleSelect}
                                                    viewType={viewType}
                                                    contextBadges={resolveContextBadges(parentCluster.parent, false, false)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {renderManifestAssetSection('Linked Artifacts', sectionedOrchestration.linked, getOrchestrationBadges)}
                                {renderManifestAssetSection('Neural Reference', sectionedOrchestration.neural, getOrchestrationBadges)}
                                {renderManifestAssetSection('Reference Image', sectionedOrchestration.referenceImages, getOrchestrationBadges)}
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // --- RENDER: MAIN REGISTRY VIEW ---
    return (
        <div className="space-y-16 pb-20 animate-in fade-in duration-700">
            {onMergeUploadedReferences && (
                <div className="flex justify-end">
                    <button
                        onClick={onMergeUploadedReferences}
                        disabled={isMergingUploadedReferences}
                        className="px-4 py-2 rounded-xl border border-indigo-500/40 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-60"
                        title="Merge duplicate uploaded references by content hash and relink manifests"
                    >
                        {isMergingUploadedReferences ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
                        Merge Duplicate References
                    </button>
                </div>
            )}
            {clusters.length > 0 && (
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400"><Layers size={18}/></div>
                        <h3 className="text-xs font-black text-white uppercase tracking-[0.4em]">Manifest Orchestrations</h3>
                        <div className="h-px bg-slate-800 flex-1" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {clusters.map((cluster) => (
                            <ReferenceFolderCard 
                                key={cluster.parent.id}
                                parentId={cluster.parent.id}
                                parentTitle={cluster.parent.currentRevision?.title || 'Untitled Manifest'}
                                parentThumbnail={resolvePreviewUrl(cluster.parent)}
                                items={cluster.children}
                                onClick={() => setActiveFolderId(cluster.parent.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {individuals.length > 0 && (
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="p-2 bg-slate-800 rounded-xl text-slate-500"><Sparkles size={18}/></div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Isolated Artifacts</h3>
                        <div className="h-px bg-slate-800 flex-1" />
                    </div>
                    
                    <div className={gridClasses}>
                        {viewType === 'list' && (
                            <div className="p-5 bg-slate-900/50 border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase flex gap-4 tracking-widest">
                                <div className="w-10"></div>
                                <div className="w-14">REF</div>
                                <div className="flex-1">Identity</div>
                                <div className="w-24 hidden md:block">Protocol</div>
                                <div className="w-24 hidden md:block">Footprint</div>
                                <div className="w-24 hidden lg:block">Timestamp</div>
                                <div className="w-24 text-right">Actions</div>
                            </div>
                        )}
                        <div className={viewType === 'list' ? 'flex flex-col' : 'contents'}>
                            {individuals.map((item, index) => (
                                <AssetCard 
                                    key={item.id} 
                                    item={item} 
                                    onClick={() => onItemClick(item, index)} 
                                    onPinToggle={onPinToggle} 
                                    onArchive={onArchive} 
                                    onMove={onMove}
                                    onRemixToBulk={onRemixToBulk}
                                    onInspectInfo={onInspectInfo}
                                    isSelected={selectedItemIds.has(item.id)} 
                                    onToggleSelect={onToggleSelect}
                                    viewType={viewType}
                                    contextBadges={resolveContextBadges(item, false, false)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
