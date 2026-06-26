import React, { useState } from 'react';
import { History, ChevronUp, Sparkles } from 'lucide-react';
import { ItemWithCurrentRevision } from '../../types';
import { LabTask } from '../../hooks/useAiGeneration';
import { ModelOption } from '../project/lab/ModelSelectorModal';
import { ManifestGallery } from '../project/lab/workspace/ManifestGallery';

type BulkManifestFilter = 'all' | 'image' | 'video';

interface BulkHistoryTrayProps {
    isOpen: boolean;
    onToggle: () => void;
    historyItems: ItemWithCurrentRevision[];
    historyTasks: LabTask[];
    onRemove: (id: string) => void;
    onSave: (result: any, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: any) => void;
    onBulkSave?: (tasks: LabTask[]) => void;
    onInspectTask: (task: LabTask) => void;
    onRemixTask?: (task: LabTask) => void;
    registry: ModelOption[];
}

export const BulkHistoryTray: React.FC<BulkHistoryTrayProps> = ({
    isOpen,
    onToggle,
    historyItems,
    historyTasks,
    onRemove,
    onSave,
    onBulkSave,
    onInspectTask,
    onRemixTask,
    registry
}) => {
    const [manifestFilter, setManifestFilter] = useState<BulkManifestFilter>('all');

    return (
        <div className={`absolute bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-slate-800 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] z-50 transition-all duration-700 ease-in-out flex flex-col ${isOpen ? 'h-[60vh]' : 'h-14'}`}>
            <button onClick={onToggle} className="h-14 w-full flex items-center justify-between px-10 bg-slate-900/50 hover:bg-slate-800 transition-colors border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400"><History size={16} /></div>
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Bulk Recent Artifact Manifests</h3>
                    <div className="h-4 w-px bg-slate-800 mx-2" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{historyItems.length} Generations Staged</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 group">
                    <span className="text-[8px] font-black uppercase tracking-widest group-hover:text-white transition-colors">{isOpen ? 'Close History' : 'View Neural History'}</span>
                    <div className="p-1 rounded-full bg-slate-800 transition-transform">
                        <ChevronUp size={14} className={`transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </button>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-[#050505]/40">
                {historyItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20 space-y-4">
                        <div className="p-6 rounded-[2rem] border-2 border-dashed border-slate-800"><Sparkles size={48} /></div>
                        <p className="text-sm font-black uppercase tracking-widest">History Manifest Empty</p>
                        <p className="text-xs max-w-xs leading-relaxed">Completed bulk synthesis artifacts will automatically stage here for project assignment.</p>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 flex flex-wrap items-center gap-2">
                            {([
                                { value: 'all', label: 'All' },
                                { value: 'image', label: 'Image' },
                                { value: 'video', label: 'Video' }
                            ] as const).map((option) => {
                                const isActive = manifestFilter === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setManifestFilter(option.value)}
                                        className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] transition-colors ${
                                            isActive
                                                ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                                                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>

                        <ManifestGallery
                            tasks={[]}
                            historyTasks={historyTasks}
                            onRemoveTask={onRemove}
                            onSave={onSave}
                            onBulkSave={onBulkSave}
                            onInspectTask={onInspectTask}
                            onRemixTask={onRemixTask}
                            registry={registry}
                            excludeLabContentUploads
                            manifestType={manifestFilter}
                            hideAudioWhenManifestTypeAll
                        />
                    </>
                )}
            </div>
        </div>
    );
};
