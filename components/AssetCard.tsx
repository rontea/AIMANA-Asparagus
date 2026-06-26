import React, { useState, useEffect, useRef, useMemo } from 'react';
/* Importing useNavigate from core package to fix named export issue */
import { useLocation, useNavigate } from 'react-router';
import { ItemWithCurrentRevision, AssetType } from '../types';
import { determineAssetType } from '../services/db';
import { File, FileImage, FileVideo, FileAudio, Trash2, Bot, Sparkles, Clock, Archive, RefreshCw, Cloud, Pin, PinOff, CheckCircle2, ExternalLink, MoreVertical, FolderPlus, Maximize2, MessageSquareOff, Zap, Upload, Box, AlertTriangle, Info, Link2, Crown, SendToBack, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { getAssetLaunchExtensionsForItem } from '../extensions/registry';
import { toPromptDraft } from './prompt-manager/utils';

const AUDIO_WAVEFORM_BARS = [10, 18, 12, 20, 14, 24, 11, 17, 22, 13, 19, 15];

interface AssetCardProps {
  item: ItemWithCurrentRevision;
  onClick: () => void;
  onAnalyze?: (item: ItemWithCurrentRevision) => void;
  onArchive?: (item: ItemWithCurrentRevision) => void;
  onRestore?: (item: ItemWithCurrentRevision) => void;
  onDelete?: (item: ItemWithCurrentRevision) => void;
  onPinToggle?: (item: ItemWithCurrentRevision) => void;
  onMove?: (item: ItemWithCurrentRevision) => void;
  onMoveToCollection?: (item: ItemWithCurrentRevision) => void;
  onSetCollectionThumbnail?: (item: ItemWithCurrentRevision) => void;
  onRemixToBulk?: (item: ItemWithCurrentRevision) => void;
  onInspectInfo?: (item: ItemWithCurrentRevision) => void;
  confirmDeleteId?: string | null;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent, id: string) => void;
  viewType?: 'grid' | 'list' | 'gallery';
  contextBadge?: string;
  contextBadges?: string[];
  isReferencedIn?: boolean;
  isCollectionThumbnail?: boolean;
}

const AssetCard: React.FC<AssetCardProps> = ({ 
    item, onClick, onArchive, onRestore, onDelete, onPinToggle, onMove, onMoveToCollection, onSetCollectionThumbnail, onRemixToBulk, onInspectInfo,
    isSelected, onToggleSelect, viewType = 'grid', contextBadge, contextBadges, isReferencedIn = false, isCollectionThumbnail = false
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [sourceProjectName, setSourceProjectName] = useState<string | null>(null);
  const [isMovingPromptToStaging, setIsMovingPromptToStaging] = useState(false);
  const previewFallbacksRef = useRef<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const rev = item.currentRevision;
  const assetType = rev ? determineAssetType(rev.mimeType) : AssetType.UNKNOWN;
  const currentUser = api.auth.getUser();
  const launchExtensions = useMemo(
    () => getAssetLaunchExtensionsForItem(assetType, item.id, currentUser),
    [assetType, item.id, currentUser?.id, currentUser?.role]
  );

  const resolvePreviewUrls = (currentRev: typeof rev, currentAssetType: AssetType): string[] => {
    if (!currentRev) return [];
    const candidates: string[] = [];
    if (currentAssetType === AssetType.AUDIO) {
      if (currentRev.fileUrl) candidates.push(currentRev.fileUrl);
    } else {
      if (currentRev.thumbnailLink) candidates.push(currentRev.thumbnailLink);
      if (currentRev.fileUrl) candidates.push(currentRev.fileUrl);
    }
    try {
      if (currentRev.aiParameters) {
        const parsed = JSON.parse(currentRev.aiParameters);
        const adv = parsed?.advanced_params || parsed || {};
        if (typeof adv.parentItemThumbnail === 'string' && adv.parentItemThumbnail.trim()) {
          candidates.push(adv.parentItemThumbnail);
        }
      }
    } catch (e) {}
    return Array.from(new Set(candidates.filter(Boolean)));
  };

  const isReferenceArtifact = (currentRev: typeof rev) => {
    if (!currentRev) return false;
    if (currentRev.engine === 'reference' || currentRev.engine === 'reference-upload') return true;
    if (currentRev.fileUrl?.includes('/Neural_Reference/')) return true;
    try {
      const parsed = currentRev.aiParameters ? JSON.parse(currentRev.aiParameters) : {};
      const adv = parsed?.advanced_params || parsed || {};
      return !!(
        (adv.isReference && !adv.parentItemId) ||
        adv.referenceAsset === true ||
        adv.source === 'reference_upload' ||
        adv.source === 'reference_drop' ||
        (typeof adv.source === 'string' && adv.source.startsWith('selector_ingest'))
      );
    } catch (e) {
      return false;
    }
  };

  // Provenance Logic
  const isReference = isReferenceArtifact(rev);
  const isProtectedReference = isReference && item.isArchived;
  const isAiGenerated = rev?.prompt && rev.engine !== 'other-model' && rev.engine !== 'default-placeholder' && !isReference;
  const hasNoPrompt = !rev?.prompt || rev.prompt.trim() === '';
  const hasLinkedArtifacts = Array.isArray(rev?.secondaryFiles) && rev.secondaryFiles.length > 0;
  const normalizedContextBadges = Array.from(new Set([...(contextBadges || []), ...(contextBadge ? [contextBadge] : [])]));
  const displayRoleBadges = [...normalizedContextBadges];
  if (isReference && !displayRoleBadges.includes('Reference Image') && !displayRoleBadges.includes('Forge')) {
    displayRoleBadges.push('Reference Image');
  }
  const activeProjectId = useMemo(() => {
    const match = location.pathname.match(/^\/project\/([^/?#]+)/);
    return match?.[1] || null;
  }, [location.pathname]);
  const showCrossProjectForgeLink = displayRoleBadges.includes('Forge') && !!activeProjectId && item.projectId !== activeProjectId;
  const audioDescriptor = useMemo(() => {
    if (!rev?.aiParameters) return '';
    try {
      const parsed = JSON.parse(rev.aiParameters);
      const adv = parsed?.advanced_params || parsed || {};
      return String(adv.voiceName || adv.voice || adv.audioModel || '').trim();
    } catch (e) {
      return '';
    }
  }, [rev?.aiParameters]);
  const isThumbnailBlurEnabled = useMemo(() => {
    if (!rev?.aiParameters) return false;
    try {
      const parsed = JSON.parse(rev.aiParameters);
      const adv = parsed?.advanced_params || parsed || {};
      return !!(adv.thumbnailBlur || parsed?.thumbnailBlur);
    } catch (e) {
      return false;
    }
  }, [rev?.aiParameters]);
  const thumbnailBlurClass = isThumbnailBlurEnabled ? 'blur-md' : '';

  useEffect(() => {
    if (!rev) {
      setObjectUrl(null);
      previewFallbacksRef.current = [];
      return;
    }

    const resolved = resolvePreviewUrls(rev, assetType);
    if (resolved.length > 0) {
      setObjectUrl(resolved[0]);
      previewFallbacksRef.current = resolved.slice(1);
      return;
    }

    if (rev.blob) {
      const url = URL.createObjectURL(rev.blob);
      setObjectUrl(url);
      previewFallbacksRef.current = [];
      return () => URL.revokeObjectURL(url);
    }

    previewFallbacksRef.current = [];
    setObjectUrl(null);
  }, [rev, assetType]);

  const handlePreviewError = () => {
    const next = previewFallbacksRef.current.shift();
    if (next) {
      setObjectUrl(next);
      return;
    }
    setObjectUrl(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!showCrossProjectForgeLink) {
      setSourceProjectName(null);
      return;
    }

    api.projects.get(item.projectId)
      .then((project) => {
        if (!cancelled) {
          setSourceProjectName(project?.name || 'Project Forge');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSourceProjectName('Project Forge');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item.projectId, showCrossProjectForgeLink]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getIcon = (size = 24) => {
    switch (assetType) {
      case AssetType.IMAGE: return <FileImage size={size} className="text-purple-400" />;
      case AssetType.VIDEO: return <FileVideo size={size} className="text-rose-400" />;
      case AssetType.AUDIO: return <FileAudio size={size} className="text-emerald-400" />;
      default: return <File size={size} className="text-slate-400" />;
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!rev) return;
    e.dataTransfer.setData('application/x-aimana-asset', item.id);
    const rawUrl = rev.fileUrl || (rev.blob ? URL.createObjectURL(rev.blob) : '');
    if (rawUrl) {
        const absoluteUrl = rawUrl.startsWith('http') ? rawUrl : window.location.origin + rawUrl;
        e.dataTransfer.setData('text/uri-list', absoluteUrl);
        e.dataTransfer.setData('text/plain', absoluteUrl);
        const dragData = `${rev.mimeType}:${rev.originalFilename}:${absoluteUrl}`;
        e.dataTransfer.setData('DownloadURL', dragData);
    }
  };

  const handleMenuAction = (e: React.MouseEvent, action: () => void) => {
      e.stopPropagation();
      setShowMenu(false);
      action();
  };
  const notifyPromptStaging = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      window.dispatchEvent(new CustomEvent('aimana-notification', {
          detail: {
              title: 'Prompt Manager',
              message,
              type
          }
      }));
  };
  const handleMovePromptToStaging = async () => {
      const prompt = String(rev?.prompt || '').trim();
      if (!prompt) {
          notifyPromptStaging('This item does not have prompt text to move.', 'error');
          return;
      }

      setIsMovingPromptToStaging(true);
      try {
          const draft = toPromptDraft({ prompt, source: 'manual' });
          await api.settings.appendPromptManagerDrafts([draft]);
          window.dispatchEvent(new CustomEvent('aimana-prompt-drafts-updated'));
          notifyPromptStaging('Moved this item prompt to Prompt Manager staging.');
      } catch (error: any) {
          notifyPromptStaging(error?.message || 'Failed to move item prompt to Prompt Manager staging.', 'error');
      } finally {
          setIsMovingPromptToStaging(false);
      }
  };
  const stopCardClick = (e: React.SyntheticEvent) => {
      e.stopPropagation();
  };

  // Improved Null Safety: Renders a "Manifest Missing" state instead of a generic red error
  if (!rev) {
      if (viewType === 'list') {
          return (
              <div
                onClick={onClick}
                className={`group flex items-center gap-6 px-5 py-6 min-h-[168px] border-b border-slate-800 bg-slate-900/40 transition-colors ${isSelected ? 'border-indigo-500/40 bg-indigo-500/5' : 'hover:bg-slate-900/70'}`}
              >
                  {onToggleSelect ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(e, item.id); }}
                        className={`w-10 flex justify-center`}
                      >
                          <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full border-2 ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 text-transparent hover:border-indigo-400'}`}>
                              <CheckCircle2 size={14} />
                          </span>
                      </button>
                  ) : (
                      <div className="w-10" />
                  )}
                  <div className="w-32 h-32 rounded-2xl border border-slate-700 bg-slate-900 flex items-center justify-center">
                      <AlertTriangle size={16} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-200 truncate">Broken Manifest</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest">Current HEAD revision missing</div>
                  </div>
                  <div className="w-24 hidden md:flex items-center text-[10px] text-slate-500 uppercase">file</div>
                  <div className="w-24 hidden md:flex items-center text-[10px] text-slate-500">—</div>
                  <div className="w-24 hidden lg:flex items-center text-[10px] text-slate-500">—</div>
                  <div className="w-24 flex justify-end">
                      <button onClick={(e) => handleMenuAction(e, () => onDelete?.(item))} className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-widest">Purge</button>
                  </div>
              </div>
          );
      }
      return (
          <div 
            onClick={onClick}
            className={`group relative bg-slate-900 border-2 border-dashed rounded-xl flex flex-col h-full cursor-pointer transition-all ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-800 hover:border-red-500/40'}`}
          >
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4 opacity-50 group-hover:opacity-100 transition-opacity">
                  <div className="p-4 bg-red-900/10 rounded-full text-red-500">
                    <AlertTriangle size={32} />
                  </div>
                  <div>
                      <h3 className="text-xs font-black text-white uppercase tracking-widest">Broken Manifest</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 leading-tight">Current HEAD revision missing</p>
                  </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-between items-center">
                  <span className="text-[8px] font-mono text-slate-700">NODE_{item.id.substring(0, 8)}</span>
                  <button onClick={(e) => handleMenuAction(e, () => onDelete?.(item))} className="text-[8px] font-black text-red-500 hover:text-red-400 uppercase tracking-widest underline">Purge Orphan</button>
              </div>
          </div>
      );
  }

  const mimeLabel = rev.mimeType?.split('/')[1] || 'FILE';

  if (viewType === 'list') {
      const modifiedTimestamp = item.updatedAt || rev.createdAt || item.createdAt;
      const modifiedLabel = new Date(modifiedTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      return (
          <div
            onClick={onClick}
            draggable
            onDragStart={handleDragStart}
            className={`group flex items-center gap-6 px-5 py-6 min-h-[168px] border-b border-slate-800 bg-slate-900/40 transition-colors ${isSelected ? 'border-indigo-500/40 bg-indigo-500/5' : 'hover:bg-slate-900/70'}`}
          >
              {onToggleSelect ? (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(e, item.id); }}
                    className="w-10 flex justify-center"
                  >
                      <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full border-2 ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 text-transparent hover:border-indigo-400'}`}>
                          <CheckCircle2 size={14} />
                      </span>
                  </button>
              ) : (
                  <div className="w-10" />
              )}

              <div className="w-32 h-32 rounded-2xl border border-slate-700 bg-slate-900 flex items-center justify-center overflow-hidden">
                  {assetType === AssetType.IMAGE && objectUrl ? (
                      <img
                        src={objectUrl}
                        alt={rev.title}
                        onError={handlePreviewError}
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        className={`w-full h-full object-cover ${thumbnailBlurClass}`}
                        referrerPolicy="no-referrer"
                      />
                  ) : assetType === AssetType.VIDEO && objectUrl ? (
                      rev.storage === 'google-drive'
                        ? <img src={objectUrl} onError={handlePreviewError} className={`w-full h-full object-cover ${thumbnailBlurClass}`} draggable={false} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        : <video src={objectUrl} poster={rev.thumbnailLink || undefined} className={`w-full h-full object-cover ${thumbnailBlurClass}`} draggable={false} preload="metadata" muted playsInline onError={handlePreviewError} />
                  ) : assetType === AssetType.AUDIO ? (
                      <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-emerald-500/12 via-slate-950 to-slate-900 p-3 text-left">
                          <div className="flex items-center justify-between gap-2">
                              <span className="text-[8px] font-black uppercase tracking-[0.28em] text-emerald-300">Audio</span>
                              <FileAudio size={16} className="shrink-0 text-emerald-400" />
                          </div>
                          <div className="flex h-10 items-end gap-1">
                              {AUDIO_WAVEFORM_BARS.map((bar, index) => (
                                  <span
                                    key={`${item.id}-list-audio-bar-${index}`}
                                    className="w-1 flex-1 rounded-full bg-gradient-to-t from-emerald-500/40 to-emerald-300/90"
                                    style={{ height: `${bar}px` }}
                                  />
                              ))}
                          </div>
                          <div className="space-y-1">
                              <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-500">
                                  {audioDescriptor || 'Playable preview'}
                              </div>
                              <div className="text-[9px] font-semibold uppercase text-slate-300">{mimeLabel}</div>
                          </div>
                      </div>
                  ) : (
                      <div className="text-slate-600">{getIcon(16)}</div>
                  )}
              </div>

              <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-200 truncate" title={rev.title}>{rev.title}</h3>
                      {hasLinkedArtifacts && (
                          <span
                            className="inline-flex items-center justify-center p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50"
                            title="Has Linked Artifacts"
                          >
                              <Box size={10} />
                          </span>
                      )}
                      {isCollectionThumbnail && (
                          <span
                            className="inline-flex items-center justify-center p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50"
                            title="Collection Thumbnail"
                          >
                              <Crown size={10} />
                          </span>
                      )}
                      {isReferencedIn && (
                          <span
                            className="inline-flex items-center justify-center p-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                            title="Referenced in other items/generations"
                          >
                              <Link2 size={10} />
                          </span>
                      )}
                      {rev.versionNumber > 1 && (
                          <span className="text-[9px] font-bold text-white bg-indigo-600/90 px-1.5 py-0.5 rounded uppercase">v{rev.versionNumber}</span>
                      )}
                      {rev.storage === 'google-drive' && (
                          <span className="text-[9px] font-bold text-white bg-blue-600/90 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                              <Cloud size={10} /> Drive
                          </span>
                      )}
                  </div>
                  {displayRoleBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                          {displayRoleBadges.slice(0, 3).map((badge) => (
                              <span key={`${item.id}-list-${badge}`} className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tight ${
                                  badge === 'Linked Artifacts' ? 'bg-amber-600/90 text-white' :
                                  badge === 'Neural References' ? 'bg-cyan-600/90 text-white' :
                                  badge === 'Reference Image' ? 'bg-emerald-600/90 text-white' :
                                  badge === 'Forge' ? 'bg-indigo-600/90 text-white' :
                                  'bg-indigo-600/90 text-white'
                              }`}>
                                  {badge}
                              </span>
                          ))}
                          {displayRoleBadges.length > 3 && (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tight bg-slate-700 text-slate-200">
                                  +{displayRoleBadges.length - 3}
                              </span>
                          )}
                      </div>
                  )}
                  {assetType === AssetType.AUDIO && objectUrl && (
                      <div
                        className="mt-3 rounded-2xl border border-emerald-500/20 bg-slate-950/80 p-3 shadow-inner"
                        onClick={stopCardClick}
                        onMouseDown={stopCardClick}
                      >
                          <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                  <div className="text-[9px] font-black uppercase tracking-[0.28em] text-emerald-300">Audio Preview</div>
                                  <div className="truncate text-[10px] text-slate-400">
                                      {audioDescriptor || 'Native player controls'}
                                  </div>
                              </div>
                              <FileAudio size={14} className="shrink-0 text-emerald-400" />
                          </div>
                          <audio src={objectUrl} controls preload="metadata" className="h-10 w-full accent-emerald-400" />
                      </div>
                  )}
              </div>

              <div className="w-24 hidden md:flex items-center text-[10px] text-slate-400 uppercase tracking-widest">{mimeLabel}</div>
              <div className="w-24 hidden md:flex items-center text-[10px] text-slate-400">{formatSize(rev.size)}</div>
              <div className="w-24 hidden lg:flex items-center text-[10px] text-slate-400">{modifiedLabel}</div>

              <div className="w-24 flex justify-end gap-2 relative" ref={menuRef}>
                  {onInspectInfo && (
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInspectInfo(item); }} className="p-2 bg-slate-900/60 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg backdrop-blur-sm shadow-sm" title="Inspect Asset">
                          <Info size={14} />
                      </button>
                  )}
                  {onRestore && item.isArchived && (
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRestore(item); }} className="p-2 bg-slate-900/60 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg backdrop-blur-sm shadow-sm" title="Restore Asset">
                          <RefreshCw size={14} />
                      </button>
                  )}
                  {onPinToggle && !item.isArchived && (
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPinToggle(item); }} className={`p-2 rounded-lg transition-all ${item.isPinned ? 'bg-indigo-500 text-white' : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-700'}`} title={item.isPinned ? "Unpin Asset" : "Pin Asset"}>
                          {item.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className={`p-2 rounded-lg backdrop-blur-sm shadow-sm transition-all ${showMenu ? 'bg-indigo-600 text-white' : 'bg-slate-900/60 hover:bg-slate-700 text-slate-300'}`}>
                      <MoreVertical size={14} />
                  </button>
                  {showMenu && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in slide-in-from-top-2">
                          {launchExtensions.map((extension) => {
                              const Icon = extension.icon;
                              return (
                                  <button key={extension.id} onClick={(e) => handleMenuAction(e, () => navigate(extension.href)) } className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 ${extension.actionClassName}`}>
                                      <Icon size={14} /> {extension.label}
                                  </button>
                              );
                          })}
                          {onRemixToBulk && !isReference && (
                              <button onClick={(e) => handleMenuAction(e, () => onRemixToBulk(item)) } className="w-full text-left px-4 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2">
                                  <Zap size={14} /> Remix to Bulk
                              </button>
                          )}
                          {!hasNoPrompt && (
                              <button onClick={(e) => handleMenuAction(e, () => { void handleMovePromptToStaging(); })} disabled={isMovingPromptToStaging} className="w-full text-left px-4 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-wait disabled:opacity-60 flex items-center gap-2">
                                  {isMovingPromptToStaging ? <Loader2 size={14} className="animate-spin" /> : <SendToBack size={14} />}
                                  Move Prompt To Staging
                              </button>
                          )}
                          {onMove && !isProtectedReference && (
                              <button onClick={(e) => handleMenuAction(e, () => onMove(item))} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                                  <FolderPlus size={14} /> Move to Project
                              </button>
                          )}
                          {onMoveToCollection && !isProtectedReference && (
                              <button onClick={(e) => handleMenuAction(e, () => onMoveToCollection(item))} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                                  <FolderPlus size={14} /> Move to Collection
                              </button>
                          )}
                          {onSetCollectionThumbnail && item.collectionId && !item.isArchived && (
                              <button onClick={(e) => handleMenuAction(e, () => onSetCollectionThumbnail(item))} className="w-full text-left px-4 py-2 text-xs text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-2">
                                  <Sparkles size={14} /> Set Main Thumbnail
                              </button>
                          )}
                          {onArchive && !item.isArchived && (
                            <button onClick={(e) => handleMenuAction(e, () => onArchive(item))} className="w-full text-left px-4 py-2 text-xs text-amber-400 hover:bg-amber-900/20 flex items-center gap-2">
                                <Trash2 size={14} /> Delete Asset
                            </button>
                          )}
                          {onDelete && (
                            <button onClick={(e) => handleMenuAction(e, () => onDelete(item))} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-400/10 flex items-center gap-2">
                                <Trash2 size={14} /> Delete Forever
                            </button>
                          )}
                      </div>
                  )}
              </div>
          </div>
      );
  }

  return (
    <div 
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      className={`group relative bg-slate-800 border rounded-xl overflow-hidden transition-all flex flex-col h-full cursor-pointer ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-indigo-900/40' : 'border-slate-700 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-900/20'}`}
    >
      {onToggleSelect && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(e, item.id); }} className={`absolute top-2 left-2 z-40 p-1 rounded-full transition-all duration-200 border-2 ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/60 border-slate-500 text-transparent hover:border-indigo-400 group-hover:bg-slate-800'}`}>
              <CheckCircle2 size={16} />
          </button>
      )}

      <div className={`absolute top-2 z-30 flex gap-1 items-center ${onToggleSelect ? 'left-10' : 'left-2'}`}>
          {onPinToggle && !item.isArchived && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPinToggle(item); }} className={`p-1.5 rounded-full shadow-lg transition-all transform active:scale-90 ${item.isPinned ? 'bg-indigo-500 text-white scale-110 opacity-100' : 'bg-slate-900/80 text-slate-400 opacity-40 group-hover:opacity-100 hover:bg-slate-700 hover:text-white'}`} title={item.isPinned ? "Unpin Asset" : "Pin Asset"}>
                <Pin size={12} className={item.isPinned ? 'fill-current' : ''} />
            </button>
          )}
          <div className="flex gap-1">
              {isCollectionThumbnail && (
                  <div className="bg-amber-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm pointer-events-none flex items-center gap-1">
                      <Crown size={10} className="fill-current" /> Main
                  </div>
              )}
              {rev.versionNumber > 1 && <div className="bg-indigo-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm pointer-events-none">v{rev.versionNumber}</div>}
              {rev.storage === 'google-drive' && <div className="bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm pointer-events-none flex items-center"><Cloud size={10} className="mr-0.5" /> Drive</div>}
          </div>
      </div>

      <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200" ref={menuRef}>
          {onInspectInfo && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInspectInfo(item); }} className="p-2 bg-slate-900/60 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg backdrop-blur-sm shadow-sm" title="Inspect Asset">
                <Info size={14} />
            </button>
          )}
          {onRestore && item.isArchived && (
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRestore(item); }} className="p-2 bg-slate-900/60 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg backdrop-blur-sm shadow-sm" title="Restore Asset">
                <RefreshCw size={14} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className={`p-2 rounded-lg backdrop-blur-sm shadow-sm transition-all ${showMenu ? 'bg-indigo-600 text-white' : 'bg-slate-900/60 hover:bg-slate-700 text-slate-300'}`}>
              <MoreVertical size={14} />
          </button>
          {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden animate-in slide-in-from-top-2">
                  {launchExtensions.map((extension) => {
                      const Icon = extension.icon;
                      return (
                          <button key={extension.id} onClick={(e) => handleMenuAction(e, () => navigate(extension.href)) } className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 ${extension.actionClassName}`}>
                              <Icon size={14} /> {extension.label}
                          </button>
                      );
                  })}
                  {onRemixToBulk && !isReference && (
                      <button onClick={(e) => handleMenuAction(e, () => onRemixToBulk(item)) } className="w-full text-left px-4 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2">
                          <Zap size={14} /> Remix to Bulk
                      </button>
                  )}
                  {!hasNoPrompt && (
                      <button onClick={(e) => handleMenuAction(e, () => { void handleMovePromptToStaging(); })} disabled={isMovingPromptToStaging} className="w-full text-left px-4 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-wait disabled:opacity-60 flex items-center gap-2">
                          {isMovingPromptToStaging ? <Loader2 size={14} className="animate-spin" /> : <SendToBack size={14} />}
                          Move Prompt To Staging
                      </button>
                  )}
                  {onMove && !isProtectedReference && (
                      <button onClick={(e) => handleMenuAction(e, () => onMove(item))} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                          <FolderPlus size={14} /> Move to Project
                      </button>
                  )}
                  {onMoveToCollection && !isProtectedReference && (
                      <button onClick={(e) => handleMenuAction(e, () => onMoveToCollection(item))} className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                          <FolderPlus size={14} /> Move to Collection
                      </button>
                  )}
                  {onSetCollectionThumbnail && item.collectionId && !item.isArchived && (
                      <button onClick={(e) => handleMenuAction(e, () => onSetCollectionThumbnail(item))} className="w-full text-left px-4 py-2 text-xs text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-2">
                          <Sparkles size={14} /> Set Main Thumbnail
                      </button>
                  )}
                  {onArchive && !item.isArchived && (
                    <button onClick={(e) => handleMenuAction(e, () => onArchive(item))} className="w-full text-left px-4 py-2 text-xs text-amber-400 hover:bg-amber-900/20 flex items-center gap-2">
                        <Trash2 size={14} /> Delete Asset
                    </button>
                  )}
                  {onDelete && (
                    <button onClick={(e) => handleMenuAction(e, () => onDelete(item))} className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-400/10 flex items-center gap-2">
                        <Trash2 size={14} /> Delete Forever
                    </button>
                  )}
              </div>
          )}
      </div>

      <div className="aspect-square bg-slate-900 w-full relative flex items-center justify-center overflow-hidden checkerboard-bg">
        {assetType === AssetType.IMAGE && objectUrl ? (
          <img
            src={objectUrl}
            alt={rev.title}
            onError={handlePreviewError}
            draggable={false}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${thumbnailBlurClass}`}
            referrerPolicy="no-referrer"
          />
        ) : assetType === AssetType.VIDEO && objectUrl ? (
          rev.storage === 'google-drive'
            ? <img src={objectUrl} onError={handlePreviewError} className={`w-full h-full object-cover ${thumbnailBlurClass}`} draggable={false} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" />
            : <video src={objectUrl} poster={rev.thumbnailLink || undefined} className={`w-full h-full object-cover ${thumbnailBlurClass}`} draggable={false} preload="metadata" muted playsInline onError={handlePreviewError} />
        ) : assetType === AssetType.AUDIO && objectUrl ? (
          <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.75)_0%,rgba(2,6,23,0.95)_100%)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-300">Audio</div>
                <div className="mt-2 line-clamp-2 text-sm font-semibold text-white">{rev.title}</div>
                <div className="mt-1 truncate text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  {audioDescriptor || mimeLabel}
                </div>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-950/20">
                <FileAudio size={20} />
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex h-16 items-end gap-1.5">
                {AUDIO_WAVEFORM_BARS.map((bar, index) => (
                    <span
                      key={`${item.id}-grid-audio-bar-${index}`}
                      className="flex-1 rounded-full bg-gradient-to-t from-emerald-500/35 via-emerald-300/80 to-emerald-100"
                      style={{ height: `${bar + 8}px` }}
                    />
                ))}
              </div>
              <div
                className="rounded-2xl border border-white/10 bg-slate-950/75 p-2 backdrop-blur-sm"
                onClick={stopCardClick}
                onMouseDown={stopCardClick}
              >
                <audio src={objectUrl} controls preload="metadata" className="h-10 w-full accent-emerald-400" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
             <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-2 border border-slate-700 group-hover:border-amber-500/50 transition-colors">
               {getIcon()}
             </div>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        {/* Manifest Required Alert - Relocated for mobile accessibility */}
        {hasNoPrompt && !isReference && (
            <div className="mb-3 bg-amber-500/10 text-amber-500 text-[10px] font-black px-2 py-1 rounded-lg border border-amber-500/20 flex items-center w-fit uppercase tracking-widest animate-pulse">
                <MessageSquareOff size={12} className="mr-1.5" /> Manifest Required
            </div>
        )}

        <div className="flex items-start justify-between mb-2">
           <div className="flex items-center space-x-2 overflow-hidden w-full">
             <div className="shrink-0 transition-transform group-hover:scale-110 duration-200">{getIcon()}</div>
             <h3 className="font-medium text-slate-200 truncate text-sm flex-1" title={rev.title}>{rev.title}</h3>
           </div>
        </div>
        <div className="text-xs text-slate-500 mb-3 flex items-center justify-between">
           <span>{formatSize(rev.size)}</span>
           <span className="uppercase">{rev.mimeType.split('/')[1] || 'FILE'}</span>
        </div>
        <div className="mt-auto pt-3 border-t border-slate-700/50 space-y-2">
            {isAiGenerated ? (
                <div className="space-y-0.5">
                    <div className="flex items-center text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                         <Sparkles size={10} className="mr-1.5" />
                         <span>AI Prompt</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate pl-4 opacity-80" title={rev.engine}>
                        {rev.engine?.replace('pollinations-', '').replace('gemini-', '') || 'Neural Node'}
                    </div>
                </div>
            ) : isReference ? (
                <div className="space-y-0.5">
                    <div className="flex items-center text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                         <Box size={10} className="mr-1.5" />
                         <span>Reference Artifact</span>
                    </div>
                    <div className="text-[9px] text-slate-500 italic truncate pl-4 opacity-80">
                        Source Material
                    </div>
                </div>
            ) : (
                <div className="space-y-0.5">
                    <div className="flex items-center text-slate-400 text-[10px] font-black uppercase tracking-widest">
                         <Upload size={10} className="mr-1.5" />
                         <span>Local Upload</span>
                    </div>
                    {rev.note && (
                        <div className="text-[9px] text-slate-600 italic truncate pl-4">
                            {rev.note}
                        </div>
                    )}
                </div>
            )}
            {showCrossProjectForgeLink && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/project/${item.projectId}?itemId=${encodeURIComponent(item.id)}`);
                    }}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-left transition-all hover:border-indigo-400/40 hover:bg-indigo-500/10"
                    title={`Open ${sourceProjectName || 'source project'} item view`}
                >
                    <div className="min-w-0">
                        <div className="flex items-center text-[9px] font-black uppercase tracking-widest text-indigo-300">
                            <FolderPlus size={10} className="mr-1.5" />
                            <span>Located In</span>
                        </div>
                        <div className="truncate pl-4 text-[10px] font-semibold text-slate-200">
                            {sourceProjectName || 'Loading source project...'}
                        </div>
                    </div>
                    <ExternalLink size={12} className="shrink-0 text-indigo-300" />
                </button>
            )}
            {displayRoleBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                    {displayRoleBadges.map((badge) => (
                        <div key={badge} className={`text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm pointer-events-none flex items-center uppercase tracking-tighter ${
                            badge === 'Linked Artifacts' ? 'bg-amber-600/90' :
                            badge === 'Neural References' ? 'bg-cyan-600/90' :
                            badge === 'Reference Image' ? 'bg-emerald-600/90' :
                            badge === 'Forge' ? 'bg-indigo-600/90' :
                            'bg-indigo-600/90'
                        }`}>
                            <Sparkles size={10} className="mr-1" /> {badge}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center justify-between text-slate-500 text-[10px] pt-1" title={`Added on ${new Date(item.createdAt).toLocaleString()}`}>
                <div className="flex items-center">
                    <Clock size={10} className="mr-1.5" />
                    <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-1">
                    {hasLinkedArtifacts && (
                        <span
                            className="inline-flex items-center justify-center p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50"
                            title="Has Linked Artifacts"
                        >
                            <Box size={10} />
                        </span>
                    )}
                    {isReferencedIn && (
                        <span
                            className="inline-flex items-center justify-center p-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                            title="Referenced in other items/generations"
                        >
                            <Link2 size={10} />
                        </span>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AssetCard;
