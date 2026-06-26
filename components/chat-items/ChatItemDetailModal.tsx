import React, { useEffect, useRef, useState } from 'react';
import {
    X,
    Image as ImageIcon,
    Bot,
    MessageCircle,
    MessageSquare,
    Cpu,
    Copy,
    Check,
    FileText,
    Sparkles,
    BrainCircuit,
    Info,
    Loader2,
    Square,
    FolderOpen,
    FolderPlus,
    Download,
    LayoutGrid,
    List
} from 'lucide-react';
import JSZip from 'jszip';
import { ChatItemDetail } from '../../types/chatItems';
import { ModelOption } from '../project/lab/ModelSelector/registry/index';
import { ChatAudioInput, ChatMessage } from '../chat/types';
import MessageMarkdown from '../chat/MessageMarkdown';
import { splitReasoningSummary } from '../chat/readAloud';

const sanitizeFileNameSegment = (value: string, fallback = 'item') => {
    const normalized = String(value || '').trim();
    const sanitized = (normalized || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 96);
    return sanitized || fallback;
};

const inferExtension = (mimeType?: string, source?: string) => {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('svg')) return 'svg';
    if (mime.includes('mp3')) return 'mp3';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('opus')) return 'opus';
    if (mime.includes('m4a') || mime.includes('aac')) return 'm4a';
    if (mime.includes('flac')) return 'flac';

    const rawSource = String(source || '').trim();
    if (!rawSource) return '';
    try {
        const url = new URL(rawSource, window.location.origin);
        const candidate = url.pathname.split('.').pop() || '';
        if (/^[a-z0-9]{2,5}$/i.test(candidate)) return candidate.toLowerCase();
    } catch {
        const candidate = rawSource.split('?')[0].split('#')[0].split('.').pop() || '';
        if (/^[a-z0-9]{2,5}$/i.test(candidate)) return candidate.toLowerCase();
    }
    return '';
};

const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
};

const escapeHtml = (value: string) => (
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
);

const buildTranscriptText = (options: {
    title: string;
    modelId: string;
    createdAtIso: string;
    updatedAtIso: string;
    systemPrompt: string;
    hasStructuredMessages: boolean;
    structuredMessages: ChatMessage[];
    fallbackTranscript: string;
}) => {
    const {
        title,
        modelId,
        createdAtIso,
        updatedAtIso,
        systemPrompt,
        hasStructuredMessages,
        structuredMessages,
        fallbackTranscript
    } = options;
    if (!hasStructuredMessages) {
        return String(fallbackTranscript || '').trim() || 'No transcript available.';
    }
    const lines: string[] = [];
    lines.push('# AIMANA AI Chat Transcript');
    lines.push(`Session: ${title}`);
    lines.push(`Model: ${modelId || 'n/a'}`);
    lines.push(`Created: ${createdAtIso}`);
    lines.push(`Updated: ${updatedAtIso}`);
    lines.push('');
    if (systemPrompt) {
        lines.push('[SYSTEM]');
        lines.push(systemPrompt);
        lines.push('');
    }
    structuredMessages.forEach((message) => {
        lines.push(`[${message.role.toUpperCase()}]`);
        const imageCount = Array.isArray(message.imageInputs) ? message.imageInputs.length : 0;
        const audioCount = Array.isArray(message.audioInputs) ? message.audioInputs.length : 0;
        if (imageCount > 0 || audioCount > 0) {
            const parts = [];
            if (imageCount > 0) parts.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
            if (audioCount > 0) parts.push(`${audioCount} audio${audioCount === 1 ? '' : 's'}`);
            lines.push(`[Attachments: ${parts.join(', ')}]`);
        }
        lines.push(message.content || '');
        lines.push('');
    });
    return lines.join('\n').trim();
};

interface ChatItemDetailModalProps {
    isOpen: boolean;
    item: ChatItemDetail | null;
    onClose: () => void;
    onOpenChat?: (item: ChatItemDetail) => void;
    onMove?: (item: ChatItemDetail) => void;
    onArchive?: (item: ChatItemDetail) => void;
    moveDisabled?: boolean;
    archiveDisabled?: boolean;
    registry?: ModelOption[];
}

interface MyStuffImageItem {
    id: string;
    name: string;
    url: string;
    mimeType?: string;
    size?: number;
}

export const ChatItemDetailModal: React.FC<ChatItemDetailModalProps> = ({
    isOpen,
    item,
    onClose,
    onOpenChat,
    onMove,
    onArchive,
    moveDisabled,
    archiveDisabled,
    registry = []
}) => {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [myStuffView, setMyStuffView] = useState<'grid' | 'list'>('grid');
    const [previewImage, setPreviewImage] = useState<MyStuffImageItem | null>(null);
    const [previewAudio, setPreviewAudio] = useState<ChatAudioInput | null>(null);
    const [isDownloadAllRunning, setIsDownloadAllRunning] = useState(false);
    const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
    const copyTimeoutRef = useRef<number | null>(null);
    const downloadStatusTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) {
                window.clearTimeout(copyTimeoutRef.current);
            }
            if (downloadStatusTimeoutRef.current) {
                window.clearTimeout(downloadStatusTimeoutRef.current);
            }
        };
    }, []);

    if (!isOpen || !item) return null;

    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    const summaryText = typeof item.payload?.memorySummary === 'string'
        ? item.payload.memorySummary.trim()
        : '';
    const showSources = item.payload?.showSources !== false;
    const messages = Array.isArray(item.payload?.messages) ? item.payload.messages : [];
    const structuredMessages = messages.filter((message): message is ChatMessage => (
        !!message &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant')
    ));
    const hasStructuredMessages = structuredMessages.length > 0;
    const modelIds = Array.isArray(item.modelIds) ? item.modelIds.filter(Boolean).map(String) : [];
    const uniqueModelIds = modelIds.length > 0
        ? Array.from(new Set(modelIds))
        : (item.modelId ? [String(item.modelId)] : []);
    const modelCount = uniqueModelIds.length || 1;
    const modelTooltip = uniqueModelIds.length > 0
        ? `Models used in this chat:\n${uniqueModelIds.map((id, index) => `${index + 1}. ${id}`).join('\n')}`
        : 'No model recorded for this chat.';
    const modelCountLabel = `${modelCount} model${modelCount === 1 ? '' : 's'} used`;
    const lookup = new Map(registry.map((model) => [String(model.id), model]));
    const modelMeta = uniqueModelIds.map((id) => ({
        id,
        label: lookup.get(id)?.label || id
    }));
    const primaryModelLabel = modelMeta[0]?.label || item.modelId || 'Unknown model';
    const systemPrompt = String(item.systemPrompt || item.payload?.systemPrompt || '').trim();
    const createdAtIso = Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString() : 'n/a';
    const updatedAtIso = Number.isFinite(item.updatedAt) ? new Date(item.updatedAt).toISOString() : 'n/a';
    const updatedAtLabel = Number.isFinite(item.updatedAt)
        ? new Date(item.updatedAt).toLocaleString()
        : 'Unknown';
    const myStuffImagesMap = new Map<string, MyStuffImageItem>();
    attachments.forEach((att) => {
        const url = String(att.fileUrl || '').trim();
        if (!url) return;
        const key = `${att.id}|${url}`;
        if (!myStuffImagesMap.has(key)) {
            myStuffImagesMap.set(key, {
                id: att.id,
                name: `Reference ${myStuffImagesMap.size + 1}`,
                url,
                mimeType: att.mimeType,
                size: Number.isFinite(att.size) ? Number(att.size) : undefined
            });
        }
    });
    structuredMessages.forEach((message) => {
        const images = Array.isArray(message.imageInputs) ? message.imageInputs : [];
        images.forEach((image) => {
            const url = String(image.url || '').trim();
            if (!url) return;
            const imageId = String(image.id || '').trim() || `${message.id}-${url}`;
            const key = `${imageId}|${url}`;
            if (!myStuffImagesMap.has(key)) {
                myStuffImagesMap.set(key, {
                    id: imageId,
                    name: image.name || 'Image',
                    url,
                    mimeType: image.mimeType,
                    size: Number.isFinite(image.size) ? Number(image.size) : undefined
                });
            }
        });
    });
    const myStuffImages = Array.from(myStuffImagesMap.values());
    const myStuffAudioMap = new Map<string, ChatAudioInput>();
    structuredMessages.forEach((message) => {
        const audios = Array.isArray(message.audioInputs) ? message.audioInputs : [];
        audios.forEach((audio) => {
            const audioId = String(audio.id || '').trim() || `${message.id}-${audio.name || 'audio'}`;
            if (!myStuffAudioMap.has(audioId)) {
                myStuffAudioMap.set(audioId, audio);
            }
        });
    });
    const myStuffAudios = Array.from(myStuffAudioMap.values());
    const myStuffCount = myStuffImages.length + myStuffAudios.length;
    const formatMb = (size?: number) => (size && Number.isFinite(size) ? `${(size / 1024 / 1024).toFixed(2)} MB` : '--');
    const chatTitle = item.title || 'Chat Capture';
    const chatBaseFileName = sanitizeFileNameSegment(chatTitle, `chat-${item.id}`);
    const transcriptText = buildTranscriptText({
        title: chatTitle,
        modelId: item.modelId || primaryModelLabel,
        createdAtIso,
        updatedAtIso,
        systemPrompt,
        hasStructuredMessages,
        structuredMessages,
        fallbackTranscript: item.transcriptText || ''
    });

    const showDownloadStatus = (message: string) => {
        setDownloadStatus(message);
        if (downloadStatusTimeoutRef.current) {
            window.clearTimeout(downloadStatusTimeoutRef.current);
        }
        downloadStatusTimeoutRef.current = window.setTimeout(() => {
            setDownloadStatus(null);
            downloadStatusTimeoutRef.current = null;
        }, 2600);
    };

    const handleCopy = async (key: string, text: string) => {
        const payload = String(text || '');
        if (!payload.trim()) return;
        try {
            await navigator.clipboard.writeText(payload);
            setCopiedKey(key);
            if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = window.setTimeout(() => setCopiedKey(null), 1400);
        } catch {
            setCopiedKey(null);
        }
    };

    const injectCitationLinks = (content: string, sources?: ChatMessage['sources']) => {
        if (!content || !Array.isArray(sources) || sources.length === 0) return content;
        const urls = sources.map((src) => String(src?.url || '').trim());
        if (urls.every((url) => !url)) return content;

        const replaceCitations = (segment: string) => (
            segment.replace(/\[(\d{1,3})\](?!\(|\s*:)/g, (match, rawIndex) => {
                const index = Number(rawIndex);
                if (!Number.isFinite(index) || index <= 0) return match;
                const url = urls[index - 1];
                if (!url) return match;
                return `[\\[${index}\\]](${url})`;
            })
        );

        const replaceInline = (segment: string) => {
            const parts = segment.split('`');
            return parts.map((part, idx) => (idx % 2 === 0 ? replaceCitations(part) : part)).join('`');
        };

        const fenced = content.split('```');
        return fenced.map((part, idx) => (idx % 2 === 0 ? replaceInline(part) : part)).join('```');
    };

    const renderSearchStatus = (message: ChatMessage) => {
        if (message.searchApplied === true) return 'Search: On (Grounded)';
        if (message.searchMode === 'native' || message.searchMode === 'fallback' || message.searchWarning) return 'Search: On (Unavailable)';
        return '';
    };

    const renderLinkStatus = (message: ChatMessage) => {
        if (message.linkApplied === true) return 'Links: On (Ingested)';
        if (message.linkWarning) return 'Links: On (Unavailable)';
        return '';
    };

    const handleDownloadJson = () => {
        const exportPayload = {
            exportedAt: new Date().toISOString(),
            type: 'chat-item-export',
            chatItem: item,
            transcriptText,
            myStuffManifest: {
                images: myStuffImages,
                audios: myStuffAudios.map((audio) => ({
                    id: audio.id,
                    name: audio.name,
                    format: audio.format || '',
                    mimeType: audio.mimeType || '',
                    size: Number.isFinite(audio.size) ? Number(audio.size) : null,
                    hasInlineData: Boolean(audio.data)
                }))
            }
        };
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        triggerBlobDownload(blob, `${chatBaseFileName}_chat.json`);
        showDownloadStatus('Downloaded chat JSON.');
    };

    const handleDownloadAll = async () => {
        if (isDownloadAllRunning) return;
        setIsDownloadAllRunning(true);
        try {
            const zip = new JSZip();
            const imagesFolder = zip.folder('my-stuff/images');
            const audioFolder = zip.folder('my-stuff/audio');
            const safeRelativePath = (relativePath: string) => relativePath.replace(/\\/g, '/');
            const imageManifest: Array<Record<string, unknown>> = [];
            const audioManifest: Array<Record<string, unknown>> = [];
            let failedMediaDownloads = 0;

            for (let index = 0; index < myStuffImages.length; index += 1) {
                const image = myStuffImages[index];
                const imageUrl = String(image.url || '').trim();
                const fallbackExt = inferExtension(image.mimeType, imageUrl) || 'png';
                const fileStem = sanitizeFileNameSegment(image.name || `image-${index + 1}`, `image-${index + 1}`);
                const fileName = `${String(index + 1).padStart(2, '0')}_${fileStem}.${fallbackExt}`;
                const zipPath = safeRelativePath(`my-stuff/images/${fileName}`);

                try {
                    if (!imageUrl) throw new Error('Missing image URL.');
                    const response = await fetch(imageUrl, {
                        credentials: imageUrl.startsWith('/') ? 'same-origin' : 'omit'
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const blob = await response.blob();
                    const nextExt = inferExtension(image.mimeType || blob.type, imageUrl) || fallbackExt;
                    const nextFileName = fileName.replace(/\.[^.]+$/, `.${nextExt}`);
                    const nextZipPath = safeRelativePath(`my-stuff/images/${nextFileName}`);
                    imagesFolder?.file(nextFileName, blob);
                    imageManifest.push({
                        id: image.id,
                        name: image.name || `Image ${index + 1}`,
                        mimeType: image.mimeType || blob.type || '',
                        size: Number.isFinite(image.size) ? Number(image.size) : null,
                        sourceUrl: imageUrl,
                        zipPath: nextZipPath,
                        status: 'included'
                    });
                } catch (error: any) {
                    failedMediaDownloads += 1;
                    imageManifest.push({
                        id: image.id,
                        name: image.name || `Image ${index + 1}`,
                        mimeType: image.mimeType || '',
                        size: Number.isFinite(image.size) ? Number(image.size) : null,
                        sourceUrl: imageUrl,
                        zipPath,
                        status: 'failed',
                        reason: error?.message || 'Image download failed.'
                    });
                }
            }

            for (let index = 0; index < myStuffAudios.length; index += 1) {
                const audio = myStuffAudios[index];
                const base64 = String(audio.data || '').trim();
                const formatFromType = inferExtension(audio.mimeType || '', '');
                const formatFromField = String(audio.format || '').trim().toLowerCase();
                const ext = formatFromField || formatFromType || 'mp3';
                const fileStem = sanitizeFileNameSegment(audio.name || `audio-${index + 1}`, `audio-${index + 1}`);
                const fileName = `${String(index + 1).padStart(2, '0')}_${fileStem}.${ext}`;
                const zipPath = safeRelativePath(`my-stuff/audio/${fileName}`);

                if (base64) {
                    try {
                        const binary = atob(base64);
                        const bytes = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i += 1) {
                            bytes[i] = binary.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: audio.mimeType || `audio/${ext}` });
                        audioFolder?.file(fileName, blob);
                        audioManifest.push({
                            id: audio.id,
                            name: audio.name || `Audio ${index + 1}`,
                            format: audio.format || ext,
                            mimeType: audio.mimeType || `audio/${ext}`,
                            size: Number.isFinite(audio.size) ? Number(audio.size) : null,
                            zipPath,
                            status: 'included'
                        });
                    } catch (error: any) {
                        failedMediaDownloads += 1;
                        audioManifest.push({
                            id: audio.id,
                            name: audio.name || `Audio ${index + 1}`,
                            format: audio.format || ext,
                            mimeType: audio.mimeType || `audio/${ext}`,
                            size: Number.isFinite(audio.size) ? Number(audio.size) : null,
                            zipPath,
                            status: 'failed',
                            reason: error?.message || 'Audio decode failed.'
                        });
                    }
                } else {
                    failedMediaDownloads += 1;
                    audioManifest.push({
                        id: audio.id,
                        name: audio.name || `Audio ${index + 1}`,
                        format: audio.format || ext,
                        mimeType: audio.mimeType || `audio/${ext}`,
                        size: Number.isFinite(audio.size) ? Number(audio.size) : null,
                        zipPath,
                        status: 'failed',
                        reason: 'Audio payload not available.'
                    });
                }
            }

            const htmlMessages = hasStructuredMessages
                ? structuredMessages.map((message, index) => {
                    const roleLabel = message.role === 'user' ? 'User' : 'Assistant';
                    const sourceHtml = Array.isArray(message.sources) && message.sources.length > 0
                        ? `<ul>${message.sources.map((source) => (
                            `<li><a href="${escapeHtml(String(source.url || ''))}">${escapeHtml(String(source.title || source.url || 'Source'))}</a></li>`
                        )).join('')}</ul>`
                        : '<p>No sources.</p>';
                    return `
                        <section>
                            <h3>${index + 1}. ${escapeHtml(roleLabel)}</h3>
                            <pre>${escapeHtml(String(message.content || ''))}</pre>
                            <p>Status: ${escapeHtml(String(message.status || 'done'))}</p>
                            ${sourceHtml}
                        </section>
                    `;
                }).join('\n')
                : `<section><pre>${escapeHtml(transcriptText)}</pre></section>`;
            const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(chatTitle)} - Chat Export</title>
  <style>
    body { font-family: "Segoe UI", Roboto, Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    h1, h2, h3 { color: #f8fafc; margin: 0 0 8px; }
    h1 { margin-bottom: 16px; }
    .meta { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 14px; margin-bottom: 18px; }
    .meta p { margin: 4px 0; color: #94a3b8; }
    section { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 10px; color: #e2e8f0; }
    a { color: #38bdf8; }
    ul { margin-top: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(chatTitle)}</h1>
  <div class="meta">
    <p><strong>Model:</strong> ${escapeHtml(primaryModelLabel)}</p>
    <p><strong>Created:</strong> ${escapeHtml(createdAtIso)}</p>
    <p><strong>Updated:</strong> ${escapeHtml(updatedAtIso)}</p>
    <p><strong>My Stuff:</strong> ${myStuffCount} item(s)</p>
  </div>
  <h2>Chat Transcript</h2>
  ${htmlMessages}
  <h2>My Stuff Manifest</h2>
  <section>
    <pre>${escapeHtml(JSON.stringify({ images: imageManifest, audios: audioManifest }, null, 2))}</pre>
  </section>
</body>
</html>`;

            zip.file('chat-transcript.html', html);
            zip.file('chat-transcript.txt', `${transcriptText}\n`);
            zip.file('chat.json', JSON.stringify({
                exportedAt: new Date().toISOString(),
                type: 'chat-item-export',
                chatItem: item,
                transcriptText
            }, null, 2));
            zip.file('my-stuff/manifest.json', JSON.stringify({
                generatedAt: new Date().toISOString(),
                images: imageManifest,
                audios: audioManifest
            }, null, 2));
            zip.file('export-manifest.json', JSON.stringify({
                type: 'chat-item-export-bundle',
                generatedAt: new Date().toISOString(),
                chatId: item.id,
                chatTitle,
                model: primaryModelLabel,
                messageCount: structuredMessages.length || item.messageCount || 0,
                myStuffCount,
                failedMediaDownloads
            }, null, 2));

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            triggerBlobDownload(zipBlob, `${chatBaseFileName}_chat_export.zip`);
            if (failedMediaDownloads > 0) {
                showDownloadStatus(`Download complete (${failedMediaDownloads} media file(s) could not be included).`);
            } else {
                showDownloadStatus('Download all complete.');
            }
        } catch {
            showDownloadStatus('Download all failed.');
        } finally {
            setIsDownloadAllRunning(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 md:p-8">
            <div className="chat-runtime w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[2rem] border border-slate-800/70 bg-[#0c0c0c] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col">
                <header className="px-6 md:px-8 py-5 border-b border-slate-800/60 bg-gradient-to-b from-white/[0.02] to-transparent flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-lg md:text-xl font-black text-white tracking-tight truncate">
                            {item.title || 'Chat Capture'}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2 md:gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                                <MessageSquare size={12} className="text-indigo-400" />
                                {item.messageCount} messages
                            </span>
                            <span className="hidden md:block text-slate-700">|</span>
                            <span className="inline-flex items-center gap-1.5">
                                <Cpu size={12} className="text-indigo-400" />
                                {primaryModelLabel}
                            </span>
                            <span
                                title={modelTooltip}
                                aria-label={modelCountLabel}
                                className="relative inline-flex h-6 w-6 cursor-help items-center justify-center rounded-full border border-indigo-500/25 bg-slate-950/90 text-indigo-200 transition-all hover:border-indigo-400/40 hover:text-indigo-100"
                            >
                                <Bot size={11} />
                                <span className="absolute -right-1 -top-1 inline-flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/20 px-1 text-[7px] font-black leading-none text-indigo-100">
                                    {modelCount}
                                </span>
                            </span>
                        </div>
                        {downloadStatus && (
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300/90">
                                {downloadStatus}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <button
                            onClick={handleDownloadJson}
                            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Download size={13} />
                            Download JSON
                        </button>
                        <button
                            onClick={handleDownloadAll}
                            disabled={isDownloadAllRunning}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isDownloadAllRunning ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            Download All
                        </button>
                        {onOpenChat && (
                            <button
                                onClick={() => onOpenChat(item)}
                                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2"
                            >
                                <MessageCircle size={13} />
                                Continue Chat
                            </button>
                        )}
                        {onMove && (
                            <button
                                onClick={() => onMove(item)}
                                disabled={moveDisabled}
                                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            >
                                <FolderPlus size={13} />
                                Move to Project
                            </button>
                        )}
                        {onArchive && (
                            <button
                                onClick={() => onArchive(item)}
                                disabled={archiveDisabled}
                                className="px-4 py-2.5 bg-slate-900 hover:bg-rose-900/20 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 active:scale-95"
                            >
                                Move to Deleted
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            aria-label="Close chat inspect"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 md:px-8 py-7 md:py-8 space-y-10">
                    <section className="space-y-5">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-indigo-500/10">
                                    <FileText size={14} className="text-indigo-400" />
                                </div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                                    Neural Transcript
                                </h4>
                            </div>
                            <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">
                                Format: Chat Manifest
                            </span>
                        </div>

                        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 font-mono text-[11px] text-slate-500 space-y-1">
                            <p># AIMANA AI Chat Transcript</p>
                            <p>Session: {item.title || 'Chat Capture'}</p>
                            <p>Model: {item.modelId || 'n/a'}</p>
                            <p>Created: {createdAtIso}</p>
                            <p>Updated: {updatedAtIso}</p>
                        </div>

                        {systemPrompt && (
                            <div className="flex justify-center">
                                <div className="px-4 py-1.5 bg-indigo-500/5 border border-indigo-500/10 rounded-full flex items-center gap-2">
                                    <Info size={12} className="text-indigo-400" />
                                    <span className="text-[10px] font-bold text-indigo-300/80 uppercase tracking-widest">
                                        System: {systemPrompt}
                                    </span>
                                </div>
                            </div>
                        )}

                        {attachments.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <ImageIcon size={12} />
                                    Reference Inputs
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {attachments.map((att) => (
                                        <div key={att.id} className="rounded-2xl overflow-hidden border border-slate-800 bg-black min-h-28">
                                            {att.fileUrl ? (
                                                <img src={att.fileUrl} alt="Reference" className="h-full w-full object-cover" loading="lazy" />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-slate-500 text-[10px] uppercase tracking-widest">
                                                    No preview
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-6">
                            {hasStructuredMessages ? structuredMessages.map((message, index) => {
                                const isUser = message.role === 'user';
                                const copyKey = `${message.id || index}`;
                                const images = Array.isArray(message.imageInputs) ? message.imageInputs : [];
                                const audios = Array.isArray(message.audioInputs) ? message.audioInputs : [];
                                const readyImages = images.filter((image) => Boolean(image.url));
                                const readyAudios = audios.filter((audio) => Boolean(audio.data && audio.format));
                                const warnings = [message.searchWarning, message.linkWarning].filter(Boolean);
                                const searchStatus = renderSearchStatus(message);
                                const linkStatus = renderLinkStatus(message);
                                const statuses = [searchStatus, linkStatus].filter(Boolean);
                                return (
                                    <div
                                        key={copyKey}
                                        className="w-full chat-motion-message"
                                        style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                                    >
                                        {isUser ? (
                                            <div className="flex justify-end w-full group">
                                                <div className="flex items-start gap-2 sm:gap-3 w-full max-w-full sm:max-w-[90%] md:max-w-[85%]">
                                                <div className="flex-1 min-w-0 chat-token-panel text-slate-200 px-4 sm:px-6 py-4 rounded-3xl rounded-tr-sm text-[15px] leading-relaxed shadow-sm">
                                                        {images.length > 0 && (
                                                            <div className="mb-3 flex flex-wrap gap-2">
                                                                {readyImages.length > 0 ? readyImages.map((image) => (
                                                                    <button
                                                                        type="button"
                                                                        key={image.id}
                                                                        onClick={() => {
                                                                            if (!image.url) return;
                                                                            setPreviewImage({
                                                                                id: image.id,
                                                                                name: image.name || 'Image',
                                                                                url: image.url,
                                                                                mimeType: image.mimeType,
                                                                                size: Number.isFinite(image.size) ? Number(image.size) : undefined
                                                                            });
                                                                        }}
                                                                        className="block w-20 h-20 rounded-lg overflow-hidden border border-indigo-300/30 bg-slate-900/60"
                                                                        title={image.name}
                                                                    >
                                                                        <img src={image.url} alt={image.name} className="w-full h-full object-cover" loading="lazy" />
                                                                    </button>
                                                                )) : (
                                                                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
                                                                        Loading image preview...
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {audios.length > 0 && (
                                                            <div className="mb-3 flex flex-col gap-2">
                                                                {readyAudios.length > 0 ? readyAudios.map((audio) => (
                                                                    <button
                                                                        key={audio.id}
                                                                        type="button"
                                                                        onClick={() => setPreviewAudio(audio)}
                                                                        className="w-full max-w-sm flex items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2 text-left hover:border-indigo-500/40 transition-colors"
                                                                    >
                                                                        <span className="truncate text-[12px] text-slate-200">{audio.name || 'Audio'}</span>
                                                                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">Preview</span>
                                                                    </button>
                                                                )) : (
                                                                    <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
                                                                        Loading audio preview...
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
                                                            {message.content || '(empty message)'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-2 mr-1 sm:mr-2 shrink-0 self-start">
                                                    <button
                                                        onClick={() => handleCopy(copyKey, message.content || '')}
                                                        className="chat-focus-ring inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white rounded px-1.5 py-1 transition-colors"
                                                        aria-label="Copy message"
                                                    >
                                                        {copiedKey === copyKey ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />} Copy
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-3 sm:gap-4 md:gap-6 w-full">
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-1">
                                                    <Sparkles size={14} className="text-indigo-400" />
                                                </div>
                                                <div className={`flex-1 min-w-0 space-y-3 ${message.status === 'error' ? 'text-red-200' : 'text-slate-200'}`}>
                                                    {message.status === 'loading' ? (
                                                        <div className="space-y-3">
                                                            {message.content.trim() ? (
                                                                <MessageMarkdown content={message.content} isStreaming messageId={message.id} />
                                                            ) : null}
                                                            <div className="inline-flex items-center gap-2 text-slate-300">
                                                                <Loader2 size={14} className="animate-spin" />
                                                                <span className="text-sm">Generating response...</span>
                                                            </div>
                                                        </div>
                                                    ) : message.status === 'stopped' ? (
                                                        <div className="text-slate-300 leading-relaxed text-[15px] font-medium flex items-center gap-2">
                                                            Generation stopped. <Square size={12} className="text-slate-500 fill-current" />
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            const { answer, summary } = splitReasoningSummary(message.content);
                                                            return (
                                                                <div className="space-y-3">
                                                                    <MessageMarkdown
                                                                        content={injectCitationLinks(answer, message.sources)}
                                                                        isStreaming={false}
                                                                        messageId={message.id}
                                                                    />
                                                                    {summary ? (
                                                                        <details className="border border-slate-800/70 rounded-xl bg-slate-900/40 p-3">
                                                                            <summary className="cursor-pointer text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                                                                                Reasoning Summary
                                                                            </summary>
                                                                            <div className="mt-3">
                                                                                <MessageMarkdown
                                                                                    content={injectCitationLinks(summary, message.sources)}
                                                                                    isStreaming={false}
                                                                                    messageId={`${message.id}-summary`}
                                                                                />
                                                                            </div>
                                                                        </details>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                    {warnings.length > 0 && (
                                                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                                                            {warnings.map((warning, warningIndex) => (
                                                                <div key={`${copyKey}-warn-${warningIndex}`}>{warning}</div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {showSources && Array.isArray(message.sources) && message.sources.length > 0 && (
                                                        <details className="border border-slate-800/70 rounded-xl bg-slate-900/40 p-3">
                                                            <summary className="cursor-pointer text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                                                                Sources ({message.sources.length})
                                                            </summary>
                                                            <div className="mt-3 space-y-2">
                                                                {message.sources.map((source, sourceIndex) => (
                                                                    <div key={`${copyKey}-source-${sourceIndex}`} className="text-xs text-slate-300">
                                                                        <span className="text-slate-500 font-mono text-[10px] uppercase tracking-widest mr-2">
                                                                            [{sourceIndex + 1}]
                                                                        </span>
                                                                        <a
                                                                            href={source.url}
                                                                            target="_blank"
                                                                            rel="noreferrer noopener"
                                                                            className="text-cyan-300 hover:text-cyan-200 font-semibold break-all"
                                                                        >
                                                                            {source.title}
                                                                        </a>
                                                                        {source.snippet ? (
                                                                            <p className="text-slate-400 mt-1 whitespace-pre-wrap break-words">
                                                                                {source.snippet}
                                                                            </p>
                                                                        ) : null}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    )}
                                                    <div className="flex flex-wrap items-center gap-1 pt-1">
                                                        <button
                                                            onClick={() => handleCopy(copyKey, message.content || '')}
                                                            className="chat-token-icon-btn chat-focus-ring p-2 transition-colors"
                                                            title="Copy response"
                                                            aria-label="Copy response"
                                                        >
                                                            {copiedKey === copyKey ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                                        </button>
                                                        <div className="w-full sm:w-auto text-[10px] font-mono text-slate-600 uppercase tracking-widest sm:ml-auto font-bold break-words">
                                                            {message.modelId || item.modelId || 'assistant'}
                                                            {message.requestId ? ` | request: ${message.requestId}` : ''}
                                                            {message.latencyMs ? ` | ${(message.latencyMs / 1000).toFixed(2)}s` : ''}
                                                            {statuses.length > 0 ? ` | ${statuses.join(' | ')}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="rounded-2xl border border-slate-800/70 bg-slate-950 p-4 relative">
                                    <pre className="whitespace-pre-wrap text-xs text-slate-300 pr-10">
                                        {item.transcriptText || 'No transcript available.'}
                                    </pre>
                                    <button
                                        onClick={() => handleCopy('fallback-transcript', item.transcriptText || '')}
                                        className="absolute right-3 top-3 p-2 bg-slate-800/60 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                                        aria-label="Copy transcript"
                                    >
                                        {copiedKey === 'fallback-transcript' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                                    <FolderOpen size={14} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">My Stuff Manifest</h4>
                                    <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">Session asset registry</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[11px] text-slate-500">{myStuffCount} items</span>
                                <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800 shadow-xl">
                                    <button
                                        type="button"
                                        onClick={() => setMyStuffView('grid')}
                                        className={`p-2 rounded-lg transition-all ${myStuffView === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Mosaic Grid"
                                        aria-label="Grid view"
                                    >
                                        <LayoutGrid size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMyStuffView('list')}
                                        className={`p-2 rounded-lg transition-all ${myStuffView === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Technical List"
                                        aria-label="List view"
                                    >
                                        <List size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        {myStuffCount === 0 ? (
                            <div className="border border-dashed border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
                                No session media captured for this chat item.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {myStuffImages.length > 0 && (
                                    <section className="space-y-3">
                                        <div className="flex items-center justify-between px-2">
                                            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Images</h5>
                                            <span className="text-[11px] text-slate-500">{myStuffImages.length} items</span>
                                        </div>
                                        {myStuffView === 'list' ? (
                                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-[1.25rem] overflow-x-auto shadow-2xl">
                                                <table className="w-full min-w-[32rem] text-left text-[11px]">
                                                    <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/80">
                                                        <tr>
                                                            <th className="px-6 py-4 w-20">Preview</th>
                                                            <th className="px-6 py-4">Name</th>
                                                            <th className="px-6 py-4 w-36">Type</th>
                                                            <th className="px-6 py-4 w-28 text-right">Size</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/40">
                                                        {myStuffImages.map((image) => (
                                                            <tr
                                                                key={image.id}
                                                                className="hover:bg-indigo-600/5 transition-colors cursor-pointer"
                                                                onClick={() => setPreviewImage(image)}
                                                            >
                                                                <td className="px-6 py-4">
                                                                    <div className="w-12 h-12 rounded-lg bg-black border border-slate-700 overflow-hidden shadow-inner">
                                                                        <img src={image.url} className="w-full h-full object-cover opacity-80" alt={image.name} loading="lazy" />
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-slate-200 font-semibold truncate">{image.name || 'Image'}</td>
                                                                <td className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{image.mimeType || 'image'}</td>
                                                                <td className="px-6 py-4 text-right text-[10px] text-slate-500 uppercase tracking-widest">
                                                                    {formatMb(image.size)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                                                {myStuffImages.map((image) => (
                                                    <button
                                                        key={image.id}
                                                        type="button"
                                                        onClick={() => setPreviewImage(image)}
                                                        className="group relative aspect-square bg-slate-900/20 border border-slate-800/50 rounded-[1.25rem] overflow-hidden transition-all hover:border-indigo-500/40 hover:-translate-y-1 shadow-xl"
                                                        title={image.name}
                                                        aria-label={`Preview ${image.name}`}
                                                    >
                                                        <img src={image.url} alt={image.name} className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                )}
                                {myStuffAudios.length > 0 && (
                                    <section className="space-y-3">
                                        <div className="flex items-center justify-between px-2">
                                            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Audio</h5>
                                            <span className="text-[11px] text-slate-500">{myStuffAudios.length} items</span>
                                        </div>
                                        {myStuffView === 'list' ? (
                                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-[1.25rem] overflow-x-auto shadow-2xl">
                                                <table className="w-full min-w-[28rem] text-left text-[11px]">
                                                    <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/80">
                                                        <tr>
                                                            <th className="px-6 py-4">Name</th>
                                                            <th className="px-6 py-4 w-36">Format</th>
                                                            <th className="px-6 py-4 w-28 text-right">Size</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/40">
                                                        {myStuffAudios.map((audio) => (
                                                            <tr
                                                                key={audio.id}
                                                                className="hover:bg-indigo-600/5 transition-colors cursor-pointer"
                                                                onClick={() => setPreviewAudio(audio)}
                                                            >
                                                                <td className="px-6 py-4 text-slate-200 font-semibold truncate">{audio.name || 'Audio'}</td>
                                                                <td className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{audio.format || 'unknown'}</td>
                                                                <td className="px-6 py-4 text-right text-[10px] text-slate-500 uppercase tracking-widest">
                                                                    {formatMb(audio.size)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {myStuffAudios.map((audio) => (
                                                    <button
                                                        key={audio.id}
                                                        type="button"
                                                        onClick={() => setPreviewAudio(audio)}
                                                        className="w-full flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left hover:border-indigo-500/40 transition-all"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-slate-200 font-semibold truncate">{audio.name || 'Audio'}</p>
                                                            <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">
                                                                {audio.format || 'unknown'}
                                                                {audio.size ? ` - ${formatMb(audio.size)}` : ''}
                                                            </p>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-widest">Preview</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                <Sparkles size={14} className="text-amber-400" />
                            </div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Neural Summary</h4>
                        </div>
                        {summaryText ? (
                            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-5 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {summaryText}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-6 flex items-center justify-center text-center">
                                <div className="flex flex-col items-center gap-3 opacity-55">
                                    <BrainCircuit size={28} className="text-slate-600" />
                                    <p className="text-xs font-medium text-slate-500 italic">
                                        No summary generated for this manifest yet.
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <footer className="px-6 md:px-8 py-4 border-t border-slate-800/60 bg-slate-900/20 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                        Artifact ID: {item.id}
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                            Last Synced: {updatedAtLabel}
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                    </div>
                </footer>
            </div>

            {previewImage && (
                <div
                    className="fixed inset-0 z-[950] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative w-full max-w-5xl max-h-[90vh] bg-slate-950 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-2xl overflow-hidden flex flex-col"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute -top-10 right-0 p-2 rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-white"
                            aria-label="Close image preview"
                        >
                            <X size={18} />
                        </button>
                        <div className="mb-4">
                            <p className="text-sm font-semibold text-slate-200">{previewImage.name || 'Image Preview'}</p>
                            <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">
                                {previewImage.mimeType || 'image'}
                                {previewImage.size ? ` - ${formatMb(previewImage.size)}` : ''}
                            </p>
                        </div>
                        <div className="min-h-0 flex-1 rounded-xl border border-slate-800 bg-black overflow-hidden flex items-center justify-center">
                            <img
                                src={previewImage.url}
                                alt={previewImage.name || 'Preview'}
                                className="max-h-full max-w-full object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}

            {previewAudio && (
                <div
                    className="fixed inset-0 z-[960] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setPreviewAudio(null)}
                >
                    <div
                        className="relative w-full max-w-xl bg-slate-950 border border-slate-800/80 rounded-2xl p-6 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            onClick={() => setPreviewAudio(null)}
                            className="absolute -top-10 right-0 p-2 rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-white"
                            aria-label="Close audio preview"
                        >
                            <X size={18} />
                        </button>
                        <div className="mb-4">
                            <p className="text-sm font-semibold text-slate-200">{previewAudio.name || 'Audio Preview'}</p>
                            <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">
                                {previewAudio.format || 'unknown'}
                                {previewAudio.size ? ` - ${formatMb(previewAudio.size)}` : ''}
                            </p>
                        </div>
                        {previewAudio.data && previewAudio.format ? (
                            <audio
                                controls
                                preload="none"
                                className="w-full"
                                src={`data:${previewAudio.mimeType || `audio/${previewAudio.format}`};base64,${previewAudio.data}`}
                            />
                        ) : (
                            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
                                Audio preview unavailable.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
