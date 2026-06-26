import React, { useState, useRef, useEffect, useMemo } from 'react';
/* Splitting react-router imports to resolve missing named export errors */
import { Link } from 'react-router-dom';
import { ArrowLeft, Pin, MoreVertical, Cloud, UploadCloud, FileUp, FileDown, ChevronDown, MessageSquarePlus, SendToBack, Layers, Sparkles, Package, Settings2, Settings, Cpu, Trash2, Plus, X } from 'lucide-react';
import * as Icons from 'lucide-react';
import { AppSettings, Project, ProjectStorageType } from '../../types';
import { loadDynamicRegistry, ModelOption } from './lab/ModelSelector/registry/index';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { api } from '../../services/api';
import { getProjectTypes } from '../../services/projectTypes';

interface ProjectHeaderProps {
    project: Project;
    engines: string[];
    onPinToggle: () => void;
    onShare: () => void;
    onImport: () => void;
    onExport: () => void;
    onImportPrompt: () => void;
    onMovePromptsToStaging?: () => void;
    isMovingPromptsToStaging?: boolean;
    onUploadClick: () => void;
    onNewItem: () => void;
    onArchive: () => void;
    onCheckPromptDuplicates?: () => void;
    isCheckingPromptDuplicates?: boolean;
    onEngineChange: (engine: string) => void;
    onUpdateProject?: (updates: Partial<Project>) => Promise<void>;
    onViewChange?: (view: 'grid' | 'list' | 'gallery') => void;
}

const getTierShortLabel = (category: string) => {
    switch(category) {
        case 'Language': return 'Semantic';
        case 'Visual': return 'Visual';
        case 'Motion': return 'Temporal';
        case 'Audio': return 'Acoustic';
        case 'Static': return 'Static';
        default: return 'Neural';
    }
};

const SYSTEM_TYPE_META: Record<string, { label: string, icon: string }> = {
    'image': { label: 'Visual', icon: 'ImageIcon' },
    'video': { label: 'Temporal', icon: 'Video' },
    'text': { label: 'Linguistic', icon: 'FileText' },
    'files': { label: 'Archive', icon: 'HardDrive' },
    'all': { label: 'Mixed', icon: 'LayoutGrid' }
};
const ASSET_INGESTION_SYSTEM_KEY = 'asset-ingestion';
const ASSET_INGESTION_UNDEFINED_ENGINE = 'engine-undefined';
const ASSET_INGESTION_UNDEFINED_LABEL = 'Engine Undefined';

const sanitizeAssetIngestionEngines = (engines: string[]) => {
    const seen = new Set<string>();
    return (engines || [])
        .map((engine) => String(engine || '').trim())
        .filter((engine) => {
            if (!engine || engine === ASSET_INGESTION_UNDEFINED_ENGINE) return false;
            const key = engine.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({ 
    project, onPinToggle, onShare, onImport, onExport, onImportPrompt, onMovePromptsToStaging, isMovingPromptsToStaging = false, onUploadClick, onNewItem, onArchive, onCheckPromptDuplicates, isCheckingPromptDuplicates = false, onEngineChange, onUpdateProject, onViewChange
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAieEngineModalOpen, setIsAieEngineModalOpen] = useState(false);
    const [allModels, setAllModels] = useState<ModelOption[]>([]);
    const [customTypeMeta, setCustomTypeMeta] = useState<{ label: string, iconName: string, color?: string } | null>(null);
    const [assetIngestionEngines, setAssetIngestionEngines] = useState<string[]>([]);
    const [draftAssetIngestionEngines, setDraftAssetIngestionEngines] = useState<string[]>([]);
    const [newAssetIngestionEngine, setNewAssetIngestionEngine] = useState('');
    const [isSavingAieEngines, setIsSavingAieEngines] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const isAssetIngestionProject = project.systemKey === ASSET_INGESTION_SYSTEM_KEY || project.name === 'Asset Ingestion';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        loadDynamicRegistry().then(setAllModels);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isAssetIngestionProject) return;
        let cancelled = false;

        const loadAssetIngestionSettings = async () => {
            try {
                const settings = await api.settings.get();
                if (!cancelled) {
                    setAssetIngestionEngines(sanitizeAssetIngestionEngines(settings.assetIngestionEngines || []));
                }
            } catch (e) {
                if (!cancelled) setAssetIngestionEngines([]);
            }
        };

        const handleSettingsUpdated = () => {
            loadAssetIngestionSettings();
        };

        loadAssetIngestionSettings();
        window.addEventListener('settings-updated', handleSettingsUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener('settings-updated', handleSettingsUpdated);
        };
    }, [isAssetIngestionProject]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const typeId = project.projectType || 'all';
            if (SYSTEM_TYPE_META[typeId]) {
                setCustomTypeMeta(null);
                return;
            }

            const types = await getProjectTypes();
            const found = types.find((t) => t.id === typeId);
            if (!cancelled) {
                setCustomTypeMeta(found ? { label: found.label, iconName: found.iconName, color: found.color } : null);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [project.projectType]);

    const { nativeModels, forgedModels, staticModels } = useMemo(() => {
        return {
            nativeModels: allModels.filter(m => m.isSystem && m.category !== 'Static'),
            forgedModels: allModels.filter(m => !m.isSystem && m.category !== 'Static' && m.isCustom),
            staticModels: allModels.filter(m => m.category === 'Static')
        };
    }, [allModels]);

    const activeModel = allModels.find(m => m.id === project.defaultEngine);
    const isImmersiveProject = project.projectType === 'image' || project.projectType === 'video';
    const isPromptProject = project.projectType === 'prompt';
    const assetIngestionEngineOptions = useMemo(() => {
        const options = sanitizeAssetIngestionEngines(assetIngestionEngines);
        const currentEngine = String(project.defaultEngine || '').trim();
        if (
            currentEngine
            && currentEngine !== ASSET_INGESTION_UNDEFINED_ENGINE
            && !options.some((engine) => engine.toLowerCase() === currentEngine.toLowerCase())
        ) {
            options.push(currentEngine);
        }
        return [
            { value: ASSET_INGESTION_UNDEFINED_ENGINE, label: ASSET_INGESTION_UNDEFINED_LABEL },
            ...options.map((engine) => ({ value: engine, label: engine }))
        ];
    }, [assetIngestionEngines, project.defaultEngine]);

    const getTypeIcon = () => {
        const iconName = customTypeMeta ? customTypeMeta.iconName : (SYSTEM_TYPE_META[project.projectType as string]?.icon || 'LayoutGrid');
        const Icon = (Icons as any)[iconName] || Icons.LayoutGrid;
        return <Icon size={14} />;
    };

    const getTypeLabel = () => {
        return customTypeMeta ? customTypeMeta.label : (SYSTEM_TYPE_META[project.projectType as string]?.label || 'Mixed');
    };

    const openAieEngineModal = () => {
        setDraftAssetIngestionEngines(sanitizeAssetIngestionEngines(assetIngestionEngines));
        setNewAssetIngestionEngine('');
        setShowMenu(false);
        setIsAieEngineModalOpen(true);
    };

    const handleAddAssetIngestionEngine = () => {
        const candidate = newAssetIngestionEngine.trim();
        if (!candidate) return;
        const next = sanitizeAssetIngestionEngines([...draftAssetIngestionEngines, candidate]);
        setDraftAssetIngestionEngines(next);
        setNewAssetIngestionEngine('');
    };

    const handleRemoveAssetIngestionEngine = (engineToRemove: string) => {
        setDraftAssetIngestionEngines((current) =>
            current.filter((engine) => engine.toLowerCase() !== engineToRemove.toLowerCase())
        );
    };

    const handleSaveAssetIngestionEngines = async () => {
        setIsSavingAieEngines(true);
        try {
            const settings = await api.settings.get();
            const nextAssetIngestionEngines = sanitizeAssetIngestionEngines(draftAssetIngestionEngines);
            const nextSettings: AppSettings = {
                ...settings,
                assetIngestionEngines: nextAssetIngestionEngines
            };
            await api.settings.update(nextSettings);
            setAssetIngestionEngines(nextAssetIngestionEngines);
            if (
                project.defaultEngine
                && project.defaultEngine !== ASSET_INGESTION_UNDEFINED_ENGINE
                && !nextAssetIngestionEngines.some((engine) => engine.toLowerCase() === project.defaultEngine?.toLowerCase())
            ) {
                await onEngineChange(ASSET_INGESTION_UNDEFINED_ENGINE);
            }
            setIsAieEngineModalOpen(false);
            window.dispatchEvent(new CustomEvent('settings-updated'));
        } catch (error) {
            console.error('Failed to save Asset Ingestion engines', error);
        } finally {
            setIsSavingAieEngines(false);
        }
    };

    return (
        <div className="flex flex-col space-y-4 mb-4 shrink-0">
            <div className="flex items-center text-slate-400 hover:text-white transition-colors w-fit">
                <Link to="/" className="flex items-center group">
                    <ArrowLeft size={18} className="mr-1 group-hover:-translate-x-1" /> Back
                </Link>
            </div>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <h1 className="min-w-0 max-w-full text-3xl font-black tracking-tight text-white sm:text-4xl xl:max-w-2xl truncate">{project.name}</h1>
                            <span style={{ color: customTypeMeta?.color || '#fff' }}>{getTypeIcon()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={onPinToggle} className={`p-2 rounded-full transition-all ${project.isPinned ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`} title={project.isPinned ? "Unpin Sidebar" : "Pin to Sidebar"}>
                                <Pin size={24} className={project.isPinned ? 'fill-current' : ''} />
                            </button>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 flex items-center gap-2 h-7 font-black uppercase tracking-widest text-[9px]">
                            {project.storageType === ProjectStorageType.GOOGLE_DRIVE ? <Cloud size={12} className="text-blue-400"/> : <Icons.HardDrive size={12} className="text-emerald-400" />}
                            {project.storageType}
                        </span>

                        <span className="bg-indigo-900/20 px-3 py-1 rounded-xl border border-indigo-500/30 flex items-center gap-2 h-7 font-black uppercase tracking-widest text-[9px] text-indigo-400">
                            {getTypeIcon()}
                            {getTypeLabel()} Cluster
                        </span>
                        
                        <div className="hidden h-4 w-px bg-slate-800 sm:block"></div>
                        
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 sm:shrink-0">
                                {isAssetIngestionProject ? 'Asset Ingestion Engine:' : 'Default Engine:'}
                            </span>
                            <div className="relative group min-w-0 w-full sm:w-auto">
                                {isAssetIngestionProject ? (
                                    <select 
                                        value={project.defaultEngine || ASSET_INGESTION_UNDEFINED_ENGINE}
                                        onChange={(e) => onEngineChange(e.target.value)}
                                        className="h-10 w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 py-1 pl-8 pr-10 text-[11px] font-bold text-slate-300 shadow-inner outline-none transition-all hover:bg-slate-800 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 sm:min-w-[240px]"
                                    >
                                        {assetIngestionEngineOptions.map((engine) => (
                                            <option key={engine.value} value={engine.value}>{engine.label}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <select 
                                        value={project.defaultEngine || 'default-placeholder'}
                                        onChange={(e) => onEngineChange(e.target.value)}
                                        className="h-10 w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 py-1 pl-8 pr-10 text-[11px] font-bold text-slate-300 shadow-inner outline-none transition-all hover:bg-slate-800 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 sm:min-w-[240px]"
                                    >
                                        <option value="default-placeholder">Unassigned Endpoint</option>
                                        <optgroup label="Native AIMANA Infrastructure">
                                            {nativeModels.map(m => (
                                                <option key={m.id} value={m.id}>{m.label} ({getTierShortLabel(m.category)})</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="User Forged Checkpoints">
                                            {forgedModels.map(m => (
                                                <option key={m.id} value={m.id}>{m.label} ({getTierShortLabel(m.category)})</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Archival / Static Labels">
                                            {staticModels.map(m => (
                                                <option key={m.id} value={m.id}>{m.label} (Metadata Only)</option>
                                            ))}
                                        </optgroup>
                                        <option value="other-model">External / Manual Integration</option>
                                    </select>
                                )}
                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                                    {isAssetIngestionProject
                                        ? <Cpu size={12} className="text-teal-400" />
                                        : activeModel?.category === 'Static'
                                            ? <Package size={12} className="text-slate-500" />
                                            : activeModel?.isSystem
                                                ? <Layers size={12} className="text-indigo-400" />
                                                : <Sparkles size={12} className="text-amber-400" />}
                                </div>
                                <ChevronDown size={10} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-indigo-400 transition-colors" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
                    <button onClick={onNewItem} className="flex-1 min-w-[140px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-md transition-all hover:bg-slate-700 sm:flex-none sm:min-w-0 flex">
                        <Plus size={18} className="mr-2 text-indigo-400" />New Item
                    </button>
                    <button onClick={onUploadClick} className="flex-1 min-w-[140px] items-center justify-center rounded-xl border border-indigo-500/50 bg-indigo-600 px-6 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-indigo-700 sm:flex-none sm:min-w-0 flex">
                        <UploadCloud size={18} className="mr-2" />Upload
                    </button>
                    <div className="relative" ref={menuRef}>
                        <button onClick={() => setShowMenu(!showMenu)} className={`p-2 rounded-xl border transition-all ${showMenu ? 'bg-slate-700 text-white border-indigo-500/50' : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'}`}>
                            <MoreVertical size={20} />
                        </button>
                        {showMenu && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-[1.5rem] shadow-2xl z-[60] py-1 animate-in slide-in-from-top-2 border-t-indigo-500 overflow-hidden">
                                {!isAssetIngestionProject && (
                                    <button onClick={() => { setShowMenu(false); setIsSettingsOpen(true); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors"><Settings2 size={16} className="text-indigo-400" /> Project Settings</button>
                                )}
                                {isAssetIngestionProject && (
                                    <button onClick={openAieEngineModal} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors"><Cpu size={16} className="text-teal-400" /> AIE Engine</button>
                                )}
                                {isImmersiveProject && onViewChange && (
                                    <button onClick={() => { setShowMenu(false); onViewChange('gallery'); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors"><Icons.Aperture size={16} className="text-indigo-400" /> View as Gallery</button>
                                )}
                                {!isAssetIngestionProject && (
                                    <button onClick={() => { setShowMenu(false); onPinToggle(); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors"><Pin size={16} className="text-indigo-400" /> {project.isPinned ? 'Unpin Sidebar' : 'Pin to Sidebar'}</button>
                                )}
                                <div className="h-px bg-slate-700 my-1 mx-2"></div>
                                <button onClick={() => { setShowMenu(false); onImportPrompt(); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors">
                                    <MessageSquarePlus size={16} className="text-indigo-400" /> Import Prompts
                                </button>
                                {onMovePromptsToStaging && (
                                    <button onClick={() => { setShowMenu(false); onMovePromptsToStaging(); }} disabled={isMovingPromptsToStaging} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 flex items-center gap-3 transition-colors">
                                        {isMovingPromptsToStaging ? <Icons.Loader2 size={16} className="text-emerald-300 animate-spin" /> : <SendToBack size={16} className="text-emerald-300" />}
                                        {isMovingPromptsToStaging ? 'Moving Prompts...' : 'Move Prompts To Staging'}
                                    </button>
                                )}
                                {isPromptProject && onCheckPromptDuplicates && (
                                    <button onClick={() => { setShowMenu(false); onCheckPromptDuplicates(); }} disabled={isCheckingPromptDuplicates} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 flex items-center gap-3 transition-colors">
                                        {isCheckingPromptDuplicates ? <Icons.Loader2 size={16} className="text-amber-300 animate-spin" /> : <Layers size={16} className="text-amber-300" />}
                                        {isCheckingPromptDuplicates ? 'Checking Prompt Duplicates...' : 'Check Prompt Duplicates'}
                                    </button>
                                )}
                                <button onClick={() => { setShowMenu(false); onImport(); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors">
                                    <FileUp size={16} className="text-indigo-400" /> Import ZIP
                                </button>
                                <button onClick={() => { setShowMenu(false); onExport(); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors">
                                    <FileDown size={16} className="text-indigo-400" /> Export ZIP
                                </button>
                                {!isAssetIngestionProject && (
                                    <>
                                        <div className="h-px bg-slate-700 my-1 mx-2"></div>
                                        <button onClick={() => { setShowMenu(false); onArchive(); }} className="w-full text-left px-5 py-3.5 text-xs font-bold text-rose-500 hover:bg-rose-950/20 flex items-center gap-3 transition-colors"><Trash2 size={16} /> Delete Workspace</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isSettingsOpen && (
                <ProjectSettingsModal 
                    isOpen={isSettingsOpen} 
                    onClose={() => setIsSettingsOpen(false)} 
                    project={project} 
                    onOpenShare={onShare}
                    onUpdate={async (u) => { 
                        if (onUpdateProject) {
                            await onUpdateProject(u);
                        } else {
                            await api.projects.update(project.id, u);
                        }
                        setIsSettingsOpen(false);
                        window.location.reload();
                    }} 
                />
            )}

            {isAieEngineModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-2xl rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/40 px-6 py-5">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl border border-teal-500/20 bg-teal-500/10 p-3 text-teal-300">
                                    <Cpu size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-tight text-white">AIE Engine</h3>
                                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Asset Ingestion Only</p>
                                </div>
                            </div>
                            <button onClick={() => setIsAieEngineModalOpen(false)} className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-6 p-6">
                            <div className="rounded-[1.5rem] border border-slate-800 bg-black/30 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Preset First Item</p>
                                <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                                    <div>
                                        <p className="text-sm font-semibold text-white">{ASSET_INGESTION_UNDEFINED_LABEL}</p>
                                        <p className="mt-1 text-[11px] text-slate-500">This stays at the top of the Asset Ingestion engine dropdown.</p>
                                    </div>
                                    <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Locked</span>
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-slate-800 bg-black/30 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Custom Asset Ingestion Engines</p>
                                <div className="mt-4 space-y-3">
                                    {draftAssetIngestionEngines.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-5 text-sm text-slate-500">
                                            No custom Asset Ingestion engines yet.
                                        </div>
                                    ) : (
                                        draftAssetIngestionEngines.map((engine) => (
                                            <div key={engine} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-white">{engine}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAssetIngestionEngine(engine)}
                                                    className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-300 transition-colors hover:bg-rose-500/20"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-slate-800 bg-black/30 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Add Asset Ingestion Engine</p>
                                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                    <input
                                        value={newAssetIngestionEngine}
                                        onChange={(e) => setNewAssetIngestionEngine(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddAssetIngestionEngine();
                                            }
                                        }}
                                        placeholder="Add engine name"
                                        className="h-12 flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition-colors focus:border-teal-500/50"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddAssetIngestionEngine}
                                        className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-teal-300 transition-colors hover:bg-teal-500/20"
                                    >
                                        Add Engine
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 border-t border-slate-800 bg-slate-950/40 px-6 py-5">
                            <button
                                type="button"
                                onClick={() => setIsAieEngineModalOpen(false)}
                                className="px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSavingAieEngines}
                                onClick={handleSaveAssetIngestionEngines}
                                className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-teal-300 transition-colors hover:bg-teal-500/20 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isSavingAieEngines ? 'Saving...' : 'Save AIE Engines'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
