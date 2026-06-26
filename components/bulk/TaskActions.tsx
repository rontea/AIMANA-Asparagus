
import React from 'react';
import { Info, Beaker, RotateCcw, FolderPlus, Trash2, Check, X } from 'lucide-react';

interface TaskActionsProps {
    status: string;
    isEditing: boolean;
    isBatchRunning?: boolean;
    hasArchivedItem: boolean;
    onInspect: () => void;
    onMoveToLab?: () => void;
    onRemix?: () => void;
    onCapture?: () => void;
    onRemove: () => void;
    onSaveEdit?: (e: React.MouseEvent) => void;
    onCancelEdit?: (e: React.MouseEvent) => void;
}

export const TaskActions: React.FC<TaskActionsProps> = ({
    status, isEditing, isBatchRunning, hasArchivedItem, onInspect, onMoveToLab, onRemix, onCapture, onRemove, onSaveEdit, onCancelEdit
}) => {
    if (isEditing) {
        return (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={onSaveEdit} className="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"><Check size={14}/></button>
                <button onClick={onCancelEdit} className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-all"><X size={14}/></button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onInspect} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all" title="Inspect Neural Manifest">
                <Info size={16} />
            </button>
            
            {status === 'error' && onMoveToLab && (
                <button onClick={onMoveToLab} className="p-2 text-rose-400 hover:text-white hover:bg-rose-600 rounded-lg transition-all" title="Move to Failure Lab">
                    <Beaker size={16} />
                </button>
            )}

            {status === 'error' && onRemix && !isBatchRunning && (
                <button onClick={onRemix} className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-all" title="Remix manifest">
                    <RotateCcw size={16} />
                </button>
            )}

            {status === 'success' && hasArchivedItem && onCapture && (
                <button onClick={onCapture} className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-600 rounded-lg transition-all" title="Capture to Project">
                    <FolderPlus size={16} />
                </button>
            )}

            {!isBatchRunning && (
                <button onClick={onRemove} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all" title="Purge logic">
                    <Trash2 size={16} />
                </button>
            )}
        </div>
    );
};
