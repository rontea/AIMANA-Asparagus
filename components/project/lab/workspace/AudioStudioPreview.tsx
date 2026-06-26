import React, { useMemo, useState } from 'react';
import {
    AudioLines,
    Mic,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Wand2,
    Loader2,
    Dices
} from 'lucide-react';
import { ModelOption, SupportedEngine } from '../ModelSelectorModal';
import { DynamicParam } from '../../../../hooks/useLabState';
import { LabMode } from '../GenerateImageModal';
import { formatPollenAmount } from '../../../../utils/pollenCredits';

interface AudioStudioPreviewProps {
    title: string;
    onSetTitle: (t: string) => void;
    prompt: string;
    onSetPrompt: (p: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    model: SupportedEngine;
    activeModel?: ModelOption | null;
    onOpenModelSelector: () => void;
    seed: string;
    onSetSeed: (v: string) => void;
    onRandomizeSeed: () => void;
    selectedVoice: string;
    onSetSelectedVoice: (v: string) => void;
    showSeed: boolean;
    paramSchema: DynamicParam[];
    dynamicParams: Record<string, any>;
    onSetDynamicParam: (key: string, value: any) => void;
    availableVoices?: string[];
    isPodcast?: boolean;
    mode?: LabMode;
}

const LIBRARY_VOICES = [
    'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'coral', 'sage',
    'verse', 'rachel', 'domi', 'bella', 'elli', 'charlotte', 'dorothy', 'sarah', 'emily',
    'lily', 'matilda', 'adam', 'antoni', 'arnold', 'josh', 'sam', 'daniel', 'charlie',
    'james', 'fin', 'callum', 'liam', 'george', 'brian', 'bill'
];

const RESPONSE_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'];
const RESERVED_PARAM_KEYS = new Set([
    'voiceName',
    'image',
    'response_format',
    'multiSpeakerEnabled',
    'speakerOneName',
    'speakerOneVoice',
    'speakerTwoName',
    'speakerTwoVoice'
]);
const MUSIC_STYLE_FALLBACK_PARAM: DynamicParam = {
    key: 'style',
    label: 'Style',
    type: 'text',
    default: '',
    description: 'Optional style guidance for music generation.'
};
const MUSIC_INSTRUMENTAL_FALLBACK_PARAM: DynamicParam = {
    key: 'instrumental',
    label: 'Instrumental Only',
    type: 'toggle',
    default: false,
    description: 'Generate instrumental output only.'
};

export const AudioStudioPreview: React.FC<AudioStudioPreviewProps> = ({
    title,
    onSetTitle,
    prompt,
    onSetPrompt,
    onGenerate,
    isGenerating,
    model,
    activeModel = null,
    onOpenModelSelector,
    seed,
    onSetSeed,
    onRandomizeSeed,
    selectedVoice,
    onSetSelectedVoice,
    showSeed,
    paramSchema,
    dynamicParams,
    onSetDynamicParam,
    availableVoices,
    isPodcast,
    mode = 'audio'
}) => {
    const isMusicMode = mode === 'music';
    const isGenerateDisabled = isGenerating || !prompt.trim();
    const modelLabel = String(model).replace('pollinations-', '').replace('gemini-', '');
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);

    const voiceParam = useMemo(() => paramSchema.find((p) => p.key === 'voiceName'), [paramSchema]);
    const multiSpeakerParam = useMemo(() => paramSchema.find((p) => p.key === 'multiSpeakerEnabled'), [paramSchema]);
    const speakerOneNameParam = useMemo(() => paramSchema.find((p) => p.key === 'speakerOneName'), [paramSchema]);
    const speakerOneVoiceParam = useMemo(() => paramSchema.find((p) => p.key === 'speakerOneVoice'), [paramSchema]);
    const speakerTwoNameParam = useMemo(() => paramSchema.find((p) => p.key === 'speakerTwoName'), [paramSchema]);
    const speakerTwoVoiceParam = useMemo(() => paramSchema.find((p) => p.key === 'speakerTwoVoice'), [paramSchema]);
    const responseFormatParam = useMemo(() => paramSchema.find((p) => p.key === 'response_format'), [paramSchema]);
    const durationParam = useMemo(() => paramSchema.find((p) => p.key === 'duration'), [paramSchema]);

    const multiSpeakerEnabled = Boolean(dynamicParams.multiSpeakerEnabled ?? multiSpeakerParam?.default ?? false);
    const controlParams = useMemo(
        () => paramSchema.filter((p) => !RESERVED_PARAM_KEYS.has(p.key)),
        [paramSchema]
    );
    const effectiveControlParams = useMemo(() => {
        if (!isMusicMode) return controlParams;
        const hasStyleControl = controlParams.some((param) => param.key === 'style');
        const hasInstrumentalControl = controlParams.some((param) => param.key === 'instrumental');
        const next = [...controlParams];
        if (!hasStyleControl) next.push(MUSIC_STYLE_FALLBACK_PARAM);
        if (!hasInstrumentalControl) next.push(MUSIC_INSTRUMENTAL_FALLBACK_PARAM);
        return next;
    }, [controlParams, isMusicMode]);

    const libraryVoices = useMemo(() => {
        const schemaVoices = voiceParam?.options?.map((opt) => String(opt.value)).filter(Boolean) || [];
        const baseVoices = schemaVoices.length > 0
            ? schemaVoices
            : (availableVoices && availableVoices.length > 0 ? availableVoices : LIBRARY_VOICES);
        return Array.from(new Set(baseVoices));
    }, [availableVoices, voiceParam]);

    const responseFormatValue = dynamicParams.response_format ?? responseFormatParam?.default ?? 'mp3';
    const supportsVoice = Boolean(voiceParam) || (availableVoices && availableVoices.length > 0);
    const responseFormatOptions = useMemo(() => {
        if (responseFormatParam?.options && responseFormatParam.options.length > 0) {
            return responseFormatParam.options.map((opt) => ({
                label: String(opt.label || opt.value).toUpperCase(),
                value: String(opt.value)
            }));
        }
        return RESPONSE_FORMATS.map((fmt) => ({ label: fmt.toUpperCase(), value: fmt }));
    }, [responseFormatParam]);
    const responseFormatLabel = useMemo(() => {
        const match = responseFormatOptions.find((opt) => opt.value === String(responseFormatValue));
        return match?.label || String(responseFormatValue || 'mp3').toUpperCase();
    }, [responseFormatOptions, responseFormatValue]);
    const fallbackControlHints = useMemo(() => {
        const hints = [];
        if (supportsVoice && !multiSpeakerEnabled) hints.push('Voice');
        if (responseFormatParam) hints.push('Response Format');
        if (!isMusicMode && multiSpeakerParam) hints.push('Two-Speaker Mode');
        return hints;
    }, [isMusicMode, multiSpeakerEnabled, multiSpeakerParam, responseFormatParam, supportsVoice]);

    const outputLabel = responseFormatParam ? responseFormatLabel : 'PCM 24k';
    const primaryVoiceValue = String(dynamicParams.voiceName ?? voiceParam?.default ?? selectedVoice ?? libraryVoices[0] ?? 'Kore');
    const requestedMusicDuration = Number(dynamicParams.duration ?? durationParam?.default ?? 30);
    const promptCharacterCount = useMemo(() => String(prompt || '').length, [prompt]);

    const estimateDurationSeconds = useMemo(() => {
        if (isMusicMode && Number.isFinite(requestedMusicDuration) && requestedMusicDuration > 0) {
            return Math.round(requestedMusicDuration);
        }
        const text = String(prompt || '').trim();
        if (!text) return 0;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const baseSeconds = (wordCount / 150) * 60;
        const punctuationPauses = (text.match(/[.!?;:]/g) || []).length * 0.3;
        const commaPauses = (text.match(/[,]/g) || []).length * 0.15;
        const newlinePauses = (text.match(/\n+/g) || []).length * 0.6;
        return Math.max(1, Math.round(baseSeconds + punctuationPauses + commaPauses + newlinePauses));
    }, [isMusicMode, prompt, requestedMusicDuration]);

    const formattedDuration = useMemo(() => {
        const total = Math.max(0, Math.round(estimateDurationSeconds));
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, [estimateDurationSeconds]);

    const estimatedLabel = estimateDurationSeconds ? `${estimateDurationSeconds}s` : '--';
    const textPricing = activeModel?.textPricing && typeof activeModel.textPricing === 'object'
        ? activeModel.textPricing
        : null;
    const toFiniteNumber = (value: unknown): number | null => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    };
    const completionAudioTokenRate = toFiniteNumber(textPricing?.completionAudioTokens);
    const completionAudioSecondRate = toFiniteNumber(textPricing?.completionAudioSeconds);
    const promptAudioSecondRate = toFiniteNumber(textPricing?.promptAudioSeconds);
    const secondRate = completionAudioSecondRate ?? promptAudioSecondRate;
    const estimatedPollen = useMemo(() => {
        if (isMusicMode) return null;
        const hasPrompt = String(prompt || '').trim().length > 0;
        if (!hasPrompt) return null;
        if (completionAudioTokenRate !== null) {
            // Pollinations audio token pricing for TTS is surfaced as pollen per character.
            return Number((promptCharacterCount * completionAudioTokenRate).toFixed(6));
        }
        if (secondRate !== null && estimateDurationSeconds > 0) {
            return Number((estimateDurationSeconds * secondRate).toFixed(6));
        }
        return null;
    }, [completionAudioTokenRate, estimateDurationSeconds, isMusicMode, prompt, promptCharacterCount, secondRate]);
    const characterCountLabel = `${promptCharacterCount.toLocaleString()} chars`;
    const estimatedPollenLabel = estimatedPollen !== null ? `~${formatPollenAmount(estimatedPollen)} pollen` : null;
    const rateLabel = useMemo(() => {
        if (completionAudioTokenRate !== null) {
            return `${formatPollenAmount(completionAudioTokenRate * 1000)} / 1K chars`;
        }
        if (secondRate !== null) {
            return `${formatPollenAmount(secondRate)} / sec`;
        }
        return null;
    }, [completionAudioTokenRate, secondRate]);

    const handleSelectVoice = (voice: string) => {
        onSetSelectedVoice(voice);
        if (voiceParam) onSetDynamicParam('voiceName', voice);
    };

    const renderParamControl = (param: DynamicParam) => {
        const currentValue = dynamicParams[param.key] ?? param.default;

        if (param.type === 'select') {
            return (
                <div key={param.key} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{param.label}</label>
                    <select
                        value={currentValue}
                        onChange={(e) => onSetDynamicParam(param.key, e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-200"
                    >
                        {param.options?.map((opt) => (
                            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                        ))}
                    </select>
                    {param.description && <p className="text-[10px] text-slate-500">{param.description}</p>}
                </div>
            );
        }

        if (param.type === 'slider') {
            const min = param.min ?? 0;
            const max = param.max ?? 100;
            const step = param.step ?? 1;
            return (
                <div key={param.key} className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span>{param.label}</span>
                        <span className="text-emerald-300">{currentValue}</span>
                    </div>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={currentValue}
                        onChange={(e) => onSetDynamicParam(param.key, Number(e.target.value))}
                        className="w-full accent-emerald-500"
                    />
                    {param.description && <p className="text-[10px] text-slate-500">{param.description}</p>}
                </div>
            );
        }

        if (param.type === 'toggle') {
            return (
                <button
                    key={param.key}
                    onClick={() => onSetDynamicParam(param.key, !currentValue)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                        currentValue ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-slate-950/50 border-slate-800 text-slate-500'
                    }`}
                >
                    <span>{param.label}</span>
                    <span>{currentValue ? 'On' : 'Off'}</span>
                </button>
            );
        }

        if (param.type === 'textarea') {
            return (
                <div key={param.key} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{param.label}</label>
                    <textarea
                        value={currentValue}
                        onChange={(e) => onSetDynamicParam(param.key, e.target.value)}
                        rows={4}
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-200 resize-y custom-scrollbar"
                    />
                    {param.description && <p className="text-[10px] text-slate-500">{param.description}</p>}
                </div>
            );
        }

        return (
            <div key={param.key} className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{param.label}</label>
                <input
                    type="text"
                    value={currentValue}
                    onChange={(e) => onSetDynamicParam(param.key, e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-200"
                />
                {param.description && <p className="text-[10px] text-slate-500">{param.description}</p>}
            </div>
        );
    };

    const renderSpeakerCard = (
        id: string,
        dotClass: string,
        nameParam?: DynamicParam,
        voiceSelectParam?: DynamicParam
    ) => {
        if (!nameParam || !voiceSelectParam) return null;

        const nameValue = String(dynamicParams[nameParam.key] ?? nameParam.default ?? '');
        const voiceValue = String(dynamicParams[voiceSelectParam.key] ?? voiceSelectParam.default ?? '');
        const voiceOptions = voiceSelectParam.options || voiceParam?.options || libraryVoices.map((voice) => ({ label: voice, value: voice }));

        return (
            <div key={id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`}></span>
                    <div className="text-sm font-semibold text-white">Speaker {id}</div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{nameParam.label}</label>
                    <input
                        type="text"
                        value={nameValue}
                        onChange={(e) => onSetDynamicParam(nameParam.key, e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-200"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{voiceSelectParam.label}</label>
                    <select
                        value={voiceValue}
                        onChange={(e) => onSetDynamicParam(voiceSelectParam.key, e.target.value)}
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-200"
                    >
                        {voiceOptions.map((opt) => (
                            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <p className="text-[10px] text-slate-500">
                    Use this exact name in the transcript, for example: {nameValue || `Speaker ${id}`}: Hello there.
                </p>
            </div>
        );
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
            <section className="space-y-6">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Live Session
                            </div>
                            <input
                                value={title}
                                onChange={(e) => onSetTitle(e.target.value)}
                                placeholder={isMusicMode ? 'Creative Music Session' : 'Creative Audio Session'}
                                className="mt-2 bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-slate-600 w-full"
                            />
                            <p className="text-slate-500 text-xs mt-1">Model: {String(model).replace('pollinations-', '')}</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <div className="px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Output</p>
                                <p className="text-sm font-semibold text-white">{outputLabel}</p>
                            </div>
                            <div className="px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Duration</p>
                                <p className="text-sm font-semibold text-white">{formattedDuration}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                            <AudioLines className="w-4 h-4 text-emerald-400" />
                            {isMusicMode ? 'Music Prompt' : 'Script Composer'}
                        </div>
                        <div className="text-right">
                            <div className="flex items-center justify-end gap-2 text-[11px] text-slate-500 font-mono">
                                {isMusicMode ? 'Requested' : 'Estimated'} {estimatedLabel}
                            </div>
                            {!isMusicMode && (
                                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                                    {characterCountLabel}
                                    {estimatedPollenLabel ? ` | ${estimatedPollenLabel}` : ''}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
                        <textarea
                            value={prompt}
                            onChange={(e) => onSetPrompt(e.target.value)}
                            className="w-full bg-transparent text-slate-100 placeholder-slate-600 text-sm resize-y focus:outline-none custom-scrollbar min-h-[180px] max-h-[70vh]"
                            placeholder={multiSpeakerEnabled
                                ? "Add a transcript with speaker labels, for example:\nSpeaker A: Welcome everyone.\nSpeaker B: Thanks for having me."
                                : isMusicMode
                                    ? "Describe the song you want to generate: genre, mood, tempo, instruments, vocals, and structure."
                                    : "Add the transcript you want Gemini to speak aloud."}
                            rows={6}
                        />
                        <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>Model: {modelLabel || 'Audio Engine'}</span>
                            <span>{rateLabel ? `Rate ${rateLabel}` : outputLabel}</span>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-4">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            {multiSpeakerEnabled
                                ? 'Speaker names in the controls must match the transcript labels exactly.'
                                : isMusicMode
                                    ? 'Add genre, mood, tempo, structure, and instrument cues for stronger music direction.'
                                    : 'Add breathing cues, emphasis, and pacing notes for more natural narration.'}
                        </div>
                        <button
                            onClick={onGenerate}
                            disabled={isGenerateDisabled}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            {isMusicMode ? 'Generate Music' : 'Generate Audio'}
                        </button>
                    </div>
                </div>

                {!isMusicMode && (isPodcast || multiSpeakerParam) && (
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Podcast</div>
                                <div className="text-sm font-semibold text-slate-200 mt-1">Two-Speaker Session</div>
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">Gemini SpeechConfig</div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                                <Mic className="w-4 h-4 text-emerald-400" />
                                Speaker Routing
                            </div>
                            {multiSpeakerParam && renderParamControl(multiSpeakerParam)}
                        </div>

                        {multiSpeakerEnabled ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                {renderSpeakerCard('A', 'bg-emerald-400', speakerOneNameParam, speakerOneVoiceParam)}
                                {renderSpeakerCard('B', 'bg-amber-400', speakerTwoNameParam, speakerTwoVoiceParam)}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                                Enable two-speaker mode to send Gemini a real multi-speaker `speechConfig`, then write the script with matching speaker labels.
                            </div>
                        )}
                    </div>
                )}
            </section>

            <aside className="space-y-6">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                            <AudioLines className="w-4 h-4 text-emerald-400" />
                            Model Selection
                        </div>
                        <button
                            onClick={onOpenModelSelector}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                            Change
                        </button>
                    </div>
                    <button
                        onClick={onOpenModelSelector}
                        className="w-full flex items-center justify-between bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-3 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
                    >
                        <div className="text-left">
                            <div className="text-xs text-slate-500">Active Model</div>
                            <div className="text-sm font-semibold text-white">{modelLabel || 'Audio Engine'}</div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Audio</span>
                    </button>
                </div>

                {showSeed && (
                    <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                                <AudioLines className="w-4 h-4 text-emerald-400" />
                                Neural Seed
                            </div>
                            <button
                                onClick={onRandomizeSeed}
                                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                                Randomize
                            </button>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                value={seed}
                                onChange={(e) => onSetSeed(e.target.value.replace(/\D/g, ''))}
                                placeholder="Inference: Randomized"
                                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-3 pl-4 pr-20 text-sm text-emerald-300 font-mono focus:ring-1 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-700"
                            />
                            <button
                                onClick={onRandomizeSeed}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-emerald-400 transition-colors"
                                title="Randomize seed"
                            >
                                <Dices className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter mt-2">
                            Deterministic results require a fixed seed value.
                        </p>
                    </div>
                )}

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm">
                            <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                            {isMusicMode ? 'Music Controls' : 'Audio Controls'}
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">Preset: {isMusicMode ? 'Composition' : 'Narrative'}</span>
                    </div>
                    <div className="space-y-4 text-sm">
                        {effectiveControlParams.length > 0 ? (
                            effectiveControlParams.map((param) => renderParamControl(param))
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                                <p className="font-semibold text-slate-300">
                                    This model does not expose advanced {isMusicMode ? 'music' : 'audio'} controls in the current registry.
                                </p>
                                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                                    {fallbackControlHints.length > 0
                                        ? `Active controls are available in the sections below: ${fallbackControlHints.join(', ')}.`
                                        : 'Only the prompt and generate action are active for this model right now.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                    <div className="flex items-center gap-2 text-slate-300 font-semibold text-sm mb-4">
                        <Settings className="w-4 h-4 text-emerald-400" />
                        Output Settings
                    </div>
                    <div className="space-y-3 text-sm">
                        {supportsVoice && !multiSpeakerEnabled && (
                            <div className="flex items-center justify-between bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-3">
                                <div>
                                    <div className="text-xs text-slate-500">Voice</div>
                                    <div className="text-sm font-semibold text-white">{primaryVoiceValue}</div>
                                </div>
                                <button
                                    onClick={() => setIsLibraryOpen(true)}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                                >
                                    Change
                                </button>
                            </div>
                        )}

                        {multiSpeakerEnabled && (
                            <div className="flex items-center justify-between bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-3">
                                <div>
                                    <div className="text-xs text-slate-500">Voice Routing</div>
                                    <div className="text-sm font-semibold text-white">Two speakers via Gemini SpeechConfig</div>
                                </div>
                                <span className="text-xs text-emerald-400">On</span>
                            </div>
                        )}

                        {responseFormatParam && (
                            <div className="flex items-start justify-between gap-4 bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-3">
                                <div className="flex-1">
                                    <div className="text-xs text-slate-500">Response Format</div>
                                    <select
                                        value={responseFormatValue}
                                        onChange={(e) => onSetDynamicParam('response_format', e.target.value)}
                                        className="mt-2 w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-200"
                                    >
                                        {responseFormatOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <div className="text-[9px] text-slate-500 mt-1">
                                        {isMusicMode ? 'Audio output format for rendered music.' : 'Audio output format for speech synthesis.'}
                                    </div>
                                </div>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{isMusicMode ? 'Music' : 'TTS'}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-between bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-3">
                            <div>
                                <div className="text-xs text-slate-500">Post-Processing</div>
                                <div className="text-sm font-semibold text-white">Denoise + Normalize</div>
                            </div>
                            <span className="text-xs text-amber-400">On</span>
                        </div>
                    </div>
                </div>
            </aside>

            {isLibraryOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-[92vw] max-w-3xl max-h-[80vh] bg-[#0c0c0c] border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <div className="text-xs text-emerald-400 font-black uppercase tracking-[0.25em]">Voice Library</div>
                                <div className="text-sm text-slate-400 mt-1">Select a voice to apply instantly.</div>
                            </div>
                            <button
                                onClick={() => setIsLibraryOpen(false)}
                                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {libraryVoices.map((voice) => {
                                    const isActive = primaryVoiceValue === voice;
                                    return (
                                        <button
                                            key={voice}
                                            onClick={() => {
                                                handleSelectVoice(voice);
                                                setIsLibraryOpen(false);
                                            }}
                                            className={`px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-widest transition-all ${
                                                isActive
                                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                    : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-emerald-500/30 hover:text-slate-200'
                                            }`}
                                        >
                                            {voice}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
