import { GeneratedImageResult } from './geminiService';
import { readApiErrorMessage } from '../utils/userFacingErrors';

export type PollinationsModel = 
    'pollinations-flux' | 
    'pollinations-turbo' | 
    'pollinations-veo' | 
    'pollinations-seedance' |
    'pollinations-seedance-pro' |
    'pollinations-wan' |
    'pollinations-ltx-2' |
    'pollinations-grok-video' |
    'pollinations-gpt-image-mini' |
    'pollinations-gpt-image-1-5' |
    'pollinations-z-image' |
    string;

const POLLINATIONS_VIDEO_MODELS = new Set([
    'veo',
    'seedance',
    'seedance-pro',
    'wan',
    'ltx-2',
    'grok-video'
]);

export interface GeneratedMediaResult extends GeneratedImageResult {
    assetType: 'image' | 'video';
    seedUsed?: string;
    pollenUsed?: string;
    referenceItemId?: string;
    referenceHash?: string;
}

export interface EnsuredReferenceAsset {
    referenceItemId: string;
    referenceHash: string;
    fileUrl: string;
    mimeType?: string;
    size?: number;
    deduped?: boolean;
}

export const ensureReferenceAsset = async (inputImage?: string | null): Promise<EnsuredReferenceAsset | null> => {
    if (!inputImage || !inputImage.startsWith('data:')) return null;
    const res = await fetch('/api/proxy/reference-assets/ensure', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ dataUri: inputImage })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Reference asset persistence failed' }));
        throw new Error(err.error || 'Reference asset persistence failed');
    }
    return res.json();
};

export const getResolvedDimensions = (aspectRatio: string, customW?: number, customH?: number) => {
    if (customW && customH) return { width: customW, height: customH };
    switch (aspectRatio) {
        case "3:4": return { width: 768, height: 1024 };
        case "4:3": return { width: 1024, height: 768 };
        case "9:16": return { width: 720, height: 1280 };
        case "16:9": return { width: 1280, height: 720 };
        case "1:1":
        default: return { width: 1024, height: 1024 };
    }
};

export const generateMediaWithPollinations = async (
    prompt: string,
    aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1",
    model: PollinationsModel = 'pollinations-flux',
    customWidth?: number,
    customHeight?: number,
    seed?: number,
    negativePrompt?: string,
    options?: {
        enhance?: boolean;
        nologo?: boolean;
        safe?: boolean;
        private?: boolean;
        nofeed?: boolean;
        transparent?: boolean;
        quality?: string;
        guidance_scale?: number;
        duration?: number;
        audio?: boolean;
        image?: string | null;
        signal?: AbortSignal; // Added support for AbortSignal
    }
): Promise<GeneratedMediaResult> => {
    
    const { width, height } = getResolvedDimensions(aspectRatio, customWidth, customHeight);
    const normalizedModel = String(model || '').toLowerCase().replace(/^pollinations-/, '');
    const isVideo = POLLINATIONS_VIDEO_MODELS.has(normalizedModel);
    const ensuredReference = await ensureReferenceAsset(options?.image || null);
    const resolvedInputImage = ensuredReference?.fileUrl || options?.image || null;

    try {
        const response = await fetch('/api/proxy/pollinations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                prompt, 
                width, 
                height, 
                model, 
                seed: seed !== undefined ? seed : -1,
                negative_prompt: negativePrompt,
                enhance: options?.enhance,
                nologo: options?.nologo,
                safe: options?.safe,
                private: options?.private,
                nofeed: options?.nofeed,
                transparent: options?.transparent,
                quality: options?.quality,
                guidance_scale: options?.guidance_scale,
                duration: options?.duration,
                audio: options?.audio,
                image: resolvedInputImage,
                aspectRatio,
                video: isVideo
            }),
            signal: options?.signal // Pass signal to fetch
        });

        if (!response.ok) {
            throw new Error(await readApiErrorMessage(response, 'Neural Pipeline Failure'));
        }

        const blob = await response.blob();
        const mimeType = response.headers.get('content-type') || (isVideo ? 'video/mp4' : 'image/png');
        const seedUsed = response.headers.get('x-generated-seed') || undefined;
        const pollenUsed = response.headers.get('x-pollen-used') || undefined;
        const referenceItemId = response.headers.get('x-reference-item-id') || ensuredReference?.referenceItemId || undefined;
        const referenceHash = response.headers.get('x-reference-hash') || ensuredReference?.referenceHash || undefined;
        
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (typeof result === 'string') resolve(result.split(',')[1]);
                else reject(new Error("Buffer encoding failure"));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        return {
            base64,
            mimeType,
            text: `Generated via Pollinations.AI (${model.toUpperCase()})`,
            assetType: isVideo ? 'video' : 'image',
            seedUsed,
            pollenUsed,
            referenceItemId,
            referenceHash
        };
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.log("[POLLINATIONS_SERVICE] Request aborted by user.");
        } else {
            console.error("[POLLINATIONS_SERVICE] Exception:", error);
        }
        throw error;
    }
};
