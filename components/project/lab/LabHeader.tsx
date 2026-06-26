import React from 'react';
import { X, ImageIcon, Video, AudioLines, MessageSquare, ArrowLeft, Music2, FileAudio } from 'lucide-react';
import { LabMode } from './GenerateImageModal';

interface LabHeaderProps {
    onClose: () => void;
    mode?: LabMode;
    onBack?: () => void;
    backLabel?: string;
}

export const LabHeader: React.FC<LabHeaderProps> = ({
    onClose,
    mode = 'image',
    onBack,
    backLabel
}) => {
    const modeMap: Record<LabMode, { label: string; icon: typeof ImageIcon; color: string; dot: string }> = {
        image: { label: 'Image', icon: ImageIcon, color: 'text-indigo-400', dot: 'bg-indigo-500' },
        video: { label: 'Video', icon: Video, color: 'text-blue-400', dot: 'bg-blue-500' },
        audio: { label: 'Audio', icon: AudioLines, color: 'text-emerald-400', dot: 'bg-emerald-500' },
        music: { label: 'Music', icon: Music2, color: 'text-amber-400', dot: 'bg-amber-500' },
        transcribe: { label: 'Audio to Text', icon: FileAudio, color: 'text-cyan-400', dot: 'bg-cyan-500' },
        text: { label: 'Text', icon: MessageSquare, color: 'text-violet-400', dot: 'bg-violet-500' }
    };
    const isAudioFamily = mode === 'audio' || mode === 'music' || mode === 'transcribe';
    const base = modeMap[mode];
    const label = isAudioFamily ? 'Audio' : base.label;
    const Icon = isAudioFamily ? AudioLines : base.icon;
    const color = isAudioFamily ? 'text-emerald-400' : base.color;
    const dot = isAudioFamily ? 'bg-emerald-500' : base.dot;
    
    return (
        <div className="border-b border-slate-800/50 shrink-0 bg-slate-900/20">
            <div className="min-h-16 flex items-center justify-between gap-4 px-4 sm:px-6 md:px-8 py-3">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4 md:gap-6">
                    {onBack && backLabel && (
                        <>
                            <button
                                onClick={onBack}
                                className="chat-focus-ring shrink-0 text-slate-500 hover:text-white transition-colors flex items-center gap-2 text-[10px] md:text-xs font-bold uppercase tracking-widest group rounded-md"
                            >
                                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                                <span className="hidden sm:inline">{backLabel}</span>
                            </button>
                            <div className="h-5 w-px bg-slate-800 hidden sm:block" />
                        </>
                    )}
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                        <div className="shrink-0 p-2 bg-indigo-500/10 rounded-xl">
                            <Icon size={20} className={color} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-[10px] md:text-xs font-black text-white uppercase tracking-[0.2em] sm:tracking-[0.25em] md:tracking-[0.35em]">
                                AI Creative {label}
                            </h2>
                            <p className="truncate text-[8px] md:text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-[0.2em] sm:tracking-widest flex items-center gap-2">
                                <span className={`w-1 h-1 rounded-full animate-pulse ${dot}`} />
                                Neural Laboratory
                            </p>
                        </div>
                    </div>
                </div>
                <button 
                    onClick={onClose}
                    className="shrink-0 p-2 text-slate-500 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full border border-white/5 transition-all shadow-lg active:scale-95"
                    aria-label="Close Studio"
                >
                    <X size={18} />
                </button>
            </div> 
        </div>
    );
};
