
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { api } from '../services/api';
import { UploadItem, ItemWithCurrentRevision } from '../types';
import { ConfirmConfig } from './useModalDialogs';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const collectReferencedIds = (item: ItemWithCurrentRevision): string[] => {
    const rev = item.currentRevision;
    if (!rev) return [];

    const refs = new Set<string>();
    rev.secondaryFiles?.forEach((file) => {
        if (file?.id) refs.add(file.id);
    });

    try {
        if (rev.aiParameters) {
            const params = JSON.parse(rev.aiParameters);
            const adv = params?.advanced_params || params || {};
            const list = Array.isArray(adv.referenceItemIds) ? adv.referenceItemIds : [];
            const audioList = Array.isArray(adv.referenceAudioItemIds) ? adv.referenceAudioItemIds : [];
            const single = typeof adv.referenceItemId === 'string' ? [adv.referenceItemId] : [];
            const audioSingle = typeof adv.referenceAudioItemId === 'string' ? [adv.referenceAudioItemId] : [];
            [...list, ...audioList, ...single, ...audioSingle].forEach((id) => {
                if (typeof id === 'string' && id.trim()) refs.add(id);
            });
        }
    } catch (e) {}

    return Array.from(refs);
};

const fetchRevisionBlob = async (item: ItemWithCurrentRevision): Promise<Blob | null> => {
    const rev = item.currentRevision;
    if (!rev) return null;

    try {
        if (rev.storage === 'local') {
            if (rev.fileUrl) {
                const res = await fetch(rev.fileUrl);
                if (res.ok) return await res.blob();
            } else if (rev.blob) {
                return rev.blob;
            }
        } else if (rev.storage === 'google-drive' && rev.webContentLink) {
            const res = await fetch(rev.webContentLink);
            if (res.ok) return await res.blob();
        }
    } catch (e) {
        console.error(`Fetch failed for asset: ${rev.title}`, e);
    }

    return null;
};

export const useProjectActions = (
    projectId: string | undefined, 
    projectName: string | undefined,
    onSuccess: (msg: string) => void,
    onError: (msg: string) => void,
    refreshData: () => void,
    confirm?: (config: ConfirmConfig) => Promise<boolean>
) => {
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [isZipping, setIsZipping] = useState(false);

    const handleFileUpload = async (files: FileList, collectionId?: string | null) => {
        if (!projectId) return;
        const fileArray = Array.from(files);
        const newUploads: UploadItem[] = fileArray.map(f => ({ 
            id: uuidv4(), 
            file: f, 
            progress: 0, 
            status: 'pending' 
        }));
        setUploads(prev => [...prev, ...newUploads]);

        for (const uploadItem of newUploads) {
            if (uploadItem.file.size > MAX_FILE_SIZE) {
                setUploads(prev => prev.map(u => u.id === uploadItem.id ? { ...u, status: 'error', errorMessage: 'Exceeds 50MB' } : u));
                continue;
            }
            setUploads(prev => prev.map(u => u.id === uploadItem.id ? { ...u, status: 'uploading' } : u));
            try {
                const resultItem = await api.items.create(projectId, uploadItem.file, (percent) => {
                    setUploads(prev => prev.map(u => u.id === uploadItem.id ? { ...u, progress: percent } : u));
                }, collectionId ? { collectionId } : undefined);
                setUploads(prev => prev.map(u => u.id === uploadItem.id ? { 
                    ...u, 
                    status: 'success', 
                    progress: 100,
                    itemId: resultItem.id
                } : u));
            } catch (error: any) {
                setUploads(prev => prev.map(u => u.id === uploadItem.id ? { ...u, status: 'error', errorMessage: error.message || 'Failed' } : u));
            }
        }
        refreshData();
    };

    const handleBulkArchive = async (selectedIds: Set<string>, allItems: ItemWithCurrentRevision[], onComplete: () => void) => {
        if (selectedIds.size === 0) return;
        const requestConfirm = confirm || (async (config: ConfirmConfig) => window.confirm(config.description));
        const ok = await requestConfirm({
            title: 'Move Items To Recycle Bin',
            description: `Move ${selectedIds.size} selected items to trash?`,
            confirmLabel: 'Move To Trash',
            tone: 'danger'
        });
        if (!ok) return;
        const count = selectedIds.size;
        try {
            for (const itemId of Array.from(selectedIds)) {
                const item = allItems.find(i => i.id === itemId);
                if (item) await api.items.update({ ...item, isArchived: true, isPinned: false });
            }
            onComplete();
            refreshData();
            onSuccess(`${count} items deleted.`);
        } catch (e) { 
            onError("Bulk delete failed."); 
            refreshData();
        }
    };

    const handleBulkMove = async (selectedIds: Set<string>, targetProjectId: string, allItems: ItemWithCurrentRevision[], onComplete: () => void) => {
        if (selectedIds.size === 0 || !targetProjectId) return;
        const count = selectedIds.size;
        try {
            for (const itemId of Array.from(selectedIds)) {
                await api.items.update({ id: itemId, projectId: targetProjectId, isArchived: false });
            }
            onComplete();
            refreshData();
            onSuccess(`${count} items migrated.`);
        } catch (e) {
            onError("Bulk move failed.");
            refreshData();
        }
    };

    const handleBulkDownload = async (selectedIds: Set<string>, allItems: ItemWithCurrentRevision[], onComplete: () => void) => {
        if (selectedIds.size === 0) return;
        setIsZipping(true);
        try {
            const zip = new JSZip();
            const metadataList: any[] = [];
            const assetFolder = zip.folder("assets");
            
            // Map selected IDs to valid items
            const selectedItems = Array.from(selectedIds)
                .map(id => allItems.find(i => i.id === id))
                .filter(i => i && i.currentRevision) as ItemWithCurrentRevision[];

            if (selectedItems.length === 0) {
                throw new Error("No valid assets found to export.");
            }

            const downloadPromises = selectedItems.map(async (item) => {
                const rev = item.currentRevision!;
                
                // CRITICAL: Ensure filename is unique within ZIP to prevent overwrites
                const finalZipFileName = `${rev.id}_${rev.originalFilename.replace(/[^a-zA-Z0-9.]/g, '_')}`;

                // CAPTURE ALL ITEM INFORMATION
                metadataList.push({ 
                    id: item.id, 
                    revisionId: rev.id,
                    projectId: item.projectId,
                    title: rev.title, 
                    label: rev.label, // Added label
                    prompt: rev.prompt, 
                    engine: rev.engine, 
                    note: rev.note, 
                    aiParameters: rev.aiParameters, // Added full neural data blob
                    secondaryFiles: rev.secondaryFiles || [],
                    mimeType: rev.mimeType, 
                    size: rev.size, 
                    originalFilename: rev.originalFilename, 
                    version: rev.versionNumber,
                    createdAt: rev.createdAt, // Added timestamps
                    updatedAt: item.updatedAt,
                    fileNameInZip: finalZipFileName
                });
                
                try {
                    let fileBlob: Blob | null = null;
                    if (rev.storage === 'local') {
                        if (rev.fileUrl) {
                            const res = await fetch(rev.fileUrl);
                            if (res.ok) fileBlob = await res.blob();
                        } else if (rev.blob) {
                            fileBlob = rev.blob;
                        }
                    } else if (rev.storage === 'google-drive' && rev.webContentLink) {
                        const res = await fetch(rev.webContentLink);
                        if (res.ok) fileBlob = await res.blob();
                    }
                    
                    if (fileBlob && assetFolder) {
                        assetFolder.file(finalZipFileName, fileBlob);
                    }
                } catch (e) { 
                    console.error(`Fetch failed for asset: ${rev.title}`, e); 
                }
            });

            await Promise.all(downloadPromises);
            
            zip.file("metadata.json", JSON.stringify(metadataList, null, 2));
            
            const content = await zip.generateAsync({ type: "blob" });
            const url = window.URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${projectName?.replace(/[^a-z0-9]/gi, '_') || 'aimana'}_export_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            onComplete();
            onSuccess(`${selectedItems.length} items exported with full metadata.`);
        } catch (error: any) { 
            onError(error.message || "Download failed."); 
        } finally { 
            setIsZipping(false); 
        }
    };

    const handleProjectExport = async (allItems: ItemWithCurrentRevision[]) => {
        if (!projectId) return;
        setIsZipping(true);

        try {
            const localItems = allItems.filter((i) => !i.isArchived && !!i.currentRevision);
            if (localItems.length === 0) {
                throw new Error("No valid assets found to export.");
            }

            const byId = new Map<string, ItemWithCurrentRevision>();
            localItems.forEach((i) => byId.set(i.id, i));

            const queue: string[] = [];
            const unresolvedIds = new Set<string>();
            const externalRefIds = new Set<string>();

            localItems.forEach((item) => {
                collectReferencedIds(item).forEach((refId) => {
                    if (!byId.has(refId) && !queue.includes(refId)) queue.push(refId);
                });
            });

            while (queue.length > 0) {
                const chunk = queue.splice(0, 100);
                const fetched = await api.items.resolve(chunk);
                const foundIds = new Set<string>();

                fetched.forEach((resolved) => {
                    if (!resolved || resolved.isArchived || !resolved.currentRevision) return;
                    if (byId.has(resolved.id)) return;

                    byId.set(resolved.id, resolved);
                    externalRefIds.add(resolved.id);
                    foundIds.add(resolved.id);

                    collectReferencedIds(resolved).forEach((nestedRefId) => {
                        if (!byId.has(nestedRefId) && !queue.includes(nestedRefId)) {
                            queue.push(nestedRefId);
                        }
                    });
                });

                chunk.forEach((id) => {
                    if (!foundIds.has(id)) unresolvedIds.add(id);
                });
            }

            const itemsToExport = Array.from(byId.values());
            const zip = new JSZip();
            const assetFolder = zip.folder("assets");
            const metadataList: any[] = [];

            await Promise.all(itemsToExport.map(async (item) => {
                const rev = item.currentRevision;
                if (!rev) return;

                const safeName = (rev.originalFilename || `${rev.title || 'asset'}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
                const finalZipFileName = `${item.id}_${rev.id}_${safeName}`;
                const blob = await fetchRevisionBlob(item);

                metadataList.push({
                    id: item.id,
                    revisionId: rev.id,
                    projectId: item.projectId,
                    sourceProjectId: item.projectId,
                    sourceProjectName: item.projectId === projectId ? projectName || '' : '',
                    exportedAsReference: externalRefIds.has(item.id),
                    title: rev.title,
                    label: rev.label,
                    prompt: rev.prompt,
                    engine: rev.engine,
                    note: rev.note,
                    aiParameters: rev.aiParameters,
                    secondaryFiles: rev.secondaryFiles || [],
                    mimeType: rev.mimeType,
                    size: rev.size,
                    originalFilename: rev.originalFilename,
                    version: rev.versionNumber,
                    createdAt: rev.createdAt,
                    updatedAt: item.updatedAt,
                    fileNameInZip: finalZipFileName
                });

                if (blob && assetFolder) {
                    assetFolder.file(finalZipFileName, blob);
                }
            }));

            zip.file("metadata.json", JSON.stringify(metadataList, null, 2));
            zip.file(
                "export-manifest.json",
                JSON.stringify({
                    type: "project-export",
                    exportedAt: new Date().toISOString(),
                    sourceProjectId: projectId,
                    sourceProjectName: projectName || '',
                    itemCount: localItems.length,
                    totalExportedCount: metadataList.length,
                    externalReferenceCount: externalRefIds.size,
                    unresolvedReferenceIds: Array.from(unresolvedIds)
                }, null, 2)
            );

            const content = await zip.generateAsync({ type: "blob" });
            const url = window.URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${projectName?.replace(/[^a-z0-9]/gi, '_') || 'project'}_full_export_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            const exportedCount = metadataList.length;
            const externalCount = externalRefIds.size;
            const unresolvedCount = unresolvedIds.size;
            const warning = unresolvedCount > 0 ? ` (${unresolvedCount} inaccessible references skipped)` : '';
            onSuccess(`Exported ${exportedCount} items (${externalCount} external references included)${warning}.`);
        } catch (error: any) {
            onError(error.message || "Export failed.");
        } finally {
            setIsZipping(false);
        }
    };

    return { uploads, setUploads, isZipping, handleFileUpload, handleBulkArchive, handleBulkDownload, handleBulkMove, handleProjectExport };
};
