import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Plus, Trash2, LayoutGrid, Check, Sparkles, Loader2, X, Save, Palette, Info, Box, ImageIcon, Video, FileText, HardDrive, Shield, Edit3 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { api } from '../../services/api';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface CustomType {
    id: string;
    label: string;
    description: string;
    iconName: string;
    color: string;
}

const SYSTEM_INTENTS = [
    { id: 'all', label: 'Mixed Cluster', description: 'Allow all asset types (General Purpose)', iconName: 'LayoutGrid', color: '#6366f1' },
    { id: 'image', label: 'Visual Cluster', description: 'Focus on static images & photos', iconName: 'ImageIcon', color: '#f59e0b' },
    { id: 'video', label: 'Temporal Stream', description: 'Cinematic video & motion assets', iconName: 'Video', color: '#3b82f6' },
    { id: 'text', label: 'Linguistic Docs', description: 'Structured documents & reasoning', iconName: 'FileText', color: '#10b981' },
    { id: 'files', label: 'File Archive', description: 'General file storage & binaries', iconName: 'HardDrive', color: '#64748b' },
];

const ICON_OPTIONS = ['LayoutGrid', 'ImageIcon', 'Video', 'FileText', 'HardDrive', 'Cpu', 'Sparkles', 'Wand2', 'Archive', 'Book', 'Code', 'Camera', 'Mic', 'Layers', 'Boxes', 'Zap', 'BrainCircuit'];

export const IntentSection: React.FC = () => {
    const { confirm, confirmDialog } = useModalDialogs();
    const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isForging, setIsForging] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [forgeData, setForgeData] = useState({ label: '', description: '', iconName: 'LayoutGrid', color: '#6366f1' });
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const fetchCustomTypes = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/settings/project-types', { headers: api.auth.getAuthHeaders() });
            if (res.ok) setCustomTypes(await res.json());
        } catch (e) {
            console.error("Failed to sync intents");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomTypes();
    }, [fetchCustomTypes]);

    const handleCommit = async () => {
        if (!forgeData.label.trim()) return;
        setStatus(null);
        try {
            const url = editingId 
                ? `/api/settings/project-types/${editingId}`
                : '/api/settings/project-types';
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(forgeData)
            });

            if (res.ok) {
                const savedType = await res.json();
                if (editingId) {
                    setCustomTypes(prev => prev.map(t => t.id === editingId ? { ...t, ...forgeData } : t));
                } else {
                    setCustomTypes(prev => [...prev, savedType]);
                }
                
                setIsForging(false);
                setEditingId(null);
                setForgeData({ label: '', description: '', iconName: 'LayoutGrid', color: '#6366f1' });
                setStatus({ type: 'success', message: editingId ? 'Intent updated successfully.' : 'New intent forged successfully.' });
                setTimeout(() => setStatus(null), 3000);
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Failed to commit intent changes.' });
        }
    };

    const handleStartEdit = (type: CustomType) => {
        setEditingId(type.id);
        setForgeData({
            label: type.label,
            description: type.description,
            iconName: type.iconName,
            color: type.color
        });
        setIsForging(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setIsForging(false);
        setEditingId(null);
        setForgeData({ label: '', description: '', iconName: 'LayoutGrid', color: '#6366f1' });
        setStatus(null);
    };

    const handleDeleteType = async (id: string) => {
        const ok = await confirm({
            title: 'Decommission Neural Intent',
            description: 'Permanently decommission this neural intent? Existing projects using this intent will revert to the default cluster.',
            confirmLabel: 'Decommission',
            tone: 'danger'
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/settings/project-types/${id}`, { 
                method: 'DELETE',
                headers: api.auth.getAuthHeaders()
            });
            if (res.ok) {
                setCustomTypes(prev => prev.filter(t => t.id !== id));
            }
        } catch (e) {}
    };

    const getIcon = (name: string, size = 18) => {
        const Icon = (Icons as any)[name] || Icons.LayoutGrid;
        return <Icon size={size} />;
    };

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                        <Cpu size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Neural Intent Registry</h2>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-0.5">Global Classification Matrix</p>
                    </div>
                </div>
                <button 
                    onClick={() => { if (isForging) handleCancel(); else setIsForging(true); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isForging ? 'bg-slate-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg'}`}
                >
                    {isForging ? <X size={14} /> : <Plus size={14} />} {isForging ? 'Cancel' : 'Forge New Intent'}
                </button>
            </div>

            <div className="p-6 space-y-10">
                {status && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 text-xs font-bold animate-in slide-in-from-top-2 ${status.type === 'success' ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-900/50' : 'bg-red-900/20 text-red-400 border border-red-900/50'}`}>
                        {status.type === 'success' ? <Check size={16} /> : <X size={16} />}
                        {status.message}
                    </div>
                )}

                {isForging && (
                    <div className="p-6 bg-slate-900 border border-indigo-500/30 rounded-2xl space-y-6 animate-in zoom-in-95 shadow-inner">
                        <div className="flex items-center gap-3 mb-2">
                            <Sparkles size={16} className="text-indigo-400" />
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">
                                {editingId ? 'Edit Neural Intent' : 'Forge New Neural Intent'}
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Intent Label</label>
                                <input 
                                    value={forgeData.label}
                                    onChange={e => setForgeData({...forgeData, label: e.target.value})}
                                    className="w-full bg-black border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 transition-all"
                                    placeholder="e.g. 3D Artifacts"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Identification Color</label>
                                <div className="flex gap-2">
                                    <div className="relative group">
                                        <input 
                                            type="color"
                                            value={forgeData.color}
                                            onChange={e => setForgeData({...forgeData, color: e.target.value})}
                                            className="w-11 h-11 rounded-xl bg-transparent border-none cursor-pointer p-0 overflow-hidden"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Palette size={14} className="text-white drop-shadow-md" />
                                        </div>
                                    </div>
                                    <input 
                                        value={forgeData.color}
                                        onChange={e => setForgeData({...forgeData, color: e.target.value})}
                                        className="flex-1 bg-black border border-slate-700 rounded-xl px-3 text-xs text-indigo-400 font-mono outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Functional Description</label>
                            <input 
                                value={forgeData.description}
                                onChange={e => setForgeData({...forgeData, description: e.target.value})}
                                className="w-full bg-black border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500"
                                placeholder="Describe the purpose of this cluster..."
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Infrastructure Icon</label>
                            <div className="flex flex-wrap gap-2 bg-black/40 p-4 rounded-xl border border-slate-800">
                                {ICON_OPTIONS.map(icon => (
                                    <button 
                                        key={icon}
                                        type="button"
                                        onClick={() => setForgeData({...forgeData, iconName: icon})}
                                        className={`p-2.5 rounded-lg transition-all ${forgeData.iconName === icon ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-600 hover:text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        {getIcon(icon, 18)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button 
                                onClick={handleCancel}
                                className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCommit}
                                disabled={!forgeData.label.trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                <Sparkles size={14} /> {editingId ? 'Update Intent' : 'Forge Intent'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Core Infrastructure Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Shield size={14} className="text-slate-500" />
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Core Archetypes</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {SYSTEM_INTENTS.map(opt => (
                            <div
                                key={opt.id}
                                className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/20 border border-slate-800/50 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all cursor-default"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl border border-white/5 shadow-md" style={{ backgroundColor: opt.color, color: '#fff' }}>
                                        {getIcon(opt.iconName, 20)}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-black text-white uppercase tracking-tight">{opt.label}</p>
                                            <span className="text-[7px] font-bold text-slate-600 uppercase bg-slate-800 px-1 rounded">System</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{opt.description}</p>
                                    </div>
                                </div>
                                <div className="p-2 text-slate-800" title="Core systems are read-only">
                                    <Box size={14} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Forged Registry Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Sparkles size={14} className="text-indigo-400" />
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Forged Registry</h3>
                    </div>
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Syncing Matrix...</span>
                        </div>
                    ) : customTypes.length === 0 ? (
                        <div className="py-12 text-center border-2 border-dashed border-slate-700 rounded-2xl opacity-40">
                            <LayoutGrid size={32} className="mx-auto mb-2 text-slate-500" />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">No custom intents forged.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {customTypes.map(opt => (
                                <div
                                    key={opt.id}
                                    className={`flex items-center justify-between p-4 rounded-2xl bg-slate-900/40 border transition-all group ${editingId === opt.id ? 'border-indigo-500 ring-1 ring-indigo-500/30' : 'border-slate-700 hover:border-indigo-500/30'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-xl border border-white/5 shadow-md" style={{ backgroundColor: opt.color, color: '#fff' }}>
                                            {getIcon(opt.iconName, 20)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-black text-white uppercase tracking-tight">{opt.label}</p>
                                                <span className="text-[7px] font-bold text-slate-600 font-mono uppercase">ID: {opt.id}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{opt.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => handleStartEdit(opt)}
                                            className="p-2 text-slate-600 hover:text-indigo-400 hover:bg-indigo-900/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            title="Edit Intent"
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteType(opt.id)}
                                            className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-900/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            title="Decommission Intent"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="mt-8 flex items-start gap-3 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                    <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                        <strong>Registry Note:</strong> Core Archetypes are part of the native infrastructure and are non-mutable. Forged Intents are user-defined and can be decommissioned if no longer required. All changes are propagated across the ecosystem immediately.
                    </p>
                </div>
            </div>

            {confirmDialog}
        </section>
    );
};
