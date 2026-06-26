import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
    value: string;
    onChange: (val: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({ value, onChange }) => (
    <div className="relative w-full group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-300" size={16} />
        <input 
            type="text" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search anything..." 
            className="h-12 w-full rounded-lg border border-slate-800/90 bg-[#020b18]/90 py-3 pl-12 pr-10 text-sm font-medium text-slate-200 shadow-inner outline-none transition-all placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/10"
        />
        {value && (
            <button 
                type="button"
                onClick={() => onChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white p-1"
                aria-label="Clear search"
            >
                <X size={14} />
            </button>
        )}
    </div>
);
