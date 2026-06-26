import { GeneratedImageResult } from '../services/geminiService';

interface CreateGeneratedAssetFileOptions {
    baseName?: string;
    formatHint?: string;
}

const DEFAULT_BASE_NAME = 'aimana_artifact';

const sanitizeBaseName = (value?: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return DEFAULT_BASE_NAME;
    return trimmed
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || DEFAULT_BASE_NAME;
};

const getTextFileExtension = (mimeType: string, formatHint?: string) => {
    const normalizedHint = String(formatHint || '').trim().toLowerCase();
    if (normalizedHint === 'json') return 'json';
    if (normalizedHint === 'srt') return 'srt';
    if (normalizedHint === 'vtt') return 'vtt';
    if (normalizedHint === 'md' || normalizedHint === 'markdown') return 'md';

    const normalizedMime = String(mimeType || '').toLowerCase();
    if (normalizedMime.includes('markdown')) return 'md';
    if (normalizedMime.includes('json')) return 'json';
    return 'txt';
};

const getBinaryFileExtension = (mimeType: string) => {
    const normalizedMime = String(mimeType || '').toLowerCase();
    if (normalizedMime.startsWith('video/')) return 'mp4';
    if (normalizedMime.startsWith('audio/')) {
        if (normalizedMime.includes('wav')) return 'wav';
        if (normalizedMime.includes('flac')) return 'flac';
        if (normalizedMime.includes('aac')) return 'aac';
        if (normalizedMime.includes('opus')) return 'opus';
        if (normalizedMime.includes('ogg')) return 'ogg';
        return 'mp3';
    }
    if (normalizedMime.includes('webp')) return 'webp';
    if (normalizedMime.includes('jpeg') || normalizedMime.includes('jpg')) return 'jpg';
    return 'png';
};

const decodeBase64 = (value: string) => {
    const byteCharacters = atob(value);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i += 1) {
        byteArray[i] = byteCharacters.charCodeAt(i);
    }
    return byteArray;
};

const resolveTextMimeType = (mimeType: string, formatHint?: string) => {
    const normalizedHint = String(formatHint || '').trim().toLowerCase();
    if (normalizedHint === 'json') return 'application/json';
    if (normalizedHint === 'md' || normalizedHint === 'markdown') return 'text/markdown';
    return String(mimeType || '').trim() || 'text/plain';
};

export const createGeneratedAssetFile = (
    result: GeneratedImageResult,
    options: CreateGeneratedAssetFileOptions = {}
) => {
    const mimeType = String(result?.mimeType || '').trim();
    const baseName = sanitizeBaseName(options.baseName);
    const isTextLike = mimeType.startsWith('text/') || (!result.base64 && typeof result.text === 'string');

    if (isTextLike) {
        const resolvedMimeType = resolveTextMimeType(mimeType, options.formatHint);
        const extension = getTextFileExtension(resolvedMimeType, options.formatHint);
        const blob = new Blob([result.text || ''], { type: resolvedMimeType });
        return new File([blob], `${baseName}.${extension}`, { type: resolvedMimeType });
    }

    if (!result.base64) {
        throw new Error('Generated artifact is missing binary content.');
    }

    const binary = decodeBase64(result.base64);
    const resolvedMimeType = mimeType || 'application/octet-stream';
    const extension = getBinaryFileExtension(resolvedMimeType);
    const blob = new Blob([binary], { type: resolvedMimeType });
    return new File([blob], `${baseName}.${extension}`, { type: resolvedMimeType });
};
