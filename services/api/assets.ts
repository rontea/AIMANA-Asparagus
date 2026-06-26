
import { v4 as uuidv4 } from 'uuid';
import { Project, ProjectCollection, ProjectStorageType, Item, Revision, ItemWithCurrentRevision, ReferenceUsage, PromptDuplicateScanResult, PromptDuplicateMergeResult } from '../../types';
import { API_BASE, handleResponse, getHeaders, getAuthHeaders } from './utils';
import { drive as driveApi } from './drive';

export const projects = {
    list: async (): Promise<Project[]> => {
        const all = await handleResponse(await fetch(`${API_BASE}/projects`, { headers: getHeaders() }));
        return all.filter((p: Project) => !p.isArchived);
    },
    listArchived: async (): Promise<Project[]> => {
        const all = await handleResponse(await fetch(`${API_BASE}/projects`, { headers: getHeaders() }));
        return all.filter((p: Project) => p.isArchived);
    },
    create: async (data: any): Promise<Project> => {
        const created = await handleResponse(await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data)
        }));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aimana-projects-updated', {
                detail: { project: created, reason: 'project-created' }
            }));
        }
        return created;
    },
    get: async (id: string): Promise<Project | null> => {
        try { return await handleResponse(await fetch(`${API_BASE}/projects/${id}`, { headers: getHeaders() })); } catch { return null; }
    },
    getAssetIngestion: async (): Promise<Project | null> => {
        try { return await handleResponse(await fetch(`${API_BASE}/projects/asset-ingestion`, { headers: getHeaders() })); } catch { return null; }
    },
    getArchive: async (): Promise<Project | null> => {
        try { return await handleResponse(await fetch(`${API_BASE}/projects/archive`, { headers: getHeaders() })); } catch { return null; }
    },
    update: async (id: string, data: Partial<Project>): Promise<Project> => {
        await handleResponse(await fetch(`${API_BASE}/projects/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(data)
        }));
        const refreshed = await projects.get(id);
        if (!refreshed) {
            throw new Error('Failed to reload updated project.');
        }
        return refreshed;
    },
    share: async (id: string, email: string): Promise<void> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${id}/share`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ email })
        }));
    },
    archive: async (id: string): Promise<void> => {
        await projects.update(id, { isArchived: true });
    },
    restore: async (id: string): Promise<void> => {
        await projects.update(id, { isArchived: false });
    },
    delete: async (id: string, deleteVerificationToken?: string): Promise<void> => {
        try {
            const project = await projects.get(id);
            if (project?.storageType === ProjectStorageType.GOOGLE_DRIVE && project.driveFolderId) {
                await driveApi.deleteFile(project.driveFolderId);
            }
        } catch (e) { console.warn(e); }
        await fetch(`${API_BASE}/projects/${id}`, { 
            method: 'DELETE', 
            headers: getHeaders({
                ...(deleteVerificationToken ? { 'X-Delete-Verification': deleteVerificationToken } : {})
            })
        }).then(handleResponse);
    }
};

export const items = {
    listAll: async (includeArchived: boolean = false): Promise<ItemWithCurrentRevision[]> => {
        const allItems = await handleResponse(await fetch(`${API_BASE}/items`, { headers: getHeaders() }));
        return includeArchived ? allItems : allItems.filter((i: Item) => !i.isArchived);
    },
    list: async (projectId: string, includeArchived: boolean = false): Promise<ItemWithCurrentRevision[]> => {
        const allItems = await handleResponse(await fetch(`${API_BASE}/projects/${projectId}/items`, { headers: getHeaders() }));
        return includeArchived ? allItems : allItems.filter((i: Item) => !i.isArchived);
    },
    listArchived: async (): Promise<ItemWithCurrentRevision[]> => {
        return handleResponse(await fetch(`${API_BASE}/items/archived`, { headers: getHeaders() }));
    },
    get: async (itemId: string): Promise<ItemWithCurrentRevision | null> => {
        try {
            return await handleResponse(await fetch(`${API_BASE}/items/${itemId}`, { headers: getHeaders() }));
        } catch { return null; }
    },
    resolve: async (itemIds: string[]): Promise<ItemWithCurrentRevision[]> => {
        const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
        if (ids.length === 0) return [];
        try {
            return await handleResponse(await fetch(`${API_BASE}/items/resolve`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ ids })
            }));
        } catch {
            return [];
        }
    },
    referencedBy: async (itemId: string): Promise<ReferenceUsage[]> => {
        try {
            return await handleResponse(await fetch(`${API_BASE}/items/${itemId}/referenced-by`, { headers: getHeaders() }));
        } catch {
            return [];
        }
    },
    referencedTargetIds: async (projectId: string): Promise<string[]> => {
        try {
            return await handleResponse(await fetch(`${API_BASE}/projects/${projectId}/referenced-target-ids`, { headers: getHeaders() }));
        } catch {
            return [];
        }
    },
    referencedTargetRelations: async (projectId: string): Promise<Array<{ itemId: string; relationKinds: string[] }>> => {
        try {
            return await handleResponse(await fetch(`${API_BASE}/projects/${projectId}/referenced-target-relations`, { headers: getHeaders() }));
        } catch {
            return [];
        }
    },
    getPromptDuplicates: async (projectId: string): Promise<PromptDuplicateScanResult> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/prompt-duplicates`, {
            headers: getHeaders()
        }));
    },
    mergePromptDuplicates: async (projectId: string): Promise<PromptDuplicateMergeResult> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/prompt-duplicates/merge`, {
            method: 'POST',
            headers: getHeaders()
        }));
    },
    mergeDuplicateReferences: async (projectId: string): Promise<{ success: boolean; mergedItems: number; duplicateGroups: number; relinkedRevisions: number; archivedDuplicateIds?: string[] }> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/reference-assets/merge-duplicates`, {
            method: 'POST',
            headers: getHeaders()
        }));
    },
    mergeSelectedMedia: async (
        projectId: string,
        payload: { mainItemId: string; itemIds: string[] }
    ): Promise<{ success: boolean; mainItemId: string; mergedItems: number; insertedRevisions: number; relinkedRevisions: number; archivedItemIds?: string[] }> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/items/merge-selected`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload)
        }));
    },
    create: (projectId: string, file: File, onProgress: (percent: number) => void, metadata?: any): Promise<ItemWithCurrentRevision> => {
        return new Promise((resolve, reject) => {
            const run = async () => {
                try {
                    onProgress(10);
                    const project = await projects.get(projectId);
                    let driveData: any = null;
                    let fileUrl: string | undefined = undefined;
                    
                    const itemId = metadata?.id || uuidv4(); 
                    const parentItemId = metadata?.parentItemId;
                    const isReference = metadata?.engine === 'reference' || metadata?.isReference === true || (metadata?.aiParameters && metadata.aiParameters.includes('isReference'));

                    if (project?.storageType === ProjectStorageType.GOOGLE_DRIVE) {
                        driveData = await driveApi.uploadFile(file, project.driveFolderId);
                    } else {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch(`${API_BASE}/projects/${projectId}/upload`, { 
                            method: 'POST', 
                            headers: getAuthHeaders({ 
                                'X-Asset-Type': isReference ? 'reference' : 'standard',
                                'X-Item-Id': itemId, // Using Item ID as the filename identifier
                                'X-Parent-Item-Id': parentItemId || ''
                            }),
                            body: formData 
                        });
                        const uploaded = await handleResponse(res);
                        fileUrl = uploaded.fileUrl;
                    }
                    onProgress(50);
                    const revId = uuidv4();
                    
                    const revision: Revision = {
                        id: revId, 
                        itemId: itemId, 
                        versionNumber: 1, 
                        title: metadata?.title || file.name, 
                        label: metadata?.label || '', 
                        tags: metadata?.tags || '',
                        prompt: metadata?.prompt || '', 
                        engine: metadata?.engine || project?.defaultEngine || 'default-placeholder',
                        note: metadata?.note || '', 
                        aiParameters: metadata?.aiParameters || '', 
                        secondaryFiles: metadata?.secondaryFiles || [], 
                        storage: driveData ? 'google-drive' : 'local', 
                        fileUrl, 
                        remoteId: driveData?.id,
                        webViewLink: driveData?.webViewLink, 
                        thumbnailLink: driveData?.thumbnailLink, 
                        mimeType: file.type, 
                        size: file.size,
                        originalFilename: file.name, 
                        createdAt: Date.now()
                    };
                    
                    const item: Item = { 
                      id: itemId, 
                      projectId, 
                      collectionId: metadata?.collectionId || null,
                      currentRevisionId: revId, 
                      isArchived: false, 
                      isPinned: false, 
                      createdAt: Date.now(), 
                      updatedAt: Date.now() 
                    };
                    
                    await fetch(`${API_BASE}/items`, { 
                        method: 'POST', 
                        headers: getHeaders(), 
                        body: JSON.stringify({ item, revision }) 
                    }).then(handleResponse);
                    onProgress(100);
                    resolve({ ...item, currentRevision: revision });
                } catch (err) { reject(err); }
            };
            run();
        });
    },
    createBlank: async (projectId: string): Promise<ItemWithCurrentRevision> => {
        const project = await projects.get(projectId);
        const itemId = uuidv4();
        const revId = uuidv4();
        const revision: Revision = {
            id: revId,
            itemId: itemId,
            versionNumber: 1,
            title: 'New Blank Artifact',
            label: '',
            tags: '',
            prompt: '',
            engine: project?.defaultEngine || 'default-placeholder',
            note: '',
            aiParameters: '',
            secondaryFiles: [],
            storage: 'local',
            mimeType: 'application/x-empty',
            size: 0,
            originalFilename: 'pending-upload',
            createdAt: Date.now()
        };
        const item: Item = { 
            id: itemId, 
            projectId, 
            currentRevisionId: revId, 
            isArchived: false, 
            isPinned: false, 
            createdAt: Date.now(), 
            updatedAt: Date.now() 
        };
        await fetch(`${API_BASE}/items`, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify({ item, revision }) 
        }).then(handleResponse);
        return { ...item, currentRevision: revision };
    },
    createFromPrompts: async (
        projectId: string,
        engine: string,
        prompts: {
            title: string,
            prompt: string,
            label?: string,
            tags?: string,
            note?: string,
            raw?: string,
            source?: string,
            previewImageUrl?: string,
            previewMimeType?: string,
            thumbnailBlur?: boolean,
            ingestionState?: string,
            queueLetter?: string,
            queueNumber?: string
        }[],
        skipDuplicates: boolean = true,
        collectionId?: string | null,
        duplicateStrategy: 'skip' | 'suffix' = 'skip'
    ): Promise<{ success: boolean; created: number; skipped: number; inputDuplicates?: number; renamed?: number }> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/import-prompts`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ engine, prompts, skipDuplicates, collectionId: collectionId || null, duplicateStrategy })
        }));
    },
    update: async (item: Partial<Item> & { id: string }): Promise<void> => {
        await handleResponse(await fetch(`${API_BASE}/items/${item.id}`, { 
            method: 'PUT', 
            headers: getHeaders(), 
            body: JSON.stringify(item) 
        }));
    },
    restore: async (itemId: string, revisionId: string): Promise<void> => {
        await items.update({ id: itemId, currentRevisionId: revisionId });
    },
    delete: async (itemId: string, deleteVerificationToken?: string): Promise<void> => {
        try {
            const history = await revisions.list(itemId);
            await Promise.all(history.map(async (rev) => {
                if (rev.storage === 'google-drive' && rev.remoteId) {
                    try { await driveApi.deleteFile(rev.remoteId); } catch(e) {}
                }
            }));
        } catch (e) {}
        await fetch(`${API_BASE}/items/${itemId}`, { 
            method: 'DELETE',
            headers: getHeaders({
                ...(deleteVerificationToken ? { 'X-Delete-Verification': deleteVerificationToken } : {})
            })
        }).then(handleResponse);
    }
};

export const collections = {
    list: async (projectId: string): Promise<ProjectCollection[]> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/collections`, { headers: getHeaders() }));
    },
    listArchived: async (): Promise<ProjectCollection[]> => {
        return handleResponse(await fetch(`${API_BASE}/collections/archived`, { headers: getHeaders() }));
    },
    create: async (projectId: string, data: { name: string, description?: string }): Promise<ProjectCollection> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/collections`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data)
        }));
    },
    update: async (
        projectId: string,
        collectionId: string,
        data: Partial<Pick<ProjectCollection, 'name' | 'description' | 'thumbnailItemId' | 'projectId' | 'isArchived' | 'isPinned'>>
    ): Promise<ProjectCollection> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/collections/${collectionId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(data)
        }));
    },
    delete: async (collectionId: string, deleteVerificationToken?: string): Promise<void> => {
        await fetch(`${API_BASE}/collections/${collectionId}`, {
            method: 'DELETE',
            headers: getHeaders({
                ...(deleteVerificationToken ? { 'X-Delete-Verification': deleteVerificationToken } : {})
            })
        }).then(handleResponse);
    }
};

export const revisions = {
    list: async (itemId: string): Promise<Revision[]> => {
        return handleResponse(await fetch(`${API_BASE}/items/${itemId}/revisions`, { headers: getHeaders() }));
    },
    get: async (id: string): Promise<Revision> => {
        return handleResponse(await fetch(`${API_BASE}/revisions/${id}`, { headers: getHeaders() }));
    },
    listGlobalArchived: async (): Promise<Revision[]> => {
        return handleResponse(await fetch(`${API_BASE}/revisions/archived`, { headers: getHeaders() }));
    },
    listProjectArchived: async (projectId: string): Promise<Revision[]> => {
        return handleResponse(await fetch(`${API_BASE}/projects/${projectId}/revisions/archived`, { headers: getHeaders() }));
    },
    add: (itemId: string, file: File, metadata: any, onProgress?: any): Promise<Revision> => {
        return new Promise((resolve, reject) => {
            const run = async () => {
                try {
                    if (onProgress) onProgress(20);
                    const item = await items.get(itemId);
                    if (!item) throw new Error("Item context not found");
                    const project = await projects.get(item.projectId);
                    const currentRev = item.currentRevision;
                    const history = await revisions.list(itemId);
                    const maxVer = history.length > 0 ? Math.max(...history.map(r => r.versionNumber)) : 0;
                    
                    const isReference = metadata?.engine === 'reference' || metadata?.isReference === true;
                    const parentItemId = metadata?.parentItemId;

                    const newRevId = uuidv4(); // Unique ID for this specific revision file
                    let driveData: any = null;
                    let fileUrl: string | undefined = undefined;
                    
                    if (project?.storageType === ProjectStorageType.GOOGLE_DRIVE) {
                        driveData = await driveApi.uploadFile(file, project.driveFolderId);
                    } else {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch(`${API_BASE}/projects/${project?.id}/upload`, { 
                            method: 'POST', 
                            headers: getAuthHeaders({ 
                                'X-Asset-Type': isReference ? 'reference' : 'standard',
                                'X-Item-Id': newRevId, // Use Revision ID to ensure unique filenames for history
                                'X-Parent-Item-Id': parentItemId || ''
                            }),
                            body: formData 
                        });
                        const uploaded = await handleResponse(res);
                        fileUrl = uploaded.fileUrl;
                    }
                    
                    const revision: Revision = {
                        id: newRevId, 
                        itemId, 
                        versionNumber: maxVer + 1, 
                        title: metadata?.title ?? currentRev?.title ?? file.name,
                        label: metadata?.label ?? currentRev?.label ?? '',
                        tags: metadata?.tags ?? currentRev?.tags ?? '',
                        prompt: metadata?.prompt ?? currentRev?.prompt ?? '', 
                        engine: metadata?.engine ?? currentRev?.engine ?? project?.defaultEngine ?? 'default-placeholder',
                        note: metadata?.note ?? currentRev?.note ?? '', 
                        aiParameters: metadata?.aiParameters ?? currentRev?.aiParameters ?? '',
                        secondaryFiles: metadata?.secondaryFiles ?? currentRev?.secondaryFiles ?? [], 
                        storage: driveData ? 'google-drive' : 'local', 
                        fileUrl, 
                        remoteId: driveData?.id,
                        webViewLink: driveData?.webViewLink, 
                        thumbnailLink: driveData?.thumbnailLink,
                        mimeType: file.type, 
                        size: file.size, 
                        originalFilename: file.name, 
                        createdAt: Date.now()
                    };
                    
                    await fetch(`${API_BASE}/revisions`, { 
                        method: 'POST', 
                        headers: getHeaders(), 
                        body: JSON.stringify({ revision, updateItem: { itemId, revId: newRevId } }) 
                    }).then(handleResponse);
                    if (onProgress) onProgress(100);
                    resolve(revision);
                } catch (e) { reject(e); }
            };
            run();
        });
    },
    addMetadataRevision: async (
        itemId: string,
        metadata: Partial<Revision>
    ): Promise<Revision> => {
        const item = await items.get(itemId);
        if (!item?.currentRevision) throw new Error('Item revision context not found');
        const currentRev = item.currentRevision;
        const history = await revisions.list(itemId);
        const maxVer = history.length > 0 ? Math.max(...history.map(r => r.versionNumber || 0)) : 0;
        const newRevId = uuidv4();
        const revision: Revision = {
            ...currentRev,
            ...metadata,
            id: newRevId,
            itemId,
            versionNumber: maxVer + 1,
            storage: currentRev.storage,
            fileUrl: metadata.fileUrl ?? currentRev.fileUrl,
            remoteId: metadata.remoteId ?? currentRev.remoteId,
            webViewLink: metadata.webViewLink ?? currentRev.webViewLink,
            webContentLink: metadata.webContentLink ?? currentRev.webContentLink,
            thumbnailLink: metadata.thumbnailLink ?? currentRev.thumbnailLink,
            mimeType: metadata.mimeType ?? currentRev.mimeType,
            size: metadata.size ?? currentRev.size,
            originalFilename: metadata.originalFilename ?? currentRev.originalFilename,
            createdAt: Date.now(),
            isArchived: false
        };

        return handleResponse(await fetch(`${API_BASE}/revisions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ revision, updateItem: { itemId, revId: newRevId } })
        }));
    },
    update: async (revision: Partial<Revision> & { id: string }): Promise<Revision> => {
        return handleResponse(await fetch(`${API_BASE}/revisions/${revision.id}`, { 
            method: 'PUT', 
            headers: getHeaders(), 
            body: JSON.stringify(revision) 
        }));
    },
    replaceFile: (revisionId: string, file: File): Promise<void> => {
        return new Promise((resolve, reject) => {
            const run = async () => {
                try {
                    const rev = await handleResponse(await fetch(`${API_BASE}/revisions/${revisionId}`, { headers: getHeaders() }));
                    const item = await items.get(rev.itemId);
                    const project = item ? await projects.get(item.projectId) : null;
                    if (rev.storage === 'google-drive' && rev.remoteId) try { await driveApi.deleteFile(rev.remoteId); } catch(e) {}
                    
                    const isReference = rev.engine === 'reference';
                    let parentItemId = '';
                    try {
                        const params = JSON.parse(rev.aiParameters || '{}');
                        const adv = params.advanced_params || params;
                        parentItemId = adv.parentItemId || '';
                    } catch(e) {}

                    const buildPreviewAiParameters = (nextUrl: string, nextMimeType: string) => {
                        let parsed: Record<string, any> = {};
                        try {
                            parsed = rev.aiParameters ? JSON.parse(rev.aiParameters) : {};
                        } catch {
                            parsed = {};
                        }
                        const existingAdvanced = parsed.advanced_params && typeof parsed.advanced_params === 'object'
                            ? parsed.advanced_params
                            : {};
                        const hasPromptPreviewMetadata = Boolean(
                            existingAdvanced.previewImageUrl
                            || existingAdvanced.parentItemThumbnail
                            || existingAdvanced.previewMimeType
                        );
                        if (!hasPromptPreviewMetadata) return rev.aiParameters;

                        return JSON.stringify({
                            ...parsed,
                            advanced_params: {
                                ...existingAdvanced,
                                previewImageUrl: nextUrl,
                                parentItemThumbnail: nextUrl,
                                previewMimeType: nextMimeType
                            }
                        }, null, 2);
                    };

                    let updatedRev = { ...rev };
                    if (rev.storage === 'google-drive') {
                        const driveData = await driveApi.uploadFile(file, project?.driveFolderId); 
                        const nextUrl = driveData.webContentLink || driveData.webViewLink || driveData.thumbnailLink || rev.fileUrl || '';
                        const nextMimeType = file.type || rev.mimeType || 'application/octet-stream';
                        updatedRev = {
                            ...rev,
                            remoteId: driveData.id,
                            webViewLink: driveData.webViewLink,
                            thumbnailLink: driveData.thumbnailLink || nextUrl,
                            mimeType: nextMimeType,
                            size: file.size,
                            originalFilename: file.name || rev.originalFilename,
                            aiParameters: buildPreviewAiParameters(nextUrl, nextMimeType)
                        };
                    } else {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch(`${API_BASE}/projects/${project?.id}/upload`, { 
                            method: 'POST', 
                            headers: getAuthHeaders({ 
                                'X-Asset-Type': isReference ? 'reference' : 'standard',
                                'X-Item-Id': rev.id, // Replace existing revision file
                                'X-Parent-Item-Id': parentItemId
                            }),
                            body: formData 
                        });
                        const uploaded = await handleResponse(res);
                        const nextUrl = uploaded.fileUrl || '';
                        const nextMimeType = file.type || rev.mimeType || 'application/octet-stream';
                        updatedRev = {
                            ...rev,
                            fileUrl: nextUrl,
                            thumbnailLink: nextUrl,
                            mimeType: nextMimeType,
                            size: file.size,
                            originalFilename: file.name || rev.originalFilename,
                            storage: 'local',
                            aiParameters: buildPreviewAiParameters(nextUrl, nextMimeType)
                        };
                    }
                    await revisions.update(updatedRev);
                    resolve();
                } catch (e) { reject(e); }
            };
            run();
        });
    },
    archive: async (revisionId: string): Promise<void> => {
        const rev = await handleResponse(await fetch(`${API_BASE}/revisions/${revisionId}`, { headers: getHeaders() }));
        if (rev) await revisions.update({ id: rev.id, isArchived: true });
    },
    restore: async (revisionId: string): Promise<void> => {
        const rev = await handleResponse(await fetch(`${API_BASE}/revisions/${revisionId}`, { headers: getHeaders() }));
        if (rev) await revisions.update({ id: rev.id, isArchived: false });
    },
    delete: async (id: string, deleteVerificationToken?: string) => {
        try {
            const rev = await handleResponse(await fetch(`${API_BASE}/revisions/${id}`, { headers: getHeaders() }));
            if (rev?.storage === 'google-drive' && rev.remoteId) await driveApi.deleteFile(rev.remoteId);
        } catch (e) {}
        await fetch(`${API_BASE}/revisions/${id}`, { 
            method: 'DELETE', 
            headers: getHeaders({
                ...(deleteVerificationToken ? { 'X-Delete-Verification': deleteVerificationToken } : {})
            })
        }).then(handleResponse);
    }
};
