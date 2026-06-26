import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, CircleHelp, Loader2, Save, Volume2 } from 'lucide-react';
import { createBrowserTtsController } from '../chat/browserTts';

interface VoiceOption {
    value: string;
    label: string;
}

interface VoiceSectionProps {
    defaultVoiceURI?: string;
    defaultVoiceName?: string;
    isAdmin: boolean;
    onSaveDefaultVoice: (voiceURI: string, voiceName: string) => Promise<void>;
}

const DEFAULT_OPTION: VoiceOption = { value: '', label: 'System default' };

const buildVoiceOptions = (voices: SpeechSynthesisVoice[]): VoiceOption[] => {
    if (!Array.isArray(voices) || voices.length === 0) return [DEFAULT_OPTION];
    const seen = new Set<string>();
    const normalized: Array<{ value: string; label: string; isDefault: boolean }> = [];
    voices.forEach((voice) => {
        const voiceURI = String(voice?.voiceURI || '').trim();
        if (!voiceURI || seen.has(voiceURI)) return;
        seen.add(voiceURI);
        const name = String(voice?.name || '').trim() || voiceURI;
        const lang = String(voice?.lang || '').trim();
        const isDefault = voice?.default === true;
        const suffix = isDefault ? ' [default]' : '';
        const label = lang ? `${name} (${lang})${suffix}` : `${name}${suffix}`;
        normalized.push({ value: voiceURI, label, isDefault });
    });
    normalized.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.label.localeCompare(b.label);
    });
    return [DEFAULT_OPTION, ...normalized.map((item) => ({ value: item.value, label: item.label }))];
};

export const VoiceSection: React.FC<VoiceSectionProps> = ({
    defaultVoiceURI,
    defaultVoiceName,
    isAdmin,
    onSaveDefaultVoice
}) => {
    const [isSupported, setIsSupported] = useState(false);
    const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([DEFAULT_OPTION]);
    const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const [previewState, setPreviewState] = useState<'idle' | 'playing' | 'paused'>('idle');
    const ttsControllerRef = useRef<ReturnType<typeof createBrowserTtsController> | null>(null);

    const syncVoices = useCallback(() => {
        const controller = ttsControllerRef.current;
        if (!controller) return;
        setVoiceOptions(buildVoiceOptions(controller.getVoices()));
    }, []);

    useEffect(() => {
        const normalized = String(defaultVoiceURI || '').trim();
        setSelectedVoiceURI(normalized);
    }, [defaultVoiceURI]);

    useEffect(() => {
        const controller = createBrowserTtsController();
        ttsControllerRef.current = controller;
        const supported = controller.isSupported();
        setIsSupported(supported);
        setVoiceOptions(
            supported
                ? buildVoiceOptions(controller.getVoices())
                : [DEFAULT_OPTION]
        );

        const warmupTimers: number[] = [];
        if (supported) {
            warmupTimers.push(window.setTimeout(syncVoices, 250));
            warmupTimers.push(window.setTimeout(syncVoices, 1200));
            const synth = window.speechSynthesis;
            if (typeof synth?.addEventListener === 'function') {
                synth.addEventListener('voiceschanged', syncVoices);
            }
            return () => {
                warmupTimers.forEach((id) => window.clearTimeout(id));
                if (typeof synth?.removeEventListener === 'function') {
                    synth.removeEventListener('voiceschanged', syncVoices);
                }
                controller.destroy();
                ttsControllerRef.current = null;
                setPreviewState('idle');
            };
        }

        return () => {
            controller.destroy();
            ttsControllerRef.current = null;
            setPreviewState('idle');
        };
    }, [syncVoices]);

    useEffect(() => {
        if (!selectedVoiceURI) return;
        if (!voiceOptions.some((option) => option.value === selectedVoiceURI)) {
            setSelectedVoiceURI('');
        }
    }, [selectedVoiceURI, voiceOptions]);

    const isDirty = String(selectedVoiceURI || '').trim() !== String(defaultVoiceURI || '').trim();

    const selectedVoiceName = useMemo(() => {
        if (!selectedVoiceURI) return '';
        const option = voiceOptions.find((voice) => voice.value === selectedVoiceURI);
        if (!option) return '';
        const raw = option.label.replace(/\s*\[default\]\s*$/i, '');
        return raw.replace(/\s+\([^)]+\)\s*$/, '').trim();
    }, [selectedVoiceURI, voiceOptions]);

    const handleSave = async () => {
        if (!isAdmin || isSaving || !isDirty) return;
        setIsSaving(true);
        try {
            await onSaveDefaultVoice(selectedVoiceURI, selectedVoiceName);
            setShowSaved(true);
            window.setTimeout(() => setShowSaved(false), 2500);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePreviewToggle = () => {
        if (!isSupported) return;
        const controller = ttsControllerRef.current;
        if (!controller) return;
        const state = controller.getState();

        if (state === 'playing') {
            controller.pause();
            setPreviewState('paused');
            return;
        }
        if (state === 'paused') {
            controller.resume();
            setPreviewState('playing');
            return;
        }

        const previewText = 'Hello. This is your default read aloud voice preview in AIMANA settings.';
        const started = controller.speak(previewText, {
            voiceURI: selectedVoiceURI || undefined,
            onStart: () => setPreviewState('playing'),
            onPause: () => setPreviewState('paused'),
            onResume: () => setPreviewState('playing'),
            onEnd: () => setPreviewState('idle'),
            onError: () => setPreviewState('idle')
        });
        if (!started) setPreviewState('idle');
    };

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Volume2 size={20} className="text-cyan-400" /> Voice Reader Defaults
                </h2>
                <span className="text-[10px] font-black bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 px-3 py-1 rounded-full uppercase tracking-widest">
                    {isAdmin ? 'Global' : 'Read Only'}
                </span>
            </div>
            <div className="p-6 space-y-5">
                <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                    <div className="flex items-start gap-2 text-slate-400 text-xs leading-relaxed">
                        <CircleHelp size={14} className="text-slate-500 mt-0.5 shrink-0" />
                        <p>
                            Set the default read-aloud voice used across AI Chat and transcript preview when a local override is not selected.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-end">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                            Default Voice
                        </label>
                        <select
                            value={selectedVoiceURI}
                            onChange={(e) => {
                                ttsControllerRef.current?.stop();
                                setPreviewState('idle');
                                setSelectedVoiceURI(e.target.value);
                            }}
                            disabled={!isSupported || !isAdmin}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-1 focus:ring-cyan-500 transition-all disabled:opacity-60"
                            aria-label="Default read aloud voice"
                        >
                            {voiceOptions.map((option) => (
                                <option key={option.value || '__default'} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={handlePreviewToggle}
                        disabled={!isSupported}
                        className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                    >
                        {!isSupported
                            ? 'Preview Unavailable'
                            : previewState === 'playing'
                                ? 'Pause Preview'
                                : previewState === 'paused'
                                    ? 'Resume Preview'
                                    : 'Preview Voice'}
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!isAdmin || !isDirty || isSaving}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Voice
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>
                        Current default: {defaultVoiceName ? `${defaultVoiceName}` : 'System default'}
                    </span>
                    {!isSupported && <span className="text-amber-300">Voice preview is unavailable in this browser.</span>}
                    {showSaved && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <CheckCircle size={14} /> Default voice updated
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
};

