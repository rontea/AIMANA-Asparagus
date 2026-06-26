import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, Settings2, ImageIcon, Video, FileText, LayoutGrid, HardDrive, Cpu, Check, Sparkles, Settings, Share2 } from 'lucide-react';
import { Project } from '../../types';
import * as Icons from 'lucide-react';
import { api } from '../../services/api';
import { IntentRegistryModal } from './IntentRegistryModal';
import { getProjectTypes } from '../../services/projectTypes';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface ProjectSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    onUpdate: (updates: Partial<Project>) => Promise<void>;
    onOpenShare?: () => void;
}

interface CustomType {
    id: string;
    label: string;
    description: string;
    iconName: string;
    color: string;
}

const COLORS = [
  '#1e293b', // Slate 800 (Default)
  '#334155', // Slate 700
  '#0f172a', // Slate 900
  '#475569', // Slate 600
  '#7c3aed', // Violet 600
  '#4c1d95', // Violet 900
  '#be123c', // Rose 700
  '#831843', // Pink 900
  '#db2777', // Pink 600
  '#166534', // Green 800
  '#14532d', // Green 900
  '#0f766e', // Teal 700
  '#0369a1', // Sky 700
  '#2563eb', // Blue 600
  '#1e3a8a', // Blue 900
  '#9333ea', // Purple 600
  '#b45309', // Amber 700
  '#7c2d12', // Orange 900
  '#dc2626', // Red 600
  '#f59e0b', // Amber 500 (Keep)
];

const SYSTEM_TYPES = [
    { id: 'all', label: 'Mixed Cluster', desc: 'Allow all asset types (General Purpose)', icon: 'LayoutGrid' },
    { id: 'image', label: 'Visual Cluster', desc: 'Focus on static images & photos', icon: 'ImageIcon' },
    { id: 'video', label: 'Temporal Stream', desc: 'Cinematic video & motion assets', icon: 'Video' },
    { id: 'text', label: 'Linguistic Docs', desc: 'Structured documents & reasoning', icon: 'FileText' },
    { id: 'files', label: 'File Archive', desc: 'General file storage & binaries', icon: 'HardDrive' },
];

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onClose, project, onUpdate, onOpenShare }) => {
    const { alert, alertDialog } = useModalDialogs();
    const [name, setName] = useState(project.name);
    const [description, setDescription] = useState(project.description);
    const [projectType, setProjectType] = useState<string>(project.projectType || 'all');
    const [selectedColor, setSelectedColor] = useState(project.color || COLORS[0]);
    const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isRegistryOpen, setIsRegistryOpen] = useState(false);
    const previousIsOpenRef = useRef(isOpen);
    const previousProjectIdRef = useRef(project.id);

    const isSuperUser = api.auth.getUser()?.id === 'admin-root';

    const fetchCustomTypes = useCallback(async (forceRefresh = false) => {
        try {
            const rows = await getProjectTypes(forceRefresh);
            setCustomTypes(rows);
        } catch (e) {}
    }, []);

    useEffect(() => {
        const wasOpen = previousIsOpenRef.current;
        const previousProjectId = previousProjectIdRef.current;
        const openedNow = !wasOpen && isOpen;
        const switchedProjectWhileOpen = isOpen && previousProjectId !== project.id;

        if (openedNow) {
            fetchCustomTypes();
        }

        if (openedNow || switchedProjectWhileOpen) {
            setName(project.name);
            setDescription(project.description);
            setProjectType(project.projectType || 'all');
            setSelectedColor(project.color || COLORS[0]);
        }

        previousIsOpenRef.current = isOpen;
        previousProjectIdRef.current = project.id;
    }, [isOpen, project.id, project.name, project.description, project.projectType, project.color, fetchCustomTypes]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName) {
            return;
        }
        setIsSaving(true);
        try {
            await onUpdate({ name: trimmedName, description, projectType, color: selectedColor });
            onClose();
        } catch (e) {
            await alert({
                title: 'Update Failed',
                description: 'Failed to update settings.',
                tone: 'danger'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const getIcon = (name: string, size = 18) => {
        const Icon = (Icons as any)[name] || Icons.LayoutGrid;
        return <Icon size={size} />;
    };
    const pickerValue = /^#[0-9A-Fa-f]{6}$/.test(selectedColor) ? selectedColor : COLORS[0];

    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                            <Settings2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Workspace Topology</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Registry Configuration</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-1">Workspace Identity</label>
                        <input 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className="w-full bg-black border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-indigo-500 transition-all shadow-inner"
                            placeholder="Project Name"
                        />
                        <textarea 
                            value={description} 
                            onChange={e => setDescription(e.target.value)} 
                            className="w-full h-24 bg-black border border-slate-800 rounded-2xl p-4 text-sm text-slate-300 outline-none focus:border-indigo-500 resize-none transition-all shadow-inner"
                            placeholder="Description..."
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-1">Aesthetic Palette</label>
                        <div className="flex gap-4 flex-wrap px-1">
                            {COLORS.map((c) => (
                                <button 
                                    key={c} 
                                    type="button" 
                                    onClick={() => setSelectedColor(c)} 
                                    className={`w-10 h-10 rounded-2xl border-4 transition-all focus:outline-none ${selectedColor === c ? 'border-white scale-110 shadow-xl' : 'border-transparent hover:scale-105 hover:border-slate-500'}`} 
                                    style={{ backgroundColor: c }} 
                                />
                            ))}
                        </div>
                        <div className="px-1 flex items-center gap-3">
                            <label htmlFor="project-custom-color" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Custom Color</label>
                            <input
                                id="project-custom-color"
                                type="color"
                                value={pickerValue}
                                onChange={(e) => setSelectedColor(e.target.value)}
                                className="h-10 w-14 rounded-xl border border-slate-700 bg-black cursor-pointer"
                                aria-label="Pick custom project color"
                            />
                            <span className="text-[10px] font-mono text-slate-400 uppercase">{pickerValue}</span>
                        </div>
                    </div>

                    {onOpenShare && (
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-1">Collaboration</label>
                            <div className="px-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        onOpenShare();
                                    }}
                                    className="w-full sm:w-auto px-6 py-3 rounded-2xl border border-indigo-500/40 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                                >
                                    <Share2 size={14} /> Share Workspace Access
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Neural Intent Selection</label>
                            {isSuperUser && (
                                <button 
                                    type="button"
                                    onClick={() => setIsRegistryOpen(true)}
                                    className="text-[9px] font-black uppercase text-indigo-400 hover:text-white flex items-center gap-1.5 transition-all group"
                                >
                                    <Settings size={12} className="group-hover:rotate-90 transition-transform" /> Manage Registry
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* System Intents */}
                            {SYSTEM_TYPES.map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setProjectType(opt.id)}
                                    className={`flex items-start gap-4 p-5 rounded-[1.5rem] border text-left transition-all ${projectType === opt.id ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-900/10' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                                >
                                    <div className={`p-2.5 rounded-xl border ${projectType === opt.id ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                        {getIcon(opt.icon)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-xs font-black uppercase tracking-tight leading-none ${projectType === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                                        <p className="text-[10px] text-slate-500 font-medium mt-1.5 leading-tight">{opt.desc}</p>
                                    </div>
                                    {projectType === opt.id && <Check size={14} className="text-indigo-400 mt-1" />}
                                </button>
                            ))}

                            {/* Forged Intents */}
                            {customTypes.map(opt => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setProjectType(opt.id)}
                                    className={`flex items-start gap-4 p-5 rounded-[1.5rem] border text-left transition-all relative group ${projectType === opt.id ? 'bg-indigo-600/10 border-indigo-500 shadow-lg shadow-indigo-900/10' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                                >
                                    <div className={`p-2.5 rounded-xl border transition-all`} style={{ backgroundColor: projectType === opt.id ? opt.color : 'transparent', color: projectType === opt.id ? '#fff' : opt.color, borderColor: projectType === opt.id ? opt.color : '#1e293b' }}>
                                        {getIcon(opt.iconName)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className={`text-xs font-black uppercase tracking-tight leading-none ${projectType === opt.id ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                                            <Sparkles size={10} className="text-amber-400 opacity-60" />
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-medium mt-1.5 leading-tight">{opt.description}</p>
                                    </div>
                                    {projectType === opt.id && <Check size={14} className="text-indigo-400 mt-1" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </form>

                <div className="p-8 border-t border-slate-800 bg-slate-950/20 flex justify-end gap-4">
                    <button type="button" onClick={onClose} className="px-8 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSaving || !name.trim()} className="min-w-[200px] bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-2xl shadow-indigo-900/40 transition-all active:scale-95 flex items-center justify-center gap-3">
                        <Save size={18} /> Commit Changes
                    </button>
                </div>
            </div>
        </div>

        {isRegistryOpen && (
            <IntentRegistryModal 
                isOpen={isRegistryOpen}
                onClose={() => {
                    setIsRegistryOpen(false);
                    fetchCustomTypes(true);
                }}
            />
        )}
        {alertDialog}
        </>
    );
};
