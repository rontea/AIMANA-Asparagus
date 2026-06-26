import React from 'react';
/* Importing useNavigate from core package to fix named export issue */
import { useNavigate } from 'react-router';
import { Project } from '../../types';
import { ProjectCard } from './ProjectCard';

interface ProjectGridProps {
    projects: Project[];
    isSelectMode: boolean;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onTogglePin: (project: Project) => void;
    onArchive: (project: Project) => void;
}

export const ProjectGrid: React.FC<ProjectGridProps> = ({
    projects, isSelectMode, selectedIds, onToggleSelection, onTogglePin, onArchive
}) => {
    const navigate = useNavigate();
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((p) => (
                <ProjectCard 
                    key={p.id}
                    project={p}
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.has(p.id)}
                    onToggleSelection={() => onToggleSelection(p.id)}
                    onClick={() => navigate(`/project/${p.id}`)}
                    onTogglePin={(e) => { e.stopPropagation(); onTogglePin(p); }}
                    onArchive={(e) => { e.stopPropagation(); onArchive(p); }}
                />
            ))}
        </div>
    );
};