import React from 'react';
/* Importing useNavigate from core package to fix named export issue */
import { useNavigate } from 'react-router';
import { Pin, Cloud, HardDrive, Archive, Check } from 'lucide-react';
import { Project, ProjectStorageType } from '../../types';

interface ProjectTableProps {
    projects: Project[];
    isSelectMode: boolean;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    onTogglePin: (project: Project) => void;
    onArchive: (project: Project) => void;
}

export const ProjectTable: React.FC<ProjectTableProps> = ({
    projects, isSelectMode, selectedIds, onToggleSelection, onTogglePin, onArchive
}) => {
    const navigate = useNavigate();
    return (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-900/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-700 backdrop-blur-md">
               <tr>
                 {isSelectMode && <th className="px-6 py-4 w-10"></th>}
                 <th className="px-6 py-4">Project Name</th>
                 <th className="px-6 py-4">Storage</th>
                 <th className="px-6 py-4">Last Updated</th>
                 <th className="px-6 py-4 text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-700/50">
               {projects.map(p => (
                 <tr 
                   key={p.id} 
                   onClick={() => isSelectMode ? onToggleSelection(p.id) : navigate(`/project/${p.id}`)}
                   className={`hover:bg-slate-700/30 transition-colors cursor-pointer group ${selectedIds.has(p.id) ? 'bg-indigo-900/10' : ''}`}
                 >
                   {isSelectMode && (
                     <td className="px-6 py-4" onClick={(e) => { e.stopPropagation(); onToggleSelection(p.id); }}>
                       <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(p.id) ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-slate-600 group-hover:border-slate-400'}`}>
                         {selectedIds.has(p.id) && <Check size={12} />}
                       </div>
                     </td>
                   )}
                   <td className="px-6 py-4">
                     <div className="flex items-center gap-3">
                       <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: p.color }} />
                       <span className="font-bold text-slate-200">{p.name}</span>
                       {p.isPinned && <Pin size={12} className="text-indigo-400 fill-current ml-1" />}
                     </div>
                   </td>
                   <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs">
                        {p.storageType === ProjectStorageType.GOOGLE_DRIVE ? <Cloud size={14} className="text-blue-400"/> : <HardDrive size={14} className="text-emerald-400"/>}
                        {p.storageType}
                      </div>
                   </td>
                   <td className="px-6 py-4 text-slate-500 text-xs">{new Date(p.updatedAt).toLocaleString()}</td>
                   <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                     {!isSelectMode && (
                       <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => onTogglePin(p)} className={`p-2 rounded-lg hover:bg-slate-700 transition-colors ${p.isPinned ? 'text-indigo-400' : 'text-slate-500'}`}>
                           <Pin size={16} className={p.isPinned ? 'fill-current' : ''} />
                         </button>
                         <button onClick={() => onArchive(p)} className="p-2 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-700 transition-colors">
                           <Archive size={16} />
                         </button>
                       </div>
                     )}
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
    );
};