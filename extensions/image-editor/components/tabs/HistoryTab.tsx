import React from 'react';

interface HistoryTabProps {
    snapshotHistory: Array<{ id: string; label: string; createdAt: number }>;
    onRestoreSnapshot: (id: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
    snapshotHistory,
    onRestoreSnapshot
}) => {
    return (
        <div className="p-4 space-y-3 bg-[#111]">
            <div className="space-y-3 p-4 bg-black/40 border border-white/5 rounded-xl">
                <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Snapshot History</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {snapshotHistory.length === 0 ? (
                        <p className="text-[8px] text-slate-600 italic">No snapshots yet. Snapshots are captured automatically as you refine.</p>
                    ) : (
                        snapshotHistory.map((snap) => (
                            <button
                                key={snap.id}
                                onClick={() => onRestoreSnapshot(snap.id)}
                                className="w-full text-left p-2 rounded-md border border-white/5 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all"
                            >
                                <div className="text-[9px] font-black text-white uppercase tracking-wide truncate">{snap.label}</div>
                                <div className="text-[8px] text-slate-500">{new Date(snap.createdAt).toLocaleString()}</div>
                            </button>
                        ))
                    )}
                </div>
                <p className="text-[8px] text-slate-600 italic">Only the latest 20 snapshots are captured for restore.</p>
            </div>
        </div>
    );
};
