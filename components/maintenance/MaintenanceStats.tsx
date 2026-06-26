
import React from 'react';
import { Users, FileStack, Info, BrainCircuit, Link2 } from 'lucide-react';

interface MaintenanceStatsProps {
    stats: {
        users: number;
        projects: number;
        items: number;
        revisions: number;
        localFiles: number;
        neuralAssets: number;
        manifestLinks?: number;
    } | null;
}

export const MaintenanceStats: React.FC<MaintenanceStatsProps> = ({ stats }) => (
    <>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users size={80} className="text-indigo-400" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Total Accounts</h3>
            <p className="text-4xl font-black text-white">{stats?.users || '0'}</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <Info size={12}/> Registered instance members
            </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <BrainCircuit size={80} className="text-indigo-400" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Neural Infrastructure</h3>
            <p className="text-4xl font-black text-white">{stats?.neuralAssets || '0'}</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <Info size={12}/> Checkpoints, Intents & Presets
            </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <FileStack size={80} className="text-purple-400" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Instance Footprint</h3>
            <div className="flex items-baseline gap-2">
                 <p className="text-4xl font-black text-white">{stats?.items || '0'}</p>
                 <span className="text-slate-500 font-bold">Items</span>
            </div>
            <div className="mt-4 space-y-2">
                 <div className="flex justify-between text-[10px] font-bold">
                     <span className="text-slate-400">Local Binaries:</span>
                     <span className="text-white">{stats?.localFiles || '0'}</span>
                 </div>
                 <div className="flex justify-between text-[10px] font-bold">
                     <span className="text-indigo-400 flex items-center gap-1.5"><Link2 size={10}/> Manifest Links:</span>
                     <span className="text-indigo-300">{stats?.manifestLinks || '0'}</span>
                 </div>
            </div>
        </div>
    </>
);
