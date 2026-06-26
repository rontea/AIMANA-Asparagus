
import React from 'react';
import { Zap, Clock, Loader2, Play, LayoutGrid, List as ListIcon, Trash2, Eraser, Cpu, Square, RotateCcw, AlertCircle, Beaker, FlaskConical, ChevronLeft, Archive, CheckSquare, Square as SquareIcon, Info } from 'lucide-react';

export type BulkViewMode = 'queue' | 'failure-lab' | 'archived';

interface BulkHeaderProps {
    isProcessingAll: boolean;
    isCoolingDown: boolean;
    cooldownProgress: number;
    generationProgress?: {
        current: number;
        total: number;
    };
    tasksCount: number;
    pendingCount: number;
    errorCount: number; 
    selectedCount: number;
    failedCount: number;
    archivedCount: number;
    bulkLimit?: number;
    viewType: 'grid' | 'list';
    viewMode: BulkViewMode;
    onViewChange: (v: 'grid' | 'list') => void;
    onViewModeChange: (m: BulkViewMode) => void;
    onClearFinished: () => void;
    onClearAll: () => void;
    onDeleteSelected: () => void;
    onRunAll: () => void;
    onStopAll: () => void;
    onRetryFailed: () => void; 
    onMoveAllToLab: () => void;
    onBulkMoveToLab: () => void;
    onBulkArchive: () => void;
    onBulkRestore: () => void;
    onToggleSelectAll: () => void;
    allSelected: boolean;
    activeModelLabel?: string;
    activeModelRate?: string | null;
}

export const BulkHeader: React.FC<BulkHeaderProps> = ({ 
    isProcessingAll, isCoolingDown, cooldownProgress, tasksCount, pendingCount, errorCount,
    generationProgress, selectedCount, failedCount, archivedCount, bulkLimit = 8, viewType, viewMode, onViewChange, onViewModeChange,
    onClearFinished, onClearAll, onDeleteSelected, onRunAll, onStopAll, onRetryFailed, onMoveAllToLab,
    onBulkMoveToLab, onBulkArchive, onBulkRestore, onToggleSelectAll, allSelected, activeModelLabel, activeModelRate
}) => {
    return (
        <div className="h-16 border-b border-slate-800/50 flex items-center justify-between px-8 bg-slate-900/10 shrink-0">
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Zap size={18} className="text-emerald-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xs font-black text-white uppercase tracking-[0.3em]">Bulk Synthesis Engine</h2>
                            <span
                                className="inline-flex items-center justify-center text-slate-400 hover:text-indigo-300 transition-colors cursor-help"
                                title="This section is for image and video generation."
                                aria-label="Bulk Synthesis Engine information"
                            >
                                <Info size={12} />
                            </span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                            {activeModelRate
                                ? `${activeModelLabel || 'Active model'} | ${activeModelRate}`
                                : 'Pipeline Orchestrator'}
                        </p>
                    </div>
                </div>

                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner relative z-10">
                    <button 
                        onClick={() => onViewModeChange('queue')}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'queue' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <LayoutGrid size={12} /> Queue ({tasksCount})
                    </button>
                    <button 
                        onClick={() => onViewModeChange('failure-lab')}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 relative ${
                            viewMode === 'failure-lab' 
                            ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]' 
                            : 'text-slate-500 hover:text-red-400'
                        }`}
                    >
                        <FlaskConical size={12} className={viewMode === 'failure-lab' ? 'text-white' : 'text-red-500'} /> Lab ({failedCount})
                        {failedCount > 0 && viewMode !== 'failure-lab' && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-950 animate-pulse" />
                        )}
                    </button>
                    <button 
                        onClick={() => onViewModeChange('archived')}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'archived' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                    >
                        <Archive size={12} /> Stashed ({archivedCount})
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {viewMode === 'queue' && isProcessingAll && generationProgress && generationProgress.total > 0 && (
                    <div className="flex flex-col items-end gap-1.5 mr-4 animate-in fade-in">
                        <div className="flex items-center gap-2">
                            <Loader2 size={12} className="text-emerald-400 animate-spin" />
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                                {isCoolingDown ? 'Cooling Down' : 'Generating'} {generationProgress.current}/{generationProgress.total}
                            </span>
                        </div>
                        <div className="w-28 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                style={{ width: `${Math.min(100, (generationProgress.current / generationProgress.total) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {viewMode === 'queue' && isCoolingDown && (!generationProgress || generationProgress.total === 0) && (
                    <div className="flex flex-col items-end gap-1.5 mr-4 animate-in fade-in">
                        <div className="flex items-center gap-2">
                            <Clock size={12} className="text-indigo-400 animate-pulse" />
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Cooldown</span>
                        </div>
                        <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(99,102,241,0.5)]" style={{ width: `${cooldownProgress}%` }} />
                        </div>
                    </div>
                )}

                <button 
                    onClick={onToggleSelectAll}
                    className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${allSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-white'}`}
                    title="Select All in current view"
                >
                    {allSelected ? <CheckSquare size={16} /> : <SquareIcon size={16} />}
                </button>

                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
                    <button onClick={() => onViewChange('grid')} className={`p-1.5 rounded-lg transition-all ${viewType === 'grid' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><LayoutGrid size={16} /></button>
                    <button onClick={() => onViewChange('list')} className={`p-1.5 rounded-lg transition-all ${viewType === 'list' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><ListIcon size={16} /></button>
                </div>

                <div className="h-6 w-px bg-slate-800 mx-1" />

                <div className="flex items-center gap-2">
                    {selectedCount > 0 && !isProcessingAll && (
                        <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800 animate-in slide-in-from-right-4">
                            {/* Move to Queue Action */}
                            {(viewMode === 'failure-lab' || viewMode === 'archived') && (
                                <button 
                                    onClick={onBulkRestore}
                                    className="p-2 bg-slate-800 hover:bg-emerald-900/40 text-slate-400 hover:text-emerald-400 rounded-lg transition-all"
                                    title="Restore to Main Queue"
                                >
                                    <RotateCcw size={16} />
                                </button>
                            )}
                            
                            {/* Move to Lab Action */}
                            {(viewMode === 'queue' || viewMode === 'archived') && (
                                <button 
                                    onClick={onBulkMoveToLab}
                                    className="p-2 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                                    title="Move to Failure Lab"
                                >
                                    <Beaker size={16} />
                                </button>
                            )}

                            {/* Stash Action */}
                            {viewMode !== 'archived' && (
                                <button 
                                    onClick={onBulkArchive}
                                    className="p-2 bg-slate-800 hover:bg-indigo-900/40 text-slate-400 hover:text-indigo-400 rounded-lg transition-all"
                                    title="Stash selected manifests in Archive"
                                >
                                    <Archive size={16} />
                                </button>
                            )}
                            
                            <button 
                                onClick={onDeleteSelected} 
                                className="p-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-lg transition-all"
                                title="Purge Selection"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}

                    {viewMode === 'queue' ? (
                        isProcessingAll ? (
                            <button onClick={onStopAll} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-900/40 transition-all flex items-center justify-center gap-2 animate-in zoom-in-95"><Square size={14} className="fill-current" /> Stop Pipeline</button>
                        ) : (
                            <button onClick={onRunAll} disabled={pendingCount === 0} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2"><Play size={14} /> Run All</button>
                        )
                    ) : (
                        <button 
                            onClick={() => onViewModeChange('queue')}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                            <ChevronLeft size={14} /> Back to Queue
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
