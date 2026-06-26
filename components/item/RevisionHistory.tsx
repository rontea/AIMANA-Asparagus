import React from 'react';
import { History, UploadCloud, File as FileIcon, RotateCcw, ChevronRight, Info, Eye, Trash2 } from 'lucide-react';
import { Revision, AssetType } from '../../types';
import { determineAssetType } from '../../services/db';

interface RevisionHistoryProps {
    revisions: Revision[];
    currentRevisionId: string | undefined;
    isHistoryDragging: boolean;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onAddClick: () => void;
    onSelectRevision: (rev: Revision) => void;
    onRestoreRevision?: (rev: Revision) => void;
    onDeleteRevision?: (revId: string) => void;
}

const RevisionThumbnail: React.FC<{ rev: Revision }> = ({ rev }) => {
    const [url, setUrl] = React.useState<string | null>(null);
    const type = determineAssetType(rev.mimeType);
    React.useEffect(() => {
        if (rev.storage === 'google-drive' && rev.thumbnailLink) setUrl(rev.thumbnailLink);
        else if (rev.storage === 'local') {
            if (rev.fileUrl) setUrl(rev.fileUrl);
            else if (rev.blob) {
                const u = URL.createObjectURL(rev.blob);
                setUrl(u);
                return () => URL.revokeObjectURL(u);
            }
        }
    }, [rev]);
    if ((type === AssetType.IMAGE || type === AssetType.VIDEO) && url) return <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />;
    return <FileIcon size={16} className="text-slate-600" />;
};

export const RevisionHistory: React.FC<RevisionHistoryProps> = ({
    revisions, currentRevisionId, isHistoryDragging, onDragEnter, onDragLeave, onDrop, onAddClick, onSelectRevision, onRestoreRevision, onDeleteRevision
}) => {
    // Sort revisions by version number descending
    const sortedRevisions = [...revisions].sort((a, b) => b.versionNumber - a.versionNumber);
    const historyRevisions = sortedRevisions.filter(r => r.id !== currentRevisionId);

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2"><History size={16} /> Revision History</h3>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{historyRevisions.length} Snapshots</span>
            </div>
            
            <div 
                onClick={onAddClick} 
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={onDrop}
                className={`w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 cursor-pointer transition-all group ${isHistoryDragging ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 scale-[0.98]' : 'border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-400'}`}
            >
                <UploadCloud size={24} className={isHistoryDragging ? 'animate-bounce text-indigo-400' : 'group-hover:text-indigo-400 transition-colors'} />
                <div className="text-xs font-bold uppercase tracking-widest transition-all">
                    {isHistoryDragging ? 'Drop Now' : 'Add Revision'}
                </div>
                {isHistoryDragging ? (
                    <div className="text-[9px] text-indigo-400 font-medium">New version will be created</div>
                ) : (
                    <div className="text-[9px] text-slate-600 group-hover:text-indigo-400/60 font-medium transition-colors">or click to browse</div>
                )}
            </div>

            <div className="space-y-2">
                {historyRevisions.map((rev) => (
                    <div 
                        key={rev.id} 
                        onClick={() => onSelectRevision(rev)} 
                        className="group p-3 rounded-xl border bg-slate-900 border-slate-800 hover:border-indigo-500/30 hover:bg-slate-800 transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 group-hover:text-indigo-300 transition-colors">v{rev.versionNumber}</span>
                            <span className="text-[9px] font-bold text-slate-600 group-hover:text-slate-500 uppercase tracking-widest">{new Date(rev.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-black flex items-center justify-center shrink-0 border border-slate-800 overflow-hidden shadow-inner">
                                <RevisionThumbnail rev={rev} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-slate-300 truncate font-bold group-hover:text-white transition-colors">{rev.title}</p>
                                <p className="text-[9px] text-slate-500 font-medium truncate mt-0.5 italic">{rev.engine}</p>
                            </div>
                            
                            {/* Actions Overlay */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onSelectRevision(rev); }}
                                    className="p-2 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-all"
                                    title="View Manifest Details"
                                >
                                    <Eye size={14} />
                                </button>
                                {onRestoreRevision && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onRestoreRevision(rev); }}
                                        className="p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg border border-indigo-500/30 transition-all"
                                        title="Bump to Main Version"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                )}
                                {onDeleteRevision && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteRevision(rev.id); }}
                                        className="p-2 bg-red-900/20 text-red-400 hover:bg-red-600 hover:text-white rounded-lg border border-red-900/30 transition-all"
                                        title="Move to Trash"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {historyRevisions.length === 0 && (
                    <div className="py-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 opacity-40">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">No previous versions</p>
                    </div>
                )}
            </div>
        </section>
    );
};