
import React from 'react';
import { Check, Loader2, XCircle, Activity, Trash2, Fingerprint } from 'lucide-react';
import { TaskIdentity } from './TaskIdentity';
import { TaskStatus } from './TaskStatus';
import { TaskActions } from './TaskActions';
import { BulkTask } from '../../pages/BulkStudio';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface BulkTaskCardProps {
    task: BulkTask;
    isSelected: boolean;
    onToggleSelect: () => void;
    onInspect: () => void;
    onRemix: (id: string) => void;
    onCapture: (item: any) => void;
    onRemove: (id: string) => void;
    onCancel?: (id: string) => void; 
    onMoveToLab?: (id: string) => void;
    isBatchRunning?: boolean;
}

export const BulkTaskCard: React.FC<BulkTaskCardProps> = ({
    task, isSelected, onToggleSelect, onInspect, onRemix, onCapture, onRemove, onCancel, onMoveToLab, isBatchRunning
}) => {
    const { confirm, confirmDialog } = useModalDialogs();
    const isSuccess = task.status === 'success';

    return (
        <div 
            onClick={() => isSuccess ? onInspect() : null}
            className={`group relative bg-slate-900/20 border rounded-[2rem] overflow-hidden aspect-square transition-all duration-500 cursor-pointer ${
                isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-2xl scale-[0.98]' : 
                task.status === 'success' ? 'border-emerald-500/30' : 
                task.status === 'error' ? 'border-red-500/30' : 
                'border-slate-800/50 hover:border-indigo-500/30 hover:-translate-y-1'
            }`}
        >
            {/* Selection Circle - Visible on Hover or when selected */}
            <div className="absolute top-4 left-4 z-40" onClick={(e) => e.stopPropagation()}>
                <button 
                    onClick={onToggleSelect}
                    disabled={isBatchRunning}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-black/20 border-white/30 text-transparent opacity-0 group-hover:opacity-100 group-hover:border-white/60 disabled:group-hover:opacity-20'}`}
                >
                    <Check size={14} strokeWidth={3} />
                </button>
            </div>

            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20">
                {task.status === 'success' && task.result ? (
                    <img src={task.result} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
                ) : task.status === 'generating' ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 size={32} className="text-indigo-500 animate-spin" />
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">{task.progress}%</span>
                    </div>
                ) : task.status === 'error' ? (
                    <XCircle size={48} strokeWidth={1} className="text-red-500/40" />
                ) : (
                    <Activity size={32} className="text-slate-800" />
                )}
            </div>
            
            <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-6 transition-all duration-300 opacity-0 group-hover:opacity-100`}>
                <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500 space-y-4">
                    <TaskIdentity id={task.id} title={task.title} prompt={task.prompt} />
                    <div className="flex items-center justify-between pointer-events-auto border-t border-white/10 pt-3">
                        <TaskStatus status={task.status} progress={task.progress} error={task.error} onCancel={onCancel} taskId={task.id} />
                        <TaskActions 
                            status={task.status} 
                            isEditing={false} 
                            isBatchRunning={isBatchRunning}
                            hasArchivedItem={!!task.archivedItem}
                            onInspect={onInspect}
                            onMoveToLab={onMoveToLab ? () => onMoveToLab(task.id) : undefined}
                            onRemix={() => onRemix(task.id)}
                            onCapture={() => onCapture(task.archivedItem)}
                            onRemove={async () => {
                                const ok = await confirm({
                                    title: 'Permanently Purge Task',
                                    description: 'Permanently purge this task?',
                                    confirmLabel: 'Purge',
                                    tone: 'danger'
                                });
                                if (ok) onRemove(task.id);
                            }}
                        />
                    </div>
                </div>
            </div>

            {confirmDialog}
        </div>
    );
};
