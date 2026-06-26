import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "./db";
import {
  DEFAULT_GOOGLE_IMAGE_MODEL,
  DEFAULT_GOOGLE_TEXT_MODEL,
  DEFAULT_GOOGLE_TTS_MODEL,
  supportsGoogleSearchGrounding
} from "../utils/googleModelIds";
import { normalizeGoogleUsage, type GoogleUsageSnapshot } from "../utils/googleCredits";

export interface GeneratedImageResult {
  base64: string;
  mimeType: string;
  text?: string;
  audioBuffer?: AudioBuffer; // For TTS results
  googleUsage?: GoogleUsageSnapshot | null;
}

export type GeminiImageModel = 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview';
export interface GeminiTtsOptions {
  model?: string;
  voiceName?: string;
  dynamicParams?: Record<string, any>;
}

interface GeminiInlineImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

const getTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const dataUriToInlineImagePart = (dataUri: string): GeminiInlineImagePart | null => {
  const matches = String(dataUri || '').match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
  if (!matches) return null;
  return {
    inlineData: {
      mimeType: matches[1],
      data: matches[2]
    }
  };
};

const imageUrlToInlineImagePart = async (imageUrl?: string | null): Promise<GeminiInlineImagePart | null> => {
  const source = String(imageUrl || '').trim();
  if (!source) return null;

  const directDataUri = dataUriToInlineImagePart(source);
  if (directDataUri) return directDataUri;

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Reference image fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = String(blob.type || '').trim();
  if (!mimeType.startsWith('image/')) {
    throw new Error('Reference image is not a supported image asset.');
  }

  const base64Data = await blobToBase64(blob);
  return {
    inlineData: {
      mimeType,
      data: base64Data
    }
  };
};

const buildGeminiTtsPrompt = (transcript: string, dynamicParams: Record<string, any> = {}): string => {
  const sections: string[] = [];
  const multiSpeakerEnabled = Boolean(dynamicParams.multiSpeakerEnabled);
  const audioProfile = getTrimmedString(dynamicParams.audioProfile);
  const sceneDescription = getTrimmedString(dynamicParams.sceneDescription);
  const directorNotes = getTrimmedString(dynamicParams.directorNotes);
  const tone = getTrimmedString(dynamicParams.tone);
  const pace = getTrimmedString(dynamicParams.pace);
  const accent = getTrimmedString(dynamicParams.accent);
  const speakerOneName = getTrimmedString(dynamicParams.speakerOneName) || 'Speaker A';
  const speakerTwoName = getTrimmedString(dynamicParams.speakerTwoName) || 'Speaker B';

  if (audioProfile) sections.push(`# AUDIO PROFILE\n${audioProfile}`);
  if (sceneDescription) sections.push(`# SCENE\n${sceneDescription}`);

  const directionLines = [
    tone ? `Tone: ${tone}` : '',
    pace ? `Pace: ${pace}` : '',
    accent ? `Accent: ${accent}` : '',
    directorNotes
  ].filter(Boolean);

  if (directionLines.length > 0) {
    sections.push(`# DIRECTOR'S NOTES\n${directionLines.join('\n')}`);
  }

  if (multiSpeakerEnabled) {
    sections.push(
      `# SPEAKERS\n` +
      `${speakerOneName}: Keep this exact speaker label in the transcript.\n` +
      `${speakerTwoName}: Keep this exact speaker label in the transcript.`
    );
  }

  sections.push(`# TRANSCRIPT\n${transcript.trim()}`);
  return sections.join('\n\n');
};

// --- Audio Utilities ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function pcmToWav(data: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const wavBuffer = new ArrayBuffer(44 + data.length);
  const view = new DataView(wavBuffer);
  const bytes = new Uint8Array(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, data.length, true);
  bytes.set(data, 44);

  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateSpeechWithGemini = async (
  text: string,
  options: GeminiTtsOptions = {}
): Promise<GeneratedImageResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const dynamicParams = options.dynamicParams || {};
  const multiSpeakerEnabled = Boolean(dynamicParams.multiSpeakerEnabled);
  const primaryVoice = getTrimmedString(dynamicParams.voiceName) || getTrimmedString(options.voiceName) || 'Kore';
  const speakerOneName = getTrimmedString(dynamicParams.speakerOneName) || 'Speaker A';
  const speakerOneVoice = getTrimmedString(dynamicParams.speakerOneVoice) || primaryVoice;
  const speakerTwoName = getTrimmedString(dynamicParams.speakerTwoName) || 'Speaker B';
  const speakerTwoVoice = getTrimmedString(dynamicParams.speakerTwoVoice) || 'Puck';
  const languageCode = getTrimmedString(dynamicParams.languageCode);
  const prompt = buildGeminiTtsPrompt(text, dynamicParams);
  
  try {
    const speechConfig: Record<string, any> = multiSpeakerEnabled
      ? {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: speakerOneName,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: speakerOneVoice }
                }
              },
              {
                speaker: speakerTwoName,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: speakerTwoVoice }
                }
              }
            ]
          }
        }
      : {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: primaryVoice }
          }
        };

    if (languageCode) {
      speechConfig.languageCode = languageCode;
    }

    const response = await ai.models.generateContent({
      model: options.model || DEFAULT_GOOGLE_TTS_MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig,
      },
    });

    const candidate = response.candidates?.[0];
    const firstPart = candidate?.content?.parts?.[0];
    const base64Audio = firstPart?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio payload returned.");
    const pcmBytes = decode(base64Audio);
    const wavBytes = pcmToWav(pcmBytes, 24000, 1);
    const wavBase64 = encodeBase64(wavBytes);

    // Prepare audio context for decoding
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBuffer = await decodeAudioData(pcmBytes, audioContext, 24000, 1);

    return {
      base64: wavBase64,
      mimeType: 'audio/wav',
      audioBuffer,
      googleUsage: normalizeGoogleUsage(response.usageMetadata),
      text: multiSpeakerEnabled
        ? `Synthesized speech (${speakerOneName}/${speakerTwoName})`
        : `Synthesized speech (${primaryVoice})`
    };
  } catch (error) {
    console.error("[TTS_ENGINE] Synthesis failed:", error);
    throw error;
  }
};

export const generateImageWithGemini = async (
  prompt: string, 
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" = "1:1",
  model: GeminiImageModel = DEFAULT_GOOGLE_IMAGE_MODEL,
  useSearch: boolean = true,
  seed?: number,
  inputImage?: string | null
): Promise<GeneratedImageResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const config: any = {
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    };

    if (seed !== undefined) {
      config.seed = seed;
    }

    if (supportsGoogleSearchGrounding(model) && useSearch) {
      config.tools = [{ googleSearch: {} }];
      config.imageConfig.imageSize = "1K";
    }

    const referenceImagePart = await imageUrlToInlineImagePart(inputImage);
    const contentParts = referenceImagePart
      ? [{ text: prompt }, referenceImagePart]
      : [{ text: prompt }];

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: contentParts,
      },
      config: config,
    });

    let base64 = "";
    let textOutput = "";

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          base64 = part.inlineData.data || "";
        } else if (part.text) {
          textOutput += part.text;
        }
      }
    }

    if (!base64) throw new Error("No image was returned.");

    return {
      base64,
      mimeType: 'image/png',
      googleUsage: normalizeGoogleUsage(response.usageMetadata),
      text: textOutput
    };
  } catch (error: any) {
    throw error;
  }
};

export const analyzeAssetWithGemini = async (file: Blob, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const base64Data = await blobToBase64(file);
    let prompt = "Describe this file in detail.";
    let model = DEFAULT_GOOGLE_TEXT_MODEL;

    if (mimeType.startsWith('image/')) {
        prompt = "Analyze this image. Provide a short, punchy title, followed by a brief description and tags.";
    } else if (mimeType.startsWith('audio/')) {
        prompt = "Listen to this audio. Summarize the speech or describe the sound.";
        model = "gemini-2.5-flash-native-audio-preview-12-2025";
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: prompt }
        ]
      }
    });

    return response.text || "No description generated.";
  } catch (error: any) {
    console.error("Gemini analysis failed:", error);
    return "AI analysis failed.";
  }
};
