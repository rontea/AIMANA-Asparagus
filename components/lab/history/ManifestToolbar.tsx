
import React from 'react';
import { History, LayoutGrid, List as ListIcon } from 'lucide-react';

interface ManifestToolbarProps {
    viewType: 'grid' | 'list';
    onViewChange: (view: 'grid' | 'list') => void;
    showSwitcher: boolean;
}

export const ManifestToolbar: React.FC<ManifestToolbarProps> = ({ viewType, onViewChange, showSwitcher }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/50 pb-6 gap-4">
        <div className="flex items-center gap-4">
            <div className="p-2.5 md:p-3 bg-slate-800 rounded-xl md:rounded-2xl text-slate-400">
                <History size={20} className="md:w-6 md:h-6" />
            </div>
            <div>
                <h3 className="text-sm md:text-lg font-black text-white uppercase tracking-widest">Recent Artifact Manifests</h3>
                <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Auto-saved generations awaiting assignment</p>
            </div>
        </div>

        {showSwitcher && (
            <div className="flex bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 shadow-xl self-end sm:self-center">
                <button 
                    onClick={() => onViewChange('grid')}
                    className={`p-2 rounded-lg transition-all ${viewType === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Mosaic Grid"
                >
                    <LayoutGrid size={18} />
                </button>
                <button 
                    onClick={() => onViewChange('list')}
                    className={`p-2 rounded-lg transition-all ${viewType === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Technical List"
                >
                    <ListIcon size={18} />
                </button>
            </div>
        )}
    </div>
);
