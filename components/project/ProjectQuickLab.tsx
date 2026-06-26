
import React from 'react';
import { ImageIcon, Video, Sparkles, MessageSquare, AudioLines } from 'lucide-react';

export type LabMode = 'image' | 'video' | 'audio' | 'music' | 'transcribe' | 'text';

interface ProjectQuickLabProps {
    onOpenLab: (mode: LabMode) => void;
    onOpenChat: () => void;
}

export const ProjectQuickLab: React.FC<ProjectQuickLabProps> = ({ onOpenLab, onOpenChat }) => {
    return (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 shrink-0">
            <button 
                onClick={() => onOpenLab('image')} 
                className="group relative h-24 bg-indigo-600/5 hover:bg-indigo-600/10 border border-indigo-500/20 rounded-3xl overflow-hidden transition-all flex items-center px-6 gap-6 shadow-lg"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-3.5 bg-indigo-500/10 rounded-2xl text-indigo-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    <ImageIcon size={28} />
                </div>
                <div className="text-left relative z-10 min-w-0">
                    <h3 className="text-xs font-black text-indigo-100 uppercase tracking-widest truncate">AI Image</h3>
                    <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase tracking-tighter">Visual Lab</p>
                </div>
                <span className="ml-auto text-indigo-500/30 group-hover:text-indigo-400 transition-all">
                    <Sparkles size={14} />
                </span>
            </button>

            <button 
                onClick={() => onOpenLab('video')} 
                className="group relative h-24 bg-blue-600/5 hover:bg-blue-600/10 border border-blue-500/20 rounded-3xl overflow-hidden transition-all flex items-center px-6 gap-6 shadow-lg"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-3.5 bg-blue-500/10 rounded-2xl text-blue-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    <Video size={28} />
                </div>
                <div className="text-left relative z-10 min-w-0">
                    <h3 className="text-xs font-black text-blue-100 uppercase tracking-widest truncate">AI Video</h3>
                    <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase tracking-tighter">Temporal Lab</p>
                </div>
                <span className="ml-auto text-blue-500/30 group-hover:text-blue-400 transition-all">
                    <Sparkles size={14} />
                </span>
            </button>

            <button
                onClick={() => onOpenLab('audio')}
                className="group relative h-24 bg-emerald-600/5 hover:bg-emerald-600/10 border border-emerald-500/20 rounded-3xl overflow-hidden transition-all flex items-center px-6 gap-6 shadow-lg"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-3.5 bg-emerald-500/10 rounded-2xl text-emerald-300 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    <AudioLines size={28} />
                </div>
                <div className="text-left relative z-10 min-w-0">
                    <h3 className="text-xs font-black text-emerald-100 uppercase tracking-widest truncate">AI Audio</h3>
                    <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase tracking-tighter">Voice Lab</p>
                </div>
                <span className="ml-auto text-emerald-500/30 group-hover:text-emerald-400 transition-all">
                    <Sparkles size={14} />
                </span>
            </button>

            <button
                onClick={onOpenChat}
                className="group relative h-24 bg-cyan-600/5 hover:bg-cyan-600/10 border border-cyan-500/20 rounded-3xl overflow-hidden transition-all flex items-center px-6 gap-6 shadow-lg"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-3.5 bg-cyan-500/10 rounded-2xl text-cyan-300 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    <MessageSquare size={28} />
                </div>
                <div className="text-left relative z-10 min-w-0">
                    <h3 className="text-xs font-black text-cyan-100 uppercase tracking-widest truncate">AI Chat</h3>
                    <p className="text-[10px] text-slate-600 font-bold mt-1 uppercase tracking-tighter">Language Lab</p>
                </div>
                <span className="ml-auto text-cyan-500/30 group-hover:text-cyan-400 transition-all">
                    <Sparkles size={14} />
                </span>
            </button>
        </div>
    );
};
