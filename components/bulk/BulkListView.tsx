
import React from 'react';
import { BulkTaskNode } from './BulkTaskNode';
import { BulkTask } from '../../pages/BulkStudio';

interface BulkListViewProps {
    tasks: BulkTask[];
    selectedTaskIds: Set<string>;
    toggleTaskSelection: (id: string) => void;
    onRemove: (id: string) => void;
    onUpdatePrompt: (id: string, updates: any) => void;
    onRemix: (id: string) => void;
    onCapture: (item: any) => void;
    onInspect: (task: BulkTask) => void;
    onCancel?: (id: string) => void; 
    onMoveToLab?: (id: string) => void;
    isBatchRunning?: boolean;
}

export const BulkListView: React.FC<BulkListViewProps> = ({
    tasks, selectedTaskIds, toggleTaskSelection, onRemove, onUpdatePrompt, onRemix, onCapture, onInspect, onCancel, onMoveToLab, isBatchRunning
}) => (
    <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/80">
                <tr>
                    <th className="px-6 py-5 w-10"></th>
                    <th className="px-6 py-5 w-24">Artifact</th>
                    <th className="px-6 py-5">Manifest Context</th>
                    <th className="px-6 py-5 w-40 text-left">Synthesis Status</th>
                    <th className="px-6 py-5 w-40 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
                {tasks.map(task => (
                    <BulkTaskNode 
                        key={task.id} 
                        task={task} 
                        isSelected={selectedTaskIds.has(task.id)}
                        onToggleSelect={() => toggleTaskSelection(task.id)}
                        onRemove={onRemove} 
                        onUpdatePrompt={(id, prompt) => onUpdatePrompt(id, { prompt })}
                        onRemix={onRemix}
                        onCapture={onCapture}
                        onInspect={() => onInspect(task)}
                        onCancel={onCancel}
                        onMoveToLab={onMoveToLab}
                        isBatchRunning={isBatchRunning}
                    />
                ))}
            </tbody>
        </table>
    </div>
);
