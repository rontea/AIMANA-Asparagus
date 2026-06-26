import React, { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, ChevronDown, Check, RefreshCw, Clock, CalendarDays, LayoutGrid } from 'lucide-react';
import { SortType } from '../../../hooks/useDashboard';

interface SortMenuProps {
    sortType: SortType;
    onSortChange: (type: SortType) => void;
}

const SORT_OPTIONS = [
    { id: 'updated', label: 'Recently Updated', icon: RefreshCw },
    { id: 'created', label: 'Date Created (Newest)', icon: Clock },
    { id: 'created-old', label: 'Date Created (Oldest)', icon: CalendarDays },
    { id: 'name-asc', label: 'Name (A-Z)', icon: LayoutGrid },
    { id: 'name-desc', label: 'Name (Z-A)', icon: LayoutGrid }
];

export const SortMenu: React.FC<SortMenuProps> = ({ sortType, onSortChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const current = SORT_OPTIONS.find(o => o.id === sortType) || SORT_OPTIONS[0];

    return (
        <div className="relative z-30 shrink-0" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`min-w-[220px] h-12 px-5 rounded-2xl bg-slate-950 border transition-all flex items-center justify-between gap-3 text-sm font-bold ${isOpen ? 'border-indigo-500 text-white shadow-xl' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
            >
                <div className="flex items-center gap-2">
                    <ArrowUpDown size={16} className="text-indigo-400" />
                    <span>{current.label}</span>
                </div>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 py-2 shadow-2xl animate-in slide-in-from-top-2">
                    <div className="px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-700/50 mb-1">Inference Priority</div>
                    {SORT_OPTIONS.map((opt) => (
                        <button 
                            key={opt.id}
                            onClick={() => { onSortChange(opt.id as SortType); setIsOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between transition-colors ${sortType === opt.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                        >
                            <div className="flex items-center gap-3">
                                <opt.icon size={14} />
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
