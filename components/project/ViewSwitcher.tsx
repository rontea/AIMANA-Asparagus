import React from 'react';
import { LayoutGrid, List as ListIcon, Aperture, Rows3 } from 'lucide-react';
import { AssetViewType } from '../../hooks/useAssetFilters';

interface ViewSwitcherProps {
    viewType: AssetViewType;
    onViewChange: (type: AssetViewType) => void;
    projectType?: string;
    allowGroupView?: boolean;
    showGallery?: boolean;
}

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ viewType, onViewChange, projectType, allowGroupView = true, showGallery = false }) => {
    const supportsGallery = showGallery || projectType === 'image' || projectType === 'video';

    return (
        <div className="flex items-center gap-2 bg-slate-900 rounded-xl p-1 border border-slate-700 shadow-sm">
            <button 
                onClick={() => onViewChange('grid')} 
                className={`p-1.5 rounded-lg transition-all ${viewType === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`} 
                title="Grid View"
            >
                <LayoutGrid size={18} />
            </button>
            {supportsGallery && (
                <button 
                    onClick={() => onViewChange('gallery')} 
                    className={`p-1.5 rounded-lg transition-all ${viewType === 'gallery' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`} 
                    title="Gallery Mode"
                >
                    <Aperture size={18} />
                </button>
            )}
            <button 
                onClick={() => onViewChange('list')} 
                className={`p-1.5 rounded-lg transition-all ${viewType === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`} 
                title="List View"
            >
                <ListIcon size={18} />
            </button>
            {allowGroupView && (
                <button 
                    onClick={() => onViewChange('group')} 
                    className={`p-1.5 rounded-lg transition-all ${viewType === 'group' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`} 
                    title="Group View"
                >
                    <Rows3 size={18} />
                </button>
            )}
        </div>
    );
};
