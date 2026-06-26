
import React, { useState } from 'react';
import { Library, UploadCloud, Plus, Trash, Wand2 } from 'lucide-react';
import { GridItem } from '../../hooks/useImageCanvas';
import { EditorCollapsible } from '../ui/EditorCollapsible';

interface MatrixTabProps {
    gridCols: number;
    setGridCols: (val: number) => void;
    gridRows: number;
    setGridRows: (val: number) => void;
    gridGutter: number;
    setGridGutter: (val: number) => void;
    gridCellWidth: number;
    setGridCellWidth: (val: number) => void;
    gridCellHeight: number;
    setGridCellHeight: (val: number) => void;
    gridItems: Record<number, GridItem>;
    onImportProject: () => void;
    onUploadLocal: () => void;
    onRemoveItem: (idx: number) => void;
    onAddAtSlot: (idx: number) => void;
    onRefineItem?: (item: GridItem) => void;
}

export const MatrixTab: React.FC<MatrixTabProps> = ({
    gridCols, setGridCols, gridRows, setGridRows, gridGutter, setGridGutter,
    gridCellWidth, setGridCellWidth, gridCellHeight, setGridCellHeight,
    gridItems, onImportProject, onUploadLocal, onRemoveItem, onAddAtSlot, onRefineItem
}) => {
    const [openSections, setOpenSections] = useState<Set<string>>(new Set(['topology', 'manifest']));

    const toggleSection = (id: string) => {
        const next = new Set(openSections);
        if (next.has(id)) next.delete(id); else next.add(id);
        setOpenSections(next);
    };

    return (
        <div className="flex flex-col h-full bg-[#111]">
            <EditorCollapsible title="Grid Topology" isOpen={openSections.has('topology')} onToggle={() => toggleSection('topology')}>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter px-1">Cols</label>
                            <input type="number" min={1} max={20} value={gridCols} onChange={e => setGridCols(parseInt(e.target.value) || 1)} className="w-full bg-black border border-white/5 rounded px-2 py-1.5 text-xs text-indigo-400 font-bold outline-none focus:border-indigo-500/50 shadow-inner" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter px-1">Rows</label>
                            <input type="number" min={1} max={20} value={gridRows} onChange={e => setGridRows(parseInt(e.target.value) || 1)} className="w-full bg-black border border-white/5 rounded px-2 py-1.5 text-xs text-indigo-400 font-bold outline-none focus:border-indigo-500/50 shadow-inner" />
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        <div className="flex justify-between px-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Gutter</label>
                            <span className="text-[9px] font-mono text-indigo-400">{gridGutter}px</span>
                        </div>
                        <input type="range" min={0} max={100} value={gridGutter} onChange={e => setGridGutter(parseInt(e.target.value))} className="w-full h-1 bg-slate-900 rounded-full appearance-none cursor-pointer accent-indigo-500 border border-white/5" />
                    </div>

                    <div className="pt-2 border-t border-white/5 space-y-3">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">Slot Resolution</label>
                        <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-600 uppercase tracking-tighter px-1">Width</label>
                                <input type="number" step={8} min={64} max={4096} value={gridCellWidth} onChange={e => setGridCellWidth(parseInt(e.target.value) || 1024)} className="w-full bg-black border border-white/5 rounded px-2 py-1.5 text-[10px] text-emerald-400 font-bold outline-none focus:border-emerald-500/50 shadow-inner" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-slate-600 uppercase tracking-tighter px-1">Height</label>
                                <input type="number" step={8} min={64} max={4096} value={gridCellHeight} onChange={e => setGridCellHeight(parseInt(e.target.value) || 1024)} className="w-full bg-black border border-white/5 rounded px-2 py-1.5 text-[10px] text-emerald-400 font-bold outline-none focus:border-emerald-500/50 shadow-inner" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 pt-2">
                        <ActionButton icon={Library} label="Workspace" onClick={onImportProject} color="text-indigo-400" />
                        <ActionButton icon={UploadCloud} label="Upload" onClick={onUploadLocal} color="text-emerald-400" />
                    </div>
                </div>
            </EditorCollapsible>

            <EditorCollapsible title="Slot Manifest" isOpen={openSections.has('manifest')} onToggle={() => toggleSection('manifest')}>
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {Array.from({ length: gridCols * gridRows }).map((_, i) => {
                        const item = gridItems[i];
                        const isLocal = item?.id?.startsWith('local-');
                        return (
                            <div key={i} className={`flex items-center gap-2 p-2 bg-[#050505] border rounded-xl transition-all group ${item ? 'border-white/10' : 'border-dashed border-white/5 opacity-40 hover:opacity-100 hover:border-indigo-500/30'}`}>
                                <div className="w-10 h-10 rounded-lg bg-black border border-white/5 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                                    {item ? <img src={item.url} className="w-full h-full object-cover" /> : <span className="text-[10px] text-slate-700 font-black">{i + 1}</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-slate-300 truncate uppercase tracking-tighter">
                                        {item ? (isLocal ? 'Local Binary' : `Artifact ${item.id.substring(0, 6)}`) : `Slot ${i + 1}`}
                                    </p>
                                    <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest mt-0.5">
                                        {item ? 'Occupied' : 'Awaiting Ingest'}
                                    </p>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    {item && onRefineItem && (
                                        <button 
                                            onClick={() => onRefineItem(item)}
                                            className="p-1.5 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all"
                                            title="Load into Refinement Studio"
                                        >
                                            <Wand2 size={12} />
                                        </button>
                                    )}
                                    {item ? (
                                        <button onClick={() => onRemoveItem(i)} className="p-1.5 hover:bg-red-600/10 text-slate-600 hover:text-red-400 transition-colors"><Trash size={12} /></button>
                                    ) : (
                                        <button onClick={() => onAddAtSlot(i)} className="p-1.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition-all"><Plus size={12} /></button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </EditorCollapsible>
        </div>
    );
};

const ActionButton: React.FC<{ icon: any, label: string, onClick: () => void, color: string }> = ({ icon: Icon, label, onClick, color }) => (
    <button onClick={onClick} className={`flex items-center justify-center gap-1.5 py-2 px-2 bg-[#050505] hover:bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${color} shadow-lg active:scale-95`}>
        <Icon size={12} /> {label}
    </button>
);
