import React, { useState, useEffect, useRef } from 'react';
import { Type, Loader2, Zap, Eye, EyeOff, ChevronUp, ChevronDown, X, Lock, Info, Maximize2, GripHorizontal } from 'lucide-react';
import { SupportedEngine } from '../ModelSelectorModal';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';
import { isPaidGoogleModelId } from '../../../../utils/googleModelIds';

interface LabInputFormProps {
    title: string;
    onSetTitle: (t: string) => void;
    prompt: string;
    onSetPrompt: (p: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    category: string;
    model: SupportedEngine;
    hasApiKey: boolean;
    negativePrompt: string;
    onSetNegativePrompt: (p: string) => void;
    onRandomizeSeed?: () => void;
    features: EngineFeatures;
}

export const LabInputForm: React.FC<LabInputFormProps> = ({
    title, onSetTitle, prompt, onSetPrompt, onGenerate, isGenerating, category, model, hasApiKey,
    negativePrompt, onSetNegativePrompt, onRandomizeSeed, features
}) => {
    const [showNegative, setShowNegative] = useState(false);
    const [isPromptFullscreen, setIsPromptFullscreen] = useState(false);
    const [promptHeight, setPromptHeight] = useState(112);
    const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const requiresPaidGoogleAccess = isPaidGoogleModelId(model);
    const isNegativeActive = features?.showNegativePrompt ?? true;
    const getPromptMaxHeight = () => (
        typeof window === 'undefined'
            ? 720
            : Math.max(420, Math.round(window.innerHeight * 0.68))
    );

    // Ensure negative panel is closed if the model doesn't support it
    useEffect(() => {
        if (!isNegativeActive) setShowNegative(false);
    }, [isNegativeActive]);

    useEffect(() => {
        const textarea = promptTextareaRef.current;
        if (!textarea) return;

        const nextHeight = Math.min(getPromptMaxHeight(), Math.max(promptHeight, textarea.scrollHeight, 112));
        if (nextHeight !== promptHeight) setPromptHeight(nextHeight);
    }, [prompt]);

    useEffect(() => {
        if (!isPromptFullscreen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsPromptFullscreen(false);
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isPromptFullscreen]);

    const handlePromptResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = promptHeight;

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const delta = moveEvent.clientY - startY;
            setPromptHeight(Math.min(getPromptMaxHeight(), Math.max(96, startHeight + delta)));
        };

        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    return (
        <>
        <div className={`bg-[#1a1a1a] border border-slate-800 rounded-[1.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 transition-all ${!isNegativeActive ? 'ring-1 ring-white/5' : ''}`}>
            {/* Context/Negative Area */}
            <div className={`transition-all duration-300 overflow-hidden ${showNegative && isNegativeActive ? 'h-32 p-4 border-b border-slate-800' : 'h-0'}`}>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                        <X size={12} className="text-red-500" /> Negative Context
                        <span className="cursor-help" title="What to avoid in the generated image">
                            <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                        </span>
                    </label>
                    <textarea 
                        value={negativePrompt}
                        onChange={(e) => onSetNegativePrompt(e.target.value)}
                        placeholder="Blur, low quality, distorted, extra limbs..."
                        className="w-full min-h-[80px] max-h-[220px] bg-black/40 rounded-xl p-3 text-xs text-slate-300 outline-none resize-y focus:border-red-500/30 border border-transparent transition-all custom-scrollbar"
                    />
                </div>
            </div>

            {/* Primary Input Container */}
            <div className="p-4 md:p-6 space-y-4">
                <div className="flex items-start gap-4">
                    <button 
                        onClick={() => isNegativeActive && setShowNegative(!showNegative)}
                        disabled={!isNegativeActive}
                        className={`p-2.5 rounded-xl border transition-all shrink-0 relative ${
                            !isNegativeActive 
                                ? 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed opacity-40' 
                                : showNegative 
                                    ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
                        }`}
                        title={isNegativeActive ? "Toggle Negative Prompt" : "Constraints disabled for this model"}
                    >
                        {showNegative ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        {!isNegativeActive && (
                            <div className="absolute -top-1 -right-1 bg-slate-800 rounded-full p-0.5 border border-slate-700">
                                <Lock size={8} className="text-slate-500" />
                            </div>
                        )}
                    </button>
                    
                    <div className="flex-1 space-y-4 min-w-0">
                        {/* Title Bar */}
                        <div className="flex items-center gap-3">
                            <input 
                                value={title}
                                onChange={(e) => onSetTitle(e.target.value)}
                                placeholder="Artifact Title (Optional)"
                                className="bg-transparent text-sm font-bold text-slate-300 placeholder:text-slate-700 outline-none flex-1 truncate"
                            />
                            <div className="h-4 w-px bg-slate-800" />
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest whitespace-nowrap overflow-hidden text-ellipsis">
                                    Model: {String(model).replace('pollinations-', '').replace('gemini-', '')}
                                </span>
                                <span className="cursor-help shrink-0" title="Text description of the image or video to generate">
                                    <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPromptFullscreen(true)}
                                className="ml-auto shrink-0 p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-500 hover:text-indigo-300 hover:border-indigo-500/40 transition-all"
                                title="Open prompt full screen"
                                aria-label="Open prompt full screen"
                            >
                                <Maximize2 size={14} />
                            </button>
                        </div>

                        {/* Prompt Input */}
                        <div className="rounded-xl border border-transparent focus-within:border-indigo-500/20 transition-colors">
                            <textarea 
                                ref={promptTextareaRef}
                                value={prompt}
                                onChange={(e) => onSetPrompt(e.target.value)}
                                placeholder="Describe your visual concept in detail..."
                                className="w-full bg-transparent text-xs md:text-sm font-medium text-white placeholder:text-slate-800 outline-none resize-none leading-relaxed custom-scrollbar overflow-y-auto"
                                style={{ height: promptHeight }}
                            />
                            <button
                                type="button"
                                onPointerDown={handlePromptResizeStart}
                                className="mt-1 flex h-5 w-full cursor-row-resize items-center justify-center rounded-lg text-slate-700 hover:bg-slate-900/70 hover:text-indigo-300 transition-all"
                                title="Drag to resize prompt"
                                aria-label="Drag to resize prompt"
                            >
                                <GripHorizontal size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-800/50">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => isNegativeActive && setShowNegative(!showNegative)}
                            disabled={!isNegativeActive}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                !isNegativeActive
                                    ? 'text-slate-700 bg-slate-900 border border-slate-800 cursor-not-allowed opacity-40'
                                    : showNegative 
                                        ? 'text-red-400 bg-red-400/10 border border-red-500/20' 
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'
                            }`}
                        >
                            <EyeOff size={14} /> Negative
                        </button>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4 group cursor-pointer hover:border-slate-700 transition-all">
                             <span className="text-[11px] font-black text-slate-500 uppercase tracking-tighter">1 image</span>
                             <ChevronDown size={14} className="text-slate-700" />
                        </div>

                        <button 
                            onClick={onGenerate}
                            disabled={isGenerating || !prompt.trim() || (requiresPaidGoogleAccess && !hasApiKey)}
                            className={`flex-1 sm:flex-none min-w-[200px] h-[52px] bg-gradient-to-r from-indigo-600 to-emerald-400 hover:from-indigo-500 hover:to-emerald-300 text-white rounded-2xl shadow-xl shadow-indigo-950/40 font-black text-base md:text-lg uppercase tracking-tight transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3`}
                        >
                            {isGenerating ? <Loader2 size={24} className="animate-spin" /> : "GENERATE"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        {isPromptFullscreen && (
            <div className="fixed inset-0 z-[320] bg-slate-950/95 backdrop-blur-xl p-4 md:p-8 animate-in fade-in duration-200">
                <div className="h-full rounded-[2rem] border border-slate-800 bg-[#111]/95 shadow-2xl flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-indigo-400">Prompt Editor</p>
                            <p className="mt-1 truncate text-xs font-bold text-slate-500">
                                Model: {String(model).replace('pollinations-', '').replace('gemini-', '')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsPromptFullscreen(false)}
                                className="h-10 px-4 rounded-xl border border-slate-800 bg-slate-900 text-xs font-black uppercase tracking-widest text-slate-300 hover:border-slate-600 hover:text-white transition-all"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPromptFullscreen(false);
                                    onGenerate();
                                }}
                                disabled={isGenerating || !prompt.trim() || (requiresPaidGoogleAccess && !hasApiKey)}
                                className="h-10 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-400 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 transition-all"
                            >
                                {isGenerating ? 'Generating' : 'Generate'}
                            </button>
                        </div>
                    </div>
                    <textarea
                        autoFocus
                        value={prompt}
                        onChange={(e) => onSetPrompt(e.target.value)}
                        placeholder="Describe your visual concept in detail..."
                        className="flex-1 w-full resize-none bg-transparent p-5 md:p-8 text-sm md:text-base font-medium leading-relaxed text-white placeholder:text-slate-800 outline-none custom-scrollbar"
                    />
                </div>
            </div>
        )}
        </>
    );
};
