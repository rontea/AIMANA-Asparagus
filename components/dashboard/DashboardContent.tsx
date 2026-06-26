import React, { useEffect, useRef } from 'react';
import { Project } from '../../types';
import { ProjectGrid } from './ProjectGrid';
import { ProjectTable } from './ProjectTable';
import { DashboardEmptyState } from './DashboardEmptyState';

interface DashboardContentProps {
    projects: Project[];
    isLoading: boolean;
    viewType: 'grid' | 'list';
    isSelectMode: boolean;
    selectedIds: Set<string>;
    toggleSelection: (id: string) => void;
    handleTogglePin: (project: Project) => void;
    handleArchive: (project: Project) => void;
    onNewProject: () => void;
    hasMoreProjects?: boolean;
    onLoadMoreProjects?: () => void;
    totalProjectCount?: number;
}

export const DashboardContent: React.FC<DashboardContentProps> = ({
    projects, isLoading, viewType, isSelectMode, selectedIds, 
    toggleSelection, handleTogglePin, handleArchive, onNewProject,
    hasMoreProjects = false, onLoadMoreProjects, totalProjectCount
}) => {
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!hasMoreProjects || !onLoadMoreProjects) return;

        const node = loadMoreRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    onLoadMoreProjects();
                }
            },
            { rootMargin: '480px 0px' }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMoreProjects, onLoadMoreProjects, projects.length]);

    if (!isLoading && projects.length === 0) {
        return <DashboardEmptyState onNewProject={onNewProject} />;
    }

    const loadMoreStatus = hasMoreProjects && (
        <div ref={loadMoreRef} className="flex justify-center py-6">
            <button
                type="button"
                onClick={onLoadMoreProjects}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-300 hover:border-indigo-400 hover:text-white"
            >
                Load More Projects
                {typeof totalProjectCount === 'number' && (
                    <span className="ml-2 text-slate-500">
                        {projects.length}/{totalProjectCount}
                    </span>
                )}
            </button>
        </div>
    );

    if (viewType === 'grid') {
        return (
            <>
                <ProjectGrid
                    projects={projects}
                    isSelectMode={isSelectMode}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                    onTogglePin={handleTogglePin}
                    onArchive={handleArchive}
                />
                {loadMoreStatus}
            </>
        );
    }

    return (
        <>
            <ProjectTable
                projects={projects}
                isSelectMode={isSelectMode}
                selectedIds={selectedIds}
                onToggleSelection={toggleSelection}
                onTogglePin={handleTogglePin}
                onArchive={handleArchive}
            />
            {loadMoreStatus}
        </>
    );
};
