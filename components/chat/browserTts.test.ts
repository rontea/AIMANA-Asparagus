import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserTtsController } from './browserTts';

interface MockUtterance {
    text: string;
    lang: string;
    rate: number;
    pitch: number;
    volume: number;
    voice: SpeechSynthesisVoice | null;
    onstart: (() => void) | null;
    onpause: (() => void) | null;
    onresume: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event?: any) => void) | null;
}

const originalUtterance = (globalThis as any).SpeechSynthesisUtterance;
const originalSpeechSynthesis = (window as any).speechSynthesis;

const makeVoice = (name: string, voiceURI: string, lang = 'en-US') => ({ name, voiceURI, lang } as SpeechSynthesisVoice);

const installSpeechMocks = (voices: SpeechSynthesisVoice[] = [makeVoice('Sample Voice', 'sample-voice')]) => {
    let currentVoices = voices;
    let lastUtterance: MockUtterance | null = null;
    const listeners = new Set<() => void>();
    const synth = {
        speak: vi.fn((utterance: MockUtterance) => {
            lastUtterance = utterance;
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn(() => currentVoices),
        addEventListener: vi.fn((_name: string, listener: () => void) => {
            listeners.add(listener);
        }),
        removeEventListener: vi.fn((_name: string, listener: () => void) => {
            listeners.delete(listener);
        })
    };

    class SpeechSynthesisUtteranceMock {
        text: string;
        lang = '';
        rate = 1;
        pitch = 1;
        volume = 1;
        voice: SpeechSynthesisVoice | null = null;
        onstart: (() => void) | null = null;
        onpause: (() => void) | null = null;
        onresume: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event?: any) => void) | null = null;

        constructor(text: string) {
            this.text = text;
        }
    }

    (globalThis as any).SpeechSynthesisUtterance = SpeechSynthesisUtteranceMock as any;
    (window as any).speechSynthesis = synth;

    return {
        synth,
        getLastUtterance: () => lastUtterance,
        setVoices: (nextVoices: SpeechSynthesisVoice[]) => {
            currentVoices = nextVoices;
        },
        emitVoicesChanged: () => {
            listeners.forEach((listener) => listener());
        }
    };
};

afterEach(() => {
    (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
    (window as any).speechSynthesis = originalSpeechSynthesis;
    vi.restoreAllMocks();
});

describe('browserTts controller', () => {
    it('synthesizes speech and transitions state through lifecycle events', () => {
        const { synth, getLastUtterance } = installSpeechMocks();
        const onStart = vi.fn();
        const onPause = vi.fn();
        const onResume = vi.fn();
        const onEnd = vi.fn();
        const controller = createBrowserTtsController();

        const started = controller.speak('Hello world', { onStart, onPause, onResume, onEnd });
        expect(started).toBe(true);
        expect(synth.cancel).toHaveBeenCalledTimes(1);
        expect(synth.speak).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toBe('playing');

        const utterance = getLastUtterance();
        expect(utterance?.text).toBe('Hello world');
        utterance?.onstart?.();
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toBe('playing');

        controller.pause();
        expect(synth.pause).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toBe('paused');
        utterance?.onpause?.();
        expect(onPause).toHaveBeenCalledTimes(1);

        controller.resume();
        expect(synth.resume).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toBe('playing');
        utterance?.onresume?.();
        expect(onResume).toHaveBeenCalledTimes(1);

        utterance?.onend?.();
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toBe('idle');
    });

    it('returns false when unsupported or empty and does not throw', () => {
        (globalThis as any).SpeechSynthesisUtterance = undefined;
        (window as any).speechSynthesis = undefined;
        const unsupportedController = createBrowserTtsController();
        expect(unsupportedController.isSupported()).toBe(false);
        expect(unsupportedController.speak('test')).toBe(false);

        const { synth } = installSpeechMocks();
        const controller = createBrowserTtsController();
        expect(controller.speak('   ')).toBe(false);
        expect(synth.speak).not.toHaveBeenCalled();
    });

    it('loads voices and supports delayed voiceschanged updates', () => {
        const { setVoices, emitVoicesChanged } = installSpeechMocks([]);
        const controller = createBrowserTtsController();

        expect(controller.getVoices()).toEqual([]);
        setVoices([makeVoice('Delayed Voice', 'delayed-voice')]);
        emitVoicesChanged();

        const voices = controller.getVoices();
        expect(voices.length).toBe(1);
        expect(voices[0].name).toBe('Delayed Voice');
    });
});

