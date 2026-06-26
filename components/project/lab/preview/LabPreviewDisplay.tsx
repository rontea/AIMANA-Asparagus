import React, { useRef, useEffect } from 'react';
import { ImageIcon, Video, Volume2, MessageSquare, Play, Pause, Loader2 } from 'lucide-react';
import { GeneratedImageResult } from '../../../../services/geminiService';
import { ModelCategory } from '../ModelSelectorModal';
import { ChatMessage } from '../../../../hooks/useLabState';

interface LabPreviewDisplayProps {
    result: GeneratedImageResult | null;
    isGenerating: boolean;
    category: ModelCategory;
    chatHistory?: ChatMessage[];
    statusMessage?: string;
}

export const LabPreviewDisplay: React.FC<LabPreviewDisplayProps> = ({
    result, isGenerating, category, chatHistory, statusMessage
}) => {
    const isVideo = result?.mimeType?.startsWith('video/');
    const [isPlaying, setIsPlaying] = React.useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (category === 'Language') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatHistory, category]);

    const playAudio = () => {
        if (result?.audioBuffer) {
            const context = new AudioContext();
            const source = context.createBufferSource();
            source.buffer = result.audioBuffer;
            source.connect(context.destination);
            source.start();
            setIsPlaying(true);
            source.onended = () => setIsPlaying(false);
            return;
        }
        if (result?.base64 && result?.mimeType?.startsWith('audio/')) {
            const audio = new Audio(`data:${result.mimeType};base64,${result.base64}`);
            setIsPlaying(true);
            audio.onended = () => setIsPlaying(false);
            audio.play().catch(() => setIsPlaying(false));
        }
    };

    if (category === 'Language') {
        return (
            <div className="w-full max-w-3xl h-full flex flex-col relative z-20">
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-4">
                    {chatHistory?.length === 0 && !isGenerating && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                            <MessageSquare size={48} className="mb-4" />
                            <p className="text-sm font-bold uppercase tracking-widest">Awaiting prompt...</p>
                        </div>
                    )}
                    {chatHistory?.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl border ${msg.role === 'user' ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-100' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                <div className="text-[8px] font-black uppercase mt-2 opacity-40 tracking-widest">{msg.role}</div>
                            </div>
                        </div>
                    ))}
                    {isGenerating && (
                        <div className="flex justify-start animate-pulse">
                            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
                                <Loader2 size={14} className="animate-spin text-indigo-500" />
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Inference...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>
            </div>
        );
    }

    if (category === 'Audio' && result && !isGenerating) {
        return (
            <div className="flex flex-col items-center gap-8 relative z-20 animate-in zoom-in-95">
                <div className="w-48 h-48 rounded-full bg-pink-500/10 border border-pink-500/30 flex items-center justify-center shadow-[0_0_100px_rgba(236,72,153,0.15)] relative group">
                    <div className="absolute inset-0 rounded-full border-4 border-pink-500/20 border-t-pink-500 animate-spin-slow" />
                    <Volume2 size={64} className="text-pink-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="space-y-4 text-center">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Vocal Synthesis Ready</h3>
                    <button onClick={playAudio} className="flex items-center gap-3 px-10 py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-pink-900/40 transition-all active:scale-95">
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        {isPlaying ? 'Speaking...' : 'Play Audio Artifact'}
                    </button>
                </div>
            </div>
        );
    }

    // Default: Visual/Motion
    return (
        <>
            {!result && !isGenerating && (
                <div className="flex flex-col items-center text-center max-w-sm relative z-10 animate-in fade-in duration-700">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-2xl">
                        {category === 'Motion' ? <Video size={48} className="text-slate-700" /> : <ImageIcon size={48} className="text-slate-700" />}
                    </div>
                    <h3 className="text-2xl font-black text-slate-400 tracking-tight uppercase">Forge Idle</h3>
                </div>
            )}
            {isGenerating && (
                <div className="flex flex-col items-center relative z-10 animate-in zoom-in-95">
                    <div className="w-80 h-80 rounded-[3rem] bg-[#0c0c0c] border border-white/5 flex flex-col items-center justify-center relative shadow-[0_0_100px_rgba(99,102,241,0.1)]">
                        <Loader2 size={40} className="text-indigo-400 animate-spin" />
                        <span className="text-[10px] font-black text-indigo-300 uppercase mt-4 tracking-[0.3em]">{statusMessage || 'Forging...'}</span>
                    </div>
                </div>
            )}
            {result && !isGenerating && (
                <div className="flex-1 w-full h-full flex flex-col items-center justify-center relative z-20 min-h-0 animate-in zoom-in-95 duration-700">
                    {isVideo ? (
                        <video src={`data:${result.mimeType};base64,${result.base64}`} className="rounded-3xl shadow-2xl max-w-full max-h-full border border-white/10" controls autoPlay muted loop />
                    ) : (
                        <img src={`data:${result.mimeType};base64,${result.base64}`} className="rounded-3xl shadow-2xl max-w-full max-h-full border border-white/10 object-contain" alt="Generated" />
                    )}
                </div>
            )}
        </>
    );
};
