import React from 'react';
import { LayoutGrid, List as ListIcon } from 'lucide-react';

interface ViewSwitcherProps {
    viewType: 'grid' | 'list';
    onViewChange: (type: 'grid' | 'list') => void;
}

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ viewType, onViewChange }) => (
    <div className="flex items-center gap-1.5 bg-slate-950 rounded-2xl p-1.5 border border-slate-700 shrink-0 shadow-inner">
        <button 
            onClick={() => onViewChange('grid')} 
            className={`p-2 rounded-xl transition-all ${viewType === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} 
            title="Grid Topology"
        >
            <LayoutGrid size={18} />
        </button>
        <button 
            onClick={() => onViewChange('list')} 
            className={`p-2 rounded-xl transition-all ${viewType === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} 
            title="Linear Registry"
        >
            <ListIcon size={18} />
        </button>
    </div>
);