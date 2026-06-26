
import React, { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, ChevronDown, Check, Calendar, Clock, RefreshCw, History, LayoutGrid, HardDrive, CalendarDays, Sparkles } from 'lucide-react';
import { AssetSortType } from '../../utils/assetSorting';

interface SortDropdownProps {
    sortType: AssetSortType;
    onSortChange: (type: AssetSortType) => void;
}

const SORT_OPTIONS: { id: AssetSortType; label: string; icon: any }[] = [
    { id: 'date-new', label: 'Date & Time (Newest)', icon: Clock },
    { id: 'date-old', label: 'Date & Time (Oldest)', icon: CalendarDays },
    { id: 'modified-new', label: 'Recently Modified', icon: RefreshCw },
    { id: 'modified-old', label: 'Oldest Modified', icon: History },
    { id: 'alphabetical', label: 'Alphabetical (A-Z)', icon: LayoutGrid },
    { id: 'size', label: 'File Size (Large)', icon: HardDrive },
    { id: 'forge-reference', label: 'Forge Reference Artifact', icon: Sparkles }
];

export const SortDropdown: React.FC<SortDropdownProps> = ({ sortType, onSortChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const currentOption = SORT_OPTIONS.find(o => o.id === sortType) || SORT_OPTIONS[0];

    return (
        <div className="relative min-w-0 flex-1 sm:flex-none" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className={`h-11 w-full rounded-xl bg-slate-900 px-4 border transition-all flex items-center justify-between gap-3 text-sm font-medium sm:min-w-[220px] ${
                    isOpen ? 'border-indigo-500 text-white bg-slate-800 ring-2 ring-indigo-500/20' : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                }`}
            >
                <div className="flex items-center gap-2">
                    <ArrowUpDown size={16} className="text-indigo-400" />
                    <span className="truncate">{currentOption?.label}</span>
                </div>
                <ChevronDown size={14} className={`transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full z-[100] mt-2 w-64 rounded-xl border border-slate-700 border-t-indigo-500 bg-slate-800 py-1 shadow-2xl animate-in slide-in-from-top-2 max-w-[min(16rem,calc(100vw-2rem))]">
                    <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 mb-1">Sort Assets By</div>
                    {SORT_OPTIONS.map((opt) => (
                        <button 
                            key={opt.id} 
                            onClick={() => { onSortChange(opt.id); setIsOpen(false); }} 
                            className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors ${
                                sortType === opt.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <opt.icon size={16} className={sortType === opt.id ? 'text-white' : 'text-slate-500'} />
                                {opt.label}
                            </div>
                            {sortType === opt.id && <Check size={14} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
