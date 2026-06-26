
import React from 'react';

interface EditorToolButtonProps {
    icon: any;
    onClick: () => void;
    active?: boolean;
    tooltip: string;
}

export const EditorToolButton: React.FC<EditorToolButtonProps> = ({ icon: Icon, onClick, active, tooltip }) => (
    <button 
        onClick={onClick}
        title={tooltip}
        className={`p-1.5 rounded transition-all ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
    >
        <Icon size={14} />
    </button>
);
