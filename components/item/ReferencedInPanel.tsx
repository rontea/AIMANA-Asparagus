import React from 'react';
import { ChevronDown, ExternalLink, FileImage, Link2, Maximize2 } from 'lucide-react';
import { ReferenceUsage } from '../../types';

interface ReferencedInPanelProps {
  itemId?: string;
  references: ReferenceUsage[];
  isLoading: boolean;
  onOpen: (itemId: string) => void;
  onOpenGallery?: () => void;
  onOpenReferenceImageGallery?: () => void;
}

const relationLabel = (kind: ReferenceUsage['relationKind']) => {
  if (kind === 'both') return 'Linked + Neural';
  if (kind === 'linked') return 'Linked Artifact';
  if (kind === 'reference_image') return 'Reference Image';
  return 'Neural Reference';
};

export const ReferencedInPanel: React.FC<ReferencedInPanelProps> = ({ itemId, references, isLoading, onOpen, onOpenGallery, onOpenReferenceImageGallery }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(true);
  const referenceImageUsageCount = React.useMemo(
    () => references.filter((ref) => ref.relationKind === 'reference_image').length,
    [references]
  );

  React.useEffect(() => {
    setIsCollapsed(true);
  }, [itemId]);

  return (
    <section className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-indigo-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Referenced In</h3>
          {references.length > 0 && !isLoading && (
            <span
              className="inline-flex items-center justify-center p-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
              title="Has Referenced In links"
            >
              <Link2 size={10} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {references.length > 0 && !isLoading && onOpenGallery && (
            <button
              type="button"
              onClick={onOpenGallery}
              className="text-[10px] font-black uppercase text-indigo-400 hover:text-white flex items-center gap-1.5 transition-colors group px-2 py-1 bg-indigo-500/5 rounded-lg border border-indigo-500/10"
              title="Full Manifest Gallery"
            >
              <Maximize2 size={12} className="group-hover:scale-110 transition-transform" />
              Full Manifest Gallery
            </button>
          )}
          {referenceImageUsageCount > 0 && !isLoading && onOpenReferenceImageGallery && (
            <button
              type="button"
              onClick={onOpenReferenceImageGallery}
              className="text-[10px] font-black uppercase text-cyan-300 hover:text-white flex items-center gap-1.5 transition-colors px-2 py-1 bg-cyan-500/10 rounded-lg border border-cyan-500/20"
              title={`Open Reference Image usage (${referenceImageUsageCount})`}
            >
              <FileImage size={12} />
              Ref Image ({referenceImageUsageCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand Referenced In' : 'Collapse Referenced In'}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            title={isCollapsed ? 'Expand Referenced In' : 'Collapse Referenced In'}
          >
            <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
          </button>
        </div>
      </div>

      {!isCollapsed && (isLoading ? (
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 py-2">Resolving links...</div>
      ) : references.length === 0 ? (
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 py-2">No active references found.</div>
      ) : (
        <div className="space-y-2">
          {references.map((ref) => (
            <button
              key={ref.parentItemId}
              type="button"
              onClick={() => onOpen(ref.parentItemId)}
              className="w-full text-left p-3 bg-slate-950 border border-slate-800 hover:border-indigo-500/40 rounded-lg transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-black border border-slate-800 shrink-0 flex items-center justify-center">
                    {ref.parentPreviewUrl && (ref.parentMimeType || '').startsWith('image/') ? (
                      <img src={ref.parentPreviewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <FileImage size={16} className="text-slate-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-white truncate">{ref.parentTitle}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 truncate mt-1">
                      {ref.parentProjectName}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1">
                      {relationLabel(ref.relationKind)}
                    </p>
                  </div>
                </div>
                <ExternalLink size={13} className="text-slate-500 shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
};
