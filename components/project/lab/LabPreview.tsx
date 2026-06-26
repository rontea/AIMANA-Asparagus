
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronUp, GripHorizontal, History } from 'lucide-react';
import { LabTask } from '../../../hooks/useAiGeneration';
import { ItemWithCurrentRevision } from '../../../types';
import { SupportedEngine, ModelOption } from './ModelSelectorModal';
import { GeneratedImageResult } from '../../../services/geminiService';
import { NeuralCommandBar } from './workspace/NeuralCommandBar';
import { ManifestGallery } from './workspace/ManifestGallery';
import { EngineFeatures } from '../../../hooks/useEngineManagement';
import { AudioStudioPreview } from './workspace/AudioStudioPreview';
import { TranscriptionStudioPreview } from './workspace/TranscriptionStudioPreview';
import { DynamicParam } from '../../../hooks/useLabState';
import { LabMode } from './GenerateImageModal';
import { isTranscriptionAudioModel } from './ModelSelector/audioModelUtils';
import { extractTranscriptionManifestDetails, isTranscriptPostProcessPending } from '../../../utils/transcriptionManifest';

interface LabPreviewProps {
    tasks: LabTask[];
    historyItems?: ItemWithCurrentRevision[];
    onRemoveTask: (id: string) => void;
    onSave: (result: GeneratedImageResult | null, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => void;
    onBulkSave?: (tasks: LabTask[]) => void;
    onInspectTask: (task: LabTask) => void;
    onRemixTask?: (task: LabTask) => void;
    onUpdateTask?: (taskId: string, updates: Partial<LabTask>) => void;
    onSaveActiveTranscriptToArchive?: (task: LabTask | null) => void;
    isSavingActiveTranscriptToArchive?: boolean;
    // Input Bar Integration Props
    title: string;
    onSetTitle: (t: string) => void;
    prompt: string;
    onSetPrompt: (p: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    category: string;
    model: SupportedEngine;
    hasApiKey: boolean;
    negativePrompt: string;
    onSetNegativePrompt: (p: string) => void;
    onRandomizeSeed: () => void;
    seed: string;
    onSetSeed: (v: string) => void;
    selectedVoice: string;
    onSetSelectedVoice: (v: string) => void;
    features: EngineFeatures;
    registry: ModelOption[];
    onOpenModelSelector: () => void;
    paramSchema: DynamicParam[];
    dynamicParams: Record<string, any>;
    onSetDynamicParam: (key: string, value: any) => void;
    isPodcast?: boolean;
    mode?: LabMode;
    selectedFile?: File | null;
    onSelectFile?: (file: File, options?: { sourceItemId?: string | null }) => void;
    onClearFile?: () => void;
    transcriptionSelectionNonce?: number;
    activeTranscriptOverride?: LabTask | null;
}

export const LabPreview: React.FC<LabPreviewProps> = ({
    tasks, historyItems = [], onRemoveTask, onSave, onBulkSave, onInspectTask, onRemixTask, onUpdateTask,
    onSaveActiveTranscriptToArchive, isSavingActiveTranscriptToArchive = false,
    title, onSetTitle, prompt, onSetPrompt, onGenerate, isGenerating, category, model, hasApiKey,
    negativePrompt,
    onSetNegativePrompt,
    onRandomizeSeed,
    seed,
    onSetSeed,
    selectedVoice,
    onSetSelectedVoice,
    features,
    registry,
    onOpenModelSelector,
    paramSchema,
    dynamicParams,
    onSetDynamicParam,
    isPodcast,
    mode = 'image',
    selectedFile = null,
    onSelectFile,
    onClearFile,
    transcriptionSelectionNonce = 0,
    activeTranscriptOverride = null
}) => {
    const [isVisualManifestTrayOpen, setIsVisualManifestTrayOpen] = useState(false);
    const [visualManifestTrayHeight, setVisualManifestTrayHeight] = useState(60);
    const historyTasks: LabTask[] = useMemo(() => {
        return historyItems.map(item => ({
            ...(function () {
                const details = extractTranscriptionManifestDetails({
                    aiParameters: item.currentRevision?.aiParameters || null
                });
                const isPending = isTranscriptPostProcessPending(details);
                const isError = details.postProcessStatus === 'error';
                const promptHasText = String(item.currentRevision?.prompt || '').trim().length > 0;
                const mimeType = String(item.currentRevision?.mimeType || '').toLowerCase();
                const hasTranscriptPayload = promptHasText || (
                    details.isTranscription && (mimeType.includes('json') || mimeType.startsWith('text/'))
                );
                const isBlockingPending = isPending && !hasTranscriptPayload;
                return {
                    status: isBlockingPending
                        ? 'pending' as const
                        : (isError && !hasTranscriptPayload ? 'error' as const : 'success' as const),
                    progress: isBlockingPending ? 96 : 100,
                    error: (isError && !hasTranscriptPayload)
                        ? (details.qaError || details.summaryError || 'Transcript post-processing failed.')
                        : null
                };
            })(),
            id: item.id,
            title: item.currentRevision?.title,
            prompt: item.currentRevision?.prompt || 'No prompt recorded',
            modelId: item.currentRevision?.engine || 'unknown',
            modelLabel: registry.find((entry) => entry.id === item.currentRevision?.engine)?.label
                || item.currentRevision?.engine
                || 'Unspecified Engine',
            result: null,
            timestamp: item.createdAt,
            aspectRatio: '1:1',
            archivedItem: item
        }));
    }, [historyItems, registry]);

    const isAudio = category === 'Audio';
    const manifestType: 'image' | 'video' | 'audio' | 'text' | 'all' =
        category === 'Motion' ? 'video'
        : category === 'Audio' ? (mode === 'transcribe' ? 'text' : 'audio')
        : category === 'Language' ? 'text'
        : 'image';
    const activeModel = useMemo(() => (registry || []).find(m => m.id === model), [registry, model]);
    const availableVoices = activeModel?.textVoices || [];
    const isTranscriptionTask = useCallback((task: LabTask) => {
        const modelMeta = (registry || []).find((entry) =>
            entry.id === task.modelId || entry.id === task.archivedItem?.currentRevision?.engine
        );
        if (modelMeta && isTranscriptionAudioModel(modelMeta)) return true;

        if (task.metadata && typeof task.metadata === 'object') {
            const meta = task.metadata as Record<string, any>;
            const adv = (meta.advanced_params || meta) as Record<string, any>;
            if (adv.isTranscription === true || meta.isTranscription === true) return true;
            if (typeof adv.transcriptionHint === 'string' && adv.transcriptionHint.trim().length > 0) return true;
            if (
                (adv.transcriptionPostProcess && typeof adv.transcriptionPostProcess === 'object')
                || (meta.transcriptionPostProcess && typeof meta.transcriptionPostProcess === 'object')
            ) {
                return true;
            }
        }

        const aiParams = String(task.archivedItem?.currentRevision?.aiParameters || '').trim();
        if (aiParams) {
            try {
                const parsed = JSON.parse(aiParams);
                const adv = (parsed?.advanced_params || parsed) as Record<string, any>;
                return adv.isTranscription === true
                    || (typeof adv.transcriptionHint === 'string' && adv.transcriptionHint.trim().length > 0)
                    || (adv.transcriptionPostProcess && typeof adv.transcriptionPostProcess === 'object')
                    || (parsed?.transcriptionPostProcess && typeof parsed.transcriptionPostProcess === 'object');
            } catch (_error) {}
        }

        return false;
    }, [registry]);

    const activeTranscriptTask = useMemo(() => {
        if (mode === 'transcribe' && activeTranscriptOverride) {
            return activeTranscriptOverride;
        }
        const combined = [...tasks, ...historyTasks];
        const transcriptCandidates = combined.filter((task) => {
            const mimeType = String(task.result?.mimeType || task.archivedItem?.currentRevision?.mimeType || '').toLowerCase();
            const transcriptText = String(
                task.result?.text
                || task.archivedItem?.currentRevision?.prompt
                || task.prompt
                || ''
            ).trim();
            const hasTextMime = mimeType.startsWith('text/');
            const looksLikeTranscriptArtifact = hasTextMime || transcriptText.length > 0;

            if (mode === 'transcribe') {
                return isTranscriptionTask(task) && looksLikeTranscriptArtifact;
            }

            return hasTextMime;
        });

        // Guard against stale transcript auto-binding when a new source file is selected.
        // The user should explicitly run transcription for the newly selected file first.
        if (mode === 'transcribe' && selectedFile && transcriptionSelectionNonce > 0) {
            return transcriptCandidates.find((task) => Number(task.timestamp || 0) >= transcriptionSelectionNonce) || null;
        }

        // Recover unresolved archive transcripts (stuck in pending/running) by reopening
        // them in the transcription preview so post-process state can be finalized.
        if (mode === 'transcribe' && !selectedFile) {
            const unresolved = transcriptCandidates.find((task) => (
                task.status === 'pending' || task.status === 'generating'
            ));
            if (unresolved) return unresolved;
        }

        return transcriptCandidates[0] || null;
    }, [activeTranscriptOverride, historyTasks, isTranscriptionTask, mode, selectedFile, tasks, transcriptionSelectionNonce]);

    const visualManifestCount = useMemo(() => {
        const ids = new Set<string>();
        [...tasks, ...historyTasks].forEach((task) => {
            const key = task.archivedItem?.id || task.id;
            if (key) ids.add(String(key));
        });
        return ids.size;
    }, [historyTasks, tasks]);

    useEffect(() => {
        if (tasks.some((task) => task.status === 'generating' || task.status === 'pending')) {
            setIsVisualManifestTrayOpen(true);
        }
    }, [tasks]);

    const handleVisualManifestTrayResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isVisualManifestTrayOpen) {
            setIsVisualManifestTrayOpen(true);
        }

        const startY = event.clientY;
        const startHeight = visualManifestTrayHeight;

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const viewportHeight = Math.max(window.innerHeight, 1);
            const deltaVh = ((startY - moveEvent.clientY) / viewportHeight) * 100;
            setVisualManifestTrayHeight(Math.min(82, Math.max(28, startHeight + deltaVh)));
        };

        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    return (
        <div className="flex-1 bg-[#0c0c0c] relative flex flex-col min-h-0 h-full overflow-hidden">
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#6366f1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

            {isAudio ? (
                <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar relative space-y-10">
                    {mode === 'transcribe' ? (
                        <TranscriptionStudioPreview
                            title={title}
                            onSetTitle={onSetTitle}
                            prompt={prompt}
                            onSetPrompt={onSetPrompt}
                            onGenerate={onGenerate}
                            isGenerating={isGenerating}
                            modelLabel={activeModel?.label || String(model)}
                            onOpenModelSelector={onOpenModelSelector}
                            paramSchema={paramSchema}
                            dynamicParams={dynamicParams}
                            onSetDynamicParam={onSetDynamicParam}
                            selectedFile={selectedFile}
                            onSelectFile={onSelectFile || (() => {})}
                            onClearFile={onClearFile || (() => {})}
                            activeTranscript={activeTranscriptTask}
                            onUpdateActiveTranscript={(updates) => {
                                if (!activeTranscriptTask || !onUpdateTask) return;
                                onUpdateTask(activeTranscriptTask.id, updates);
                            }}
                            onSaveTranscriptToArchive={() => onSaveActiveTranscriptToArchive?.(activeTranscriptTask)}
                            isSavingTranscriptToArchive={isSavingActiveTranscriptToArchive}
                        />
                    ) : (
                        <AudioStudioPreview
                            title={title}
                            onSetTitle={onSetTitle}
                            prompt={prompt}
                            onSetPrompt={onSetPrompt}
                            onGenerate={onGenerate}
                            isGenerating={isGenerating}
                            model={model}
                            activeModel={activeModel}
                            onOpenModelSelector={onOpenModelSelector}
                            seed={seed}
                            onSetSeed={onSetSeed}
                            onRandomizeSeed={onRandomizeSeed}
                            selectedVoice={selectedVoice}
                            onSetSelectedVoice={onSetSelectedVoice}
                            showSeed={features.showSeed}
                            paramSchema={paramSchema}
                            dynamicParams={dynamicParams}
                            onSetDynamicParam={onSetDynamicParam}
                            availableVoices={availableVoices}
                            isPodcast={isPodcast}
                            mode={mode}
                        />
                    )}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Recent Renders</div>
                            <span className="text-[10px] text-slate-600">Captured artifacts</span>
                        </div>
                        <ManifestGallery 
                            tasks={tasks}
                            historyTasks={historyTasks}
                            onRemoveTask={onRemoveTask}
                            onSave={onSave}
                            onBulkSave={onBulkSave}
                            onInspectTask={onInspectTask}
                            onRemixTask={onRemixTask}
                            registry={registry}
                            excludeLabContentUploads
                            excludeMatrixCompositions
                            manifestType={manifestType}
                            onlyTranscriptions={mode === 'transcribe'}
                            onlyMusicGenerations={mode === 'music'}
                        />
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-16">
                        <NeuralCommandBar 
                            title={title} onSetTitle={onSetTitle}
                            prompt={prompt} onSetPrompt={onSetPrompt}
                            onGenerate={onGenerate} isGenerating={isGenerating}
                            category={category} model={model} hasApiKey={hasApiKey}
                            negativePrompt={negativePrompt} onSetNegativePrompt={onSetNegativePrompt}
                            onRandomizeSeed={onRandomizeSeed}
                            features={features}
                            selectedRatio={""}
                            onSetRatio={() => {}}
                        />
                    </div>
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-slate-800 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] z-50 transition-[height] duration-700 ease-in-out flex flex-col"
                        style={{ height: isVisualManifestTrayOpen ? `${visualManifestTrayHeight}vh` : '3.5rem' }}
                    >
                        <button
                            type="button"
                            onPointerDown={handleVisualManifestTrayResizeStart}
                            className="absolute -top-4 left-1/2 z-10 flex h-8 w-28 -translate-x-1/2 cursor-row-resize items-center justify-center rounded-full border border-slate-800 bg-slate-950/95 text-slate-600 shadow-xl hover:border-indigo-500/40 hover:text-indigo-300 transition-colors"
                            title="Drag to resize archive tray"
                            aria-label="Drag to resize archive tray"
                        >
                            <GripHorizontal size={20} />
                        </button>
                        <button onClick={() => setIsVisualManifestTrayOpen(!isVisualManifestTrayOpen)} className="h-14 w-full flex items-center justify-between px-10 bg-slate-900/50 hover:bg-slate-800 transition-colors border-b border-slate-800 shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400"><History size={16} /></div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Neural Archive Manifests</h3>
                                <div className="h-4 w-px bg-slate-800 mx-2" />
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{visualManifestCount} Generations Staged</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500 group">
                                <span className="text-[8px] font-black uppercase tracking-widest group-hover:text-white transition-colors">{isVisualManifestTrayOpen ? 'Close History' : 'View Neural History'}</span>
                                <div className="p-1 rounded-full bg-slate-800 transition-transform">
                                    <ChevronUp size={14} className={`transition-transform duration-500 ${isVisualManifestTrayOpen ? 'rotate-180' : ''}`} />
                                </div>
                            </div>
                        </button>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-[#050505]/40">
                            <ManifestGallery 
                                tasks={tasks}
                                historyTasks={historyTasks}
                                onRemoveTask={onRemoveTask}
                                onSave={onSave}
                                onBulkSave={onBulkSave}
                                onInspectTask={onInspectTask}
                                onRemixTask={onRemixTask}
                                registry={registry}
                                excludeLabContentUploads
                                excludeMatrixCompositions
                                manifestType={manifestType}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
