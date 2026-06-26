import React, { useRef, useState } from 'react';
import {
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  X,
  Upload,
  Wand2
} from 'lucide-react';
import { NeuralConfig } from '../project/lab/sidebar/NeuralConfig';
import { ConstraintConfig } from '../project/lab/sidebar/ConstraintConfig';
import { TemporalConfig } from '../project/lab/sidebar/TemporalConfig';
import { LabAdvancedSettings } from '../project/lab/sidebar/LabAdvancedSettings';
import { LabDimensionSelector } from '../project/lab/sidebar/LabDimensionSelector';
import { ArtifactSelectorModal } from '../../extensions/image-editor/components/ArtifactSelectorModal';
import type { PromptManagerImageModelOption } from './types';
import type { ModelOption, SupportedEngine } from '../project/lab/ModelSelector/types';
import type { EngineFeatures, DynamicParamBlueprint } from '../../hooks/useEngineManagement';
import { api } from '../../services/api';

interface PromptManagerSidebarProps {
  isOpen: boolean;
  previewModel: string;
  modelRegistry: ModelOption[];
  currentModelCategory: 'Visual' | 'Motion';
  currentModelFeatures: EngineFeatures;
  currentModelSchema: DynamicParamBlueprint[];
  selectedRatio: string;
  customWidth: number;
  customHeight: number;
  negativePrompt: string;
  seed: string;
  useSearch: boolean;
  enhance: boolean;
  nologo: boolean;
  safe: boolean;
  dynamicParams: Record<string, any>;
  duration: number;
  audio: boolean;
  isPrivate: boolean;
  nofeed: boolean;
  modelOptions: PromptManagerImageModelOption[];
  missingPreviewCount: number;
  queuedGenerationCount: number;
  isGenerating: boolean;
  isCoolingDown: boolean;
  cooldownProgress: number;
  generationProgress: {
    current: number;
    total: number;
  };
  onToggleOpen: () => void;
  onOpenCheckpointHub: () => void;
  onOpenLoraSelector: () => void;
  onOpenEmbeddingSelector: () => void;
  onOpenControlNetSelector: () => void;
  onSelectedRatioChange: (ratio: string) => void;
  onCustomWidthChange: (value: number) => void;
  onCustomHeightChange: (value: number) => void;
  onNegativePromptChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  onToggleUseSearch: (value: boolean) => void;
  onToggleEnhance: (value: boolean) => void;
  onToggleNologo: (value: boolean) => void;
  onToggleSafe: (value: boolean) => void;
  onSetDynamicParam: (key: string, value: any) => void;
  onSetDuration: (value: number) => void;
  onSetAudio: (value: boolean) => void;
  onSetIsPrivate: (value: boolean) => void;
  onSetNofeed: (value: boolean) => void;
  onGenerate: () => void;
  onStopGeneration: () => void;
}

const panelClass = 'rounded-2xl border border-slate-800/80 bg-slate-950/65 p-4 backdrop-blur-sm';

export const PromptManagerSidebar: React.FC<PromptManagerSidebarProps> = ({
  isOpen,
  previewModel,
  modelRegistry,
  currentModelCategory,
  currentModelFeatures,
  currentModelSchema,
  selectedRatio,
  customWidth,
  customHeight,
  negativePrompt,
  seed,
  useSearch,
  enhance,
  nologo,
  safe,
  dynamicParams,
  duration,
  audio,
  isPrivate,
  nofeed,
  modelOptions,
  missingPreviewCount,
  queuedGenerationCount,
  isGenerating,
  isCoolingDown,
  cooldownProgress,
  generationProgress,
  onToggleOpen,
  onOpenCheckpointHub,
  onOpenLoraSelector,
  onOpenEmbeddingSelector,
  onOpenControlNetSelector,
  onSelectedRatioChange,
  onCustomWidthChange,
  onCustomHeightChange,
  onNegativePromptChange,
  onSeedChange,
  onToggleUseSearch,
  onToggleEnhance,
  onToggleNologo,
  onToggleSafe,
  onSetDynamicParam,
  onSetDuration,
  onSetAudio,
  onSetIsPrivate,
  onSetNofeed,
  onGenerate,
  onStopGeneration
}) => {
  const activeModel = modelOptions.find((option) => option.id === previewModel) || modelOptions[0];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReferenceSelectorOpen, setIsReferenceSelectorOpen] = useState(false);
  const loadProgressPercent = isGenerating && generationProgress.total > 0
    ? (generationProgress.current / generationProgress.total) * 100
    : 0;
  const showRatioControls = currentModelCategory === 'Visual' || currentModelCategory === 'Motion';
  const showReferenceImage = currentModelFeatures.showImageInput || currentModelSchema.some((param) => param.key === 'image');
  const referenceImage = typeof dynamicParams.image === 'string' ? dynamicParams.image : '';
  const activeRegistryModel = modelRegistry.find((model) => String(model.id) === previewModel);
  const imageReferenceLabel = currentModelCategory === 'Motion' ? 'Image-to-Video' : 'Image-to-Image';

  const handleReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      try {
        const saved = await api.settings.uploadPromptManagerDraftImage(
          `reference-${Date.now()}`,
          dataUrl,
          file.type || 'image/png'
        );
        onSetDynamicParam('image', saved.fileUrl);
      } catch (error) {
        console.error('Failed to save prompt manager reference image locally', error);
        onSetDynamicParam('image', dataUrl);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleReferenceAssetSelect = async (itemIds: string[]) => {
    const selectedId = itemIds[0];
    if (!selectedId) return;
    try {
      const item = await api.items.get(selectedId);
      const fileUrl = item?.currentRevision?.fileUrl || item?.currentRevision?.thumbnailLink || null;
      if (!fileUrl) return;
      onSetDynamicParam('image', fileUrl);
      onSetDynamicParam('referenceItemId', selectedId);
      setIsReferenceSelectorOpen(false);
    } catch (error) {
      console.error('Failed to attach reference asset', error);
    }
  };

  return (
    <>
    <div className="relative hidden lg:block">
      <button
        onClick={onToggleOpen}
        className="absolute left-0 top-1/2 z-30 -translate-y-1/2 -translate-x-[calc(100%-1px)] rounded-l-2xl border border-slate-700/70 border-r-0 bg-slate-800/90 px-3 py-6 text-slate-400 shadow-[0_12px_35px_rgba(2,6,23,0.65)] transition-all hover:bg-slate-700/95 hover:px-4 hover:text-slate-100"
        aria-label={isOpen ? 'Collapse prompt manager sidebar' : 'Expand prompt manager sidebar'}
      >
        <ChevronRight size={26} className={`transition-transform duration-300 ${isOpen ? '' : 'rotate-180'}`} />
      </button>

      <aside className={`h-full overflow-hidden border-l border-slate-800/80 bg-slate-950/70 backdrop-blur-sm transition-all duration-300 ${isOpen ? 'w-[378px]' : 'w-0 border-l-0'}`}>
        <div className="flex h-full w-[378px] min-h-0 flex-col">
          <div className="border-b border-slate-800/50 px-5 py-4">
            <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">Inference Console v1.4</h3>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-6 scrollbar-subtle"
            style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
          >
            <div className={panelClass}>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Neural Batch</div>
              <h2 className="mt-2 text-lg font-black text-white">Preview Generator</h2>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Generate draft previews with one model lane and keep staging prompts visually consistent.
              </p>
            </div>

            <NeuralConfig
              model={previewModel as SupportedEngine}
              registry={modelRegistry}
              onOpenModal={onOpenCheckpointHub}
              onOpenLoraModal={onOpenLoraSelector}
              onOpenEmbeddingModal={onOpenEmbeddingSelector}
              onOpenControlNetModal={onOpenControlNetSelector}
              onAddTriggerWord={() => {}}
              vae="ae.sft"
              onSetVae={() => {}}
            />

            <ConstraintConfig
              negativePrompt={negativePrompt}
              onSetNegativePrompt={onNegativePromptChange}
              show={currentModelFeatures.showNegativePrompt}
            />

            <section className="space-y-8">
              <h4 className="px-1 text-sm font-black uppercase tracking-widest text-white">Studio Config</h4>

              {showRatioControls && (
                <LabDimensionSelector
                  ratios={activeRegistryModel?.ratios || ['1:1', '3:4', '4:3', '9:16', '16:9']}
                  selectedRatio={selectedRatio}
                  onSetRatio={onSelectedRatioChange}
                  customWidth={customWidth}
                  setCustomWidth={onCustomWidthChange}
                  customHeight={customHeight}
                  setCustomHeight={onCustomHeightChange}
                />
              )}

              {showReferenceImage && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <ImageIcon size={12} className="text-blue-400" /> Reference Image
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsReferenceSelectorOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 hover:text-white"
                    >
                      <FolderOpen size={12} />
                      From Projects
                    </button>
                  </div>
                  <div
                    onClick={() => !referenceImage && fileInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      const element = event.currentTarget as HTMLElement;
                      element.classList.add('border-blue-500', 'bg-blue-500/10');
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      const element = event.currentTarget as HTMLElement;
                      element.classList.remove('border-blue-500', 'bg-blue-500/10');
                    }}
                    onDrop={async (event) => {
                      event.preventDefault();
                      const element = event.currentTarget as HTMLElement;
                      element.classList.remove('border-blue-500', 'bg-blue-500/10');
                      const internalId = event.dataTransfer.getData('application/x-aimana-asset');
                      if (internalId) {
                        const item = await api.items.get(internalId);
                        const fileUrl = item?.currentRevision?.fileUrl || item?.currentRevision?.thumbnailLink || null;
                        if (fileUrl) {
                          onSetDynamicParam('image', fileUrl);
                          onSetDynamicParam('referenceItemId', internalId);
                          return;
                        }
                      }
                      const files = event.dataTransfer.files;
                      if (files?.[0]) handleReferenceUpload({ target: { files } } as React.ChangeEvent<HTMLInputElement>);
                    }}
                    className={`relative group h-40 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden ${
                      referenceImage
                        ? 'border-blue-500/50 bg-blue-500/5'
                        : 'border-slate-800 bg-black/40 hover:border-blue-500/30 hover:bg-blue-500/5'
                    }`}
                  >
                    {referenceImage ? (
                      <>
                        <img src={referenceImage} className="w-full h-full object-contain p-3 opacity-95" alt="Reference" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 py-3">
                          <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-white/90">
                                {imageReferenceLabel}
                              </p>
                              <p className="mt-1 text-[9px] text-slate-300">
                                {dynamicParams.referenceItemId ? 'Attached from project assets' : 'Attached from upload or drag and drop'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setIsReferenceSelectorOpen(true);
                                }}
                                className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-200 hover:bg-cyan-500/25"
                              >
                                Change
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onSetDynamicParam('image', '');
                                  onSetDynamicParam('referenceItemId', '');
                                }}
                                className="p-2.5 bg-red-600 text-white rounded-xl shadow-2xl hover:bg-red-500 transition-all active:scale-95"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center space-y-2">
                        <div className="p-3 bg-slate-800 rounded-2xl text-slate-500 group-hover:text-blue-400 transition-colors mx-auto w-fit">
                          <Upload size={24} />
                        </div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                          {imageReferenceLabel}
                        </p>
                        <p className="text-[9px] text-slate-600 font-medium">Click to upload, drag and drop, or attach from projects</p>
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setIsReferenceSelectorOpen(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 hover:text-white"
                          >
                            <FolderOpen size={12} />
                            Browse Projects
                          </button>
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleReferenceUpload}
                    />
                  </div>
                </div>
              )}

              <TemporalConfig
                category={currentModelCategory}
                features={currentModelFeatures}
                paramSchema={currentModelSchema}
                motionIntensity={50}
                setMotionIntensity={() => {}}
                duration={duration}
                setDuration={onSetDuration}
                seed={seed}
                setSeed={onSeedChange}
                useSearch={useSearch}
                setUseSearch={onToggleUseSearch}
                model={previewModel}
              />

              <LabAdvancedSettings
                model={previewModel as SupportedEngine}
                seed={seed}
                onSetSeed={onSeedChange}
                negativePrompt={negativePrompt}
                onSetNegativePrompt={onNegativePromptChange}
                category={currentModelCategory}
                enhance={enhance}
                setEnhance={onToggleEnhance}
                nologo={nologo}
                setNologo={onToggleNologo}
                safe={safe}
                setSafe={onToggleSafe}
                audio={audio}
                setAudio={onSetAudio}
                isPrivate={isPrivate}
                setIsPrivate={onSetIsPrivate}
                nofeed={nofeed}
                setNofeed={onSetNofeed}
                isPollinations={previewModel.startsWith('pollinations-')}
                dynamicParams={dynamicParams}
                onSetDynamicParam={onSetDynamicParam}
                paramSchema={currentModelSchema}
                features={currentModelFeatures}
              />
            </section>

            <div className="mt-auto space-y-4 pt-2">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Missing Previews</div>
                    <div className="mt-1 text-sm text-slate-400">Prompts ready for generation</div>
                  </div>
                  <div className="text-3xl font-black text-white">{missingPreviewCount}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Queued Batch</div>
                    <div className="mt-1 text-sm text-slate-400">Selected prompts ready to bulk generate</div>
                  </div>
                  <div className="text-3xl font-black text-white">{queuedGenerationCount}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <span>Model Load</span>
                  <span>{isGenerating && generationProgress.total > 0 ? `${generationProgress.current}/${generationProgress.total}` : 'Idle'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${loadProgressPercent}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <span>Cooldown</span>
                  <span>{isCoolingDown ? `${Math.round(cooldownProgress)}%` : 'Ready'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${isCoolingDown ? cooldownProgress : 0}%` }}
                  />
                </div>
              </div>

              {queuedGenerationCount > 0 && (
                <button
                  onClick={isGenerating ? onStopGeneration : onGenerate}
                  className={`flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-3.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg transition-all ${
                    isGenerating
                      ? 'border-red-500/40 bg-red-600 shadow-red-950/20 hover:bg-red-500'
                      : 'border-cyan-500/40 bg-cyan-600 shadow-cyan-950/20 hover:bg-cyan-500'
                  }`}
                >
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                  {isGenerating
                    ? (isCoolingDown
                        ? `Cooling Down ${generationProgress.current}/${generationProgress.total}`
                        : `Generating ${generationProgress.current}/${generationProgress.total}`)
                    : `Generate Selected (${queuedGenerationCount})`}
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
    <ArtifactSelectorModal
      isOpen={isReferenceSelectorOpen}
      onClose={() => setIsReferenceSelectorOpen(false)}
      onSelect={handleReferenceAssetSelect}
      ingestContext="reference"
      allowMultiple={false}
    />
    </>
  );
};
