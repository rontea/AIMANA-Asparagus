import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { AssetSortType } from '../../utils/assetSorting';
import { AssetViewType } from '../../hooks/useAssetFilters';
import { SearchBar } from './SearchBar';
import { SortDropdown } from './SortDropdown';
import { ViewSwitcher } from './ViewSwitcher';

interface ProjectToolbarProps {
    searchTerm: string;
    onSearchChange: (val: string) => void;
    allVisibleSelected: boolean;
    onToggleSelectAll: () => void;
    sortType: AssetSortType;
    onSortChange: (type: AssetSortType) => void;
    viewType: AssetViewType;
    onViewChange: (type: AssetViewType) => void;
    roleFilter: 'all' | 'none' | 'linked' | 'neural' | 'reference_image' | 'forge';
    onRoleFilterChange: (mode: 'all' | 'none' | 'linked' | 'neural' | 'reference_image' | 'forge') => void;
    mediaFilter: 'all' | 'image' | 'video' | 'audio' | 'text' | 'collections';
    onMediaFilterChange: (mode: 'all' | 'image' | 'video' | 'audio' | 'text' | 'collections') => void;
    projectType?: string;
    allowGroupView?: boolean;
    showGallery?: boolean;
}

export const ProjectToolbar: React.FC<ProjectToolbarProps> = ({
    searchTerm, 
    onSearchChange, 
    allVisibleSelected, 
    onToggleSelectAll, 
    sortType, 
    onSortChange, 
    viewType, 
    onViewChange, 
    roleFilter,
    onRoleFilterChange,
    mediaFilter,
    onMediaFilterChange,
    projectType,
    allowGroupView = true,
    showGallery = false
}) => {
    const canUseGroupView = allowGroupView && roleFilter !== 'all' && roleFilter !== 'none';

    return (
        <div className="relative z-50 mb-6 shrink-0 space-y-4 rounded-2xl border border-slate-800 bg-slate-800/30 p-4 shadow-inner">
            <div className="w-full">
                <SearchBar value={searchTerm} onChange={onSearchChange} />
            </div>
            
            <div className="flex w-full flex-wrap items-center gap-3 border-t border-slate-800/80 pt-4 xl:flex-nowrap xl:justify-end">
                <button 
                    onClick={onToggleSelectAll} 
                    className={`h-11 rounded-xl border px-4 transition-all flex items-center gap-2 text-sm font-medium w-full justify-center sm:w-auto ${
                        allVisibleSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    {allVisibleSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    <span>{allVisibleSelected ? 'Deselect All' : 'Select All'}</span>
                </button>

                <div className="hidden h-8 w-px bg-slate-700 xl:block"></div>

                <SortDropdown sortType={sortType} onSortChange={onSortChange} />

                <div className="hidden h-8 w-px bg-slate-700 xl:block"></div>

                <select
                    value={mediaFilter}
                    onChange={(e) => onMediaFilterChange(e.target.value as 'all' | 'image' | 'video' | 'audio' | 'text' | 'collections')}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-300 outline-none transition-all hover:bg-slate-800 hover:text-white sm:flex-none sm:min-w-[170px]"
                    title="Filter by media type"
                >
                    <option value="all">All Media</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="text">Text</option>
                    <option value="collections">Collections</option>
                </select>

                <select
                    value={roleFilter}
                    onChange={(e) => onRoleFilterChange(e.target.value as 'all' | 'none' | 'linked' | 'neural' | 'reference_image' | 'forge')}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-300 outline-none transition-all hover:bg-slate-800 hover:text-white sm:flex-none sm:min-w-[200px]"
                    title="Filter by reference role"
                >
                    <option value="all">All</option>
                    <option value="none">None</option>
                    <option value="linked">Linked Artifacts</option>
                    <option value="neural">Neural References</option>
                    <option value="reference_image">Reference Image</option>
                    <option value="forge">Forge</option>
                </select>

                <div className="ml-auto flex items-center gap-2 xl:ml-0">
                    <ViewSwitcher
                        viewType={viewType}
                        onViewChange={onViewChange}
                        projectType={projectType}
                        allowGroupView={canUseGroupView}
                        showGallery={showGallery}
                    />
                </div>
            </div>
        </div>
    );
};
