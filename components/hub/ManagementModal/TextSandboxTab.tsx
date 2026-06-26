import React, { useMemo, useRef, useState } from 'react';
import {
    Terminal, Play, Loader2, AlertTriangle, Copy, Check, ShieldCheck,
    ToggleLeft, ToggleRight, Sparkles, Clock3, Fingerprint, Upload,
    Image as ImageIcon, Music, Film, Info
} from 'lucide-react';

interface TextSandboxTabProps {
    testPrompt: string;
    onSetTestPrompt: (p: string) => void;
    textSandboxImageInput: string;
    onSetTextSandboxImageInput: (v: string) => void;
    textSandboxAudioData: string;
    onSetTextSandboxAudioData: (v: string) => void;
    textSandboxAudioFormat: string;
    onSetTextSandboxAudioFormat: (v: string) => void;
    textSandboxVideoInput: string;
    onSetTextSandboxVideoInput: (v: string) => void;
    onRunTest: () => void;
    isTesting: boolean;
    testResult: any;
    testError: string | null;
    isUrlDefined: boolean;
    isTested: boolean;
    onSetTested: (v: boolean) => void;
    formData: any;
    setFormData: (data: any) => void;
}

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(value || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (_e) {}
    };
    return (
        <button
            onClick={onCopy}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5 transition-all"
        >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? 'Copied' : label}
        </button>
    );
};

export const TextSandboxTab: React.FC<TextSandboxTabProps> = ({
    testPrompt,
    onSetTestPrompt,
    textSandboxImageInput,
    onSetTextSandboxImageInput,
    textSandboxAudioData,
    onSetTextSandboxAudioData,
    textSandboxAudioFormat,
    onSetTextSandboxAudioFormat,
    textSandboxVideoInput,
    onSetTextSandboxVideoInput,
    onRunTest,
    isTesting,
    testResult,
    testError,
    isUrlDefined,
    isTested,
    onSetTested,
    formData,
    setFormData
}) => {
    const data = formData || {};
    const diagnostics = testResult?.diagnostics || {};
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const audioInputRef = useRef<HTMLInputElement | null>(null);
    const videoInputRef = useRef<HTMLInputElement | null>(null);

    const supportedInputModalities = useMemo(() => {
        try {
            const parsed = data.configJson ? JSON.parse(data.configJson) : {};
            const raw = Array.isArray(parsed.textInputModalities) && parsed.textInputModalities.length > 0
                ? parsed.textInputModalities
                : ['text'];
            return raw.map((m: any) => String(m || '').toLowerCase()).filter(Boolean);
        } catch (_e) {
            return ['text'];
        }
    }, [data.configJson]);
    const supportedOutputModalities = useMemo(() => {
        try {
            const parsed = data.configJson ? JSON.parse(data.configJson) : {};
            const raw = Array.isArray(parsed.textOutputModalities) ? parsed.textOutputModalities : ['text'];
            return raw.map((m: any) => String(m || '').toLowerCase()).filter(Boolean);
        } catch (_e) {
            return ['text'];
        }
    }, [data.configJson]);

    const supportsImage = supportedInputModalities.includes('image');
    const supportsAudio = supportedInputModalities.includes('audio');
    const supportsVideo = supportedInputModalities.includes('video');

    const preRunWarnings = useMemo(() => {
        const warnings: string[] = [];
        if (textSandboxImageInput && !supportsImage) warnings.push('Image input is set but this model does not support image input.');
        if (textSandboxAudioData && !supportsAudio) warnings.push('Audio input is set but this model does not support audio input.');
        if (textSandboxVideoInput && !supportsVideo) warnings.push('Video input is set but this model does not support video input.');
        if (supportsAudio && supportedOutputModalities.includes('audio') && !textSandboxAudioData) {
            warnings.push('This model may require audio input/output settings. Text-only runs can fail.');
        }
        if (!testPrompt.trim()) warnings.push('Prompt is empty.');
        return warnings;
    }, [testPrompt, textSandboxImageInput, textSandboxAudioData, textSandboxVideoInput, supportsImage, supportsAudio, supportsVideo, supportedOutputModalities]);

    const rawPayload = useMemo(() => {
        try {
            return JSON.stringify(testResult?.raw || {}, null, 2);
        } catch (_e) {
            return '{}';
        }
    }, [testResult]);

    const backendWarnings = Array.isArray(diagnostics?.warnings) ? diagnostics.warnings : [];
    const capabilityChecks = diagnostics?.capabilityChecks || {};

    const handleImageUpload = async (file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') onSetTextSandboxImageInput(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleAudioUpload = async (file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') return;
            const split = reader.result.split(',');
            if (split.length < 2) return;
            const subtype = ((file.type || '').split('/')[1] || '').toLowerCase();
            const formatMap: Record<string, string> = {
                mpeg: 'mp3',
                mp3: 'mp3',
                wav: 'wav',
                'x-wav': 'wav',
                flac: 'flac',
                opus: 'opus',
                pcm: 'pcm16',
                'x-pcm': 'pcm16'
            };
            const inferred = formatMap[subtype] || 'mp3';
            onSetTextSandboxAudioFormat(inferred);
            onSetTextSandboxAudioData(split[1]);
        };
        reader.readAsDataURL(file);
    };

    const handleVideoUpload = async (file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') onSetTextSandboxVideoInput(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handlePromoteToVerified = () => {
        if (!testResult?.content) return;
        setFormData({
            ...data,
            verifiedPrompt: testPrompt,
            verifiedResult: testResult.content,
            verifiedMimeType: 'text/plain',
            verifiedParams: JSON.stringify({
                ...(testResult?.metadata || {}),
                diagnostics: testResult?.diagnostics || {},
                raw: testResult?.raw || {}
            }),
            isTested: true
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in h-full flex flex-col">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1 min-h-0">
                <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2">
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-inner">
                        <div className="flex items-center gap-2">
                            <Terminal size={16} className="text-cyan-400" />
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Text Sandbox Input</label>
                        </div>

                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[10px] text-slate-300 flex items-start gap-2">
                            <Info size={12} className="text-cyan-300 mt-[1px]" />
                            <div>
                                Supported input modalities: <span className="text-cyan-200 font-bold">{supportedInputModalities.join(', ')}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Prompt</label>
                            <textarea
                                value={testPrompt}
                                onChange={(e) => onSetTestPrompt(e.target.value)}
                                className="w-full h-36 bg-black border border-slate-800 rounded-xl p-4 text-xs text-white outline-none resize-none focus:border-cyan-500 shadow-inner"
                                placeholder="Enter a text prompt to test this Language model..."
                            />
                        </div>

                        {supportsImage && (
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                    <ImageIcon size={11} /> Image Input (URL or Upload)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        value={textSandboxImageInput}
                                        onChange={(e) => onSetTextSandboxImageInput(e.target.value)}
                                        className="flex-1 bg-black border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                                        placeholder="https://... or data:image/...;base64,..."
                                    />
                                    <input
                                        ref={imageInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleImageUpload(e.target.files?.[0])}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => imageInputRef.current?.click()}
                                        className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5"
                                    >
                                        <Upload size={11} /> Upload
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onSetTextSandboxImageInput('')}
                                        className="px-3 py-2 rounded-xl border border-slate-800 bg-black hover:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-400"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}

                        {supportsAudio && (
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                    <Music size={11} /> Audio Input (Upload / Base64)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        value={textSandboxAudioData}
                                        onChange={(e) => onSetTextSandboxAudioData(e.target.value)}
                                        className="flex-1 bg-black border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                                        placeholder="Base64 audio payload"
                                    />
                                    <input
                                        value={textSandboxAudioFormat}
                                        onChange={(e) => onSetTextSandboxAudioFormat(e.target.value)}
                                        className="w-20 bg-black border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                                        placeholder="mp3"
                                    />
                                    <input
                                        ref={audioInputRef}
                                        type="file"
                                        accept="audio/*"
                                        className="hidden"
                                        onChange={(e) => handleAudioUpload(e.target.files?.[0])}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => audioInputRef.current?.click()}
                                        className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5"
                                    >
                                        <Upload size={11} /> Upload
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onSetTextSandboxAudioData('')}
                                        className="px-3 py-2 rounded-xl border border-slate-800 bg-black hover:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-400"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}

                        {supportsVideo && (
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                    <Film size={11} /> Video Input (URL or Upload)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        value={textSandboxVideoInput}
                                        onChange={(e) => onSetTextSandboxVideoInput(e.target.value)}
                                        className="flex-1 bg-black border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                                        placeholder="https://... or data:video/...;base64,..."
                                    />
                                    <input
                                        ref={videoInputRef}
                                        type="file"
                                        accept="video/*"
                                        className="hidden"
                                        onChange={(e) => handleVideoUpload(e.target.files?.[0])}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => videoInputRef.current?.click()}
                                        className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5"
                                    >
                                        <Upload size={11} /> Upload
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onSetTextSandboxVideoInput('')}
                                        className="px-3 py-2 rounded-xl border border-slate-800 bg-black hover:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-400"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}

                        {preRunWarnings.length > 0 && (
                            <div className="p-3 bg-amber-900/20 border border-amber-800/60 rounded-xl space-y-1">
                                {preRunWarnings.map((warning: string) => (
                                    <div key={warning} className="text-[10px] text-amber-300 flex items-start gap-1.5">
                                        <AlertTriangle size={11} className="mt-[1px]" /> {warning}
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={onRunTest}
                            disabled={isTesting || !isUrlDefined || !testPrompt.trim()}
                            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            {isTesting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            {isTesting ? 'Running Text Pipeline...' : 'Run Text Test'}
                        </button>
                        {!isUrlDefined && (
                            <p className="text-[9px] text-amber-400 font-bold text-center flex items-center justify-center gap-1.5">
                                <AlertTriangle size={10} /> Define Endpoint URL in Network tab first
                            </p>
                        )}
                    </div>

                    <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-3xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Verification State</span>
                            </div>
                            <button
                                onClick={() => onSetTested(!isTested)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                                    isTested ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}
                            >
                                <span className="text-[9px] font-black uppercase tracking-widest">{isTested ? 'Verified' : 'Pending'}</span>
                                {isTested ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handlePromoteToVerified}
                                disabled={!testResult?.content || isTesting}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
                            >
                                <Sparkles size={12} /> Promote to Verified
                            </button>
                            {testResult?.content && <CopyButton value={testResult.content} label="Copy Response" />}
                            {rawPayload && <CopyButton value={rawPayload} label="Copy Raw JSON" />}
                            {testPrompt && <CopyButton value={testPrompt} label="Copy Prompt" />}
                        </div>
                        <textarea
                            value={data.verificationNotes || ''}
                            onChange={(e) => setFormData({ ...data, verificationNotes: e.target.value })}
                            className="w-full h-24 bg-black border border-slate-800 rounded-xl p-3 text-xs text-slate-400 outline-none resize-none focus:border-cyan-500 transition-all shadow-inner"
                            placeholder="Add text-model specific validation notes..."
                        />
                    </div>
                </div>

                <div className="bg-black border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col min-h-0">
                    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <Fingerprint size={12} className="text-cyan-400" />
                            Text Diagnostics
                        </div>
                        {diagnostics?.latencyMs !== undefined && (
                            <div className="text-[9px] font-black uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
                                <Clock3 size={11} /> {diagnostics.latencyMs}ms
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr_auto]">
                        <div className="p-4 border-b border-slate-800 grid grid-cols-2 gap-2 text-[9px] font-bold uppercase tracking-widest">
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Engine: <span className="text-white">{diagnostics.engineId || data.id || '-'}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Upstream: <span className="text-white">{diagnostics.upstreamId || data.upstreamId || '-'}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Payload Mode: <span className="text-white">{diagnostics.payloadMode || '-'}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Request ID: <span className="text-white">{diagnostics.requestId || '-'}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Supported Modalities: <span className="text-white">{(capabilityChecks.supportedInputModalities || []).join(', ') || '-'}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Requested Modalities: <span className="text-white">{(capabilityChecks.requestedModalities || []).join(', ') || '-'}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Tools: <span className="text-white">{capabilityChecks.tools === null || capabilityChecks.tools === undefined ? '-' : String(capabilityChecks.tools)}</span>
                            </div>
                            <div className="bg-slate-900 rounded-lg border border-slate-800 p-2 text-slate-400">
                                Reasoning: <span className="text-white">{capabilityChecks.reasoning === null || capabilityChecks.reasoning === undefined ? '-' : String(capabilityChecks.reasoning)}</span>
                            </div>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar p-4 space-y-4">
                            {isTesting && (
                                <div className="flex items-center gap-2 text-cyan-300 text-[10px] font-black uppercase tracking-widest">
                                    <Loader2 size={12} className="animate-spin" /> Running text sandbox...
                                </div>
                            )}
                            {!isTesting && !testResult?.content && !testError && (
                                <div className="text-slate-600 text-[10px] font-black uppercase tracking-widest">
                                    Run a text test to see response and raw payload.
                                </div>
                            )}
                            {backendWarnings.length > 0 && (
                                <div className="p-3 bg-amber-900/20 border border-amber-800/60 rounded-xl space-y-1">
                                    {backendWarnings.map((warning: string) => (
                                        <div key={warning} className="text-[10px] text-amber-300 flex items-start gap-1.5">
                                            <AlertTriangle size={11} className="mt-[1px]" /> {warning}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {testResult && Object.prototype.hasOwnProperty.call(testResult, 'content') && (
                                <div>
                                    <div className="text-[9px] font-black uppercase tracking-widest text-emerald-300 mb-2">Response</div>
                                    <pre className="whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-emerald-300 leading-relaxed">
                                        {testResult.content || '(empty response body)'}
                                    </pre>
                                </div>
                            )}
                            {testError && (
                                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-300 text-xs">
                                    {testError}
                                </div>
                            )}
                        </div>
                        <div className="border-t border-slate-800 p-3 bg-slate-950/70">
                            <details>
                                <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    Raw Payload (Debug)
                                </summary>
                                <pre className="mt-2 whitespace-pre-wrap bg-black border border-slate-800 rounded-xl p-3 text-[10px] text-slate-300 max-h-56 overflow-y-auto custom-scrollbar">
                                    {rawPayload}
                                </pre>
                            </details>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
