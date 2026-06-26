import { ModelOption } from './types';

const normalizeAudioMarker = (value: unknown) =>
    String(value || '').trim().toLowerCase();

const getAudioMarkers = (model?: Partial<ModelOption>) => {
    if (!model) return [];
    return [
        model.id,
        model.label,
        model.desc,
        model.upstreamId
    ].map(normalizeAudioMarker);
};

export const isMusicAudioModel = (model?: Partial<ModelOption>) => {
    const markers = getAudioMarkers(model);
    return markers.some((value) => (
        value.includes('suno') ||
        value.includes('music') ||
        value.includes('acestep') ||
        value.includes('ace-step') ||
        value.includes('ace_step') ||
        value.includes('ace step')
    ));
};

export const isTranscriptionAudioModel = (model?: Partial<ModelOption>) => {
    if (!model) return false;

    const inputs = (model.textInputModalities || []).map(normalizeAudioMarker);
    const outputs = (model.textOutputModalities || []).map(normalizeAudioMarker);
    if (inputs.length > 0 || outputs.length > 0) {
        return inputs.includes('audio') && outputs.includes('text');
    }

    return getAudioMarkers(model).some((value) => (
        value.includes('whisper') ||
        value.includes('scribe') ||
        value.includes('transcription') ||
        value.includes('speech to text')
    ));
};

export const isSpeechSynthesisModel = (model?: Partial<ModelOption>) => {
    if (!model || isMusicAudioModel(model) || isTranscriptionAudioModel(model)) {
        return false;
    }

    const inputs = (model.textInputModalities || []).map(normalizeAudioMarker);
    const outputs = (model.textOutputModalities || []).map(normalizeAudioMarker);
    if (inputs.length > 0 || outputs.length > 0) {
        return inputs.includes('text') && outputs.includes('audio');
    }

    const caps = (model.capabilities || []).map(normalizeAudioMarker);
    return caps.includes('text') && caps.includes('audio');
};
