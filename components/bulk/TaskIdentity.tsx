
import React from 'react';
import { FileText } from 'lucide-react';

interface TaskIdentityProps {
    id: string;
    title?: string;
    prompt: string;
    isEditing?: boolean;
    editValue?: string;
    onEditChange?: (val: string) => void;
    onSaveEdit?: (e: React.MouseEvent) => void;
    onCancelEdit?: (e: React.MouseEvent) => void;
}

export const TaskIdentity: React.FC<TaskIdentityProps> = ({ 
    id, title, prompt, isEditing, editValue, onEditChange, onSaveEdit, onCancelEdit 
}) => (
    <div className="flex flex-col gap-1 min-w-0">
        {title && (
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest drop-shadow-sm">
                {title}
            </span>
        )}
        <div className="flex items-start gap-2">
            <FileText size={12} className="text-indigo-500/50 shrink-0 mt-1" />
            {isEditing ? (
                <div className="flex-1 flex gap-2" onClick={e => e.stopPropagation()}>
                    <input 
                        type="text"
                        value={editValue}
                        onChange={(e) => onEditChange?.(e.target.value)}
                        className="flex-1 bg-black/60 border border-indigo-500/50 rounded-lg px-3 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        autoFocus
                    />
                </div>
            ) : (
                <div className="min-w-0">
                    <span className="text-white font-bold text-sm leading-tight line-clamp-2 italic">
                        "{prompt}"
                    </span>
                    <p className="text-[9px] text-slate-600 font-mono mt-1 uppercase tracking-tighter opacity-60">
                        SIG: {id.substring(0, 12).toUpperCase()}
                    </p>
                </div>
            )}
        </div>
    </div>
);
