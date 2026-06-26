import React, { useState, useRef, useEffect } from 'react';
import { Revision, Project, AssetType, ItemWithCurrentRevision } from '../../types';
import { api } from '../../services/api';
import { determineAssetType } from '../../services/db';
import { X, UploadCloud, Loader2, RotateCcw, ShieldCheck, Info, FileText, Trash2 } from 'lucide-react';
import { ItemSidebar } from './ItemSidebar';
import { ItemManifestHeader } from './ItemManifestHeader';
import { ItemActionFooter } from './ItemActionFooter';
import { ArtifactSelectorModal } from '../../extensions/image-editor/components/ArtifactSelectorModal';
import { GenerationDataModal } from './GenerationDataModal';
import { loadDynamicRegistry, ModelOption } from '../project/lab/ModelSelector/registry/index';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface RevisionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  revision: Revision;
  project: Project;
  isHead: boolean;
  onUpdate: () => void;
  onRefreshHistory?: () => void;
  onRemix?: (rev: Revision) => void;
}

const RevisionDetailModal: React.FC<RevisionDetailModalProps> = ({ 
    isOpen, onClose, revision, project, isHead, onUpdate, onRefreshHistory, onRemix 
}) => {
  const { confirm, alert, confirmDialog, alertDialog } = useModalDialogs();
  const [formData, setFormData] = useState({ 
    title: revision.title, label: revision.label || '', tags: revision.tags || '', prompt: revision.prompt,
    engine: revision.engine, note: revision.note, aiParameters: revision.aiParameters || '',
    originalFilename: revision.originalFilename || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [engines, setEngines] = useState<ModelOption[]>([]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  
  const dragCounter = useRef(0);
  const parsedAiParameters = React.useMemo(() => {
    if (!formData.aiParameters) return { parsed: null, parseError: null as string | null };
    try {
      return { parsed: JSON.parse(formData.aiParameters), parseError: null as string | null };
    } catch (e: any) {
      return { parsed: null, parseError: e?.message || 'Invalid JSON' };
    }
  }, [formData.aiParameters]);

  const rawDataEnvelope = React.useMemo(() => {
    return JSON.stringify({
      envelope: 'aimana.revision.raw.v1',
      item: {
        id: revision.itemId,
        projectId: project.id
      },
      revision: {
        id: revision.id,
        itemId: revision.itemId,
        versionNumber: revision.versionNumber,
        storage: revision.storage,
        mimeType: revision.mimeType,
        size: revision.size,
        originalFilename: revision.originalFilename,
        remoteId: revision.remoteId || null,
        fileUrl: revision.fileUrl || null,
        thumbnailLink: revision.thumbnailLink || null,
        webViewLink: revision.webViewLink || null,
        webContentLink: revision.webContentLink || null,
        createdAt: revision.createdAt,
        isArchived: !!revision.isArchived,
        secondaryFiles: revision.secondaryFiles || []
      },
      manifest: {
        title: formData.title,
        label: formData.label,
        tags: formData.tags,
        prompt: formData.prompt,
        engine: formData.engine,
        note: formData.note,
        originalFilename: formData.originalFilename
      },
      neural: {
        aiParametersRaw: formData.aiParameters || '',
        aiParametersParsed: parsedAiParameters.parsed,
        aiParametersParseError: parsedAiParameters.parseError
      }
    }, null, 2);
  }, [revision, project.id, formData, parsedAiParameters]);

  const handleRawDataChange = (val: string) => {
    let nextAiParameters = val;
    try {
      const parsed = JSON.parse(val);
      const neural = (parsed && typeof parsed === 'object') ? (parsed as any).neural : null;
      if (typeof neural?.aiParametersRaw === 'string') {
        nextAiParameters = neural.aiParametersRaw;
      } else if (neural?.aiParametersParsed && typeof neural.aiParametersParsed === 'object') {
        nextAiParameters = JSON.stringify(neural.aiParametersParsed, null, 2);
      } else if (typeof (parsed as any)?.aiParametersRaw === 'string') {
        nextAiParameters = (parsed as any).aiParametersRaw;
      }
    } catch {
      // Backward-compatible: allow pasting raw aiParameters directly.
    }
    setFormData({ ...formData, aiParameters: nextAiParameters });
  };
  
  useEffect(() => {
    setFormData({ 
        title: revision.title, label: revision.label || '', tags: revision.tags || '', prompt: revision.prompt,
        engine: revision.engine, note: revision.note, aiParameters: revision.aiParameters || '',
        originalFilename: revision.originalFilename || ''
    });
    loadRegistry();
  }, [revision]);

  useEffect(() => {
      if (revision.storage === 'local' && revision.fileUrl) setPreviewUrl(revision.fileUrl);
      else if (revision.blob) {
          const url = URL.createObjectURL(revision.blob);
          setPreviewUrl(url);
          return () => URL.revokeObjectURL(url);
      } else if (revision.thumbnailLink) setPreviewUrl(revision.thumbnailLink.replace('=s220', '=s1024'));
      else setPreviewUrl(null);
  }, [revision]);

  const loadRegistry = async () => {
    try {
        const models = await loadDynamicRegistry();
        setEngines(models);
    } catch (e) {}
  };

  const handleLinkReference = async (ids: string[]) => {
    setIsSubmitting(true);
    try {
        const params = formData.aiParameters ? JSON.parse(formData.aiParameters) : {};
        const adv = params.advanced_params || params;
        const currentRefs = adv.referenceItemIds || [];
        const nextRefs = [...new Set([...currentRefs, ...ids])];
        const updatedParams = { ...params, advanced_params: { ...(params.advanced_params || adv), referenceItemIds: nextRefs } };
        const newParamsStr = JSON.stringify(updatedParams, null, 2);
        setFormData({ ...formData, aiParameters: newParamsStr });
        await api.revisions.update({ ...revision, aiParameters: newParamsStr });
        onUpdate();
        setIsSelectorOpen(false);
    } catch (e) {} finally { setIsSubmitting(false); }
  };

  const handleUnlinkReference = async (idToRemove: string) => {
    try {
        const params = JSON.parse(formData.aiParameters);
        const adv = params.advanced_params || params;
        const nextRefs = (adv.referenceItemIds || []).filter((id: string) => id !== idToRemove);
        const nextReferenceItemId = adv.referenceItemId === idToRemove ? null : (adv.referenceItemId || null);
        const updatedParams = {
            ...params,
            ...(params.referenceItemId === idToRemove ? { referenceItemId: null } : {}),
            advanced_params: {
                ...(params.advanced_params || adv),
                referenceItemIds: nextRefs,
                referenceItemId: nextReferenceItemId
            }
        };
        const newParamsStr = JSON.stringify(updatedParams, null, 2);
        setFormData({ ...formData, aiParameters: newParamsStr });
        await api.revisions.update({ ...revision, aiParameters: newParamsStr });
        onUpdate();
    } catch (e) {}
  };

  const handleReplaceFile = async (file: File) => {
      setIsSubmitting(true);
      try {
          await api.revisions.replaceFile(revision.id, file);
          onUpdate(); onRefreshHistory?.();
      } catch (e) {} finally { setIsSubmitting(false); setIsDragging(false); dragCounter.current = 0; }
  };

  const handleCommitRefinement = async (base64: string, mimeType: string, newPrompt: string, engine: string, metadata: any) => {
    setIsSubmitting(true);
    try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: mimeType});
        const subtype = mimeType.split('/')[1]?.split(';')[0] || '';
        const ext = subtype ? subtype.toLowerCase() : 'bin';
        await api.revisions.add(revision.itemId, new File([blob], `Refinement_${Date.now()}.${ext}`, {type: mimeType}), { 
            title: `Iterated v${revision.versionNumber}`, prompt: newPrompt, 
            engine, aiParameters: JSON.stringify(metadata, null, 2),
            secondaryFiles: revision.secondaryFiles || []
        });
        onUpdate(); onRefreshHistory?.();
        onClose();
    } catch (e) {} finally { setIsSubmitting(false); }
  };

  const handleRestoreHead = async () => {
    const promoteOk = await confirm({
      title: 'Promote Version',
      description: `Promote Version ${revision.versionNumber} to current head? This will replace the active version on the main dashboard.`,
      confirmLabel: 'Promote',
      tone: 'danger'
    });
    if (!promoteOk) return;
    setIsSubmitting(true);
    try {
        await api.items.restore(revision.itemId, revision.id);
        onUpdate(); 
        onClose();
    } catch (e) {
        console.error("Restoration failed", e);
    } finally { setIsSubmitting(false); }
  };

  const handleViewReference = async (refItem: ItemWithCurrentRevision) => {
    const fullItem = await api.items.get(refItem.id);
    if (fullItem) {
        onClose();
        window.location.hash = `/project/${fullItem.projectId}?itemId=${fullItem.id}`;
        window.location.reload(); 
    }
  };

  const handleArchiveRevisionLocal = async () => {
    if (isHead) {
        await alert({
          title: 'Deletion Blocked',
          description: 'The current active version cannot be deleted individually. Delete the entire item instead.',
          tone: 'danger'
        });
        return;
    }
    const deleteOk = await confirm({
        title: 'Move Version To Recycle Bin',
        description: `Move Version ${revision.versionNumber} to the recycle bin?`,
        confirmLabel: 'Move To Bin',
        tone: 'danger'
    });
    if (!deleteOk) return;
    
    setIsSubmitting(true);
    try {
        await api.revisions.archive(revision.id);
        onUpdate();
        onRefreshHistory?.();
        onClose();
    } catch (e) {
        console.error("Delete failed", e);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
        await api.revisions.update({ 
            ...revision, 
            ...formData, 
            secondaryFiles: revision.secondaryFiles || [] 
        });
        onUpdate();
        onClose();
    } catch (e) {} finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 z-[1001] flex items-center justify-center md:p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-6xl h-full md:h-[90vh] md:rounded-[3rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative ring-1 ring-white/10">
        <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
             <ItemManifestHeader 
                title={formData.title}
                onTitleChange={(v) => setFormData({...formData, title: v})}
                onClose={onClose}
                assetType={determineAssetType(revision.mimeType)}
                itemId={revision.itemId}
                onNavigateToLab={() => {}}
                onRemixToBulk={() => {}}
                onMove={() => {}}
                onArchive={() => {}}
             />

             <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 flex flex-col">
                <div className="relative group/main flex flex-col items-center justify-center flex-1 min-h-[300px]"
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }}
                    onDrop={async (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files?.[0]) await handleReplaceFile(e.dataTransfer.files[0]); else { setIsDragging(false); dragCounter.current = 0; } }}
                >
                    <div className="w-full h-full flex items-center justify-center bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden relative group shadow-inner">
                        {determineAssetType(revision.mimeType) === AssetType.IMAGE && previewUrl && <img src={previewUrl} className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-lg" referrerPolicy="no-referrer" />}
                        {isDragging && (
                            <div className="absolute inset-0 z-[70] bg-indigo-600/40 backdrop-blur-md border-4 border-dashed border-indigo-400 rounded-2xl flex flex-col items-center justify-center pointer-events-none">
                                <UploadCloud size={48} className="text-white animate-bounce" />
                                <h2 className="text-white font-black text-xl mt-4 tracking-tight uppercase">Release to Replace Binary</h2>
                            </div>
                        )}
                    </div>
                </div>

                {!isHead && (
                    <div className="p-6 bg-indigo-600/10 border border-indigo-500/30 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-bottom-4 shadow-xl mb-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-500 text-white rounded-xl shadow-lg">
                                <RotateCcw size={20} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Historical Snapshot</h4>
                                <p className="text-[10px] text-indigo-300 font-bold uppercase mt-0.5">Version {revision.versionNumber} • Read Only State</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleArchiveRevisionLocal}
                                className="bg-red-900/20 hover:bg-red-600 text-red-500 hover:text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 border border-red-500/20 flex items-center gap-2"
                            >
                                <Trash2 size={16} /> Delete Version
                            </button>
                            <button 
                                onClick={handleRestoreHead}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-2 border border-indigo-400/20"
                            >
                                <ShieldCheck size={16} /> Bump to Main
                            </button>
                        </div>
                    </div>
                )}
             </div>
        </div>

        <div className="w-full md:w-[480px] bg-[#080808] border-l border-white/5 flex flex-col overflow-hidden shadow-[-40px_0_80px_rgba(0,0,0,0.5)]">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-4 border-b border-white/5 bg-slate-900/20">
                     <div className="flex items-center gap-2 px-1">
                        <FileText size={14} className="text-indigo-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Manifest Metadata</h3>
                    </div>
                </div>
                <ItemSidebar 
                    item={{...revision, currentRevision: revision} as any} project={project} currentRev={revision} formData={formData} setFormData={setFormData}
                    secondaryFiles={revision.secondaryFiles || []} onCommitRefinement={handleCommitRefinement}
                    onLinkRequested={() => setIsSelectorOpen(true)} onUnlinkRequested={handleUnlinkReference} onDropLink={(id) => handleLinkReference([id])}
                    onViewReference={handleViewReference} onRemoveSecondary={() => {}}
                    revisions={[]} isHistoryDragging={false} onHistoryDragEnter={() => {}} onHistoryDragLeave={() => {}} onHistoryDrop={() => {}}
                    onHistoryAddClick={() => {}} onSelectRevision={() => {}} onShowParams={() => setShowParamsModal(true)}
                    engines={engines.map(e => e.id)}
                    showHistory={false}
                    showRefinement={!isHead}
                    showManifest={true}
                />
            </div>
            <ItemActionFooter 
                onClose={onClose} 
                onSave={handleSave} 
                onArchive={handleArchiveRevisionLocal} 
                isSubmitting={isSubmitting} 
                canSave={!!formData.title}
            />
        </div>
      </div>
    </div>
    
    {isSelectorOpen && (
      <ArtifactSelectorModal
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        ingestContext="reference"
        onSelect={handleLinkReference}
      />
    )}
    <GenerationDataModal isOpen={showParamsModal} onClose={() => setShowParamsModal(false)} data={rawDataEnvelope} onDataChange={handleRawDataChange} />
    {confirmDialog}
    {alertDialog}
    </>
  );
};
export default RevisionDetailModal;
