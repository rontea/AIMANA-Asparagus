import type { GeneratedImageResult } from '../services/geminiService';
import type { Revision } from '../types';
import { createGeneratedAssetFile } from './generatedAssetFile';

const DEFAULT_FILE_NAME = 'aimana_artifact';

const getExtensionFromMimeType = (mimeType?: string) => {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized.startsWith('audio/')) {
        if (normalized.includes('wav')) return 'wav';
        if (normalized.includes('flac')) return 'flac';
        if (normalized.includes('aac')) return 'aac';
        if (normalized.includes('opus')) return 'opus';
        if (normalized.includes('ogg')) return 'ogg';
        return 'mp3';
    }
    if (normalized.startsWith('video/')) return 'mp4';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('json')) return 'json';
    if (normalized.includes('markdown')) return 'md';
    if (normalized.startsWith('text/')) return 'txt';
    return 'bin';
};

const sanitizeDownloadName = (value?: string, mimeType?: string) => {
    const trimmed = String(value || '').trim();
    const fallbackExtension = getExtensionFromMimeType(mimeType);
    const sanitized = (trimmed || DEFAULT_FILE_NAME)
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (sanitized.includes('.')) return sanitized;
    return `${sanitized || DEFAULT_FILE_NAME}.${fallbackExtension}`;
};

export const triggerBlobDownload = (blob: Blob, fileName?: string) => {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = sanitizeDownloadName(fileName, blob.type);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
};

export const downloadGeneratedArtifact = (
    result: GeneratedImageResult,
    options: { baseName?: string; formatHint?: string } = {}
) => {
    const file = createGeneratedAssetFile(result, options);
    triggerBlobDownload(file, file.name);
};

export const downloadRevisionArtifact = async (
    revision: Pick<Revision, 'blob' | 'fileUrl' | 'webContentLink' | 'mimeType' | 'originalFilename' | 'title'>,
    fallbackUrl?: string
) => {
    let blob = revision.blob || null;
    const sourceUrl = revision.fileUrl || revision.webContentLink || fallbackUrl || '';

    if (!blob) {
        if (!sourceUrl) {
            throw new Error('No artifact source available for download.');
        }

        const response = await fetch(sourceUrl, {
            credentials: sourceUrl.startsWith('/') ? 'same-origin' : 'omit'
        });

        if (!response.ok) {
            throw new Error(`Download failed with status ${response.status}.`);
        }

        blob = await response.blob();
    }

    triggerBlobDownload(blob, revision.originalFilename || revision.title || DEFAULT_FILE_NAME);
};
