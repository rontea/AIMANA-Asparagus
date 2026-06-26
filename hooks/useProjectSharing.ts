
import { useState, useCallback } from 'react';

interface UseProjectSharingProps {
    projectId: string;
    projectName: string;
}

export const useProjectSharing = ({ projectId, projectName }: UseProjectSharingProps) => {
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const openShareModal = useCallback(() => {
        setIsShareModalOpen(true);
    }, []);

    const closeShareModal = useCallback(() => {
        setIsShareModalOpen(false);
    }, []);

    // Return setIsShareModalOpen as expected by ProjectDashboard.tsx
    return {
        isShareModalOpen,
        setIsShareModalOpen,
        openShareModal,
        closeShareModal,
        projectId,
        projectName
    };
};
