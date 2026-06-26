import React, { useEffect, useRef, useState } from 'react';
import {
    AudioLines,
    Check,
    ChevronDown,
    FileText,
    Filter,
    Folder,
    HardDrive,
    ImageIcon,
    MessageSquare,
    Pin,
    Search,
    Sparkles,
    Video,
    X
} from 'lucide-react';
import { SortType } from '../../hooks/useDashboard';
import {
    createDefaultDashboardSearchFilters,
    DashboardSearchDateRange,
    DashboardSearchFilters,
    DashboardSearchKind,
    DashboardSearchMedia,
    DashboardSearchStatus
} from '../../hooks/useDashboardSearch';
import { ProjectStorageType } from '../../types';
import { SearchInput } from './Toolbar/SearchInput';
import { SortMenu } from './Toolbar/SortMenu';
import { ViewSwitcher } from './Toolbar/ViewSwitcher';

interface DashboardToolbarProps {
    searchTerm: string;
    onSearchChange: (val: string) => void;
    sortType: SortType;
    onSortChange: (type: SortType) => void;
    viewType: 'grid' | 'list';
    onViewChange: (type: 'grid' | 'list') => void;
    searchFilters: DashboardSearchFilters;
    onSearchFiltersChange: (filters: DashboardSearchFilters) => void;
    searchFilterCount: number;
    resultCount: number;
    availableTags?: string[];
    showSearch?: boolean;
    showProjectControls?: boolean;
}

export const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
    searchTerm,
    onSearchChange,
    sortType,
    onSortChange,
    viewType,
    onViewChange,
    searchFilters,
    onSearchFiltersChange,
    searchFilterCount,
    resultCount,
    availableTags = [],
    showSearch = true,
    showProjectControls = true
}) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onMouseDown = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    const toggleArrayValue = <T,>(values: T[], value: T) => (
        values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
    );

    const updateFilters = (updates: Partial<DashboardSearchFilters>) => {
        onSearchFiltersChange({ ...searchFilters, ...updates });
    };

    const kindOptions: Array<{ id: DashboardSearchKind; label: string; icon: React.ElementType }> = [
        { id: 'project', label: 'Projects', icon: Folder },
        { id: 'item', label: 'Items', icon: ImageIcon },
        { id: 'chat', label: 'Chats', icon: MessageSquare },
        { id: 'prompt', label: 'Prompts', icon: Sparkles }
    ];

    const mediaOptions: Array<{ id: DashboardSearchMedia; label: string; icon: React.ElementType }> = [
        { id: 'image', label: 'Image', icon: ImageIcon },
        { id: 'video', label: 'Video', icon: Video },
        { id: 'audio', label: 'Audio', icon: AudioLines },
        { id: 'document', label: 'Document', icon: FileText },
        { id: 'other', label: 'Other', icon: HardDrive }
    ];

    const dateOptions: Array<{ id: DashboardSearchDateRange; label: string }> = [
        { id: 'any', label: 'Any time' },
        { id: 'day', label: 'Past 24 hours' },
        { id: 'week', label: 'Past week' },
        { id: 'month', label: 'Past month' }
    ];

    const storageOptions: Array<{ id: ProjectStorageType | 'prompt-manager'; label: string }> = [
        { id: ProjectStorageType.LOCAL_DRIVE, label: 'Local Drive' },
        { id: ProjectStorageType.GOOGLE_DRIVE, label: 'Google Drive' },
        { id: 'prompt-manager', label: 'Prompt Manager' }
    ];
    const statusOptions: Array<{ id: DashboardSearchStatus; label: string }> = [
        { id: 'ready', label: 'Ready' },
        { id: 'processing', label: 'Processing' },
        { id: 'failed', label: 'Failed' }
    ];

    const resetFilters = () => onSearchFiltersChange(createDefaultDashboardSearchFilters());

    const CheckboxButton = ({
        active,
        label,
        icon: Icon,
        onClick
    }: {
        active: boolean;
        label: string;
        icon?: React.ElementType;
        onClick: () => void;
    }) => (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${
                active
                    ? 'border-indigo-400/30 bg-indigo-500/10 text-slate-100'
                    : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-200'
            }`}
        >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-700'}`}>
                {active && <Check size={11} strokeWidth={3} />}
            </span>
            {Icon && <Icon size={14} className={active ? 'text-indigo-300' : 'text-slate-600'} />}
            <span className="truncate">{label}</span>
        </button>
    );

    return (
        <div className="relative z-40" ref={filterRef}>
            <div className="relative z-20 flex flex-col gap-4 rounded-lg border border-slate-800 bg-[#07101f]/80 p-3 shadow-xl shadow-black/10 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
                    {showSearch && <SearchInput value={searchTerm} onChange={onSearchChange} />}
                    <button
                        type="button"
                        onClick={() => setIsFilterOpen((value) => !value)}
                        className={`flex h-12 items-center justify-between gap-3 rounded-lg border px-4 text-sm font-bold transition-colors md:w-auto ${
                            isFilterOpen || searchFilterCount > 0
                                ? 'border-indigo-400/40 bg-indigo-500/10 text-indigo-200'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-white'
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Filter size={16} />
                            Filters
                            {searchFilterCount > 0 && (
                                <span className="rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-black text-white">{searchFilterCount}</span>
                            )}
                        </span>
                        <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {showProjectControls && (
                    <div className="flex w-full items-center justify-end gap-4 lg:w-auto">
                        <SortMenu sortType={sortType} onSortChange={onSortChange} />
                        <div className="mx-1 hidden h-8 w-px bg-slate-700 lg:block" />
                        <ViewSwitcher viewType={viewType} onViewChange={onViewChange} />
                    </div>
                )}
            </div>

            {isFilterOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-3 overflow-hidden rounded-xl border border-slate-800 bg-[#0E121E] shadow-2xl shadow-black/40">
                    <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-3">
                        <div className="space-y-2">
                            <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Asset Type</h4>
                            {mediaOptions.slice(0, 4).map((option) => (
                                <CheckboxButton
                                    key={option.id}
                                    active={searchFilters.media.includes(option.id)}
                                    label={option.label}
                                    icon={option.icon}
                                    onClick={() => updateFilters({ media: toggleArrayValue(searchFilters.media, option.id) })}
                                />
                            ))}
                            <h4 className="mb-3 mt-6 text-xs font-black uppercase tracking-widest text-slate-400">Search In</h4>
                            {kindOptions.map((option) => (
                                <CheckboxButton
                                    key={option.id}
                                    active={searchFilters.kinds.includes(option.id)}
                                    label={option.label}
                                    icon={option.icon}
                                    onClick={() => updateFilters({ kinds: toggleArrayValue(searchFilters.kinds, option.id) })}
                                />
                            ))}
                        </div>

                        <div className="space-y-2">
                            <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Date Modified</h4>
                            {dateOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => updateFilters({ dateRange: option.id })}
                                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${
                                        searchFilters.dateRange === option.id
                                            ? 'border-indigo-400/30 bg-indigo-500/10 text-slate-100'
                                            : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-200'
                                    }`}
                                >
                                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${searchFilters.dateRange === option.id ? 'border-indigo-400' : 'border-slate-700'}`}>
                                        {searchFilters.dateRange === option.id && <span className="h-2 w-2 rounded-full bg-indigo-400" />}
                                    </span>
                                    {option.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => updateFilters({ pinnedOnly: !searchFilters.pinnedOnly })}
                                className={`mt-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${
                                    searchFilters.pinnedOnly
                                        ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                                        : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-600 hover:text-slate-200'
                                }`}
                            >
                                <Pin size={14} className={searchFilters.pinnedOnly ? 'fill-amber-300 text-amber-300' : 'text-slate-600'} />
                                Pinned only
                            </button>
                            <div className="mt-5 border-t border-slate-800 pt-4">
                                <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Storage</h4>
                                <div className="grid grid-cols-1 gap-2">
                                    {storageOptions.map((option) => (
                                        <CheckboxButton
                                            key={option.id}
                                            active={searchFilters.storage.includes(option.id)}
                                            label={option.label}
                                            onClick={() => updateFilters({ storage: toggleArrayValue(searchFilters.storage, option.id) })}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="mb-3 flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Tags</h4>
                                {availableTags.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => updateFilters({ tags: availableTags.slice(0, 6) })}
                                        className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200"
                                    >
                                        Select All
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {(availableTags.length > 0 ? availableTags.slice(0, 8) : ['image', 'video', 'audio', 'prompt']).map((tag) => {
                                    const active = searchFilters.tags.includes(tag);
                                    return (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => updateFilters({ tags: toggleArrayValue(searchFilters.tags, tag) })}
                                            className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                                                active
                                                    ? 'border-indigo-400/30 bg-indigo-500/20 text-indigo-200'
                                                    : 'border-slate-800 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                                            }`}
                                        >
                                            #{tag}
                                            {active && <X size={12} className="ml-1 inline" />}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-8 space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Status</h4>
                                <div className="flex flex-wrap gap-5">
                                    {statusOptions.map((option) => {
                                        const active = searchFilters.statuses.includes(option.id);
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => updateFilters({ statuses: toggleArrayValue(searchFilters.statuses, option.id) })}
                                                className={`flex items-center gap-2 text-xs font-bold transition-colors ${active ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                                            >
                                                <span className={`flex h-4 w-4 items-center justify-center rounded border ${active ? 'border-indigo-400 bg-indigo-500/40' : 'border-slate-800 bg-slate-950'}`}>
                                                    {active && <Check size={11} />}
                                                </span>
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-5 py-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                            <span>Matches</span>
                            <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-black text-slate-200">{resultCount}</span>
                            <span>results</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-400 hover:bg-slate-900 hover:text-white"
                            >
                                <X size={13} />
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsFilterOpen(false)}
                                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-black text-white shadow-lg shadow-indigo-950/30 hover:bg-indigo-500"
                            >
                                <Search size={13} />
                                Show Results
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
