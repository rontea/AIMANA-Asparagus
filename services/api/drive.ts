import { googleDriveService } from '../googleDrive';

export const drive = {
    isReal: () => true,
    isSessionActive: () => googleDriveService.isSessionActive(),
    authorize: async () => {
        if (!googleDriveService.isConfigured()) throw new Error("Drive API not configured.");
        return await googleDriveService.authorize();
    },
    listFolders: async (): Promise<{id: string, name: string}[]> => {
        return await googleDriveService.listFolders();
    },
    createFolder: async (name: string): Promise<{id: string, name: string}> => {
        return await googleDriveService.createFolder(name);
    },
    uploadFile: async (file: File, folderId?: string): Promise<{id: string, webViewLink: string, webContentLink: string, thumbnailLink?: string}> => {
        return await googleDriveService.uploadFile(file, folderId);
    },
    deleteFile: async (fileId: string): Promise<void> => {
        return await googleDriveService.deleteFile(fileId);
    }
};