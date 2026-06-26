import { AssetType } from '../types';

// NOTE: This file previously handled IndexedDB. 
// Logic has moved to index.js (Node backend entrypoint).
// Keeping utility functions here to maintain imports in components.

export const determineAssetType = (mimeType: string): AssetType => {
  if (mimeType.startsWith('image/')) return AssetType.IMAGE;
  if (mimeType.startsWith('video/')) return AssetType.VIDEO;
  if (mimeType.startsWith('audio/')) return AssetType.AUDIO;
  return AssetType.UNKNOWN;
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
