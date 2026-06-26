
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EditorCollapsibleProps {
    title: string;
    icon?: React.ComponentType<{ size?: string | number; className?: string }>;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

export const EditorCollapsible: React.FC<EditorCollapsibleProps> = ({ title, icon: Icon, isOpen, onToggle, children }) => (
    <div className="border-b border-white/5">
        <button 
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors group"
        >
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
                {Icon ? <Icon size={12} className="text-slate-500 group-hover:text-indigo-400 transition-colors" /> : null}
                {title}
            </span>
            {isOpen ? <ChevronDown size={12} className="text-slate-600" /> : <ChevronRight size={12} className="text-slate-600" />}
        </button>
        {isOpen && (
            <div className="px-4 pb-4 animate-in slide-in-from-top-1 duration-200">
                {children}
            </div>
        )}
    </div>
);
