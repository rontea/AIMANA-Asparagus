import React, { useEffect } from 'react';
import { ImageIcon, Type, Video, Volume2, Search, BrainCircuit, Code2, Layers, Cpu, Package, Zap, ZapOff, DollarSign, ToggleLeft, ToggleRight } from 'lucide-react';

interface IdentityTabProps {
    formData: any;
    setFormData: (data: any) => void;
    isNew: boolean;
}

const CAPABILITY_LIST = [
    { id: 'image', label: 'Image Synthesis', icon: ImageIcon, color: 'text-amber-400' },
    { id: 'text', label: 'Text Generation', icon: Type, color: 'text-emerald-400' },
    { id: 'video', label: 'Motion / Video', icon: Video, color: 'text-blue-400' },
    { id: 'audio', label: 'Audio / Voice', icon: Volume2, color: 'text-pink-400' },
    { id: 'logic', label: 'Reasoning', icon: BrainCircuit, color: 'text-indigo-400' },
    { id: 'code', label: 'Coding / Script', icon: Code2, color: 'text-slate-300' },
    { id: 'search', label: 'Search Grounding', icon: Search, color: 'text-cyan-400' }
];

export const IdentityTab: React.FC<IdentityTabProps> = ({ formData, setFormData, isNew }) => {
    const isSystem = !!formData.isSystem;
    const isStatic = formData.category === 'Static';
    
    useEffect(() => {
        if (isStatic && formData.isProgrammable) {
            setFormData({ ...formData, isProgrammable: false });
        }
    }, [isStatic]);

    const toggleCapability = (capId: string) => {
        const current = formData.capabilities || [];
        const next = current.includes(capId) 
            ? current.filter((c: string) => c !== capId)
            : [...current, capId];
        setFormData({ ...formData, capabilities: next });
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-left-2">
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                    <div className="space-y-1">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Cpu size={12} /> Infrastructure Origin
                        </h4>
                        <p className="text-[11px] text-slate-400">
                            {isSystem 
                                ? "This engine is part of the native Animana framework and cannot be decommissioned."
                                : "This engine is a Forged Checkpoint, defined by manual network logic."}
                        </p>
                        <div className="pt-2">
                            <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${isSystem ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                                {isSystem ? <Layers size={18} className="fill-current" /> : <Cpu size={18} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">{isSystem ? 'Native Animana' : 'Forged Checkpoint'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800/50">
                        <button 
                            type="button"
                            onClick={() => setFormData({ ...formData, isPaid: !formData.isPaid })}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left group ${
                                formData.isPaid 
                                ? 'bg-amber-600/10 border-amber-500/50 shadow-lg shadow-amber-900/10' 
                                : 'bg-slate-900 border-slate-800'
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`p-2.5 rounded-xl border transition-all ${formData.isPaid ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                                    <DollarSign size={18} />
                                </div>
                                <div>
                                    <div className={`text-xs font-black uppercase tracking-tight ${formData.isPaid ? 'text-white' : 'text-slate-400'}`}>
                                        Paid Infrastructure Only
                                    </div>
                                    <p className="text-[9px] text-slate-500 font-medium mt-1 leading-relaxed">
                                        Indicates that this model requires a paid provider tier or specific billing configuration.
                                    </p>
                                </div>
                            </div>
                            <div className={formData.isPaid ? 'text-amber-500' : 'text-slate-700'}>
                                {formData.isPaid ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                            </div>
                        </button>
                    </div>
                </div>

                <div className="flex-1 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Zap size={12} /> Functional Context
                    </h4>
                    <button 
                        type="button"
                        disabled={isStatic || isSystem}
                        onClick={() => setFormData({ ...formData, isProgrammable: !formData.isProgrammable })}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left group ${
                            formData.isProgrammable 
                            ? 'bg-indigo-600/10 border-indigo-500/50 shadow-lg shadow-indigo-900/10' 
                            : 'bg-slate-900 border-slate-800 opacity-60'
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2.5 rounded-xl border transition-all ${formData.isProgrammable ? 'bg-indigo-500 text-white border-indigo-400 shadow-md' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                                {formData.isProgrammable ? <Zap size={18} /> : <ZapOff size={18} />}
                            </div>
                            <div>
                                <div className={`text-xs font-black uppercase tracking-tight ${formData.isProgrammable ? 'text-white' : 'text-slate-400'}`}>
                                    Programmable Blueprint
                                </div>
                                <p className="text-[9px] text-slate-500 font-medium mt-1 leading-relaxed">
                                    {formData.isProgrammable 
                                        ? "Active API orchestration enabled. Network and UI tabs unlocked." 
                                        : isStatic ? "Reference mode only. Functional logic disabled for Static Tier." : "Engine acts as a metadata label for archival purposes."}
                                </p>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Engine Slug ID</label>
                    <input 
                        type="text" 
                        value={formData.id} 
                        onChange={e => setFormData({...formData, id: e.target.value.toLowerCase().replace(/\s/g, '-')})} 
                        disabled={!isNew} 
                        className={`w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500 ${!isNew ? 'text-slate-600' : 'text-indigo-400'}`} 
                        placeholder="e.g. my-custom-flux" 
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Display Label</label>
                    <input 
                        type="text" 
                        value={formData.label} 
                        onChange={e => setFormData({...formData, label: e.target.value})} 
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500" 
                        placeholder="e.g. Flux Pro High Fidelity" 
                    />
                </div>
            </div>

            <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Neural Capabilities (Identification)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {CAPABILITY_LIST.map(cap => {
                        const isActive = formData.capabilities?.includes(cap.id);
                        return (
                            <button 
                                key={cap.id}
                                type="button"
                                onClick={() => toggleCapability(cap.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                    isActive 
                                    ? 'bg-indigo-600/10 border-indigo-500/40 text-white' 
                                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                                }`}
                            >
                                <cap.icon size={16} className={isActive ? cap.color : 'text-slate-600'} />
                                <span className="text-[10px] font-bold uppercase tracking-tight">{cap.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Infrastructure Tier</label>
                    <select 
                        value={formData.category} 
                        onChange={e => setFormData({...formData, category: e.target.value})} 
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500"
                    >
                        <option value="Visual">Text to Image</option>
                        <option value="Motion">Text to Video</option>
                        <option value="Language">Text to Text</option>
                        <option value="Audio">Text to Speech</option>
                        <option value="Static">Reference / Manual Label</option>
                    </select>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Technical Description</label>
                <textarea 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    className="w-full h-24 bg-black border border-slate-800 rounded-2xl p-4 text-sm text-slate-400 outline-none resize-none focus:border-indigo-500 italic" 
                    placeholder="Provide context for this engine's intended use case..." 
                />
            </div>
        </div>
    );
};
