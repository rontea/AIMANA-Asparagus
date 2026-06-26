
import React, { useState, useEffect, useCallback } from 'react';
// Added Loader2 to imports
import { X, Save, Settings2, LayoutGrid, Plus, Trash2, Check, Sparkles, Cpu, Loader2 } from 'lucide-react';
import * as Icons from 'lucide-react';
import { api } from '../../services/api';
import { clearProjectTypesCache, getProjectTypes } from '../../services/projectTypes';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface IntentRegistryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface CustomType {
    id: string;
    label: string;
    description: string;
    iconName: string;
    color: string;
}

const ICON_OPTIONS = ['LayoutGrid', 'ImageIcon', 'Video', 'FileText', 'HardDrive', 'Cpu', 'Sparkles', 'Wand2', 'Archive', 'Book', 'Code', 'Camera', 'Mic', 'Layers'];

export const IntentRegistryModal: React.FC<IntentRegistryModalProps> = ({ isOpen, onClose }) => {
    const { confirm, alert, confirmDialog, alertDialog } = useModalDialogs();
    const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
    const [isForging, setIsForging] = useState(false);
    const [forgeData, setForgeData] = useState({ label: '', description: '', iconName: 'LayoutGrid', color: '#6366f1' });
    const [isLoading, setIsLoading] = useState(true);

    const fetchCustomTypes = useCallback(async () => {
        setIsLoading(true);
        try {
            setCustomTypes(await getProjectTypes(true));
        } catch (e) {
            console.error("Failed to sync intents");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) fetchCustomTypes();
    }, [isOpen, fetchCustomTypes]);

    const handleForge = async () => {
        if (!forgeData.label.trim()) return;
        try {
            const res = await fetch('/api/settings/project-types', {
                method: 'POST',
                headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(forgeData)
            });
            if (res.ok) {
                const newType = await res.json();
                clearProjectTypesCache();
                setCustomTypes(prev => [...prev, newType]);
                setIsForging(false);
                setForgeData({ label: '', description: '', iconName: 'LayoutGrid', color: '#6366f1' });
            }
        } catch (e) {
            await alert({
                title: 'Forge Failed',
                description: 'Forging failed.',
                tone: 'danger'
            });
        }
    };

    const handleDeleteType = async (id: string) => {
        const ok = await confirm({
            title: 'Decommission Neural Intent',
            description: 'Permanently decommission this neural intent? Existing projects using this intent will revert to default.',
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
                clearProjectTypesCache();
                setCustomTypes(prev => prev.filter(t => t.id !== id));
            }
        } catch (e) {}
    };

    const getIcon = (name: string, size = 18) => {
        const Icon = (Icons as any)[name] || Icons.LayoutGrid;
        return <Icon size={size} />;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                            <Cpu size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Intent Registry</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Global Classification Studio</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Neural Infrastructure</h4>
                        <button 
                            onClick={() => setIsForging(!isForging)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isForging ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white shadow-lg'}`}
                        >
                            {isForging ? <X size={14} /> : <Plus size={14} />} {isForging ? 'Cancel' : 'Forge New Intent'}
                        </button>
                    </div>

                    {isForging && (
                        <div className="p-8 bg-slate-950 border border-indigo-500/30 rounded-[2rem] space-y-8 animate-in slide-in-from-top-2 shadow-2xl">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Intent Label</label>
                                    <input 
                                        value={forgeData.label}
                                        onChange={e => setForgeData({...forgeData, label: e.target.value})}
                                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 shadow-inner"
                                        placeholder="e.g. 3D Artifacts"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Identity Color</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="color"
                                            value={forgeData.color}
                                            onChange={e => setForgeData({...forgeData, color: e.target.value})}
                                            className="w-11 h-11 rounded-xl bg-transparent border-none cursor-pointer p-0 overflow-hidden"
                                        />
                                        <input 
                                            value={forgeData.color}
                                            onChange={e => setForgeData({...forgeData, color: e.target.value})}
                                            className="flex-1 bg-black border border-slate-800 rounded-xl px-3 text-xs text-indigo-400 font-mono outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Functional Context</label>
                                <input 
                                    value={forgeData.description}
                                    onChange={e => setForgeData({...forgeData, description: e.target.value})}
                                    className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400 outline-none focus:border-indigo-500 shadow-inner"
                                    placeholder="Describe the purpose of this workspace type..."
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">System Topology Icon</label>
                                <div className="flex flex-wrap gap-2 bg-black/40 p-4 rounded-2xl border border-slate-800 shadow-inner">
                                    {ICON_OPTIONS.map(icon => (
                                        <button 
                                            key={icon}
                                            type="button"
                                            onClick={() => setForgeData({...forgeData, iconName: icon})}
                                            className={`p-3 rounded-xl transition-all ${forgeData.iconName === icon ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:text-slate-400 hover:bg-slate-800'}`}
                                        >
                                            {getIcon(icon, 20)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button 
                                    onClick={handleForge}
                                    disabled={!forgeData.label.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-3"
                                >
                                    <Sparkles size={16} /> Confirm Forge
                                </button>
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4 text-slate-600">
                            <Loader2 size={32} className="animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Syncing Registry...</span>
                        </div>
                    ) : customTypes.length === 0 && !isForging ? (
                        <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[2rem] opacity-40">
                            <p className="text-sm font-bold text-slate-500">No forged intents detected.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {customTypes.map(opt => (
                                <div
                                    key={opt.id}
                                    className="flex items-center justify-between p-6 rounded-[2rem] bg-slate-950 border border-slate-800 group hover:border-indigo-500/30 transition-all"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="p-3 rounded-2xl border border-white/5 shadow-lg" style={{ backgroundColor: opt.color, color: '#fff' }}>
                                            {getIcon(opt.iconName, 22)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-black text-white uppercase tracking-tight">{opt.label}</p>
                                                <span className="text-[8px] font-black text-slate-600 font-mono uppercase">ID: {opt.id}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-medium mt-1 leading-tight">{opt.description}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleDeleteType(opt.id)}
                                        className="p-3 text-slate-700 hover:text-red-400 hover:bg-red-900/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        title="Decommission Intent"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-slate-800 bg-slate-950/20 text-center">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Registry overrides apply globally across the Ecosystem</p>
                </div>
            </div>
            {confirmDialog}
            {alertDialog}
        </div>
    );
};
