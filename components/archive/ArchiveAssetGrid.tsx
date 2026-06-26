
import React from 'react';
import { Archive, CheckSquare, Square } from 'lucide-react';
import AssetCard from '../AssetCard';
import { ItemWithCurrentRevision, Project } from '../../types';

interface ArchiveAssetGridProps {
    title?: string;
    icon?: React.ReactNode;
    items: ItemWithCurrentRevision[];
    projectMap: Record<string, Project>;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleAll: () => void;
}

export const ArchiveAssetGrid: React.FC<ArchiveAssetGridProps> = ({
    title = "Archived Assets",
    icon = <Archive size={20} className="text-emerald-400"/>,
    items, projectMap, selectedIds, onToggleSelection, onRestore, onDelete, onToggleAll
}) => {
    return (
        <section className="space-y-6">
            <div className="flex justify-between items-center px-1">
                <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                    {icon} {title}
                </h2>
                {items.length > 0 && (
                    <button 
                        onClick={onToggleAll}
                        className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${selectedIds.size > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        {selectedIds.size === items.length ? <CheckSquare size={14} /> : <Square size={14} />}
                        {selectedIds.size === items.length ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>
            {items.length === 0 ? (
               <div className="py-20 border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-900/30 text-center text-slate-600 text-sm font-bold uppercase tracking-widest">
                   No relevant assets in bin.
               </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {items.map((item) => (
                    <div key={item.id} className="relative group">
                       <AssetCard 
                        item={item} 
                        onClick={() => onToggleSelection(item.id)} 
                        onRestore={() => onRestore(item.id)} 
                        onDelete={() => onDelete(item.id)} 
                        isSelected={selectedIds.has(item.id)} 
                        onToggleSelect={(e) => { e.stopPropagation(); onToggleSelection(item.id); }}
                       />
                       <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 backdrop-blur-sm text-[8px] font-black text-white/40 uppercase tracking-widest truncate rounded-b-xl border-t border-white/5 px-4 pointer-events-none">
                           Workspace: {projectMap[item.projectId]?.name || '...'}
                       </div>
                    </div>
                  ))}
              </div>
            )}
        </section>
    );
};
