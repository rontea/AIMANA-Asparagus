
import React, { useState, useEffect } from 'react';
import { Pin, Archive, Cloud, Folder, Check, ImageIcon, MessageSquare, Video, AudioLines, File } from 'lucide-react';
import * as Icons from 'lucide-react';
import { Project, ProjectStorageType } from '../../types';
import { getProjectTypes } from '../../services/projectTypes';

interface ProjectCardProps {
    project: Project;
    isSelectMode: boolean;
    isSelected: boolean;
    onToggleSelection: () => void;
    onClick: () => void;
    onTogglePin: (e: React.MouseEvent) => void;
    onArchive: (e: React.MouseEvent) => void;
}

const SYSTEM_TYPE_META: Record<string, { label: string, icon: string }> = {
    'image': { label: 'Visual', icon: 'ImageIcon' },
    'video': { label: 'Temporal', icon: 'Video' },
    'text': { label: 'Linguistic', icon: 'FileText' },
    'files': { label: 'Archive', icon: 'HardDrive' },
    'all': { label: 'Mixed', icon: 'LayoutGrid' }
};

export const ProjectCard: React.FC<ProjectCardProps> = ({
    project, isSelectMode, isSelected, onToggleSelection, onClick, onTogglePin, onArchive
}) => {
    const [customTypeMeta, setCustomTypeMeta] = useState<{ label: string, iconName: string, color?: string } | null>(null);

    const getRelativeUpdatedAt = () => {
        const diff = Math.max(0, Date.now() - Number(project.updatedAt || 0));
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < hour) {
            const minutes = Math.max(1, Math.round(diff / minute));
            return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
        }
        if (diff < day) {
            const hours = Math.max(1, Math.round(diff / hour));
            return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        }
        const days = Math.max(1, Math.round(diff / day));
        return `${days} day${days === 1 ? '' : 's'} ago`;
    };

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            const typeId = project.projectType || 'all';
            if (SYSTEM_TYPE_META[typeId]) {
                setCustomTypeMeta(null);
                return;
            }

            const types = await getProjectTypes();
            const found = types.find((t) => t.id === typeId);
            if (!cancelled) {
                setCustomTypeMeta(found ? { label: found.label, iconName: found.iconName, color: found.color } : null);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [project.projectType]);

    const getDisplayIcon = () => {
        const iconName = customTypeMeta ? customTypeMeta.iconName : (SYSTEM_TYPE_META[project.projectType as string]?.icon || 'LayoutGrid');
        const Icon = (Icons as any)[iconName] || Icons.LayoutGrid;
        return <Icon size={12} />;
    };

    const getDisplayLabel = () => {
        return customTypeMeta ? customTypeMeta.label : (SYSTEM_TYPE_META[project.projectType as string]?.label || 'Mixed');
    };

    return (
        <div 
            onClick={isSelectMode ? onToggleSelection : onClick}
            className={`cursor-pointer rounded-[2rem] p-6 transition-all border relative overflow-hidden group ${isSelected ? 'ring-4 ring-indigo-500 border-indigo-400 scale-[0.98]' : 'border-slate-700/50 hover:-translate-y-1 shadow-md hover:shadow-xl'}`}
            style={{ backgroundColor: project.color || '#1e293b' }}
        >
            <div className="absolute inset-0 bg-slate-900/60 pointer-events-none" />
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 px-2 py-0.5 bg-black/40 rounded-lg border border-white/5 w-fit">
                            <span style={{ color: customTypeMeta?.color || '#fff' }}>{getDisplayIcon()}</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">{getDisplayLabel()}</span>
                        </div>
                        <h3 className="text-xl font-black text-white truncate pr-4 drop-shadow-md mt-1">{project.name}</h3>
                    </div>
                    {!isSelectMode && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={onTogglePin}
                                className={`p-1.5 rounded-full transition-all ${project.isPinned ? 'text-indigo-400 bg-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                title="Pin"
                            >
                                <Pin size={16} className={project.isPinned ? 'fill-current' : ''} />
                            </button>
                            <button 
                                onClick={onArchive}
                                className="p-1.5 rounded-full text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-all"
                                title="Archive"
                            >
                                <Archive size={16} />
                            </button>
                        </div>
                    )}
                </div>
                <p className="text-slate-200/60 text-xs font-medium line-clamp-2 h-10 mb-6 leading-relaxed italic">{project.description || "No description provided."}</p>
                <div className="flex justify-between items-start gap-3 text-[10px] text-white/40 border-t border-white/5 pt-4 font-black uppercase tracking-widest">
                    <span className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-lg">
                        {project.storageType === ProjectStorageType.GOOGLE_DRIVE ? <Cloud size={10} /> : <Folder size={10} />} 
                        {project.storageType}
                    </span>
                    <div className="flex flex-col items-end gap-2 text-right">
                        <span title={new Date(project.updatedAt).toLocaleString()}>{getRelativeUpdatedAt()}</span>
                        <div className="flex items-center gap-3 text-[11px] normal-case tracking-normal text-white/55">
                            {project.projectType !== 'prompt' && (
                                <span className="flex items-center gap-1.5" title={`${project.collectionCount || 0} collection${(project.collectionCount || 0) === 1 ? '' : 's'}`}>
                                    <Folder size={12} />
                                    {project.collectionCount || 0}
                                </span>
                            )}
                            <span className="flex items-center gap-1.5" title={`${project.imageItemCount || 0} image${(project.imageItemCount || 0) === 1 ? '' : 's'}`}>
                                <ImageIcon size={12} />
                                {project.imageItemCount || 0}
                            </span>
                            <span className="flex items-center gap-1.5" title={`${project.videoItemCount || 0} video${(project.videoItemCount || 0) === 1 ? '' : 's'}`}>
                                <Video size={12} />
                                {project.videoItemCount || 0}
                            </span>
                            <span className="flex items-center gap-1.5" title={`${project.chatItemCount || 0} chat capture${(project.chatItemCount || 0) === 1 ? '' : 's'}`}>
                                <MessageSquare size={12} />
                                {project.chatItemCount || 0}
                            </span>
                            <span className="flex items-center gap-1.5" title={`${project.audioItemCount || 0} audio file${(project.audioItemCount || 0) === 1 ? '' : 's'}`}>
                                <AudioLines size={12} />
                                {project.audioItemCount || 0}
                            </span>
                            <span className="flex items-center gap-1.5" title={`${project.otherItemCount || 0} other file${(project.otherItemCount || 0) === 1 ? '' : 's'}`}>
                                <File size={12} />
                                {project.otherItemCount || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            {isSelectMode && (
                <div className="absolute top-4 right-4 z-20">
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg scale-110' : 'bg-black/40 border-white/20 text-transparent'}`}>
                        <Check size={18} strokeWidth={3} />
                    </div>
                </div>
            )}
        </div>
    );
};
