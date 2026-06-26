import React from 'react';
import { FolderOpen } from 'lucide-react';

interface DashboardEmptyStateProps {
    onNewProject: () => void;
}

export const DashboardEmptyState: React.FC<DashboardEmptyStateProps> = ({ onNewProject }) => (
    <div className="p-20 text-center flex flex-col items-center justify-center space-y-4 bg-slate-800/20 rounded-[2.5rem] border border-slate-800 border-dashed">
        <div className="p-6 bg-slate-800 rounded-3xl text-slate-500"><FolderOpen size={48} /></div>
        <div>
          <h3 className="text-xl font-bold text-slate-200">No projects found</h3>
          <p className="text-slate-500 mt-1 max-w-sm mx-auto">Try a different search term or create a new workspace to get started.</p>
        </div>
        <button 
            onClick={onNewProject} 
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-full font-bold shadow-lg transition-all active:scale-95"
        >
            Create Workspace
        </button>
    </div>
);