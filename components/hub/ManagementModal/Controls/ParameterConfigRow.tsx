
import React from 'react';
import { Trash2, Box, Sliders as SlidersIcon, ToggleLeft, Type, Link as LinkIcon, ListFilter } from 'lucide-react';
import { PARAMETER_BLUEPRINTS } from '../../../../hooks/useEngineManagement';

interface ParameterConfigRowProps {
    param: any;
    index: number;
    onUpdate: (idx: number, updates: any) => void;
    onRemove: (idx: number) => void;
}

export const ParameterConfigRow: React.FC<ParameterConfigRowProps> = ({ param, index, onUpdate, onRemove }) => {
    const isBlueprint = Object.values(PARAMETER_BLUEPRINTS).some(bp => bp.key === param.key);

    return (
        <div className={`p-6 bg-slate-900/60 border rounded-[2rem] flex flex-col gap-4 animate-in slide-in-from-top-2 hover:bg-slate-900/80 transition-all shadow-inner ${isBlueprint ? 'border-indigo-500/30' : 'border-slate-800'}`}>
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl border border-white/5 ${isBlueprint ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500'}`}>
                    {param.type === 'slider' ? <SlidersIcon size={18} /> : param.type === 'toggle' ? <ToggleLeft size={18} /> : param.type === 'select' ? <ListFilter size={18} /> : <Type size={18} />}
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Logic Key Binding</label>
                            {isBlueprint && <span className="text-[8px] font-black text-indigo-400 uppercase flex items-center gap-1"><LinkIcon size={8} /> Blueprint</span>}
                        </div>
                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500/50 text-[11px] font-mono">{"{{"}</span>
                            <input 
                                value={param.key} 
                                onChange={e => onUpdate(index, { key: e.target.value.toLowerCase().replace(/\s/g, '_') })} 
                                className="w-full bg-black border border-slate-700 rounded-xl pl-8 pr-8 py-3 text-[11px] font-mono text-indigo-400 outline-none focus:border-indigo-500/50" 
                                placeholder="variable_name" 
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500/50 text-[11px] font-mono">{"}}"}</span>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Studio UI Label</label>
                        <input 
                            value={param.label} 
                            onChange={e => onUpdate(index, { label: e.target.value })} 
                            className="w-full bg-black border border-slate-700 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-indigo-500/50" 
                            placeholder="Human Readable Name" 
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Input Modality</label>
                        <select 
                            value={param.type} 
                            onChange={e => onUpdate(index, { type: e.target.value })} 
                            className="w-full bg-black border border-slate-700 rounded-xl px-4 py-3 text-[11px] text-slate-400 font-bold uppercase outline-none focus:border-indigo-500/50 cursor-pointer"
                        >
                            <option value="slider">Range Slider</option>
                            <option value="toggle">Boolean Switch</option>
                            <option value="select">Dropdown List</option>
                            <option value="text">Character Buffer</option>
                            <option value="textarea">Paragraph Buffer</option>
                        </select>
                    </div>
                </div>
                <button 
                    type="button"
                    onClick={() => onRemove(index)} 
                    className="p-3 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-2xl transition-all self-end"
                    title="Decommission Variable"
                >
                    <Trash2 size={20}/>
                </button>
            </div>

            {param.type === 'slider' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-black/40 rounded-2xl border border-white/5 animate-in fade-in">
                    <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-600 uppercase">Lower Bound</label>
                        <input type="number" value={param.min} onChange={e => onUpdate(index, { min: parseFloat(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-300 outline-none" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-600 uppercase">Upper Bound</label>
                        <input type="number" value={param.max} onChange={e => onUpdate(index, { max: parseFloat(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-300 outline-none" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-600 uppercase">Step Resolution</label>
                        <input type="number" value={param.step} onChange={e => onUpdate(index, { step: parseFloat(e.target.value) })} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-300 outline-none" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-indigo-400 uppercase">Initial State</label>
                        <input type="number" value={param.default} onChange={e => onUpdate(index, { default: parseFloat(e.target.value) })} className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2 text-[10px] text-indigo-300 font-bold outline-none" />
                    </div>
                </div>
            )}

            {param.type === 'toggle' && (
                <div className="flex items-center gap-4 p-5 bg-black/40 rounded-2xl border border-white/5 animate-in fade-in">
                    <div className="space-y-1.5 flex-1">
                        <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Default Toggle State</label>
                        <div className="flex gap-2">
                            <button 
                                type="button"
                                onClick={() => onUpdate(index, { default: true })}
                                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${param.default === true ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-600 hover:text-slate-400'}`}
                            >
                                Enabled (True)
                            </button>
                            <button 
                                type="button"
                                onClick={() => onUpdate(index, { default: false })}
                                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${param.default === false ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-600 hover:text-slate-400'}`}
                            >
                                Bypassed (False)
                            </button>
                        </div>
                    </div>
                    <div className="w-32 flex flex-col items-center justify-center gap-1 border-l border-slate-800">
                        <Box size={18} className="text-indigo-500/30" />
                        <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Boolean Map</span>
                    </div>
                </div>
            )}

            {param.type === 'select' && (
                <div className="p-5 bg-black/40 rounded-2xl border border-white/5 animate-in fade-in space-y-3">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Options Configuration</label>
                        <button 
                            type="button"
                            onClick={() => onUpdate(index, { options: [...(param.options || []), { label: 'New Option', value: 'value' }] })}
                            className="text-[8px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors"
                        >
                            + Add Item
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(param.options || []).map((opt: any, optIdx: number) => (
                            <div key={optIdx} className="flex gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                <input 
                                    value={opt.label} 
                                    onChange={e => {
                                        const n = [...param.options];
                                        n[optIdx] = { ...opt, label: e.target.value };
                                        onUpdate(index, { options: n });
                                    }}
                                    className="flex-1 bg-black border border-slate-700 rounded px-2 py-1 text-[10px] text-white" 
                                    placeholder="Label" 
                                />
                                <input 
                                    value={opt.value} 
                                    onChange={e => {
                                        const n = [...param.options];
                                        n[optIdx] = { ...opt, value: e.target.value };
                                        onUpdate(index, { options: n });
                                    }}
                                    className="flex-1 bg-black border border-slate-700 rounded px-2 py-1 text-[10px] text-indigo-300 font-mono" 
                                    placeholder="Value" 
                                />
                                <button 
                                    type="button"
                                    onClick={() => onUpdate(index, { options: param.options.filter((_: any, i: number) => i !== optIdx) })}
                                    className="text-slate-600 hover:text-red-400"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(param.type === 'text' || param.type === 'textarea') && (
                <div className="p-5 bg-black/40 rounded-2xl border border-white/5 animate-in fade-in space-y-3">
                    <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest px-1">Default Value</label>
                    {param.type === 'textarea' ? (
                        <textarea
                            value={String(param.default ?? '')}
                            onChange={e => onUpdate(index, { default: e.target.value })}
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-300 outline-none resize-y"
                            placeholder="Initial multiline value..."
                        />
                    ) : (
                        <input
                            value={String(param.default ?? '')}
                            onChange={e => onUpdate(index, { default: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[10px] text-slate-300 outline-none"
                            placeholder="Initial text value..."
                        />
                    )}
                </div>
            )}
        </div>
    );
};
