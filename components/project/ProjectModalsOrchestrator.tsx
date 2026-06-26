
import React from 'react';
import ItemDetailModal from '../item/ItemDetailModal';
import ShareProjectModal from './ShareProjectModal';
import ImportWorkspaceModal from '../ImportWorkspaceModal';
import ImportPromptModal from './ImportPromptModal';
import GenerateImageModal, { LabMode } from './lab/GenerateImageModal';
import { ProjectReassignModal } from '../lab/history/ProjectReassignModal';
import { Project, ItemWithCurrentRevision, Revision } from '../../types';
import { SupportedEngine } from './lab/ModelSelectorModal';
import { GeneratedImageResult } from '../../services/geminiService';

interface ProjectModalsOrchestratorProps {
    project: Project;
    items: ItemWithCurrentRevision[];
    selectedItem: ItemWithCurrentRevision | null;
    setSelectedItem: (item: ItemWithCurrentRevision | null) => void;
    onUpdateItems: (u: ItemWithCurrentRevision) => void;
    onRefresh: () => void;
    onDelete: () => void;
    onImportPromptsComplete: (result: { total: number; created: number; skipped: number; inputDuplicates?: number }) => void;
    
    // Import/Share/Lab states
    isImportModalOpen: boolean;
    setIsImportModalOpen: (v: boolean) => void;
    isImportPromptOpen: boolean;
    setIsImportPromptOpen: (v: boolean) => void;
    isShareModalOpen: boolean;
    setIsShareModalOpen: (v: boolean) => void;
    isAiLabOpen: boolean;
    setIsAiLabOpen: (v: boolean) => void;
    labMode: LabMode;
    onLabModeChange?: (mode: LabMode) => void;
    remixRevision: Revision | null;
    onAddAiImage: (result: GeneratedImageResult, prompt: string, modelId: string, metadata: any, userTitle?: string, archivedItem?: ItemWithCurrentRevision) => Promise<void>;
    
    // Move states
    showProjectSelector: boolean;
    setShowProjectSelector: (v: boolean) => void;
    allProjects: Project[];
    selectedProjectId: string;
    setSelectedProjectId: (id: string) => void;
    handleConfirmMove: () => void;
    isMoving: boolean;
    movingItem: ItemWithCurrentRevision | null;
    selectedItemIds: Set<string>;
    totalBulkSelectionCount?: number;
    isBulkMove: boolean;

    // Actions
    onMoveInitiate: (item: ItemWithCurrentRevision) => void;
    onRemixToBulk: (item: ItemWithCurrentRevision) => void;
    onRemix: (rev: Revision) => void;
}

export const ProjectModalsOrchestrator: React.FC<ProjectModalsOrchestratorProps> = ({
    project, items, selectedItem, setSelectedItem, onUpdateItems, onRefresh, onDelete, onImportPromptsComplete,
    isImportModalOpen, setIsImportModalOpen, isImportPromptOpen, setIsImportPromptOpen,
    isShareModalOpen, setIsShareModalOpen, isAiLabOpen, setIsAiLabOpen, labMode, onLabModeChange, remixRevision, onAddAiImage,
    showProjectSelector, setShowProjectSelector, allProjects, selectedProjectId, setSelectedProjectId,
    handleConfirmMove, isMoving, movingItem, selectedItemIds, totalBulkSelectionCount, isBulkMove, onMoveInitiate, onRemixToBulk, onRemix
}) => {
    return (
        <>
            <ImportWorkspaceModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
                project={project} 
                existingItems={items} 
                onImportComplete={onRefresh} 
            />
            
            <ImportPromptModal 
                isOpen={isImportPromptOpen} 
                onClose={() => setIsImportPromptOpen(false)} 
                projectId={project.id} 
                existingItems={items} 
                onComplete={onImportPromptsComplete} 
            />
            
            <GenerateImageModal 
                key={`project-lab-${labMode}`}
                isOpen={isAiLabOpen} 
                onClose={() => setIsAiLabOpen(false)} 
                onAddAsAsset={onAddAiImage} 
                initialModel={project.defaultEngine as SupportedEngine} 
                mode={labMode} 
                onModeChange={onLabModeChange}
                remixRevision={remixRevision} 
            />
            
            {isShareModalOpen && (
                <ShareProjectModal 
                    isOpen={isShareModalOpen} 
                    onClose={() => setIsShareModalOpen(false)} 
                    projectId={project.id} 
                    projectName={project.name} 
                />
            )}
            
            {selectedItem && (
                <ItemDetailModal 
                    isOpen={!!selectedItem} 
                    onClose={() => setSelectedItem(null)} 
                    item={selectedItem} 
                    project={project} 
                    onUpdate={onUpdateItems} 
                    onOpenItem={setSelectedItem}
                    onMove={onMoveInitiate} 
                    onRemixToBulk={onRemixToBulk}
                    onRefreshHistory={onRefresh} 
                    onDelete={onDelete} 
                    onRemix={onRemix}
                />
            )}
            
            {showProjectSelector && (
                <ProjectReassignModal 
                    projects={allProjects} 
                    selectedProjectId={selectedProjectId} 
                    onSelectProject={setSelectedProjectId}
                    onConfirm={handleConfirmMove} 
                    onCancel={() => setShowProjectSelector(false)}
                    isMoving={isMoving} 
                    title={isBulkMove ? `Capture ${totalBulkSelectionCount ?? selectedItemIds.size} Artifacts` : "Capture Bulk Artifact"}
                />
            )}
        </>
    );
};

