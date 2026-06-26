
import React from 'react';
import { RefreshCw, Trash2, X, Loader2 } from 'lucide-react';

interface ArchiveBulkBarProps {
    selectedCounts: {
        projects: number;
        collections: number;
        items: number;
        revisions: number;
        promptDrafts: number;
        registryVariables: number;
    };
    onCancel: () => void;
    onRestore: (type: 'project' | 'collection' | 'item' | 'revision') => void;
    onRestorePromptDrafts: () => void;
    onRestoreRegistryVariables: () => void;
    onDelete: () => void;
    isRestoring: boolean;
}

export const ArchiveBulkBar: React.FC<ArchiveBulkBarProps> = ({
    selectedCounts, onCancel, onRestore, onRestorePromptDrafts, onRestoreRegistryVariables, onDelete, isRestoring
}) => {
    const hasSelection = selectedCounts.projects > 0 || selectedCounts.collections > 0 || selectedCounts.items > 0 || selectedCounts.revisions > 0 || selectedCounts.promptDrafts > 0 || selectedCounts.registryVariables > 0;
    if (!hasSelection) return null;

    return (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-950 border border-indigo-500/50 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] p-5 flex items-center gap-10 animate-in slide-in-from-bottom-10 z-[100] ring-1 ring-white/10">
            <div className="flex flex-col">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Neural Triage Control</span>
                <span className="text-sm font-black text-white uppercase mt-1">
                    {selectedCounts.projects > 0 && `${selectedCounts.projects} Proj `}
                    {selectedCounts.collections > 0 && `${selectedCounts.collections} Collection `}
                    {selectedCounts.items > 0 && `${selectedCounts.items} Asset `}
                    {selectedCounts.revisions > 0 && `${selectedCounts.revisions} Snap `}
                    {selectedCounts.promptDrafts > 0 && `${selectedCounts.promptDrafts} Prompt `}
                    {selectedCounts.registryVariables > 0 && `${selectedCounts.registryVariables} Variable `}
                    Selected
                </span>
            </div>
            <div className="flex gap-4">
                <button 
                    onClick={onCancel} 
                    className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                >
                    Cancel
                </button>
                
                <button 
                    onClick={() => {
                        if (selectedCounts.projects > 0) onRestore('project');
                        if (selectedCounts.collections > 0) onRestore('collection');
                        if (selectedCounts.items > 0) onRestore('item');
                        if (selectedCounts.revisions > 0) onRestore('revision');
                        if (selectedCounts.promptDrafts > 0) onRestorePromptDrafts();
                        if (selectedCounts.registryVariables > 0) onRestoreRegistryVariables();
                    }} 
                    disabled={isRestoring} 
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-xl transition-all disabled:opacity-50"
                >
                    {isRestoring ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} 
                    Restore Selected
                </button>

                <button 
                    onClick={onDelete} 
                    className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
                >
                    <Trash2 size={16} /> Purge Forever
                </button>
            </div>
        </div>
    );
};
