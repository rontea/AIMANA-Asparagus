import React, { useState, useEffect, useCallback } from 'react';
import { GeneratedImageResult } from '../../services/geminiService';
import { LabSidebar, RATIO_CONFIG } from './lab/LabSidebar';
import { LabPreview } from './lab/LabPreview';
import { LabHeader } from './lab/LabHeader';
import { SupportedEngine, ModelOption, ModelSelectorModal, ModelCategory } from './lab/ModelSelectorModal';
import { loadDynamicRegistry } from './lab/ModelSelector/registry/index';
import { useLabState } from '../../hooks/useLabState';
import { useAiGeneration, STAGE_LABELS, LabTask } from '../../hooks/useAiGeneration';
import { getResolvedDimensions } from '../../services/pollinationsService';
import { Revision, ItemWithCurrentRevision } from '../../types';
import { ArtifactInspector } from './lab/workspace/ArtifactInspector';
import { api } from '../../services/api';
import { isMusicAudioModel, isSpeechSynthesisModel } from './lab/ModelSelector/audioModelUtils';

// Sub-modals for expanded logic
import { LoraSelectorModal } from './lab/LoraSelectorModal';
import { EmbeddingSelectorModal } from './lab/EmbeddingSelectorModal';
import { ControlNetSelectorModal } from './lab/ControlNetSelectorModal';

export type LabMode = 'image' | 'video' | 'audio' | 'music' | 'text';

const MODEL_CACHE_KEY_BY_MODE: Record<LabMode, string> = {
  image: 'aimana_lab_model_image',
  video: 'aimana_lab_model_video',
  audio: 'aimana_lab_model_audio_generation',
  music: 'aimana_lab_model_music_generation',
  text: 'aimana_lab_model_text'
};

const getTargetCategoryForMode = (mode: LabMode): ModelCategory => (
  mode === 'image' ? 'Visual'
    : mode === 'video' ? 'Motion'
      : mode === 'audio' || mode === 'music' ? 'Audio'
        : 'Language'
);

const isModelCompatibleWithMode = (model: ModelOption | undefined, mode: LabMode): boolean => {
  if (!model) return false;
  if (model.category !== getTargetCategoryForMode(mode)) return false;
  if (mode === 'audio') return isSpeechSynthesisModel(model);
  if (mode === 'music') return isMusicAudioModel(model);
  return true;
};

const readModeScopedModel = (mode: LabMode): SupportedEngine | null => {
  try {
    const cached = localStorage.getItem(MODEL_CACHE_KEY_BY_MODE[mode]);
    return cached ? (cached as SupportedEngine) : null;
  } catch {
    return null;
  }
};

const writeModeScopedModel = (mode: LabMode, modelId: SupportedEngine) => {
  try {
    localStorage.setItem(MODEL_CACHE_KEY_BY_MODE[mode], String(modelId));
  } catch {
    // ignore storage errors in private/sandboxed contexts
  }
};

interface GenerateImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAsAsset: (result: GeneratedImageResult, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => Promise<void>;
  initialModel?: SupportedEngine;
  mode?: LabMode;
  remixRevision?: Revision | null;
  isPodcast?: boolean;
}

const GenerateImageModal: React.FC<GenerateImageModalProps> = ({ isOpen, onClose, onAddAsAsset, initialModel, mode = 'image', remixRevision: externalRemixRevision, isPodcast }) => {
  const labState = useLabState(initialModel);
  const { generate, isGenerating, tasks, removeTask, stage, result, error, reset } = useAiGeneration();
  // UI Logic States
  const [isSaving, setIsSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [registry, setRegistry] = useState<ModelOption[]>([]);
  const [inspectedTask, setInspectedTask] = useState<LabTask | null>(null);
  const [internalRemixRevision, setInternalRemixRevision] = useState<Revision | null>(null);
  
  // Sub-modal Visibility States
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isLoraSelectorOpen, setIsLoraSelectorOpen] = useState(false);
  const [isEmbeddingSelectorOpen, setIsEmbeddingSelectorOpen] = useState(false);
  const [isControlNetSelectorOpen, setIsControlNetSelectorOpen] = useState(false);

  // Neural History (Unassigned Manifests)
  const [historyItems, setHistoryItems] = useState<ItemWithCurrentRevision[]>([]);

  const activeRemixRevision = externalRemixRevision || internalRemixRevision;
  const [lastUsedParams, setLastUsedParams] = useState<any>(null);

  const fetchNeuralHistory = useCallback(async () => {
    try {
        const archive = await fetch('/api/projects/archive', { 
            headers: api.auth.getAuthHeaders()
        }).then(r => r.json());
        
        if (archive?.id) {
            const items = await api.items.list(archive.id);
            setHistoryItems(items.sort((a, b) => b.createdAt - a.createdAt));
        }
    } catch (e) {
        console.warn("Lab failed to sync neural history archive.");
    }
  }, []);

  useEffect(() => {
      if (isOpen) {
          loadDynamicRegistry().then(setRegistry);
          fetchNeuralHistory();
      }
  }, [isOpen, fetchNeuralHistory]);

  // Sync with background updates (e.g. from Auto-Save)
  useEffect(() => {
    const handleHistoryUpdate = () => fetchNeuralHistory();
    window.addEventListener('neural-history-updated', handleHistoryUpdate);
    return () => window.removeEventListener('neural-history-updated', handleHistoryUpdate);
  }, [fetchNeuralHistory]);

  // REMIX HYDRATION LOGIC
  useEffect(() => {
    if (isOpen && activeRemixRevision && registry.length > 0) {
      try {
        const params = activeRemixRevision.aiParameters ? JSON.parse(activeRemixRevision.aiParameters) : {};
        const adv = params.advanced_params || params;
        
        labState.setPrompt(activeRemixRevision.prompt || '');
        labState.setModel(activeRemixRevision.engine as SupportedEngine);
        
        // When remixing, explicitly set the seed in the UI
        if (adv.seed) labState.setSeed(adv.seed.toString());
        
        if (adv.negativePrompt) labState.setNegativePrompt(adv.negativePrompt);
        if (adv.ratio) labState.setSelectedRatio(adv.ratio);
        if (adv.motionIntensity) labState.setMotionIntensity(adv.motionIntensity);
        if (adv.duration) labState.setDuration(adv.duration);
        if (adv.temperature) labState.setTemperature(adv.temperature);
        if (adv.voiceName) labState.setSelectedVoice(adv.voiceName);
        if (adv.enhance !== undefined) labState.setEnhance(adv.enhance);
        if (adv.nologo !== undefined) labState.setNologo(adv.nologo);
        if (adv.safe !== undefined) labState.setSafe(adv.safe);
        if (adv.isPrivate !== undefined) labState.setIsPrivate(adv.isPrivate);
        if (adv.audio !== undefined) labState.setAudio(adv.audio);
        if (adv.inputImage) labState.setInputImage(adv.inputImage);
        if (adv.useSearch !== undefined) labState.setUseSearch(adv.useSearch);

        if (adv.dynamicParams) {
          Object.entries(adv.dynamicParams).forEach(([key, val]) => {
            labState.setDynamicParam(key, val);
          });
        }

        if (internalRemixRevision) setInternalRemixRevision(null);
      } catch (e) {
        console.warn("Remix hydration failed:", e);
      }
    }
  }, [isOpen, activeRemixRevision, registry.length]);

  useEffect(() => {
      if (!isOpen || registry.length === 0 || activeRemixRevision) return;
      const modelData = registry.find((m) => m.id === labState.model);
      if (isModelCompatibleWithMode(modelData, mode)) return;

      const cachedModelId = readModeScopedModel(mode);
      const cachedModel = cachedModelId ? registry.find((m) => m.id === cachedModelId) : undefined;
      const fallback = isModelCompatibleWithMode(cachedModel, mode)
          ? cachedModel
          : mode === 'audio'
              ? registry.find((m) => m.category === 'Audio' && isSpeechSynthesisModel(m))
              : mode === 'music'
                  ? registry.find((m) => m.category === 'Audio' && isMusicAudioModel(m))
                  : registry.find((m) => m.category === getTargetCategoryForMode(mode));
      if (fallback && fallback.id !== labState.model) {
          labState.setModel(fallback.id);
      }
  }, [isOpen, mode, registry, labState.model, labState.setModel, activeRemixRevision]);

  useEffect(() => {
    if (!isOpen || registry.length === 0) return;
    const modelData = registry.find((m) => m.id === labState.model);
    if (!isModelCompatibleWithMode(modelData, mode)) return;
    writeModeScopedModel(mode, labState.model);
  }, [isOpen, mode, registry, labState.model]);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    if (isOpen) checkKey();
  }, [isOpen]);

  const handleGenerate = () => {
      // Logic Guard: Prevent redundant tasks
      if (isGenerating) return;
      
      const modelData = registry.find(m => m.id === labState.model);
      const category = modelData?.category || 'Visual';

      if (category === 'Language') {
          labState.setChatHistory([...labState.chatHistory, { role: 'user', text: labState.prompt }]);
      }

      // 1. RESOLVE SEED: Determine final seed for inference without polluting UI
      let finalSeed = labState.seed;
      if (!finalSeed && (category === 'Visual' || category === 'Motion')) {
          finalSeed = Math.floor(Math.random() * 10000000).toString();
      }

      const apiRatio = RATIO_CONFIG[labState.selectedRatio].apiValue;
      const { width, height } = getResolvedDimensions(
          apiRatio, 
          labState.selectedRatio === 'custom' ? labState.customWidth : undefined,
          labState.selectedRatio === 'custom' ? labState.customHeight : undefined
      );

      const runParams = {
          negativePrompt: labState.negativePrompt,
          seed: finalSeed,
          motionIntensity: labState.motionIntensity,
          temperature: labState.temperature,
          useSearch: labState.useSearch,
          voiceName: labState.selectedVoice,
          duration: Number.isFinite(Number(labState.dynamicParams?.duration ?? labState.duration))
              ? Number(labState.dynamicParams?.duration ?? labState.duration)
              : undefined,
          enhance: labState.enhance,
          nologo: labState.nologo,
          safe: labState.safe,
          isPrivate: labState.isPrivate,
          inputImage: labState.features.showImageInput ? labState.inputImage : null,
          referenceItemId: labState.referenceItemId || null,
          ratio: labState.selectedRatio,
          resolvedWidth: width,
          resolvedHeight: height,
          dynamicParams: labState.dynamicParams
      };
      setLastUsedParams(runParams);

      generate(
        labState.prompt, 
        labState.model, 
        labState.selectedRatio, 
        runParams.resolvedWidth, 
        runParams.resolvedHeight,
        runParams
      );
      
      if (category === 'Language') labState.setPrompt('');
  };

  const handleSave = async (res: GeneratedImageResult | null, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => {
    setIsSaving(true);
    setCaptureMessage(null);

    try {
        await onAddAsAsset(res!, prompt, modelId, metadata, userTitle, archivedItem);
        setCaptureMessage("Artifact successfully captured to project workspace.");
        setTimeout(() => setCaptureMessage(null), 3500);
        // Refresh local history as the item was moved out of the unassigned archive
        fetchNeuralHistory();
    } catch (err) {
        setCaptureMessage("Failed to save artifact.");
        setTimeout(() => setCaptureMessage(null), 3500);
    } finally {
        setIsSaving(false);
    }
  };

  const handleAddTriggerWord = (word: string) => {
      const current = labState.prompt.trim();
      if (!current) {
          labState.setPrompt(word);
      } else if (!current.includes(word)) {
          labState.setPrompt(`${current}, ${word}`);
      }
  };

  if (!isOpen) return null;

  // Map LabMode to ModelCategory for filtering
  const forcedCategory: ModelCategory | undefined = getTargetCategoryForMode(mode);

  const isAudioMode = mode === 'audio' || mode === 'music';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-in fade-in">
        <div className="bg-[#0c0c0c] border border-slate-800/50 w-[95vw] h-[95vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col ring-1 ring-white/10">
            <LabHeader onClose={onClose} mode={mode} />
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {!isAudioMode && (
                    <LabSidebar 
                        {...labState}
                        mode={mode}
                        hasApiKey={hasApiKey} 
                        registry={registry}
                        onSelectKey={() => { // @ts-ignore
                            window.aistudio?.openSelectKey().then(() => setHasApiKey(true));
                        }}
                        isGenerating={isGenerating} onGenerate={handleGenerate}
                        onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                        onOpenLoraSelector={() => setIsLoraSelectorOpen(true)}
                        onOpenEmbeddingSelector={() => setIsEmbeddingSelectorOpen(true)}
                        onOpenControlNetSelector={() => setIsControlNetSelectorOpen(true)}
                        onAddTriggerWord={handleAddTriggerWord}
                        onSetVae={labState.setVae}
                    />
                )}
                <LabPreview 
                    tasks={tasks}
                    historyItems={historyItems}
                    onRemoveTask={removeTask}
                    onSave={handleSave}
                    onInspectTask={(task) => setInspectedTask(task)}
                    onRemixTask={(task) => {
                        if (task.archivedItem?.currentRevision) {
                            setInternalRemixRevision(task.archivedItem.currentRevision);
                        }
                    }}
                    title={labState.title}
                    onSetTitle={labState.setTitle}
                    prompt={labState.prompt}
                    onSetPrompt={labState.setPrompt}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    category={registry.find(m => m.id === labState.model)?.category || 'Visual'}
                    model={labState.model}
                    hasApiKey={hasApiKey}
                    negativePrompt={labState.negativePrompt}
                    onSetNegativePrompt={labState.setNegativePrompt}
                    onRandomizeSeed={() => labState.setSeed(Math.floor(Math.random() * 10000000).toString())}
                    seed={labState.seed}
                    onSetSeed={labState.setSeed}
                    selectedVoice={labState.selectedVoice}
                    onSetSelectedVoice={labState.setSelectedVoice}
                    features={labState.features}
                    registry={registry}
                    onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                    paramSchema={labState.paramSchema}
                    dynamicParams={labState.dynamicParams}
                    onSetDynamicParam={labState.setDynamicParam}
                    isPodcast={isPodcast}
                />
            </div>
        </div>

        {/* Modal Registry */}
        {isModelSelectorOpen && (
            <ModelSelectorModal 
                isOpen={isModelSelectorOpen}
                onClose={() => setIsModelSelectorOpen(false)}
                currentModel={labState.model}
                onSelect={(id) => {
                    labState.setModel(id);
                    setIsModelSelectorOpen(false);
                }}
                forcedCategory={forcedCategory}
                audioFilter={mode === 'audio' ? 'speech' : mode === 'music' ? 'music' : undefined}
            />
        )}

        {isLoraSelectorOpen && (
            <LoraSelectorModal 
                isOpen={isLoraSelectorOpen}
                onClose={() => setIsLoraSelectorOpen(false)}
            />
        )}

        {isEmbeddingSelectorOpen && (
            <EmbeddingSelectorModal 
                isOpen={isEmbeddingSelectorOpen}
                onClose={() => setIsEmbeddingSelectorOpen(false)}
            />
        )}

        {isControlNetSelectorOpen && (
            <ControlNetSelectorModal 
                isOpen={isControlNetSelectorOpen}
                onClose={() => setIsControlNetSelectorOpen(false)}
            />
        )}

        {inspectedTask && (
            <ArtifactInspector 
                task={inspectedTask} 
                onClose={() => setInspectedTask(null)} 
                onRemix={(task) => {
                    if (task.archivedItem?.currentRevision) {
                        setInternalRemixRevision(task.archivedItem.currentRevision);
                    }
                }}
                registry={registry}
            />
        )}
    </div>
  );
};

export default GenerateImageModal;
