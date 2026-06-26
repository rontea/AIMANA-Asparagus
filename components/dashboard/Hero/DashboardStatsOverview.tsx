import React from 'react';
import { Cloud, HardDrive, Layers, Pin, RefreshCw } from 'lucide-react';
import { Project, ProjectStorageType } from '../../../types';

interface DashboardStatsOverviewProps {
    projects: Project[];
}

export const DashboardStatsOverview: React.FC<DashboardStatsOverviewProps> = ({ projects }) => {
    const pinnedCount = projects.filter(p => p.isPinned).length;
    const localCount = projects.filter(p => p.storageType === ProjectStorageType.LOCAL_DRIVE).length;
    const cloudCount = projects.filter(p => p.storageType === ProjectStorageType.GOOGLE_DRIVE || p.storageType === ProjectStorageType.GOOGLE_KEEP).length;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const updatedTodayCount = projects.filter(p => (p.updatedAt || 0) >= startOfToday.getTime()).length;
    
    const stats = [
        { label: 'Total Projects', value: projects.length, icon: Layers, color: 'text-cyan-400', delta: `${projects.length} active workspace${projects.length === 1 ? '' : 's'}` },
        { label: 'Pinned Projects', value: pinnedCount, icon: Pin, color: 'text-amber-400', delta: `${pinnedCount} quick access` },
        { label: 'Local Projects', value: localCount, icon: HardDrive, color: 'text-emerald-400', delta: `${localCount} stored locally` },
        { label: 'Cloud Projects', value: cloudCount, icon: Cloud, color: 'text-sky-400', delta: `${cloudCount} synced workspace${cloudCount === 1 ? '' : 's'}` },
        { label: 'Updated Today', value: updatedTodayCount, icon: RefreshCw, color: 'text-teal-400', delta: `${updatedTodayCount} changed today` }
    ];

    return (
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 animate-in fade-in slide-in-from-right-4 duration-700">
            {stats.map((stat, i) => (
                <div
                    key={i}
                    className="group min-h-[104px] rounded-lg border border-slate-700/60 bg-slate-950/35 p-4 shadow-[0_18px_55px_rgba(2,6,23,0.28)] transition-all hover:-translate-y-0.5 hover:border-indigo-400/40 hover:bg-slate-900/45"
                >
                    <div className="flex items-center gap-2">
                        <stat.icon size={14} className={stat.color} />
                        <div className="truncate text-[10px] font-black text-slate-400">{stat.label}</div>
                    </div>
                    <div className="mt-2 text-3xl font-black leading-none tracking-tight text-white">
                        {stat.value}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                        <span className="leading-none">+</span>
                        <span className="truncate">{stat.delta}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};
