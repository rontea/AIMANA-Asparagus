import React from 'react';
import { History, RotateCcw, File as FileIcon, Trash2 } from 'lucide-react';
import { Revision, AssetType } from '../../types';
import { determineAssetType } from '../../services/db';

interface ArchivedAssetsTabProps {
    archivedRevisions: Revision[];
    onRestoreRevision: (revId: string) => void;
    onDeleteRevisionPermanently: (revId: string) => void;
}

const RevisionThumbnail: React.FC<{ rev: Revision }> = ({ rev }) => {
    const [url, setUrl] = React.useState<string | null>(null);
    const type = determineAssetType(rev.mimeType);

    React.useEffect(() => {
        if (rev.storage === 'google-drive' && rev.thumbnailLink) {
            setUrl(rev.thumbnailLink);
        } else if (rev.storage === 'local') {
            if (rev.fileUrl) {
                setUrl(rev.fileUrl);
            } else if (rev.blob) {
                const u = URL.createObjectURL(rev.blob);
                setUrl(u);
                return () => URL.revokeObjectURL(u);
            }
        }
    }, [rev]);

    if ((type === AssetType.IMAGE || type === AssetType.VIDEO) && url) {
        return (
            <img 
                src={url} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer" 
                alt={rev.title} 
            />
        );
    }

    return <FileIcon size={18} className="text-slate-600" />;
};

export const ArchivedAssetsTab: React.FC<ArchivedAssetsTabProps> = ({
    archivedRevisions, onRestoreRevision, onDeleteRevisionPermanently
}) => {
    return (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Trash2 className="text-indigo-400" size={20} />
                </div>
                <div>
                    <h3 className="text-white font-bold">Deleted Versions</h3>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Historical versions of active items moved to trash</p>
                </div>
            </div>

            {archivedRevisions.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center bg-slate-900/30 rounded-xl border border-dashed border-slate-700">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4 text-slate-600">
                        <History size={24} />
                    </div>
                    <p className="text-slate-500 italic text-sm">No individual revisions in the bin for this project.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {archivedRevisions.map(rev => (
                        <div key={rev.id} className="flex items-center justify-between p-3 hover:bg-slate-700/40 rounded-xl border border-slate-700/30 transition-all group">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="shrink-0 relative">
                                    <div className="w-14 h-14 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shadow-inner relative">
                                        <RevisionThumbnail rev={rev} />
                                    </div>
                                    <span className="absolute -top-1 -left-1 text-[8px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded shadow-lg border border-indigo-400/30 uppercase tracking-tighter">
                                        v{rev.versionNumber}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <span className="text-white font-bold block truncate text-sm" title={rev.title}>{rev.title}</span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                                            Deleted {new Date(rev.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className="h-1 w-1 rounded-full bg-slate-700"></span>
                                        <span className="text-[9px] text-slate-600 font-mono">
                                            {(rev.size / 1024).toFixed(0)} KB
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onRestoreRevision(rev.id)} 
                                    className="flex items-center gap-2 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 group-hover:border-emerald-500/30 border border-transparent"
                                    title="Restore as newest version"
                                >
                                    <RotateCcw size={14} /> Restore
                                </button>
                                <button 
                                    onClick={() => onDeleteRevisionPermanently(rev.id)} 
                                    className="flex items-center gap-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 group-hover:border-red-500/30 border border-transparent"
                                    title="Delete Forever"
                                >
                                    <Trash2 size={14} /> Purge
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};