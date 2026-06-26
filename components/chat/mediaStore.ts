import { ChatAudioInput, ChatImageInput } from './types';

const DB_NAME = 'aimana_chat_media_v1';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';
const AUDIO_STORE = 'audios';

interface StoredImage {
    id: string;
    url: string;
    name?: string;
    mimeType?: string;
    size?: number;
    updatedAt: number;
}

interface StoredAudio {
    id: string;
    data: string;
    format: string;
    name?: string;
    mimeType?: string;
    size?: number;
    updatedAt: number;
}

const openDb = () => {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB unavailable'));
    }
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
                db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const runStoreRequest = async <T>(
    storeName: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest
): Promise<T | undefined> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = action(store);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
    });
};

export const saveChatImage = async (image: ChatImageInput) => {
    if (!image?.id || !image.url) return;
    if (typeof indexedDB === 'undefined') return;
    const payload: StoredImage = {
        id: image.id,
        url: image.url,
        name: image.name,
        mimeType: image.mimeType,
        size: image.size,
        updatedAt: Date.now()
    };
    await runStoreRequest<StoredImage>(IMAGE_STORE, 'readwrite', (store) => store.put(payload));
};

export const saveChatAudio = async (audio: ChatAudioInput) => {
    if (!audio?.id || !audio.data || !audio.format) return;
    if (typeof indexedDB === 'undefined') return;
    const payload: StoredAudio = {
        id: audio.id,
        data: audio.data,
        format: audio.format,
        name: audio.name,
        mimeType: audio.mimeType,
        size: audio.size,
        updatedAt: Date.now()
    };
    await runStoreRequest<StoredAudio>(AUDIO_STORE, 'readwrite', (store) => store.put(payload));
};

export const getChatImage = async (id: string) => {
    if (!id) return undefined;
    if (typeof indexedDB === 'undefined') return undefined;
    return runStoreRequest<StoredImage>(IMAGE_STORE, 'readonly', (store) => store.get(id));
};

export const getChatAudio = async (id: string) => {
    if (!id) return undefined;
    if (typeof indexedDB === 'undefined') return undefined;
    return runStoreRequest<StoredAudio>(AUDIO_STORE, 'readonly', (store) => store.get(id));
};
