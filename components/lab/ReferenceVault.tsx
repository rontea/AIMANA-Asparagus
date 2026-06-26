
import React from 'react';
import { Box, MoveRight, Trash2, Info, Image as ImageIcon, UploadCloud } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../types';
import { ManifestGallery } from '../project/lab/workspace/ManifestGallery';
import { LabTask } from '../../hooks/useAiGeneration';

interface ReferenceVaultProps {
    items: ItemWithCurrentRevision[];
    onRemove: (id: string) => void;
    onCapture: (item: ItemWithCurrentRevision) => void;
    onBulkCapture?: (items: ItemWithCurrentRevision[]) => void;
    onInspect: (item: ItemWithCurrentRevision) => void;
    onRemixTask?: (task: LabTask) => void;
}

export const ReferenceVault: React.FC<ReferenceVaultProps> = ({ items, onRemove, onCapture, onBulkCapture, onInspect, onRemixTask }) => {
    if (items.length === 0) return null;

    const historyTasks = items.map(item => ({
        id: item.id,
        title: item.currentRevision?.title,
        prompt: item.currentRevision?.prompt || 'Source material for synthesis.',
        modelId: 'reference',
        modelLabel: 'Source Reference',
        status: 'success' as const,
        progress: 100,
        result: null,
        error: null,
        timestamp: item.createdAt,
        aspectRatio: '1:1',
        archivedItem: item
    }));

    return (
        <section className="pt-12 border-t border-slate-800/50 mt-12 animate-in fade-in duration-700">
            <div className="flex items-center justify-between mb-8 px-2">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                        <Box size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm md:text-lg font-black text-white uppercase tracking-widest">Neural Reference Vault</h3>
                        <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Staged source material and reference clusters</p>
                    </div>
                </div>
            </div>

            <ManifestGallery 
                tasks={[]} 
                historyTasks={historyTasks} 
                onRemoveTask={(id) => onRemove(id)} 
                onSave={(res, p, m, meta, title, archivedItem) => {
                    if (archivedItem) onCapture(archivedItem);
                }}
                onBulkSave={(tasks) => {
                    if (onBulkCapture) {
                        const selectedItems = tasks.map(t => t.archivedItem).filter(Boolean) as ItemWithCurrentRevision[];
                        onBulkCapture(selectedItems);
                    }
                }}
                onInspectTask={(task) => onInspect(task.archivedItem!)}
                onRemixTask={onRemixTask}
                registry={[]}
            />
        </section>
    );
};
