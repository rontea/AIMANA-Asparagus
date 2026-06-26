import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import GenerateImageModal from '../components/project/lab/GenerateImageModal';
import { api } from '../services/api';
import { Project, ItemWithCurrentRevision } from '../types';
import { GeneratedImageResult } from '../services/geminiService';
import { ProjectReassignModal } from '../components/lab/history/ProjectReassignModal';
import { CheckCircle } from 'lucide-react';
import { useModalDialogs } from '../hooks/useModalDialogs';
import { extractAutoReferenceImageTag, mergeRevisionTags } from '../utils/revisionTags';

interface PendingCapture {
    res: GeneratedImageResult;
    prompt: string;
    modelId: string;
    metadata: any;
    userTitle?: string;
    archivedItem?: ItemWithCurrentRevision;
}

const Podcast: React.FC = () => {
    const navigate = useNavigate();
    const { alert, alertDialog } = useModalDialogs();
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [pendingCaptures, setPendingCaptures] = useState<PendingCapture[]>([]);
    const [isMoving, setIsMoving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const fetchProjects = useCallback(async () => {
        try {
            const list = await api.projects.list();
            setAllProjects(list);
            if (list.length > 0 && !selectedProjectId) setSelectedProjectId(list[0].id);
        } catch (_e) {}
    }, [selectedProjectId]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleConfirmSelection = async () => {
        if (!selectedProjectId) return;
        setIsMoving(true);
        try {
            let movedCount = 0;
            let failedCount = 0;
            for (const capture of pendingCaptures) {
                const { res, prompt, modelId, metadata, userTitle, archivedItem } = capture;
                const finalTitle = userTitle?.trim() || `Captured: ${prompt.substring(0, 20)}...`;
                try {
                    if (archivedItem) {
                        await api.items.update({ id: archivedItem.id, projectId: selectedProjectId, isArchived: false });
                        if (archivedItem.currentRevision) {
                            await api.revisions.update({
                                id: archivedItem.currentRevision.id,
                                prompt,
                                engine: modelId,
                                aiParameters: JSON.stringify(metadata, null, 2),
                                title: finalTitle
                            });
                        }
                        movedCount++;
                    } else if (res?.base64 && res?.mimeType) {
                        const byteCharacters = atob(res.base64);
                        const byteArray = new Uint8Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteArray[i] = byteCharacters.charCodeAt(i);
                        }
                        const blob = new Blob([byteArray], { type: res.mimeType });
                        const ext = res.mimeType.split('/')[1] || 'bin';
                        const file = new File([blob], `captured_${Date.now()}.${ext}`, { type: res.mimeType });
                        const itemWithRev = await api.items.create(selectedProjectId, file, () => {});
                        if (itemWithRev.currentRevision) {
                            const nextTags = mergeRevisionTags(
                                itemWithRev.currentRevision.tags,
                                extractAutoReferenceImageTag(metadata)
                            );
                            await api.revisions.update({
                                ...itemWithRev.currentRevision,
                                prompt,
                                engine: modelId,
                                aiParameters: JSON.stringify(metadata, null, 2),
                                title: finalTitle,
                                tags: nextTags
                            });
                        }
                        movedCount++;
                    }
                } catch (_e) {
                    failedCount++;
                }
            }
            if (movedCount > 0 && failedCount === 0) {
                setSuccessMsg(movedCount > 1 ? `Successfully moved ${movedCount} artifacts to project.` : 'Successfully moved artifact to project.');
            } else if (movedCount > 0 && failedCount > 0) {
                setSuccessMsg(`Moved ${movedCount} artifact(s), ${failedCount} failed.`);
            }
            setTimeout(() => setSuccessMsg(null), 3000);
            setShowProjectSelector(false);
            setPendingCaptures([]);
        } catch (_err) {
            await alert({
                title: 'Capture Failed',
                description: 'Capture failed.',
                tone: 'danger'
            });
        } finally {
            setIsMoving(false);
        }
    };

    return (
        <div className="relative min-h-screen bg-[#050505]">
            <GenerateImageModal
                isOpen
                onClose={() => navigate('/generate')}
                onBack={() => navigate('/generate')}
                backLabel="Generate Content"
                mode="audio"
                isPodcast
                onAddAsAsset={async (res, prompt, modelId, metadata, title, archivedItem) => {
                    setPendingCaptures([{ res, prompt, modelId, metadata, userTitle: title, archivedItem }]);
                    setShowProjectSelector(true);
                }}
                onBulkAddAsAssets={async (captures) => {
                    const normalized: PendingCapture[] = (captures || []).map((c: any) => ({
                        res: c.res,
                        prompt: c.prompt,
                        modelId: c.modelId,
                        metadata: c.metadata,
                        userTitle: c.userTitle,
                        archivedItem: c.archivedItem
                    }));
                    if (normalized.length > 0) {
                        setPendingCaptures(normalized);
                        setShowProjectSelector(true);
                    }
                }}
            />

            {showProjectSelector && (
                <ProjectReassignModal
                    projects={allProjects}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={setSelectedProjectId}
                    onConfirm={handleConfirmSelection}
                    onCancel={() => { setShowProjectSelector(false); setPendingCaptures([]); }}
                    isMoving={isMoving}
                    title={pendingCaptures.length > 1 ? `Capture ${pendingCaptures.length} Artifacts` : "Capture Artifact"}
                />
            )}

            {successMsg && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 animate-in slide-in-from-bottom-4 z-50">
                    <CheckCircle size={18} /> {successMsg}
                </div>
            )}

            {alertDialog}
        </div>
    );
};

export default Podcast;
