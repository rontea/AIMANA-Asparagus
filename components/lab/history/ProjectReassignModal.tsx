
import React from 'react';
import { FolderPlus, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { Project } from '../../../types';

interface ProjectReassignModalProps {
    projects: Project[];
    selectedProjectId: string;
    onSelectProject: (id: string) => void;
    onConfirm: (itemLimit?: number) => void;
    onCancel: () => void;
    isMoving: boolean;
    title?: string;
    description?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    confirmLabel?: string;
    itemLimitLabel?: string;
    maxSelectableItems?: number;
    defaultSelectableItems?: number;
    showProjectItemCounts?: boolean;
    projectItemCountLabel?: string;
}

export const ProjectReassignModal: React.FC<ProjectReassignModalProps> = ({
    projects,
    selectedProjectId,
    onSelectProject,
    onConfirm,
    onCancel,
    isMoving,
    title = "Reassign Artifact",
    description = "Select a destination project workspace for this neural asset.",
    emptyTitle = "No project workspaces detected.",
    emptyDescription = "Create a project from the dashboard first.",
    confirmLabel = "Confirm Selection",
    itemLimitLabel = "Items to move",
    maxSelectableItems,
    defaultSelectableItems,
    showProjectItemCounts = false,
    projectItemCountLabel = "items"
}) => {
    const [itemLimit, setItemLimit] = React.useState(() => {
        const initial = defaultSelectableItems ?? maxSelectableItems ?? 1;
        return Math.max(1, initial);
    });
    const showItemLimit = typeof maxSelectableItems === 'number' && maxSelectableItems > 1;
    const normalizedItemLimit = showItemLimit
        ? Math.max(1, Math.min(maxSelectableItems, Math.floor(Number(itemLimit) || 1)))
        : undefined;

    React.useEffect(() => {
        if (!showItemLimit) return;
        const initial = defaultSelectableItems ?? maxSelectableItems;
        setItemLimit(Math.max(1, Math.min(maxSelectableItems, Math.floor(Number(initial) || 1))));
    }, [defaultSelectableItems, maxSelectableItems, showItemLimit]);

    return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[3rem] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] overflow-hidden p-10 space-y-8">
            <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-indigo-500/10 rounded-[2rem] flex items-center justify-center mx-auto text-indigo-400 mb-2 border border-indigo-500/20">
                    <FolderPlus size={40} />
                </div>
                <h3 className="text-2xl font-black text-white tracking-tight uppercase">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
            </div>

            <div className="space-y-3">
                {projects.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-3">
                        {projects.map(p => {
                            const count = Number(p.itemCount || 0);
                            const itemCountLabel = count === 1
                                ? projectItemCountLabel.replace(/s$/, '')
                                : projectItemCountLabel;
                            return (
                            <button 
                                key={p.id}
                                onClick={() => onSelectProject(p.id)}
                                className={`w-full text-left p-5 rounded-[1.5rem] border transition-all flex items-center justify-between group ${selectedProjectId === p.id ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/30' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                            >
                                <div className="flex min-w-0 items-center gap-4">
                                    <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: p.color }} />
                                    <div className="min-w-0">
                                        <span className={`block truncate text-sm font-black uppercase tracking-tight ${selectedProjectId === p.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>{p.name}</span>
                                        {showProjectItemCounts && (
                                            <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                                                {count} {itemCountLabel}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {selectedProjectId === p.id && <CheckCircle2 size={18} className="text-indigo-400" />}
                            </button>
                        );
                        })}
                    </div>
                ) : (
                    <div className="p-6 bg-red-900/10 border border-red-900/20 rounded-2xl flex flex-col items-center gap-3 text-red-400 text-center">
                        <AlertCircle size={32} />
                        <p className="text-xs font-bold uppercase leading-relaxed">{emptyTitle} <br /> {emptyDescription}</p>
                    </div>
                )}
            </div>

            {showItemLimit && (
                <label className="block rounded-[1.5rem] border border-slate-800 bg-slate-950 p-5">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{itemLimitLabel}</span>
                    <div className="mt-3 flex items-center gap-3">
                        <input
                            type="number"
                            min={1}
                            max={maxSelectableItems}
                            value={itemLimit}
                            onChange={(event) => {
                                const value = Math.floor(Number(event.target.value) || 1);
                                setItemLimit(Math.max(1, Math.min(maxSelectableItems, value)));
                            }}
                            disabled={isMoving}
                            className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus:border-indigo-500/60 disabled:opacity-60"
                        />
                        <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-500">
                            of {maxSelectableItems}
                        </span>
                    </div>
                </label>
            )}

            <div className="flex gap-4 pt-4">
                <button onClick={onCancel} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Cancel</button>
                <button 
                    onClick={() => onConfirm(normalizedItemLimit)} 
                    disabled={!selectedProjectId || projects.length === 0 || isMoving}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                >
                    {isMoving ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} /> {confirmLabel}</>}
                </button>
            </div>
        </div>
    </div>
    );
};
