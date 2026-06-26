
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FileText, Clipboard, Cloud, HardDrive, Tag, Bot, ChevronDown, Cpu, Code2, LayoutPanelLeft, FileSignature, Sparkles, Box, Check, FolderKanban, Volume2 } from 'lucide-react';
import { Revision } from '../../types';
import { loadDynamicRegistry, ModelOption } from '../project/lab/ModelSelector/registry/index';
import { SpecsDisplay } from './specs/SpecsDisplay';
import { createBrowserTtsController } from '../chat/browserTts';
import { api } from '../../services/api';

interface MainRevisionMetaProps {
    formData: { title: string; label: string; tags: string; prompt: string; engine: string; note: string; aiParameters: string; originalFilename: string };
    setFormData: (data: any) => void;
    engines: string[];
    currentRev: Revision | undefined;
    projectName: string;
    onShowParams: () => void;
    onCopyText: (text: string, label: string) => void;
    onCopyLocation: () => void;
    onOpenItemById?: (itemId: string) => void;
}

export const MainRevisionMeta: React.FC<MainRevisionMetaProps> = ({
    formData, setFormData, engines, currentRev, projectName, onShowParams, onCopyText, onCopyLocation, onOpenItemById
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [viewMode, setViewMode] = useState<'visual' | 'code'>('visual');
    const [allModels, setAllModels] = useState<ModelOption[]>([]);
    const [promptCopied, setPromptCopied] = useState(false);
    const [labelCopied, setLabelCopied] = useState(false);
    const [tagsCopied, setTagsCopied] = useState(false);
    const [noteCopied, setNoteCopied] = useState(false);
    const [locationCopied, setLocationCopied] = useState(false);
    const [isPromptReadAloudSupported, setIsPromptReadAloudSupported] = useState(false);
    const [promptReadAloudState, setPromptReadAloudState] = useState<'idle' | 'playing' | 'paused'>('idle');
    const [globalReadAloudDefault, setGlobalReadAloudDefault] = useState<{ voiceURI: string; voiceName: string }>({
        voiceURI: '',
        voiceName: ''
    });
    const promptTtsControllerRef = useRef<ReturnType<typeof createBrowserTtsController> | null>(null);

    const stopPromptReadAloud = useCallback(() => {
        promptTtsControllerRef.current?.stop();
        setPromptReadAloudState('idle');
    }, []);

    useEffect(() => {
        loadDynamicRegistry().then(setAllModels);
    }, []);

    useEffect(() => {
        const controller = createBrowserTtsController();
        promptTtsControllerRef.current = controller;
        setIsPromptReadAloudSupported(controller.isSupported());
        return () => {
            controller.destroy();
            promptTtsControllerRef.current = null;
            setIsPromptReadAloudSupported(false);
            setPromptReadAloudState('idle');
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const loadDefaultVoice = async () => {
            try {
                const settings = await api.settings.get();
                if (cancelled) return;
                setGlobalReadAloudDefault({
                    voiceURI: String(settings?.defaultReadAloudVoiceURI || '').trim(),
                    voiceName: String(settings?.defaultReadAloudVoiceName || '').trim()
                });
            } catch {}
        };
        const onSettingsUpdated = () => {
            loadDefaultVoice();
        };
        loadDefaultVoice();
        window.addEventListener('settings-updated', onSettingsUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener('settings-updated', onSettingsUpdated);
        };
    }, []);

    useEffect(() => {
        stopPromptReadAloud();
    }, [currentRev?.id, stopPromptReadAloud]);

    const { parsedParams, capturedEngine, rawMetadata, isReference } = useMemo(() => {
        if (!formData.aiParameters) return { parsedParams: null, capturedEngine: null, rawMetadata: null, isReference: false };
        try {
            const data = JSON.parse(formData.aiParameters);
            const params = data.advanced_params || data;
            const engineId = params.engine_id || data.engine_id || currentRev?.engine;
            const engine = allModels.find(m => m.id === engineId);
            
            // Logic to determine if this is a manual reference source
            const isRef = params.isReference || data.source === 'reference_upload' || engineId === 'reference' || formData.engine === 'reference';
            
            return { parsedParams: params, capturedEngine: engine, rawMetadata: data, isReference: isRef };
        } catch (e) {
            return { parsedParams: null, capturedEngine: null, rawMetadata: null, isReference: false };
        }
    }, [formData.aiParameters, currentRev?.engine, allModels, formData.engine]);

    const fileLocation = useMemo(() => {
        if (!currentRev) return 'Unavailable';
        if (currentRev.storage === 'google-drive') {
            return currentRev.webViewLink || currentRev.webContentLink || currentRev.remoteId || 'Unavailable';
        }
        return currentRev.fileUrl || 'Unavailable';
    }, [currentRev]);

    const handleSuggestId = () => {
        const prefix = isReference ? "ref-" : "artifact-";
        const randomNum = Math.floor(100 + Math.random() * 900);
        const suggestedId = `${prefix}${randomNum}`;
        const currentExt = formData.originalFilename?.split('.').pop() || 'png';
        setFormData({ ...formData, title: suggestedId.toUpperCase(), originalFilename: `${suggestedId}.${currentExt}` });
    };

    const handleCopyPrompt = () => {
        if (!formData.prompt) return;
        navigator.clipboard.writeText(formData.prompt);
        setPromptCopied(true);
        onCopyText(formData.prompt, "Prompt");
        setTimeout(() => setPromptCopied(false), 2000);
    };

    const handleCopyLabel = () => {
        if (!formData.label) return;
        navigator.clipboard.writeText(formData.label);
        setLabelCopied(true);
        onCopyText(formData.label, "Label");
        setTimeout(() => setLabelCopied(false), 2000);
    };

    const handleCopyNote = () => {
        if (!formData.note) return;
        navigator.clipboard.writeText(formData.note);
        setNoteCopied(true);
        onCopyText(formData.note, "Note");
        setTimeout(() => setNoteCopied(false), 2000);
    };

    const handleCopyTags = () => {
        if (!formData.tags) return;
        navigator.clipboard.writeText(formData.tags);
        setTagsCopied(true);
        onCopyText(formData.tags, "Tags");
        setTimeout(() => setTagsCopied(false), 2000);
    };

    const handleCopyLocation = () => {
        if (!fileLocation || fileLocation === 'Unavailable') return;
        navigator.clipboard.writeText(fileLocation);
        setLocationCopied(true);
        onCopyLocation();
        setTimeout(() => setLocationCopied(false), 2000);
    };

    const handlePromptReadAloudToggle = useCallback(() => {
        const text = String(formData.prompt || '').trim();
        if (!text) return;
        const tts = promptTtsControllerRef.current;
        if (!tts || !tts.isSupported()) return;

        const state = tts.getState();
        if (state === 'playing') {
            tts.pause();
            setPromptReadAloudState('paused');
            return;
        }
        if (state === 'paused') {
            tts.resume();
            setPromptReadAloudState('playing');
            return;
        }

        const preferredVoiceURI = String(globalReadAloudDefault.voiceURI || '').trim();
        const preferredVoiceName = String(globalReadAloudDefault.voiceName || '').trim();
        const matchedVoice = preferredVoiceURI
            ? tts.getVoices().find((voice) => String(voice?.voiceURI || '').trim() === preferredVoiceURI)
            : null;
        const started = tts.speak(text, {
            voiceURI: preferredVoiceURI || undefined,
            voiceName: preferredVoiceName || String(matchedVoice?.name || '').trim() || undefined,
            onStart: () => setPromptReadAloudState('playing'),
            onPause: () => setPromptReadAloudState('paused'),
            onResume: () => setPromptReadAloudState('playing'),
            onEnd: () => setPromptReadAloudState('idle'),
            onError: () => setPromptReadAloudState('idle')
        });
        if (!started) setPromptReadAloudState('idle');
    }, [formData.prompt, globalReadAloudDefault.voiceName, globalReadAloudDefault.voiceURI]);

    const parsedTags = useMemo(() => (
        String(formData.tags || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
    ), [formData.tags]);

    return (
        <section className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50 space-y-4">
            <div className="space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5">
                            <FileSignature size={10} className="text-indigo-400"/> Binary Filename
                        </label>
                        <button type="button" onClick={handleSuggestId} className="text-[9px] font-black uppercase bg-indigo-600/10 hover:bg-indigo-600 hover:text-white text-indigo-400 border border-indigo-500/30 px-2 py-1 rounded-lg transition-all flex items-center gap-1 group">
                            <Sparkles size={10} className="group-hover:animate-pulse" /> Suggest ID
                        </button>
                    </div>
                    <input value={formData.originalFilename} onChange={(e) => setFormData({...formData, originalFilename: e.target.value})} className="w-full bg-slate-800 rounded-lg py-2.5 pl-3 pr-8 text-xs text-slate-300 border border-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="artifact_v1.png" />
                    <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5">
                                <FolderKanban size={10} className="text-indigo-400" /> Project Workspace
                            </label>
                        </div>
                        <input
                            value={projectName || 'Unavailable'}
                            readOnly
                            className="w-full bg-slate-950 rounded-lg py-2.5 px-3 text-xs text-slate-400 border border-slate-800"
                            placeholder="Unavailable"
                        />
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] uppercase font-black text-slate-500 flex items-center gap-1.5">
                                <HardDrive size={10} className="text-cyan-400" /> Asset File Location
                            </label>
                            <button
                                type="button"
                                onClick={handleCopyLocation}
                                disabled={fileLocation === 'Unavailable'}
                                className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${locationCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-indigo-400'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                title="Copy location"
                            >
                                {locationCopied ? <Check size={10} /> : <Clipboard size={10} />}
                                {locationCopied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <input
                            value={fileLocation}
                            readOnly
                            className="w-full bg-slate-950 rounded-lg py-2.5 px-3 text-xs text-slate-400 border border-slate-800 font-mono"
                            placeholder="Unavailable"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
                            {isReference ? <Box size={10} className="text-emerald-400" /> : <Bot size={10} className="text-indigo-400"/>}
                            {isReference ? 'Classification: Neural Reference' : 'AI Inference Engine'}
                        </label>
                        <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); onShowParams(); }} 
                            className="text-[10px] flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg transition-all active:scale-95"
                        >
                            <FileText size={10} className="text-indigo-400" /> Raw Data
                        </button>
                    </div>
                    <div className="relative">
                        <select 
                            value={formData.engine} 
                            onChange={(e) => setFormData({...formData, engine: e.target.value})} 
                            className={`w-full appearance-none bg-slate-800 rounded-lg py-2.5 pl-3 pr-8 text-sm border focus:ring-1 focus:ring-indigo-500 outline-none transition-all ${isReference ? 'text-emerald-400 border-emerald-500/30' : 'text-slate-200 border-slate-700'}`}
                        >
                            <optgroup label="Core Intelligence Registry">
                                {allModels.length > 0 ? allModels.map(m => (
                                    <option key={m.id} value={m.id}>{m.label}</option>
                                )) : <option value={formData.engine}>{formData.engine}</option>}
                            </optgroup>
                            <optgroup label="Manual Ingest Classifications">
                                <option value="reference">Source Reference Artifact</option>
                                <option value="other-model">External / Unmapped Node</option>
                            </optgroup>
                        </select>
                        <Tag size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600" />
                    </div>

                    <div className="pt-2">
                        <div className={`flex items-center justify-between w-full p-2.5 bg-slate-950/50 border rounded-t-xl transition-all ${showAdvanced ? 'border-indigo-500/50 border-b-transparent' : 'border-slate-800 rounded-b-xl'}`}>
                            <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-2 group/btn">
                                <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${showAdvanced ? 'text-indigo-400' : 'text-slate-500 group-hover/btn:text-slate-300'}`}>
                                    <Cpu size={12} /> Neural Network Specs
                                </span>
                                <ChevronDown size={12} className={`text-slate-600 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} />
                            </button>
                            {showAdvanced && (
                                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                                    <button onClick={() => setViewMode('visual')} className={`p-1.5 rounded transition-all ${viewMode === 'visual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Visual View"><LayoutPanelLeft size={12} /></button>
                                    <button onClick={() => setViewMode('code')} className={`p-1.5 rounded transition-all ${viewMode === 'code' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="JSON View"><Code2 size={12} /></button>
                                </div>
                            )}
                        </div>
                        
                        {showAdvanced && (
                            <div className="p-4 bg-slate-950 border-x border-b border-indigo-500/30 rounded-b-xl animate-in slide-in-from-top-2 fade-in">
                                {viewMode === 'visual' ? (
                                    <SpecsDisplay
                                        params={parsedParams}
                                        engine={capturedEngine || undefined}
                                        rawMetadata={rawMetadata}
                                        onOpenItemById={onOpenItemById}
                                    />
                                ) : (
                                    <div className="relative group/code">
                                        <pre className="bg-black/80 rounded-xl p-4 text-[10px] font-mono text-indigo-300 overflow-x-auto max-h-80 custom-scrollbar shadow-inner border border-white/5 leading-relaxed">
                                            <code>{JSON.stringify(rawMetadata, null, 2)}</code>
                                        </pre>
                                        <button onClick={() => onCopyText(JSON.stringify(rawMetadata, null, 2), "JSON")} className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-lg opacity-0 group-hover/code:opacity-100 transition-all border border-slate-700 shadow-xl"><Clipboard size={14} /></button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {isReference ? 'Reference Concept / Description' : 'Prompt / Synthesis Context'}
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handlePromptReadAloudToggle}
                                disabled={!formData.prompt.trim() || !isPromptReadAloudSupported}
                                className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${
                                    promptReadAloudState === 'playing'
                                        ? 'text-indigo-300'
                                        : promptReadAloudState === 'paused'
                                            ? 'text-amber-300'
                                            : 'text-slate-500 hover:text-indigo-400'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                                title={!isPromptReadAloudSupported ? 'Read aloud unavailable in this browser' : (promptReadAloudState === 'playing' ? 'Pause reading' : promptReadAloudState === 'paused' ? 'Resume reading' : 'Read prompt aloud')}
                            >
                                <Volume2 size={10} />
                                {!isPromptReadAloudSupported
                                    ? 'Unavailable'
                                    : (promptReadAloudState === 'playing'
                                        ? 'Pause'
                                        : promptReadAloudState === 'paused'
                                            ? 'Resume'
                                            : 'Read')}
                            </button>
                            <button 
                                type="button"
                                onClick={handleCopyPrompt}
                                className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${promptCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-indigo-400'}`}
                                title="Copy Prompt"
                            >
                                {promptCopied ? <Check size={10} /> : <Clipboard size={10} />}
                                {promptCopied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    </div>
                    <textarea value={formData.prompt} onChange={(e) => setFormData({...formData, prompt: e.target.value})} className="w-full min-h-[5rem] bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 resize-y focus:border-indigo-500 outline-none" />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Classification Label
                        </label>
                        <button 
                            type="button"
                            onClick={handleCopyLabel}
                            className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${labelCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-indigo-400'}`}
                            title="Copy Label"
                        >
                            {labelCopied ? <Check size={10} /> : <Clipboard size={10} />}
                            {labelCopied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <input 
                        value={formData.label} 
                        onChange={(e) => setFormData({...formData, label: e.target.value})} 
                        className="block w-full min-w-0 bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" 
                        placeholder="Tag or category..." 
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Tags
                        </label>
                        <button
                            type="button"
                            onClick={handleCopyTags}
                            className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${tagsCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-indigo-400'}`}
                            title="Copy Tags"
                        >
                            {tagsCopied ? <Check size={10} /> : <Clipboard size={10} />}
                            {tagsCopied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <input
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        className="block w-full min-w-0 bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="portrait, editorial, high-contrast"
                    />
                    {parsedTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {parsedTags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200"
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            User Notes
                        </label>
                        <button 
                            type="button"
                            onClick={handleCopyNote}
                            className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${noteCopied ? 'text-emerald-400' : 'text-slate-500 hover:text-indigo-400'}`}
                            title="Copy Note"
                        >
                            {noteCopied ? <Check size={10} /> : <Clipboard size={10} />}
                            {noteCopied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <textarea 
                        value={formData.note} 
                        onChange={(e) => setFormData({...formData, note: e.target.value})} 
                        className="w-full min-h-[4rem] bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 resize-y focus:border-indigo-500 outline-none transition-all" 
                        placeholder="Additional technical details, thoughts, or context..."
                    />
                </div>
            </div>
        </section>
    );
};
