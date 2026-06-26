
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, XCircle, Activity, Check, Edit2 } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../types';
import { TaskIdentity } from './TaskIdentity';
import { TaskStatus } from './TaskStatus';
import { TaskActions } from './TaskActions';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface BulkTask {
    id: string;
    title?: string;
    prompt: string;
    status: 'pending' | 'generating' | 'success' | 'error';
    result?: string;
    error?: string;
    progress: number;
    archivedItem?: ItemWithCurrentRevision;
}

interface BulkTaskNodeProps {
    task: BulkTask;
    isSelected: boolean;
    onToggleSelect: () => void;
    onRemove: (id: string) => void;
    onUpdatePrompt: (id: string, prompt: string) => void;
    onRemix?: (id: string) => void;
    onCapture?: (item: ItemWithCurrentRevision) => void;
    onInspect?: () => void;
    onCancel?: (id: string) => void; 
    onMoveToLab?: (id: string) => void;
    isBatchRunning?: boolean;
}

export const BulkTaskNode: React.FC<BulkTaskNodeProps> = ({ 
    task, isSelected, onToggleSelect, onRemove, onUpdatePrompt, onRemix, onCapture, onInspect, onCancel, onMoveToLab, isBatchRunning 
}) => {
    const { confirm, confirmDialog } = useModalDialogs();
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(task.prompt);

    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUpdatePrompt(task.id, editValue);
        setIsEditing(false);
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(task.prompt);
        setIsEditing(false);
    };

    const handleRemoveWithConfirm = async () => {
        const ok = await confirm({
            title: 'Permanently Purge Task',
            description: 'Permanently purge this task from the queue?',
            confirmLabel: 'Purge',
            tone: 'danger'
        });
        if (ok) onRemove(task.id);
    };

    return (
        <>
            <tr 
                onClick={isEditing ? undefined : onInspect}
                className={`hover:bg-indigo-600/5 transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-600/10' : ''}`}
            >
                <td className="px-6 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                    <button 
                        onClick={onToggleSelect}
                        disabled={isBatchRunning}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-black/20 border-white/30 text-transparent group-hover:border-slate-400 disabled:group-hover:border-white/20'}`}
                    >
                        <Check size={12} strokeWidth={3} />
                    </button>
                </td>
                <td className="px-6 py-4">
                    <div className="w-14 h-14 rounded-xl bg-black/40 border border-slate-800 overflow-hidden flex items-center justify-center relative shadow-inner">
                        {task.status === 'success' && task.result ? (
                            <img src={task.result} className="w-full h-full object-cover" alt="" />
                        ) : task.status === 'generating' ? (
                            <Loader2 size={16} className="text-indigo-500 animate-spin" />
                        ) : task.status === 'error' ? (
                            <XCircle size={16} className="text-red-500/60" />
                        ) : (
                            <Activity size={16} className="text-slate-800" />
                        )}
                    </div>
                </td>
                <td className="px-6 py-4">
                    <TaskIdentity 
                        id={task.id} title={task.title} prompt={task.prompt} 
                        isEditing={isEditing} editValue={editValue} 
                        onEditChange={setEditValue} 
                    />
                </td>
                <td className="px-6 py-4">
                    <TaskStatus status={task.status} progress={task.progress} error={task.error} onCancel={onCancel} taskId={task.id} />
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <TaskActions 
                        status={task.status} 
                        isEditing={isEditing} 
                        isBatchRunning={isBatchRunning}
                        hasArchivedItem={!!task.archivedItem}
                        onInspect={onInspect || (() => {})}
                        onMoveToLab={onMoveToLab ? () => onMoveToLab(task.id) : undefined}
                        onRemix={onRemix ? () => onRemix(task.id) : undefined}
                        onCapture={onCapture ? () => onCapture(task.archivedItem!) : undefined}
                        onRemove={handleRemoveWithConfirm}
                        onSaveEdit={handleSave}
                        onCancelEdit={handleCancelEdit}
                    />
                    {!isEditing && task.status === 'pending' && !isBatchRunning && (
                        <button onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="p-2 text-slate-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" title="Edit Manifest">
                            <Edit2 size={16} />
                        </button>
                    )}
                </td>
            </tr>
            {confirmDialog ? createPortal(confirmDialog, document.body) : null}
        </>
    );
};
