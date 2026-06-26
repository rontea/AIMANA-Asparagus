
import React from 'react';
import { BulkTaskCard } from './BulkTaskCard';
import { BulkTask } from '../../pages/BulkStudio';

interface BulkGridViewProps {
    tasks: BulkTask[];
    selectedTaskIds: Set<string>;
    toggleTaskSelection: (id: string) => void;
    onInspect: (task: BulkTask) => void;
    onRemix: (id: string) => void;
    onCapture: (item: any) => void;
    onRemove: (id: string) => void;
    onCancel?: (id: string) => void; 
    onMoveToLab?: (id: string) => void;
    isBatchRunning?: boolean;
}

export const BulkGridView: React.FC<BulkGridViewProps> = ({
    tasks, selectedTaskIds, toggleTaskSelection, onInspect, onRemix, onCapture, onRemove, onCancel, onMoveToLab, isBatchRunning
}) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
        {tasks.map((task) => (
            <BulkTaskCard 
                key={task.id}
                task={task}
                isSelected={selectedTaskIds.has(task.id)}
                onToggleSelect={() => toggleTaskSelection(task.id)}
                onInspect={() => onInspect(task)}
                onRemix={onRemix}
                onCapture={onCapture}
                onRemove={onRemove}
                onCancel={onCancel}
                onMoveToLab={onMoveToLab}
                isBatchRunning={isBatchRunning}
            />
        ))}
    </div>
);
