export type BrowserTtsState = 'idle' | 'playing' | 'paused';

export interface BrowserTtsSpeakOptions {
    lang?: string;
    voiceName?: string;
    voiceURI?: string;
    voice?: SpeechSynthesisVoice;
    rate?: number;
    pitch?: number;
    volume?: number;
    onStart?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onEnd?: () => void;
    onError?: (event?: SpeechSynthesisErrorEvent) => void;
}

export interface BrowserTtsController {
    isSupported: () => boolean;
    getState: () => BrowserTtsState;
    getVoices: () => SpeechSynthesisVoice[];
    speak: (text: string, options?: BrowserTtsSpeakOptions) => boolean;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    destroy: () => void;
}

const hasBrowserSpeechSupport = () => (
    typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof SpeechSynthesisUtterance !== 'undefined'
);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveVoice = (voices: SpeechSynthesisVoice[], options: BrowserTtsSpeakOptions): SpeechSynthesisVoice | null => {
    if (options.voice) return options.voice;
    const requestedName = String(options.voiceName || '').trim().toLowerCase();
    const requestedUri = String(options.voiceURI || '').trim().toLowerCase();
    if (!requestedName && !requestedUri) return null;
    const byUri = requestedUri
        ? voices.find((voice) => String(voice.voiceURI || '').trim().toLowerCase() === requestedUri)
        : null;
    if (byUri) return byUri;
    const byName = requestedName
        ? voices.find((voice) => String(voice.name || '').trim().toLowerCase() === requestedName)
        : null;
    return byName || null;
};

export const createBrowserTtsController = (): BrowserTtsController => {
    let state: BrowserTtsState = 'idle';
    let activeUtterance: SpeechSynthesisUtterance | null = null;
    let cachedVoices: SpeechSynthesisVoice[] = [];
    let voicesListener: (() => void) | null = null;

    const isSupported = () => hasBrowserSpeechSupport();

    const setState = (next: BrowserTtsState) => {
        state = next;
    };

    const getSynth = () => (isSupported() ? window.speechSynthesis : null);

    const ensureVoicesListener = () => {
        const synth = getSynth();
        if (!synth || voicesListener) return;
        voicesListener = () => {
            const latest = synth.getVoices();
            if (Array.isArray(latest) && latest.length > 0) cachedVoices = latest;
        };
        if (typeof synth.addEventListener === 'function') {
            synth.addEventListener('voiceschanged', voicesListener);
        }
    };

    const getVoices = () => {
        const synth = getSynth();
        if (!synth) return [];
        ensureVoicesListener();
        const latest = synth.getVoices();
        if (Array.isArray(latest) && latest.length > 0) {
            cachedVoices = latest;
            return latest;
        }
        return cachedVoices;
    };

    const stop = () => {
        const synth = getSynth();
        if (synth) {
            synth.cancel();
        }
        activeUtterance = null;
        setState('idle');
    };

    const speak = (text: string, options: BrowserTtsSpeakOptions = {}) => {
        const synth = getSynth();
        const value = String(text || '').trim();
        if (!synth || !value) return false;

        stop();

        const utterance = new SpeechSynthesisUtterance(value);
        const voices = getVoices();
        const chosenVoice = resolveVoice(voices, options);
        if (chosenVoice) {
            utterance.voice = chosenVoice;
            if (chosenVoice.lang && !options.lang) utterance.lang = chosenVoice.lang;
        }

        if (options.lang) utterance.lang = String(options.lang);
        if (Number.isFinite(options.rate)) utterance.rate = clamp(Number(options.rate), 0.1, 10);
        if (Number.isFinite(options.pitch)) utterance.pitch = clamp(Number(options.pitch), 0, 2);
        if (Number.isFinite(options.volume)) utterance.volume = clamp(Number(options.volume), 0, 1);

        utterance.onstart = () => {
            if (activeUtterance !== utterance) return;
            setState('playing');
            options.onStart?.();
        };
        utterance.onpause = () => {
            if (activeUtterance !== utterance) return;
            setState('paused');
            options.onPause?.();
        };
        utterance.onresume = () => {
            if (activeUtterance !== utterance) return;
            setState('playing');
            options.onResume?.();
        };
        utterance.onend = () => {
            if (activeUtterance !== utterance) return;
            activeUtterance = null;
            setState('idle');
            options.onEnd?.();
        };
        utterance.onerror = (event) => {
            if (activeUtterance !== utterance) return;
            activeUtterance = null;
            setState('idle');
            options.onError?.(event);
        };

        activeUtterance = utterance;
        setState('playing');
        try {
            synth.speak(utterance);
            return true;
        } catch {
            activeUtterance = null;
            setState('idle');
            return false;
        }
    };

    const pause = () => {
        const synth = getSynth();
        if (!synth || state !== 'playing') return;
        synth.pause();
        setState('paused');
    };

    const resume = () => {
        const synth = getSynth();
        if (!synth || state !== 'paused') return;
        synth.resume();
        setState('playing');
    };

    const destroy = () => {
        stop();
        const synth = getSynth();
        if (synth && voicesListener && typeof synth.removeEventListener === 'function') {
            synth.removeEventListener('voiceschanged', voicesListener);
        }
        voicesListener = null;
    };

    return {
        isSupported,
        getState: () => state,
        getVoices,
        speak,
        pause,
        resume,
        stop,
        destroy
    };
};

