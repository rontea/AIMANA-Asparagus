import React, { useMemo, useState, useRef } from 'react';
import { Terminal, Play, Loader2, AlertTriangle, CheckCircle2, FlaskConical, Clipboard, FileText, ToggleLeft, ToggleRight, Sparkles, Image as ImageIcon, Trash2, Fingerprint, ChevronDown, LayoutPanelLeft, Upload, X, ImageIcon as ImageIconLucide } from 'lucide-react';
import { SandboxResultView } from './SandboxResultView';
import { SpecsDisplay } from '../../item/specs/SpecsDisplay';
import { EngineFeatures } from '../../../hooks/useEngineManagement';

interface SandboxTabProps {
    testPrompt: string;
    onSetTestPrompt: (p: string) => void;
    testImage: string | null;
    onSetTestImage: (img: string | null) => void;
    audioData: string;
    onSetAudioData: (v: string) => void;
    audioFormat: string;
    onSetAudioFormat: (v: string) => void;
    onRunTest: () => void;
    isTesting: boolean;
    testResult: any;
    testError: string | null;
    isUrlDefined: boolean;
    isTested: boolean;
    onSetTested: (v: boolean) => void;
    formData: any;
    setFormData: (data: any) => void;
    features: EngineFeatures;
}

export const SandboxTab: React.FC<SandboxTabProps> = ({ 
    testPrompt, onSetTestPrompt, testImage, onSetTestImage,
    audioData, onSetAudioData, audioFormat, onSetAudioFormat,
    onRunTest, isTesting, testResult, testError, isUrlDefined,
    isTested, onSetTested, formData, setFormData, features
}) => {
    const [showVerifiedSpecs, setShowVerifiedSpecs] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const data = formData || {};
    const isAudio = data.category === 'Audio';
    const supportsAudioInput = useMemo(() => {
        try {
            const parsed = data.configJson ? JSON.parse(data.configJson) : {};
            const inputs = Array.isArray(parsed.textInputModalities)
                ? parsed.textInputModalities.map((m: any) => String(m || '').toLowerCase())
                : [];
            return inputs.includes('audio');
        } catch (_e) {
            return false;
        }
    }, [data.configJson]);

    const handlePromoteToVerified = () => {
        if (!testResult || (testResult.type !== 'binary' && testResult.type !== 'text')) return;
        setFormData({ 
            ...data, 
            verifiedPrompt: testPrompt,
            verifiedResult: testResult.base64 || testResult.content,
            verifiedMimeType: testResult.mimeType || 'text/plain',
            verifiedParams: JSON.stringify(testResult.metadata || {}),
            isTested: true
        });
    };

    const handleClearVerified = () => {
        setFormData({
            ...data,
            verifiedPrompt: '',
            verifiedResult: '',
            verifiedMimeType: '',
            verifiedParams: '',
            isTested: false
        });
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => onSetTestImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const inferAudioFormat = (file: File) => {
        const lowerType = (file.type || '').toLowerCase();
        if (lowerType.includes('wav')) return 'wav';
        if (lowerType.includes('ogg')) return 'ogg';
        if (lowerType.includes('mp4')) return 'mp4';
        if (lowerType.includes('m4a')) return 'm4a';
        if (lowerType.includes('mpeg') || lowerType.includes('mp3')) return 'mp3';
        if (lowerType.includes('aac')) return 'aac';
        if (lowerType.includes('flac')) return 'flac';
        if (lowerType.includes('opus')) return 'opus';
        if (lowerType.includes('webm')) return 'webm';
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext) return ext;
        return 'mp3';
    };

    const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result !== 'string') return;
            onSetAudioFormat(inferAudioFormat(file));
            onSetAudioData(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const verifiedParams = useMemo(() => {
        if (!data.verifiedParams) return null;
        try {
            return JSON.parse(data.verifiedParams);
        } catch (e) {
            return null;
        }
    }, [data.verifiedParams]);

    return (
        <div className="space-y-6 animate-in fade-in h-full flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0">
                <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2">
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-inner">
                        <div className="flex items-center gap-2">
                            <Terminal size={16} className="text-indigo-400" />
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sandbox Input</label>
                        </div>

                        {/* Conditional Image Reference Block */}
                        {!isAudio && features.showImageInput && (
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <ImageIconLucide size={12} className="text-blue-400" /> Neural Visual Reference
                                </label>
                                <div 
                                    onClick={() => !testImage && fileInputRef.current?.click()}
                                    className={`relative group h-32 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden ${
                                        testImage ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-800 bg-black/40 hover:border-blue-500/30 hover:bg-blue-500/5'
                                    }`}
                                >
                                    {testImage ? (
                                        <>
                                            <img src={testImage} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="Test Reference" />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onSetTestImage(null); }}
                                                    className="p-2 bg-red-600 text-white rounded-full shadow-2xl hover:bg-red-500 transition-all active:scale-95"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center space-y-1">
                                            <div className="p-2 bg-slate-800 rounded-xl text-slate-500 group-hover:text-blue-400 transition-colors mx-auto w-fit">
                                                <Upload size={16} />
                                            </div>
                                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Reference Image</p>
                                            <p className="text-[8px] text-slate-600 font-medium">Click to upload a sandbox reference image</p>
                                        </div>
                                    )}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                </div>
                            </div>
                        )}

                        {isAudio && supportsAudioInput && (
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <Upload size={12} className="text-pink-400" /> Audio Input (Transcription)
                                </label>
                                <div 
                                    onClick={() => !audioData && audioInputRef.current?.click()}
                                    className={`relative group h-24 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden ${
                                        audioData ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-800 bg-black/40 hover:border-pink-500/30 hover:bg-pink-500/5'
                                    }`}
                                >
                                    {audioData ? (
                                        <div className="text-center space-y-1">
                                            <p className="text-[9px] font-black uppercase text-pink-300 tracking-widest">Audio Loaded</p>
                                            <p className="text-[8px] text-slate-500 font-medium">Format: {audioFormat || 'mp3'}</p>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onSetAudioData(''); onSetAudioFormat('mp3'); }}
                                                className="mt-2 px-3 py-1 rounded-lg text-[9px] font-black uppercase bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                                            >
                                                Clear Audio
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center space-y-1">
                                            <div className="p-2 bg-slate-800 rounded-xl text-slate-500 group-hover:text-pink-400 transition-colors mx-auto w-fit">
                                                <Upload size={16} />
                                            </div>
                                            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Upload Audio File</p>
                                            <p className="text-[8px] text-slate-600 font-medium">Click to select a file for transcription</p>
                                        </div>
                                    )}
                                    <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleAudioUpload} />
                                </div>
                                <p className="text-[8px] text-slate-600 font-medium px-1">
                                    Use Whisper Large V3, Whisper 1, or Scribe to convert audio to text.
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">
                                {isAudio ? 'Audio Prompt (TTS / Music)' : 'Evolutionary Manifest (Prompt)'}
                            </label>
                            <textarea 
                                value={testPrompt} 
                                onChange={(e) => onSetTestPrompt(e.target.value)} 
                                className="w-full h-24 bg-black border border-slate-800 rounded-xl p-4 text-xs text-white outline-none resize-none focus:border-indigo-500 shadow-inner" 
                                placeholder="Enter a prompt to test your logic..."
                            />
                        </div>

                        <button 
                            onClick={onRunTest} 
                            disabled={isTesting || !isUrlDefined}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            {isTesting ? 'Simulating Pipeline...' : 'Run Neural Test'}
                        </button>
                        {!isUrlDefined && (
                            <p className="text-[9px] text-amber-400 font-bold text-center flex items-center justify-center gap-1.5">
                                <AlertTriangle size={10} /> Define Endpoint URL in Network tab first
                            </p>
                        )}
                    </div>

                    {/* Verified Reference & Golden Manifest */}
                    <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-[2rem] space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                                    <Shield size={16} />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Verified Blueprint</h4>
                                    <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">Saved Prompt + Control Snapshot</p>
                                </div>
                            </div>

                            <button 
                                onClick={() => onSetTested(!isTested)}
                                className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${
                                    isTested 
                                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' 
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-emerald-400'
                                }`}
                            >
                                <span className="text-[9px] font-black uppercase tracking-widest">{isTested ? 'System Functional' : 'Awaiting Test'}</span>
                                {isTested ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <ImageIcon size={10} /> Golden Artifact
                                    </label>
                                    {testResult && (testResult.type === 'binary' || testResult.type === 'text') && !isTesting && (
                                        <button 
                                            onClick={handlePromoteToVerified}
                                            className="text-[8px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                        >
                                            <Sparkles size={10} /> Promote Current to Verified
                                        </button>
                                    )}
                                </div>
                                <p className="px-1 text-[9px] text-slate-500 leading-relaxed">
                                    Verified captures store the prompt, rendered result, and the request controls resolved from the current sandbox defaults.
                                </p>
                                
                                <div className="bg-black/60 border border-slate-800 rounded-2xl overflow-hidden min-h-[160px] flex flex-col relative group">
                                    {data.verifiedResult ? (
                                        <>
                                            <div className="flex-1 flex items-center justify-center p-4">
                                                {data.verifiedMimeType?.includes('video') ? (
                                                    <video src={`data:${data.verifiedMimeType};base64,${data.verifiedResult}`} className="max-w-full max-h-48 rounded-lg shadow-2xl" autoPlay loop muted />
                                                ) : data.verifiedMimeType?.includes('image') ? (
                                                    <img src={`data:${data.verifiedMimeType};base64,${data.verifiedResult}`} className="max-w-full max-h-48 object-contain rounded-lg shadow-2xl" alt="Verified result" />
                                                ) : data.verifiedMimeType?.includes('audio') ? (
                                                    <audio controls className="w-full">
                                                        <source src={`data:${data.verifiedMimeType};base64,${data.verifiedResult}`} />
                                                    </audio>
                                                ) : (
                                                    <div className="p-4 bg-black rounded border border-white/5 font-mono text-[10px] text-emerald-400 w-full max-h-48 overflow-y-auto">
                                                        <pre className="whitespace-pre-wrap">{data.verifiedResult}</pre>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between gap-3">
                                                <p className="text-[9px] text-indigo-300 font-mono line-clamp-1 italic">"{data.verifiedPrompt}"</p>
                                                {verifiedParams && (
                                                    <button 
                                                        onClick={() => setShowVerifiedSpecs(!showVerifiedSpecs)}
                                                        className={`p-1.5 rounded-lg border transition-all ${showVerifiedSpecs ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'}`}
                                                        title="Toggle captured controls"
                                                    >
                                                        <Fingerprint size={12} />
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {showVerifiedSpecs && verifiedParams && (
                                                <div className="p-4 bg-slate-950 border-t border-slate-800 animate-in slide-in-from-top-2">
                                                    <SpecsDisplay params={verifiedParams} />
                                                </div>
                                            )}

                                            <button 
                                                onClick={handleClearVerified}
                                                className="absolute top-2 right-2 p-2 bg-red-900/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Clear Golden Reference"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center py-10 opacity-20 text-slate-500">
                                            <Sparkles size={32} strokeWidth={1} />
                                            <span className="text-[9px] font-black uppercase mt-3 tracking-widest">No Golden Test Recorded</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <FileText size={10} /> Verification Notes
                                </label>
                                <textarea 
                                    value={data.verificationNotes || ''}
                                    onChange={(e) => setFormData({ ...data, verificationNotes: e.target.value })}
                                    className="w-full h-24 bg-black border border-slate-800 rounded-xl p-3 text-xs text-slate-400 outline-none resize-none focus:border-indigo-500 transition-all shadow-inner"
                                    placeholder="Add technical observations, infrastructure status, or performance notes..."
                                />
                            </div>
                        </div>
                    </div>

                    {testError && (
                        <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-2xl flex items-start gap-3 text-red-400 animate-in shake">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                            <div className="text-xs font-medium leading-relaxed">{testError}</div>
                        </div>
                    )}
                </div>

                <div className="bg-black border border-slate-800 rounded-[3rem] overflow-hidden flex flex-col relative shadow-2xl">
                    <div className="absolute top-0 right-0 p-4 z-10">
                        <span className="text-[8px] font-black bg-slate-900 text-slate-500 px-2 py-1 rounded-lg border border-slate-800 uppercase tracking-widest shadow-xl">Inference Port</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-8">
                        <SandboxResultView result={testResult} isLoading={isTesting} />
                    </div>
                </div>
            </div>
        </div>
    );
};

interface ShieldProps {
    size?: number;
}
const Shield: React.FC<ShieldProps> = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
