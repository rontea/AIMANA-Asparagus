import React, { useMemo, useState } from 'react';
import { ListPlus, ChevronRight, Type, FileJson, HelpCircle, Check, Copy, AlertCircle, Tag, Plus, Trash2, Save, Database, Download, Loader2, RefreshCw, Eye, Edit3, Lock, FolderOpen, CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';
import { BulkVariable, BulkPreset } from '../../pages/BulkStudio';
import type { Project } from '../../types';
import type { SavedRegistryList } from '../../utils/variableRegistryStorage';
import { autoCorrectPromptImportJsonInput, checkPromptImportJsonInput, resolvePromptImportVariables } from '../prompt-manager/utils';

interface BulkQueueSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    inputMode: 'text' | 'json';
    setInputMode: (m: 'text' | 'json') => void;
    bulkInput: string;
    setBulkInput: (v: string) => void;
    variables: BulkVariable[];
    setVariables: (v: BulkVariable[]) => void;
    presets: BulkPreset[];
    onSavePreset: (name: string) => Promise<void>;
    onUpdatePreset: (id: string, name: string) => Promise<void>;
    onDeletePreset: (id: string) => Promise<void>;
    onSyncFromQueue?: () => void;
    parseError: string | null;
    onInject: () => void;
    showSamples: boolean;
    setShowSamples: (v: boolean) => void;
    copyToClipboard: (text: string) => void;
    copiedSample: boolean;
    isBatchRunning?: boolean;
    promptCollections?: Project[];
    onQueueCollection?: (collectionId: string) => Promise<void>;
    isQueueingCollection?: boolean;
    registryCollections?: SavedRegistryList[];
    onLoadActiveRegistry?: () => void;
    onLoadRegistryCollection?: (collectionId: string) => void;
}

export const BulkQueueSidebar: React.FC<BulkQueueSidebarProps> = ({ 
    isOpen, onClose, inputMode, setInputMode, bulkInput, setBulkInput, 
    variables, setVariables, presets, onSavePreset, onUpdatePreset, onDeletePreset,
    onSyncFromQueue, parseError, onInject, showSamples, setShowSamples, copyToClipboard, copiedSample, isBatchRunning,
    promptCollections = [], onQueueCollection, isQueueingCollection = false,
    registryCollections = [], onLoadActiveRegistry, onLoadRegistryCollection
}) => {
    const [copiedKeys, setCopiedKeys] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [previewingPresetId, setPreviewingPresetId] = useState<string | null>(null);
    const [selectedCollectionId, setSelectedCollectionId] = useState('');
    const [selectedRegistryCollectionId, setSelectedRegistryCollectionId] = useState('');

    const TEXT_SAMPLE = "A cinematic futuristic city at night featuring {{ name }}\nHyper-realistic mechanical eye close-up for {{ name }}\nNeon-lit rain-slicked street in {{ name }}'s world";
    const JSON_SAMPLE = `[\n  {\n    "title": "Neon Horizon",\n    "prompt": "A futuristic skyline featuring {{ name }}..."\n  },\n  {\n    "title": "Cyber Eye",\n    "prompt": "Detailed mechanical iris for {{ name }}..."\n  }\n]`;
    const jsonCheck = useMemo(() => {
        if (inputMode !== 'json') return null;
        return checkPromptImportJsonInput(resolvePromptImportVariables(bulkInput, variables));
    }, [bulkInput, inputMode, variables]);
    const isJsonBlocked = inputMode === 'json' && (!jsonCheck || !jsonCheck.ok);

    const handleAutoCorrectJson = () => {
        const result = autoCorrectPromptImportJsonInput(bulkInput);
        if (result.changed) {
            setBulkInput(result.corrected);
        }
    };

    const handleAddVariable = () => {
        const newVar: BulkVariable = {
            id: Math.random().toString(36).substring(7),
            key: '',
            value: ''
        };
        setVariables([...variables, newVar]);
    };

    const handleUpdateVariable = (id: string, updates: Partial<BulkVariable>) => {
        setVariables(variables.map(v => v.id === id ? { ...v, ...updates } : v));
    };

    const handleRemoveVariable = (id: string) => {
        setVariables(variables.filter(v => v.id !== id));
    };

    const handleCopyKeys = () => {
        const keys = variables
            .filter(v => v.key.trim())
            .map(v => `{{ ${v.key.trim()} }}`)
            .join(' ');
        
        if (!keys) return;
        
        navigator.clipboard.writeText(keys);
        setCopiedKeys(true);
        setTimeout(() => setCopiedKeys(false), 2000);
    };

    const handleSaveLocalPreset = async () => {
        if (!presetName.trim()) return;
        setIsSavingPreset(true);
        await onSavePreset(presetName);
        setPresetName('');
        setIsSavingPreset(false);
    };

    const applyPreset = (p: BulkPreset) => {
        setVariables(p.variables);
        if (p.manifest) setBulkInput(p.manifest);
        if (p.inputMode) setInputMode(p.inputMode);
        setPreviewingPresetId(null);
    };

    return (
        <div className={`fixed top-0 right-0 h-full w-[450px] bg-slate-900/95 backdrop-blur-2xl border-l border-indigo-500/30 z-[120] transition-transform duration-500 transform shadow-[-20px_0_50px_rgba(0,0,0,0.5)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Interactive Lock Overlay */}
            {isBatchRunning && (
                <div className="absolute inset-0 z-[130] bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                    <div className="p-4 bg-indigo-600 rounded-3xl shadow-2xl mb-4">
                        <Lock size={32} className="text-white" />
                    </div>
                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-[0.3em]">Queue Locked</h4>
                    <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase leading-relaxed max-w-[200px]">Manifest modifications are prohibited while the pipeline is active.</p>
                </div>
            )}

            <div className="h-full flex flex-col">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400"><ListPlus size={20} /></div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Neural Queue</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <ChevronRight size={24} />
                    </button>
                </div>

                <div className="flex-1 p-8 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex gap-1 shadow-inner">
                        <button onClick={() => setInputMode('text')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${inputMode === 'text' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                            <Type size={14} /> Text Manifest
                        </button>
                        <button onClick={() => setInputMode('json')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${inputMode === 'json' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                            <FileJson size={14} /> JSON Manifest
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {inputMode === 'text' ? 'Bulk Prompt Manifest' : 'Structured JSON Manifest'}
                            </label>
                            <div className="flex items-center gap-3">
                                {onSyncFromQueue && (
                                    <button 
                                        onClick={onSyncFromQueue}
                                        disabled={isBatchRunning}
                                        className="text-[9px] font-black uppercase text-indigo-400 hover:text-white flex items-center gap-1 transition-all disabled:opacity-30"
                                        title="Pull active queue prompts into editor"
                                    >
                                        <Edit3 size={10} /> Edit Queue
                                    </button>
                                )}
                                {inputMode === 'json' && (
                                    <button
                                        type="button"
                                        onClick={handleAutoCorrectJson}
                                        disabled={!bulkInput.trim() || isBatchRunning}
                                        className="text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 transition-colors text-slate-500 hover:text-emerald-300 disabled:opacity-40"
                                    >
                                        <Wand2 size={10} /> Auto Correct
                                    </button>
                                )}
                                <button 
                                    onClick={() => setShowSamples(!showSamples)} 
                                    className={`text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 transition-colors ${showSamples ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-300'}`}
                                >
                                    <HelpCircle size={10} /> {showSamples ? 'Hide Samples' : 'View Samples'}
                                </button>
                            </div>
                        </div>

                        {showSamples && (
                            <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Example {inputMode.toUpperCase()} Format</span>
                                    <button 
                                        onClick={() => copyToClipboard(inputMode === 'text' ? TEXT_SAMPLE : JSON_SAMPLE)} 
                                        className="text-[8px] font-black uppercase text-slate-500 hover:text-white flex items-center gap-1 transition-all"
                                    >
                                        {copiedSample ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />} 
                                        {copiedSample ? 'Copied' : 'Copy Sample'}
                                    </button>
                                </div>
                                <pre className="text-[9px] font-mono text-slate-400 bg-black/40 p-3 rounded-lg overflow-x-auto custom-scrollbar leading-relaxed">
                                    {inputMode === 'text' ? TEXT_SAMPLE : JSON_SAMPLE}
                                </pre>
                            </div>
                        )}

                        <textarea 
                            value={bulkInput} 
                            onChange={(e) => setBulkInput(e.target.value)} 
                            disabled={isBatchRunning}
                            placeholder={inputMode === 'text' ? "A cinematic city featuring {{ name }}..." : '[\n  {\n    "title": "Neon Horizon",\n    "prompt": "Skyline featuring {{ name }}..."\n  }\n]'} 
                            className={`w-full h-56 bg-black/40 border rounded-3xl p-6 text-sm font-medium outline-none transition-all resize-none custom-scrollbar placeholder:text-slate-800 ${parseError ? 'border-red-500/50 text-red-200' : 'border-slate-800 text-white focus:border-indigo-500/50 shadow-inner'} disabled:opacity-30`} 
                        />

                        {inputMode === 'json' && jsonCheck && (
                            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                                jsonCheck.ok
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                    : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                            }`}>
                                <div className="mt-0.5 shrink-0">
                                    {jsonCheck.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em]">
                                        {jsonCheck.ok ? 'JSON Valid' : 'JSON Check'}
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed opacity-90">{jsonCheck.message}</p>
                                </div>
                            </div>
                        )}

                        {/* Neural Variable Registry Section */}
                        <div className="space-y-4 mt-6 animate-in slide-in-from-top-1">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <Tag size={12} /> Neural Variable Registry
                                </label>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleCopyKeys}
                                        disabled={variables.filter(v => v.key.trim()).length === 0}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            copiedKeys 
                                            ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' 
                                            : 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white disabled:opacity-30'
                                        }`}
                                        title="Copy all keys to clipboard"
                                    >
                                        {copiedKeys ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedKeys ? 'Copied' : 'Copy Keys'}
                                    </button>
                                    {!isBatchRunning && (
                                        <button 
                                            onClick={handleAddVariable}
                                            className="p-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all border border-indigo-500/20"
                                            title="Add Variable"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {variables.length === 0 ? (
                                    <p className="text-[9px] text-slate-600 font-bold uppercase text-center py-4 border border-dashed border-slate-800 rounded-2xl">No variables defined</p>
                                ) : (
                                    variables.map((v) => (
                                        <div key={v.id} className="flex gap-2 animate-in slide-in-from-left-1 duration-300">
                                            <div className="flex-1 space-y-1">
                                                <div className="relative group">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500/50 text-[10px] font-mono">{"{{"}</span>
                                                    <input 
                                                        type="text" 
                                                        value={v.key}
                                                        disabled={isBatchRunning}
                                                        onChange={(e) => handleUpdateVariable(v.id, { key: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                                                        placeholder="key"
                                                        className="w-full bg-black/40 border border-slate-800 rounded-xl pl-8 pr-8 py-2 text-[10px] font-mono text-indigo-400 outline-none focus:border-indigo-500 transition-all disabled:opacity-30"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500/50 text-[10px] font-mono">{"}}"}</span>
                                                </div>
                                            </div>
                                            <div className="flex-[2]">
                                                <input 
                                                    type="text" 
                                                    value={v.value}
                                                    disabled={isBatchRunning}
                                                    onChange={(e) => handleUpdateVariable(v.id, { value: e.target.value })}
                                                    placeholder="replacement value..."
                                                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all shadow-inner placeholder:text-slate-700 disabled:opacity-30"
                                                />
                                            </div>
                                            {!isBatchRunning && (
                                                <button 
                                                    onClick={() => handleRemoveVariable(v.id)}
                                                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="rounded-2xl border border-slate-800/70 bg-black/20 p-4 space-y-3">
                                <div>
                                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                                        Load Registry Source
                                    </div>
                                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                                        Pull the shared active Neural Variable Registry into this bulk editor, or load a saved vault collection here.
                                    </p>
                                </div>

                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={onLoadActiveRegistry}
                                        disabled={!onLoadActiveRegistry || isBatchRunning}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-300 transition-colors hover:bg-indigo-600 hover:text-white disabled:opacity-40"
                                    >
                                        <RefreshCw size={11} />
                                        Load Active Registry
                                    </button>
                                    <div className="inline-flex w-full items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
                                        <Database size={12} className="shrink-0 text-emerald-300" />
                                        <select
                                            value={selectedRegistryCollectionId}
                                            onChange={(event) => setSelectedRegistryCollectionId(event.target.value)}
                                            disabled={isBatchRunning || registryCollections.length === 0}
                                            className="w-full bg-transparent text-[10px] font-black uppercase tracking-widest text-emerald-200 outline-none disabled:opacity-50"
                                        >
                                            <option value="">
                                                {registryCollections.length === 0 ? 'No vault collections available' : 'Select vault collection'}
                                            </option>
                                            {registryCollections.map((entry) => (
                                                <option key={entry.id} value={entry.id}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!selectedRegistryCollectionId || !onLoadRegistryCollection) return;
                                            onLoadRegistryCollection(selectedRegistryCollectionId);
                                        }}
                                        disabled={!selectedRegistryCollectionId || !onLoadRegistryCollection || isBatchRunning}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-40"
                                    >
                                        <Database size={11} />
                                        Load Collection
                                    </button>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-800/50 space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <FolderOpen size={12} className="text-amber-300" />
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prompt Manager Collection</label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <select
                                        value={selectedCollectionId}
                                        disabled={isBatchRunning || isQueueingCollection || promptCollections.length === 0}
                                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                                        className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-[10px] text-white outline-none focus:border-amber-500 transition-all shadow-inner disabled:opacity-30"
                                    >
                                        <option value="">
                                            {promptCollections.length === 0 ? 'No prompt collections available' : 'Select prompt collection'}
                                        </option>
                                        {promptCollections.map((collection) => (
                                            <option key={collection.id} value={collection.id}>
                                                {collection.name}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        onClick={async () => {
                                            if (!selectedCollectionId || !onQueueCollection) return;
                                            await onQueueCollection(selectedCollectionId);
                                        }}
                                        disabled={!selectedCollectionId || !onQueueCollection || isBatchRunning || isQueueingCollection}
                                        className="w-full bg-amber-500/15 hover:bg-amber-500 text-amber-200 hover:text-slate-950 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-amber-500/25 disabled:opacity-30 flex items-center justify-center gap-2"
                                    >
                                        {isQueueingCollection ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                                        Queue Collection To Bulk
                                    </button>
                                </div>

                                <p className="text-[8px] text-slate-500 uppercase tracking-tighter px-1">
                                    Pull prompts from a Prompt Manager collection directly into the bulk queue.
                                </p>
                            </div>

                            {/* Preset Persistence Section */}
                            <div className="pt-4 border-t border-slate-800/50 space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <Database size={12} className="text-emerald-400" />
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saved Preset Vault</label>
                                    </div>
                                </div>
                                
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={presetName}
                                        disabled={isBatchRunning}
                                        onChange={(e) => setPresetName(e.target.value)}
                                        placeholder="Preset Name (e.g. Cyberpunk Styles)"
                                        className="flex-1 bg-black/40 border border-slate-800 rounded-xl px-4 py-2 text-[10px] text-white outline-none focus:border-emerald-500 transition-all shadow-inner disabled:opacity-30"
                                    />
                                    <button 
                                        onClick={handleSaveLocalPreset}
                                        disabled={!presetName.trim() || variables.length === 0 || isSavingPreset || isBatchRunning}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-emerald-900/40 disabled:opacity-30 flex items-center gap-2"
                                    >
                                        {isSavingPreset ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                                    {presets.length === 0 ? (
                                        <p className="text-[8px] text-slate-600 italic px-1">No presets archived in the database.</p>
                                    ) : (
                                        presets.map(p => (
                                            <div key={p.id} className="flex flex-col p-3 bg-slate-950 border border-slate-800 rounded-xl group transition-all hover:border-indigo-500/30">
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-bold text-slate-300 truncate">{p.name}</p>
                                                        <p className="text-[8px] text-slate-600 uppercase tracking-widest">{p.variables.length} variables • {p.inputMode || 'text'}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button 
                                                            onClick={() => setPreviewingPresetId(previewingPresetId === p.id ? null : p.id)}
                                                            className={`p-1.5 rounded-lg transition-all ${previewingPresetId === p.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                                            title="View Manifest"
                                                        >
                                                            <Eye size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={() => applyPreset(p)}
                                                            disabled={isBatchRunning}
                                                            className="p-1.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all disabled:opacity-30"
                                                            title="Apply Preset"
                                                        >
                                                            <Check size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={() => onUpdatePreset(p.id, p.name)}
                                                            disabled={isBatchRunning}
                                                            className="p-1.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg transition-all disabled:opacity-30"
                                                            title="Update with current config"
                                                        >
                                                            <RefreshCw size={12} />
                                                        </button>
                                                        <button 
                                                            onClick={() => onDeletePreset(p.id)}
                                                            disabled={isBatchRunning}
                                                            className="p-1.5 hover:bg-red-600/10 text-slate-600 hover:text-red-400 rounded-lg transition-all disabled:opacity-30"
                                                            title="Decommission Preset"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {previewingPresetId === p.id && (
                                                    <div className="mt-3 p-2 bg-black/40 rounded-lg border border-white/5 animate-in slide-in-from-top-1">
                                                        <p className="text-[9px] font-mono text-slate-500 line-clamp-3 leading-relaxed">
                                                            {p.manifest || 'No manifest stored in this preset.'}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            <p className="text-[8px] text-slate-500 uppercase tracking-tighter px-1">
                                Placeholders like {"{{ key }}"} will be resolved during task injection.
                            </p>
                        </div>

                        {parseError && (
                            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-tight p-2 bg-red-950/20 border border-red-900/30 rounded-lg animate-in slide-in-from-top-1">
                                <AlertCircle size={12} /> {parseError}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 border-t border-white/5 bg-slate-950/20">
                    <button 
                        onClick={onInject} 
                        disabled={!bulkInput.trim() || isBatchRunning || isJsonBlocked} 
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        <ListPlus size={18} /> Inject to Registry
                    </button>
                </div>
            </div>
        </div>
    );
};
