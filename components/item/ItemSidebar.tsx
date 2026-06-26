import React from 'react';
import { RefinementLab } from './RefinementLab';
import { ReferenceManifest } from './ReferenceManifest';
import { MainRevisionMeta } from './MainRevisionMeta';
import { MosaicManager } from './MosaicManager';
import { RevisionHistory } from './RevisionHistory';
import { ItemWithCurrentRevision, Revision, Project, ReferenceUsage } from '../../types';
import { ReferencedInPanel } from './ReferencedInPanel';

interface ItemSidebarProps {
    item: ItemWithCurrentRevision;
    project: Project;
    currentRev: Revision | undefined;
    formData: any;
    setFormData: (data: any) => void;
    secondaryFiles: any[];
    onCommitRefinement: any;
    onLinkRequested: () => void;
    onUnlinkRequested: (id: string) => void;
    onDropLink: (id: string) => void;
    onViewReference: (refItem: ItemWithCurrentRevision) => void;
    onMoveReferenceToProject?: (refItem: ItemWithCurrentRevision) => void;
    onRemoveSecondary: (id: string) => void;
    revisions: Revision[];
    isHistoryDragging: boolean;
    onHistoryDragEnter: (e: React.DragEvent) => void;
    onHistoryDragLeave: (e: React.DragEvent) => void;
    onHistoryDrop: (e: React.DragEvent) => void;
    onHistoryAddClick: () => void;
    onSelectRevision: (rev: Revision) => void;
    onRestoreRevision?: (rev: Revision) => void;
    onDeleteRevision?: (revId: string) => void;
    onShowParams: () => void;
    engines: string[];
    showRefinement?: boolean;
    showHistory?: boolean;
    showManifest?: boolean;
    onMosaicDrop?: (e: React.DragEvent) => void;
    onMosaicView?: (index: number) => void;
    onMosaicAdd?: () => void;
    onReferenceDrop?: (e: React.DragEvent) => void;
    referencedBy?: ReferenceUsage[];
    isReferencedByLoading?: boolean;
    onOpenReferenceParent?: (itemId: string) => void;
    onOpenReferenceGallery?: () => void;
    onOpenReferenceImageGallery?: () => void;
    onOpenItemById?: (itemId: string) => void;
}

export const ItemSidebar: React.FC<ItemSidebarProps> = ({
    item, project, currentRev, formData, setFormData, secondaryFiles, onCommitRefinement,
    onLinkRequested, onUnlinkRequested, onDropLink, onViewReference, onMoveReferenceToProject, onRemoveSecondary,
    revisions, isHistoryDragging, onHistoryDragEnter, onHistoryDragLeave, onHistoryDrop,
    onHistoryAddClick, onSelectRevision, onRestoreRevision, onDeleteRevision, onShowParams, engines,
    showRefinement = true, showHistory = true, showManifest = true, onMosaicDrop, onMosaicView, onMosaicAdd,
    onReferenceDrop,
    referencedBy = [],
    isReferencedByLoading = false,
    onOpenReferenceParent,
    onOpenReferenceGallery,
    onOpenReferenceImageGallery,
    onOpenItemById
}) => {
    return (
        <div className="p-4 md:p-5 space-y-8 animate-in fade-in duration-500 pb-20">
            {showRefinement && (
                <RefinementLab 
                    item={item} 
                    project={project} 
                    onCommit={onCommitRefinement} 
                />
            )}

            <MainRevisionMeta 
                formData={formData} 
                setFormData={setFormData} 
                engines={engines} 
                currentRev={currentRev}
                projectName={project.name}
                onShowParams={onShowParams} 
                onCopyText={() => {}} 
                onCopyLocation={() => {}}
                onOpenItemById={onOpenItemById}
            />

            <ReferencedInPanel
                itemId={item.id}
                references={referencedBy}
                isLoading={isReferencedByLoading}
                onOpen={(itemId) => onOpenReferenceParent?.(itemId)}
                onOpenGallery={onOpenReferenceGallery}
                onOpenReferenceImageGallery={onOpenReferenceImageGallery}
            />
            
            {showManifest && (
                <MosaicManager 
                    secondaryFiles={secondaryFiles} 
                    onAdd={onMosaicAdd || (() => {})} 
                    onRemove={onRemoveSecondary} 
                    onView={onMosaicView}
                    onDrop={onMosaicDrop}
                    viewMode="list" 
                    resetKey={item.id}
                />
            )}

            {showHistory && (
                <RevisionHistory 
                    revisions={revisions} 
                    currentRevisionId={item.currentRevisionId} 
                    isHistoryDragging={isHistoryDragging}
                    onDragEnter={onHistoryDragEnter}
                    onDragLeave={onHistoryDragLeave}
                    onDrop={onHistoryDrop}
                    onAddClick={onHistoryAddClick}
                    onSelectRevision={onSelectRevision}
                    onRestoreRevision={onRestoreRevision}
                    onDeleteRevision={onDeleteRevision}
                />
            )}

            <ReferenceManifest 
                revision={currentRev} 
                onLinkRequested={onLinkRequested}
                onUnlinkRequested={onUnlinkRequested}
                onDropLink={onDropLink}
                onViewItem={onViewReference}
                onMoveItemToProject={onMoveReferenceToProject}
                onDrop={onReferenceDrop}
            />
        </div>
    );
};
