
import React from 'react';
import { ImageIcon, Video, Plus, MessageSquare, AudioLines } from 'lucide-react';
import { LabMode } from '../../project/lab/GenerateImageModal';

interface LabActionCardsProps {
    onOpenLab: (mode: LabMode) => void;
    onOpenChat: () => void;
}

export const LabActionCards: React.FC<LabActionCardsProps> = ({ onOpenLab, onOpenChat }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4 md:gap-6 mb-12 md:mb-16 w-full">
        <button 
            onClick={() => onOpenLab('image')}
            className="group relative min-h-[8rem] md:min-h-[10rem] bg-indigo-600/5 hover:bg-indigo-600/10 border border-indigo-500/20 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden transition-all flex items-start p-6 md:p-8 gap-4 md:gap-8 shadow-2xl"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="shrink-0 p-4 md:p-6 bg-indigo-500/10 rounded-2xl md:rounded-3xl text-indigo-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl border border-indigo-500/20">
                <ImageIcon size={30} className="md:w-10 md:h-10" />
            </div>
            <div className="text-left relative z-10 flex-1 min-w-0 self-center">
                <h3 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight mb-1 md:mb-2 leading-tight whitespace-normal break-words">Forge AI Image</h3>
                <p className="text-[10px] md:text-sm text-slate-500 font-medium leading-relaxed whitespace-normal break-words">High-fidelity synthesis for visual artifacts.</p>
            </div>
            <Plus size={20} className="shrink-0 self-center text-indigo-500 opacity-20 group-hover:opacity-100 group-hover:scale-125 transition-all hidden sm:block" />
        </button>

        <button 
            onClick={() => onOpenLab('video')}
            className="group relative min-h-[8rem] md:min-h-[10rem] bg-blue-600/5 hover:bg-blue-600/10 border border-blue-500/20 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden transition-all flex items-start p-6 md:p-8 gap-4 md:gap-8 shadow-2xl"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="shrink-0 p-4 md:p-6 bg-blue-500/10 rounded-2xl md:rounded-3xl text-blue-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl border border-blue-500/20">
                <Video size={30} className="md:w-10 md:h-10" />
            </div>
            <div className="text-left relative z-10 flex-1 min-w-0 self-center">
                <h3 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight mb-1 md:mb-2 leading-tight whitespace-normal break-words">Forge AI Video</h3>
                <p className="text-[10px] md:text-sm text-slate-500 font-medium leading-relaxed whitespace-normal break-words">Cinematic sequences via motion engine.</p>
            </div>
            <Plus size={20} className="shrink-0 self-center text-blue-500 opacity-20 group-hover:opacity-100 group-hover:scale-125 transition-all hidden sm:block" />
        </button>

        <button
            onClick={onOpenChat}
            className="group relative min-h-[8rem] md:min-h-[10rem] bg-indigo-600/5 hover:bg-indigo-600/10 border border-indigo-500/20 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden transition-all flex items-start p-6 md:p-8 gap-4 md:gap-8 shadow-2xl"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="shrink-0 p-4 md:p-6 bg-indigo-500/10 rounded-2xl md:rounded-3xl text-indigo-300 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl border border-indigo-500/20">
                <MessageSquare size={30} className="md:w-10 md:h-10" />
            </div>
            <div className="text-left relative z-10 flex-1 min-w-0 self-center">
                <h3 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight mb-1 md:mb-2 leading-tight whitespace-normal break-words">AI Chat</h3>
                <p className="text-[10px] md:text-sm text-slate-500 font-medium leading-relaxed whitespace-normal break-words">Conversation-first language workspace.</p>
            </div>
            <Plus size={20} className="shrink-0 self-center text-indigo-400 opacity-20 group-hover:opacity-100 group-hover:scale-125 transition-all hidden sm:block" />
        </button>

        <button
            onClick={() => onOpenLab('audio')}
            className="group relative min-h-[8rem] md:min-h-[10rem] bg-emerald-600/5 hover:bg-emerald-600/10 border border-emerald-500/20 rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden transition-all flex items-start p-6 md:p-8 gap-4 md:gap-8 shadow-2xl"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="shrink-0 p-4 md:p-6 bg-emerald-500/10 rounded-2xl md:rounded-3xl text-emerald-300 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl border border-emerald-500/20">
                <AudioLines size={30} className="md:w-10 md:h-10" />
            </div>
            <div className="text-left relative z-10 flex-1 min-w-0 self-center">
                <h3 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight mb-1 md:mb-2 leading-tight whitespace-normal break-words">AI Audio</h3>
                <p className="text-[10px] md:text-sm text-slate-500 font-medium leading-relaxed whitespace-normal break-words">Multi-speaker narration and voice synthesis.</p>
            </div>
            <Plus size={20} className="shrink-0 self-center text-emerald-400 opacity-20 group-hover:opacity-100 group-hover:scale-125 transition-all hidden sm:block" />
        </button>

    </div>
);
