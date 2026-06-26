
import { useState, useCallback } from 'react';
import { GeneratedImageResult, GeminiImageModel, generateImageWithGemini, generateSpeechWithGemini } from '../services/geminiService';
import { PollinationsModel, generateMediaWithPollinations, getResolvedDimensions, ensureReferenceAsset } from '../services/pollinationsService';
import { RATIO_CONFIG } from '../components/project/lab/LabSidebar';
import { SupportedEngine, loadDynamicRegistry } from '../components/project/lab/ModelSelector/registry/index';
import { GoogleGenAI } from '@google/genai';
import { api } from '../services/api';
import { ItemWithCurrentRevision } from '../types';
import { formatPollenAmount, getPrimaryModelCreditRate, resolvePollenCharge } from '../utils/pollenCredits';
import { consumePollenCredit } from '../utils/pollenCreditBalance';
import { formatGoogleUsd, normalizeGoogleUsage, resolveGoogleApiCharge, summarizeGoogleUsage } from '../utils/googleCredits';
import { normalizeGoogleModelId } from '../utils/googleModelIds';
import { createGeneratedAssetFile } from '../utils/generatedAssetFile';
import { normalizeUserFacingError, readApiErrorMessage } from '../utils/userFacingErrors';
import { isTranscriptionAudioModel } from '../components/project/lab/ModelSelector/audioModelUtils';
import { mergeRevisionTags } from '../utils/revisionTags';

export const STAGE_LABELS: Record<number, string> = {
    0: 'Idle',
    10: 'Initializing Neural Pipeline...',
    30: 'Allocating Compute Resources...',
    50: 'Executing Inference...',
    70: 'Post-Processing Artifact...',
    90: 'Finalizing Manifest...',
    100: 'Synthesis Complete'
};

const parseAspectRatio = (ratio?: string): number | null => {
    if (!ratio || typeof ratio !== 'string' || !ratio.includes(':')) return null;
    const [w, h] = ratio.split(':').map((v) => Number(v));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return w / h;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Reference image decode failed'));
        img.src = src;
    });

const normalizeReferenceImageAspect = async (inputImage: string, targetRatio?: string): Promise<string> => {
    const target = parseAspectRatio(targetRatio);
    if (!inputImage || !target) return inputImage;
    if (!/^data:image\/|^\/storage\/|^https?:\/\//.test(inputImage)) return inputImage;

    try {
        const img = await loadImage(inputImage);
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH) return inputImage;

        const srcRatio = srcW / srcH;
        if (Math.abs(srcRatio - target) < 0.01) return inputImage;

        let cropW = srcW;
        let cropH = srcH;
        let sx = 0;
        let sy = 0;

        if (srcRatio > target) {
            cropW = Math.max(1, Math.round(srcH * target));
            sx = Math.max(0, Math.floor((srcW - cropW) / 2));
        } else {
            cropH = Math.max(1, Math.round(srcW / target));
            sy = Math.max(0, Math.floor((srcH - cropH) / 2));
        }

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return inputImage;
        ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
        return canvas.toDataURL('image/jpeg', 0.95);
    } catch {
        return inputImage;
    }
};

export type GenerationStatus = 'pending' | 'generating' | 'success' | 'error';

export interface LabTask {
    id: string;
    title?: string;
    prompt: string;
    modelId: string;
    modelLabel: string;
    status: GenerationStatus;
    progress: number;
    result: GeneratedImageResult | null;
    error: string | null;
    timestamp: number;
    aspectRatio: string;
    archivedItem?: ItemWithCurrentRevision;
    metadata?: any;
}

const stripEmbeddedArchivePayload = (params: any) => {
    if (!params || typeof params !== 'object') return params;
    const next = { ...params };
    delete next.audioData;
    delete next.inputAudioData;
    delete next.audioBase64;
    return next;
};

const extractTranscriptTextFromPayload = (payload: string): string => {
    const source = String(payload || '').trim();
    if (!source) return '';
    if (source === '[object Object]') return '';
    if (!(source.startsWith('{') && source.endsWith('}'))) return source;

    try {
        const parsed = JSON.parse(source) as Record<string, any>;
        const directCandidates = [
            parsed?.text,
            parsed?.transcript,
            parsed?.output_text,
            parsed?.results?.transcript,
            parsed?.results?.text,
            parsed?.results?.transcripts?.[0]?.transcript
        ];
        for (const value of directCandidates) {
            const text = String(value || '').trim();
            if (text && text !== '[object Object]') return text;
        }

        const segmentCandidates = [
            parsed?.segments,
            parsed?.utterances,
            parsed?.results?.segments
        ];
        for (const candidate of segmentCandidates) {
            if (!Array.isArray(candidate)) continue;
            const joined = candidate
                .map((segment: any) => String(segment?.text || segment?.transcript || '').trim())
                .filter(Boolean)
                .join(' ')
                .trim();
            if (joined && joined !== '[object Object]') return joined;
        }
    } catch (_error) {
        return source === '[object Object]' ? '' : source;
    }

    return source === '[object Object]' ? '' : source;
};

const normalizeReferenceTagToken = (value: unknown): string => (
    String(value || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
);

const resolveRequestedDuration = (advanced?: { duration?: number; dynamicParams?: Record<string, any> }): number | undefined => {
    const candidates = [
        advanced?.dynamicParams?.duration,
        advanced?.duration
    ];
    for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) return value;
    }
    return undefined;
};

const resolveReferenceImageTitleTag = async (referenceItemId?: string | null): Promise<string> => {
    const cleanId = String(referenceItemId || '').trim();
    if (!cleanId) return '';

    try {
        const item = await api.items.get(cleanId);
        return normalizeReferenceTagToken(item?.currentRevision?.title || '');
    } catch (_error) {
        return '';
    }
};

const resolveReferenceImageTitleTags = async (referenceItemIds?: Array<string | null | undefined>): Promise<string> => {
    const ids = Array.from(new Set(
        (Array.isArray(referenceItemIds) ? referenceItemIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
    ));
    if (ids.length === 0) return '';

    const tags = await Promise.all(ids.map((id) => resolveReferenceImageTitleTag(id)));
    return mergeRevisionTags(tags);
};

export const saveArtifactToArchive = async (
    res: any,
    prompt: string,
    modelId: string,
    params: any,
    options: {
        markAutoSaved?: boolean;
        stripEmbeddedAudioData?: boolean;
    } = {}
): Promise<ItemWithCurrentRevision | null> => {
    try {
        const archive = await fetch('/api/projects/archive', {
            headers: api.auth.getAuthHeaders()
        }).then(r => r.json());

        if (!archive?.id) return null;

        const paramsForPersistence = options.stripEmbeddedAudioData
            ? stripEmbeddedArchivePayload(params)
            : params;
        const normalizedPrompt = String(prompt || '').trim();
        const transcriptionPayloadText = paramsForPersistence?.isTranscription
            ? extractTranscriptTextFromPayload(String(res?.text || ''))
            : '';
        const persistedPrompt = transcriptionPayloadText
            || (String(res?.mimeType || '').startsWith('text/')
                ? String(res?.text || '').trim()
                : '')
            || normalizedPrompt;
        const transcriptionResponseFormat = String(paramsForPersistence?.dynamicParams?.response_format || '').trim().toLowerCase();
        const fallbackTranscriptionFormat = paramsForPersistence?.isTranscription
            ? (
                transcriptionResponseFormat
                || (String(res?.text || '').trim().startsWith('{') ? 'json' : 'text')
            )
            : '';
        const file = createGeneratedAssetFile(res, {
            baseName: paramsForPersistence?.title || paramsForPersistence?.sourceFileName || `auto-${Date.now()}`,
            formatHint: paramsForPersistence?.isTranscription
                ? fallbackTranscriptionFormat
                : paramsForPersistence?.dynamicParams?.response_format
        });

        const itemWithRev = await api.items.create(archive.id, file, () => {});

        if (itemWithRev.currentRevision) {
            const resolvedReferenceItemId = res.referenceItemId
                || paramsForPersistence?.referenceItemId
                || paramsForPersistence?.referenceAudioItemId
                || null;
            const resolvedReferenceHash = res.referenceHash
                || paramsForPersistence?.referenceHash
                || paramsForPersistence?.referenceAudioHash
                || null;
            const finalParams = {
                ...paramsForPersistence,
                pollenUsed: res.pollenUsed,
                referenceItemId: resolvedReferenceItemId,
                referenceHash: resolvedReferenceHash,
                referenceAudioItemId: paramsForPersistence?.referenceAudioItemId || resolvedReferenceItemId,
                referenceAudioHash: paramsForPersistence?.referenceAudioHash || resolvedReferenceHash
            };
            const finalTitle = paramsForPersistence?.title || `Auto: ${prompt.substring(0, 30)}...`;
            const nextAiParameters: Record<string, any> = {
                advanced_params: finalParams
            };
            const fallbackReferenceImageTag = !String(paramsForPersistence?.referenceImageTag || '').trim()
                ? await resolveReferenceImageTitleTags([
                    resolvedReferenceItemId,
                    ...(Array.isArray(paramsForPersistence?.referenceItemIds) ? paramsForPersistence.referenceItemIds : [])
                ])
                : '';
            const nextTags = mergeRevisionTags(
                itemWithRev.currentRevision.tags,
                paramsForPersistence?.referenceImageTag,
                fallbackReferenceImageTag
            );

            if (options.markAutoSaved !== false) {
                nextAiParameters.auto_saved = true;
            }

            const updatedRevision = await api.revisions.update({
                ...itemWithRev.currentRevision,
                prompt: persistedPrompt,
                engine: modelId,
                aiParameters: JSON.stringify(nextAiParameters, null, 2),
                title: finalTitle,
                tags: nextTags
            });

            itemWithRev.currentRevision = updatedRevision;
            itemWithRev.currentRevisionId = updatedRevision.id;
        }

        window.dispatchEvent(new CustomEvent('neural-history-updated'));
        return itemWithRev;
    } catch (e) {
        console.warn("[AUTO_SAVE] Failed to persist artifact to archive.", e);
        return null;
    }
};

export const useAiGeneration = () => {
    const [tasks, setTasks] = useState<LabTask[]>([]);

    const latestTask = tasks[0] || null;
    const isGenerating = tasks.some(t => t.status === 'generating' || t.status === 'pending');
    const stage = latestTask?.progress || 0;
    const result = latestTask?.result || null;
    const error = latestTask?.error ? { message: latestTask.error } : null;
    
    const reset = useCallback(() => setTasks([]), []);

    const updateTask = useCallback((taskId: string, updates: Partial<LabTask>) => {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    }, []);

    const removeTask = useCallback((taskId: string) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
    }, []);

    const generate = async (
        prompt: string, 
        modelId: SupportedEngine, 
        ratio: any, 
        customWidth?: number, 
        customHeight?: number,
        advanced?: {
            title?: string;
            negativePrompt?: string;
            seed?: string;
            dynamicParams?: Record<string, any>;
            temperature?: number;
            useSearch?: boolean;
            voiceName?: string;
            duration?: number;
            audioData?: string;
            audioFormat?: string;
            sourceFileName?: string;
            isTranscription?: boolean;
            inputImage?: string | null;
            referenceItemId?: string | null; // Track internal items used as source
            referenceHash?: string | null;
            referenceAudioItemId?: string | null;
            referenceAudioHash?: string | null;
            ratio?: string;
            skipAutoSave?: boolean;
        }
    ) => {
        const resolvedModelId = normalizeGoogleModelId(modelId as string) as SupportedEngine;
        const taskId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const fullRegistry = await loadDynamicRegistry();
        const modelData = fullRegistry.find(m => m.id === resolvedModelId);
        
            const newTask: LabTask = {
            id: taskId,
            title: advanced?.title,
            prompt,
            modelId: resolvedModelId,
            modelLabel: modelData?.label || resolvedModelId,
            status: 'pending',
            progress: 10,
            result: null,
            error: null,
            timestamp: Date.now(),
            aspectRatio: ratio
        };

        setTasks(prev => [newTask, ...prev]);

        try {
            updateTask(taskId, { status: 'generating', progress: 30 });
            
            if (!prompt.trim() && !advanced?.inputImage && !advanced?.audioData) throw new Error("Input required (Prompt, Audio, or Image).");
            if (!modelData) throw new Error(`Neural endpoint [${resolvedModelId}] not registered in Hub.`);
            
            const category = modelData.category;
            const isCustom = (modelData as any).isCustom === true;
            const effectiveRatio = (advanced?.dynamicParams?.aspectRatio || advanced?.ratio || ratio || "1:1") as string;
            const requestedDuration = resolveRequestedDuration(advanced);
            const normalizedInputImage = category === 'Motion' && advanced?.inputImage
                ? await normalizeReferenceImageAspect(advanced.inputImage, effectiveRatio)
                : (advanced?.inputImage || null);
            const ensuredReference = await ensureReferenceAsset(normalizedInputImage || null);
            const resolvedInputImage = ensuredReference?.fileUrl || normalizedInputImage || null;
            let resolvedReferenceItemId = ensuredReference?.referenceItemId
                || advanced?.referenceItemId
                || advanced?.referenceAudioItemId
                || null;
            let resolvedReferenceHash = ensuredReference?.referenceHash
                || (advanced as any)?.referenceHash
                || (advanced as any)?.referenceAudioHash
                || null;
            if (category === 'Audio' && advanced?.audioData && !resolvedReferenceItemId) {
                try {
                    const ensuredAudioReference = await ensureReferenceAsset(advanced.audioData);
                    if (ensuredAudioReference?.referenceItemId) {
                        resolvedReferenceItemId = ensuredAudioReference.referenceItemId;
                        resolvedReferenceHash = ensuredAudioReference.referenceHash || resolvedReferenceHash;
                    }
                } catch (error) {
                    console.warn('[AUDIO_REF] Failed to persist uploaded source audio as reference asset.', error);
                }
            }
            const resolvedReferenceAudioItemId = advanced?.referenceAudioItemId
                || (category === 'Audio' ? resolvedReferenceItemId : null);
            const resolvedReferenceAudioHash = advanced?.referenceAudioHash
                || (category === 'Audio' ? resolvedReferenceHash : null);
            const canUseReferenceImage = category !== 'Audio'
                && category !== 'Language'
                && !!(
                    normalizedInputImage
                    || resolvedReferenceItemId
                    || advanced?.referenceItemId
                );

            let res: any;
            updateTask(taskId, { progress: 50 });
            
            if (category === 'Audio') {
                if (isTranscriptionAudioModel(modelData)) {
                    if (!advanced?.audioData) {
                        throw new Error('Attach an audio file before starting transcription.');
                    }

                    const proxyRes = await fetch('/api/proxy/pollinations', {
                        method: 'POST',
                        headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            model: resolvedModelId,
                            prompt,
                            audioData: advanced.audioData,
                            audioFormat: advanced.audioFormat,
                            isTranscription: advanced.isTranscription,
                            dynamicParams: advanced?.dynamicParams || {}
                        })
                    });

                    if (!proxyRes.ok) {
                        throw new Error(await readApiErrorMessage(proxyRes, 'Transcription request failed.'));
                    }

                    res = {
                        base64: '',
                        mimeType: proxyRes.headers.get('content-type') || 'text/plain',
                        text: await proxyRes.text(),
                        pollenUsed: proxyRes.headers.get('x-pollen-used') || ''
                    };
                } else if (isCustom) {
                    const proxyRes = await fetch('/api/proxy/pollinations', {
                        method: 'POST',
                        headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            model: resolvedModelId,
                            prompt,
                            ...(requestedDuration !== undefined ? { duration: requestedDuration } : {}),
                            temperature: advanced?.temperature,
                            voiceName: advanced?.voiceName,
                            dynamicParams: advanced?.dynamicParams || {}
                        })
                    });

                    if (!proxyRes.ok) {
                        throw new Error(await readApiErrorMessage(proxyRes, 'Audio generation failed.'));
                    }

                    const pollenUsed = proxyRes.headers.get('x-pollen-used') || '';
                    const contentType = proxyRes.headers.get('content-type') || '';

                    if (contentType.includes('audio/')) {
                        const blob = await proxyRes.blob();
                        const base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        res = { base64, mimeType: contentType, pollenUsed };
                    } else {
                        res = { base64: '', mimeType: 'text/plain', text: await proxyRes.text(), pollenUsed };
                    }
                } else {
                    res = await generateSpeechWithGemini(prompt, {
                        model: resolvedModelId,
                        voiceName: advanced?.voiceName,
                        dynamicParams: advanced?.dynamicParams
                    });
                }
            } else if (isCustom) {
                const proxyRes = await fetch('/api/proxy/pollinations', {
                    method: 'POST',
                    headers: api.auth.getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        model: resolvedModelId,
                        prompt,
                        width: customWidth || 1024,
                        height: customHeight || 1024,
                        seed: advanced?.seed ? parseInt(advanced.seed) : Math.floor(Math.random() * 10000000),
                        negative_prompt: advanced?.negativePrompt || "",
                        ...(requestedDuration !== undefined ? { duration: requestedDuration } : {}),
                        image: resolvedInputImage,
                        // Prefer explicit dynamic control mapping from Checkpoint Hub (e.g. aspectRatio select).
                        aspectRatio: advanced?.dynamicParams?.aspectRatio || advanced?.ratio || ratio || "1:1",
                        temperature: advanced?.temperature,
                        useSearch: advanced?.useSearch,
                        voiceName: advanced?.voiceName,
                        dynamicParams: advanced?.dynamicParams || {}
                    })
                });

                if (!proxyRes.ok) {
                    throw new Error(await readApiErrorMessage(proxyRes, 'Neural Inference Gateway Failure'));
                }

                const pollenUsed = proxyRes.headers.get('x-pollen-used') || '';
                const referenceItemId = proxyRes.headers.get('x-reference-item-id') || resolvedReferenceItemId || '';
                const referenceHash = proxyRes.headers.get('x-reference-hash') || resolvedReferenceHash || '';
                const contentType = proxyRes.headers.get('content-type') || '';

                if (contentType.includes('image/') || contentType.includes('video/') || contentType.includes('audio/')) {
                    const blob = await proxyRes.blob();
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    res = { base64, mimeType: contentType, pollenUsed, referenceItemId, referenceHash };
                } else {
                    res = { base64: '', mimeType: 'text/plain', text: await proxyRes.text(), pollenUsed, referenceItemId, referenceHash };
                }
            } else if (category === 'Language') {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const response = await ai.models.generateContent({
                    model: resolvedModelId as string,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { temperature: advanced?.temperature ?? 0.7 }
                });
                res = {
                    base64: 'chat_payload',
                    mimeType: 'text/markdown',
                    text: response.text,
                    googleUsage: normalizeGoogleUsage(response.usageMetadata)
                };
            } else if (resolvedModelId.startsWith('pollinations-')) {
                // Fix: Correctly spreading dynamicParams to pass all refined settings to the Pollinations service call
                res = await generateMediaWithPollinations(
                    prompt, RATIO_CONFIG[ratio].apiValue, resolvedModelId as PollinationsModel, 
                    customWidth, customHeight, advanced?.seed ? parseInt(advanced.seed) : undefined,
                    advanced?.negativePrompt,
                    {
                        ...advanced?.dynamicParams,
                        enhance: advanced?.dynamicParams?.enhance,
                        nologo: advanced?.dynamicParams?.nologo,
                        safe: advanced?.dynamicParams?.safe,
                        private: advanced?.dynamicParams?.isPrivate,
                        duration: requestedDuration,
                        image: resolvedInputImage
                    }
                );
            } else {
                res = await generateImageWithGemini(
                    prompt, RATIO_CONFIG[ratio].apiValue, resolvedModelId as GeminiImageModel, 
                    advanced?.useSearch ?? true,
                    advanced?.seed ? parseInt(advanced.seed) : undefined,
                    resolvedInputImage
                );
            }

            const resolvedCharge = resolvePollenCharge({
                model: modelData,
                pollenUsed: res?.pollenUsed,
                promptText: prompt,
                completionText: res?.text,
                durationSeconds: requestedDuration
            });

            if (!res?.pollenUsed && resolvedCharge.amount !== null) {
                res = {
                    ...res,
                    pollenUsed: String(resolvedCharge.amount)
                };
            }

            const googleCharge = resolveGoogleApiCharge({
                model: modelData,
                usage: res?.googleUsage,
                outputImageCount: category === 'Visual' ? 1 : undefined
            });
            const isTranscriptionTask = category === 'Audio' && isTranscriptionAudioModel(modelData);
            const transcriptionPostProcess = isTranscriptionTask
                ? {
                    status: 'pending',
                    summaryEnabled: Boolean(advanced?.dynamicParams?.transcriptSummaryEnabled ?? true),
                    qaEnabled: Boolean(advanced?.dynamicParams?.transcriptQaCheckerEnabled ?? false),
                    summaryText: '',
                    qaReport: '',
                    summaryError: '',
                    qaError: '',
                    updatedAt: Date.now()
                }
                : null;
            const referenceImageTag = canUseReferenceImage
                ? await resolveReferenceImageTitleTags([
                    res?.referenceItemId,
                    resolvedReferenceItemId,
                    advanced?.referenceItemId
                ])
                : '';
            const advancedForPersistence = {
                ...advanced,
                referenceItemId: resolvedReferenceItemId,
                referenceHash: resolvedReferenceHash,
                referenceImageTag,
                referenceAudioItemId: resolvedReferenceAudioItemId,
                referenceAudioHash: resolvedReferenceAudioHash,
                googleUsage: res?.googleUsage || null,
                googleEstimatedCostUsd: googleCharge.amountUsd,
                ...(transcriptionPostProcess ? { transcriptionPostProcess } : {})
            };

            updateTask(taskId, { progress: 90 });
            
            const transcriptPayload = category === 'Audio' && isTranscriptionAudioModel(modelData)
                ? String(res?.text || '').trim()
                : '';
            let transcriptText = extractTranscriptTextFromPayload(transcriptPayload);
            const persistedPrompt = transcriptText || prompt;

            let savedItem: ItemWithCurrentRevision | undefined;
            if ((res.base64 || res.text) && !advanced?.skipAutoSave) {
                const saved = await saveArtifactToArchive(res, persistedPrompt, resolvedModelId, advancedForPersistence, {
                    markAutoSaved: true,
                    stripEmbeddedAudioData: isTranscriptionTask
                });
                if (saved) savedItem = saved;
            }

            updateTask(taskId, { 
                status: 'success', 
                progress: 100, 
                result: res, 
                prompt: persistedPrompt,
                archivedItem: savedItem,
                metadata: { 
                    ...advancedForPersistence,
                    sourceFileName: advanced?.sourceFileName || null,
                    transcriptionHint: advanced?.isTranscription ? prompt : null,
                    referenceItemId: res.referenceItemId || resolvedReferenceItemId || advanced?.referenceItemId || advanced?.referenceAudioItemId || null,
                    referenceHash: res.referenceHash || resolvedReferenceHash || (advanced as any)?.referenceHash || (advanced as any)?.referenceAudioHash || null,
                    referenceAudioItemId: resolvedReferenceAudioItemId || advanced?.referenceAudioItemId || null,
                    referenceAudioHash: resolvedReferenceAudioHash || advanced?.referenceAudioHash || null,
                    pollenUsed: res.pollenUsed
                } 
            });
            if (res.pollenUsed) {
                consumePollenCredit(
                    res.pollenUsed,
                    resolvedCharge.isEstimated ? `AI Creative ${category} (estimated)` : `AI Creative ${category}`
                );
            }
            if (typeof window !== 'undefined') {
                const trimmedPrompt = String(persistedPrompt || '').trim();
                const creditParts: string[] = [];
                if (res.pollenUsed) {
                    creditParts.push(`Credit used: ${formatPollenAmount(res.pollenUsed)} pollen`);
                }
                const modelCreditRate = getPrimaryModelCreditRate(modelData);
                if (modelCreditRate?.displayValue) {
                    creditParts.push(`Model rate: ${modelCreditRate.displayValue}`);
                }
                const googleUsageLabel = summarizeGoogleUsage(res?.googleUsage);
                if (googleUsageLabel) {
                    creditParts.push(`Google usage: ${googleUsageLabel}`);
                }
                if (googleCharge.amountUsd !== null) {
                    creditParts.push(`Google paid est: ${formatGoogleUsd(googleCharge.amountUsd)}`);
                }
                if (trimmedPrompt) {
                    creditParts.push(`Prompt: ${trimmedPrompt.slice(0, 120)}${trimmedPrompt.length > 120 ? '...' : ''}`);
                }
                const snippet = creditParts.join(' | ') || 'Generation completed.';
                window.dispatchEvent(new CustomEvent('aimana-notification', {
                    detail: {
                        type: 'success',
                        title: 'Synthesis Complete',
                        message: snippet,
                        source: 'ai-generation'
                    }
                }));
            }

        } catch (err: any) {
            const errorMessage = normalizeUserFacingError(err?.message || 'Synthesis failure');
            updateTask(taskId, { 
                status: 'error', 
                progress: 0, 
                error: errorMessage 
            });
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('aimana-notification', {
                    detail: {
                        type: 'error',
                        title: 'Synthesis Failed',
                        message: errorMessage,
                        source: 'ai-generation'
                    }
                }));
            }
        }
    };

    return { generate, tasks, updateTask, removeTask, isGenerating, stage, result, error, reset };
};
