import React from 'react';
import { ListPlus, FlaskConical, Archive } from 'lucide-react';
import { BulkTask } from '../../pages/BulkStudio';
import { BulkGridView } from './BulkGridView';
import { BulkListView } from './BulkListView';
import { BulkViewMode } from './BulkHeader';

interface BulkWorkspaceProps {
    viewType: 'grid' | 'list';
    viewMode: BulkViewMode;
    tasks: BulkTask[];
    selectedTaskIds: Set<string>;
    toggleTaskSelection: (id: string) => void;
    onInspect: (task: BulkTask) => void;
    onRemix: (id: string) => void;
    onCapture: (item: any) => void;
    onRemove: (id: string) => void;
    onUpdatePrompt: (id: string, updates: any) => void;
    onCancel?: (id: string) => void; 
    onMoveToLab?: (id: string) => void;
    isBatchRunning?: boolean;
}

export const BulkWorkspace: React.FC<BulkWorkspaceProps> = ({
    viewType, viewMode, tasks, selectedTaskIds, toggleTaskSelection, onInspect, onRemix, onCapture, onRemove, onUpdatePrompt, onCancel, onMoveToLab, isBatchRunning
}) => {
    if (tasks.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center py-40 opacity-30 animate-in fade-in">
                <div className="p-8 rounded-[3rem] border-2 border-dashed border-slate-800 bg-slate-900/20">
                    {viewMode === 'queue' && <ListPlus size={64} strokeWidth={1} />}
                    {viewMode === 'failure-lab' && <FlaskConical size={64} strokeWidth={1} />}
                    {viewMode === 'archived' && <Archive size={64} strokeWidth={1} />}
                </div>
                <p className="text-sm font-black uppercase tracking-[0.2em] mt-8">
                    {viewMode === 'queue' && "Queue Empty"}
                    {viewMode === 'failure-lab' && "Failure Lab Sanitized"}
                    {viewMode === 'archived' && "No Stashed Manifests"}
                </p>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">
                    {viewMode === 'queue' && "Inject prompts to begin synthesis"}
                    {viewMode === 'failure-lab' && "All neural exceptions cleared"}
                    {viewMode === 'archived' && "Archive manifests to keep the queue organized"}
                </p>
            </div>
        );
    }

    if (viewType === 'grid') {
        return (
            <BulkGridView 
                tasks={tasks}
                selectedTaskIds={selectedTaskIds}
                toggleTaskSelection={toggleTaskSelection}
                onInspect={onInspect}
                onRemix={onRemix}
                onCapture={onCapture}
                onRemove={onRemove}
                onCancel={onCancel}
                onMoveToLab={onMoveToLab}
                isBatchRunning={isBatchRunning}
            />
        );
    }

    return (
        <BulkListView 
            tasks={tasks}
            selectedTaskIds={selectedTaskIds}
            toggleTaskSelection={toggleTaskSelection}
            onInspect={onInspect}
            onRemix={onRemix}
            onCapture={onCapture}
            onRemove={onRemove}
            onUpdatePrompt={onUpdatePrompt}
            onCancel={onCancel}
            onMoveToLab={onMoveToLab}
            isBatchRunning={isBatchRunning}
        />
    );
};