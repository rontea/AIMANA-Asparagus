
import React, { useState, useMemo, useEffect } from 'react';
import { HubHeader } from './ModelSelector/HubHeader';
import { HubSearchFilter, ProviderTab, MediaTab } from './ModelSelector/HubSearchFilter';
import { HubModelGrid } from './ModelSelector/HubModelGrid';
import { HubFooter } from './ModelSelector/HubFooter';
import { MetricsSidebar } from './ModelSelector/MetricsSidebar';
import { HubLayout } from './ModelSelector/HubLayout';
import { SupportedEngine, ModelCategory, ModelOption } from './ModelSelector/types';
import { loadDynamicRegistry } from './ModelSelector/registry/index';
import { isMusicAudioModel, isSpeechSynthesisModel, isTranscriptionAudioModel } from './ModelSelector/audioModelUtils';

export type { SupportedEngine, ModelCategory, ModelOption } from './ModelSelector/types';

interface ModelSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentModel: SupportedEngine;
    onSelect: (model: SupportedEngine) => void;
    forcedCategory?: ModelCategory;
    forcedCategories?: ModelCategory[];
    allowedModelIds?: SupportedEngine[];
    audioFilter?: 'speech' | 'music' | 'transcription';
}

const FALLBACK_MODEL: ModelOption = {
    id: 'unknown',
    label: 'Selecting...',
    desc: 'Connecting to Intelligence Hub...',
    icon: () => null,
    color: 'text-slate-500',
    limits: '---',
    efficiency: '---',
    provider: 'system',
    category: 'Experimental',
    ratios: []
};

const normalizeHubSearch = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({ 
    isOpen, onClose, currentModel, onSelect, forcedCategory, forcedCategories, allowedModelIds, audioFilter
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<ProviderTab>('all');
    const [activeMediaTab, setActiveMediaTab] = useState<MediaTab>('all');
    const [allModels, setAllModels] = useState<ModelOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refreshRegistry = async () => {
        setIsLoading(true);
        try {
            const data = await loadDynamicRegistry();
            setAllModels(data);
        } catch (e) {
            console.error("Hub Sync Failure");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            refreshRegistry();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onRegistryUpdated = () => refreshRegistry();
        window.addEventListener('aimana-registry-updated', onRegistryUpdated);
        return () => window.removeEventListener('aimana-registry-updated', onRegistryUpdated);
    }, [isOpen]);

    const allowedModelIdSet = useMemo(() => {
        const ids = Array.isArray(allowedModelIds) ? allowedModelIds : [];
        return new Set(ids.map((id) => String(id).trim()).filter(Boolean));
    }, [allowedModelIds]);

    const scopedModels = useMemo(() => {
        const normalizedForcedCategories = Array.isArray(forcedCategories)
            ? forcedCategories.filter(Boolean)
            : [];
        const hasForcedCategories = normalizedForcedCategories.length > 0;
        const base = hasForcedCategories
            ? allModels.filter((m) => normalizedForcedCategories.includes(m.category))
            : forcedCategory
                ? allModels.filter((m) => m.category === forcedCategory)
                : allModels;
        const providerScoped = (() => {
            if (audioFilter === 'speech') return base.filter((m) => isSpeechSynthesisModel(m));
            if (audioFilter === 'music') return base.filter((m) => isMusicAudioModel(m));
            if (audioFilter === 'transcription') return base.filter((m) => isTranscriptionAudioModel(m));
            return base;
        })();
        if (allowedModelIdSet.size === 0) return providerScoped;
        return providerScoped.filter((m) => allowedModelIdSet.has(String(m.id)));
    }, [allModels, forcedCategory, forcedCategories, audioFilter, allowedModelIdSet]);

    const shouldShowMediaTabs = useMemo(() => {
        const categoryScope = Array.isArray(forcedCategories) && forcedCategories.length > 0
            ? forcedCategories
            : forcedCategory
                ? [forcedCategory]
                : [];
        return categoryScope.includes('Visual') && categoryScope.includes('Motion');
    }, [forcedCategory, forcedCategories]);

    const modalityFilteredModels = useMemo(() => {
        if (activeMediaTab === 'image') return scopedModels.filter((m) => m.category === 'Visual');
        if (activeMediaTab === 'video') return scopedModels.filter((m) => m.category === 'Motion');
        return scopedModels;
    }, [scopedModels, activeMediaTab]);

    const filteredModels = useMemo(() => {
        return modalityFilteredModels.filter(m => {
            const q = searchQuery.toLowerCase();
            const normalizedQuery = normalizeHubSearch(searchQuery);
            const normalizedMatches = normalizedQuery.length === 0 || [
                m.label,
                m.desc,
                String(m.id),
                String(m.upstreamId || '')
            ].some((value) => normalizeHubSearch(String(value || '')).includes(normalizedQuery));
            const matchesSearch = 
                m.label.toLowerCase().includes(q) || 
                m.desc.toLowerCase().includes(q) ||
                String(m.id).toLowerCase().includes(q) ||
                String(m.upstreamId || '').toLowerCase().includes(q) ||
                normalizedMatches;
            const matchesProvider = activeTab === 'all' || m.provider === activeTab;
            return matchesSearch && matchesProvider;
        });
    }, [modalityFilteredModels, searchQuery, activeTab]);

    if (!isOpen) return null;

    const activeModel = filteredModels.find((m) => m.id === currentModel)
        || modalityFilteredModels.find((m) => m.id === currentModel)
        || modalityFilteredModels[0]
        || FALLBACK_MODEL;

    const handleClearFilters = () => {
        setSearchQuery('');
        setActiveTab('all');
        setActiveMediaTab('all');
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
            <div className="bg-[#0a0a0a] border border-slate-800/80 w-[95vw] h-[95vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 ring-1 ring-white/10 flex flex-col">
                
                <HubHeader onClose={onClose} />

                <HubSearchFilter 
                    searchQuery={searchQuery} 
                    setSearchQuery={setSearchQuery} 
                    activeTab={activeTab} 
                    setActiveTab={setActiveTab} 
                    models={modalityFilteredModels}
                    activeMediaTab={activeMediaTab}
                    setActiveMediaTab={setActiveMediaTab}
                    showMediaTabs={shouldShowMediaTabs}
                />
                
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Synchronizing Neural Hub...</span>
                    </div>
                ) : (
                    <HubLayout 
                        mainContent={
                            <HubModelGrid 
                                filteredModels={filteredModels} 
                                currentModel={currentModel} 
                                onSelect={onSelect} 
                                onClearFilters={handleClearFilters}
                                forcedCategory={forcedCategory}
                                forcedCategories={forcedCategories}
                            />
                        }
                        sidebar={
                            <MetricsSidebar activeModel={activeModel} />
                        }
                    />
                )}
                
                <HubFooter onClose={onClose} />
            </div>
        </div>
    );
};
