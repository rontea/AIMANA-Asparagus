import React from 'react';
import { Plus, CheckSquare, Square } from 'lucide-react';

interface DashboardHeaderProps {
    isSelectMode: boolean;
    onToggleSelectMode: () => void;
    onNewProject: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    isSelectMode, onToggleSelectMode, onNewProject
}) => (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
            <h1 className="text-xl font-black text-white tracking-tight">Project Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">Manage your creative assets and workspaces.</p>
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={onToggleSelectMode}
                className={`p-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium ${isSelectMode ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-950/70 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
            >
                {isSelectMode ? <CheckSquare size={18} /> : <Square size={18} />}
                <span className="hidden lg:inline">{isSelectMode ? 'Cancel Selection' : 'Select Mode'}</span>
            </button>
            <button 
                onClick={onNewProject} 
                className="flex items-center rounded-lg border border-indigo-500/50 bg-indigo-600 px-5 py-2 text-white shadow-lg transition-all hover:bg-indigo-500 active:scale-95"
            >
                <Plus size={20} />
                <span className="hidden sm:inline ml-2 font-medium">New Project</span>
            </button>
        </div>
    </div>
);
