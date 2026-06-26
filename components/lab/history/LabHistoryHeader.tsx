
import React from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';

interface LabHistoryHeaderProps {
    onBack: () => void;
}

export const LabHistoryHeader: React.FC<LabHistoryHeaderProps> = ({ onBack }) => (
    <div className="h-20 flex items-center justify-between px-6 md:px-10 border-b border-slate-800/50 shrink-0 bg-slate-900/20 z-30">
        <div className="flex items-center gap-4 md:gap-8">
            <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors flex items-center gap-2 md:gap-3 text-[10px] md:text-xs font-bold uppercase tracking-widest group">
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
                <span className="hidden sm:inline">Dashboard</span>
            </button>
            <div className="h-6 w-px bg-slate-800 hidden sm:block" />
            <div className="flex items-center gap-3 md:gap-4">
                <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Sparkles size={18} className="text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-[10px] md:text-xs font-black text-white uppercase tracking-[0.2em] md:tracking-[0.4em]">Neural Laboratory</h2>
                    <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Inference & Archival</p>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-black text-emerald-500 uppercase">Live Pipeline Connected</span>
            </div>
        </div>
    </div>
);
