
import React, { useRef, useState, useEffect } from 'react';
import { X, MoreVertical, Wand2, Zap, FolderPlus, Trash2, SendToBack, Loader2 } from 'lucide-react';
import { AssetType } from '../../types';

interface ItemManifestHeaderProps {
    title: string;
    onTitleChange: (val: string) => void;
    onClose: () => void;
    assetType: AssetType;
    itemId: string;
    onNavigateToLab: () => void;
    onRemixToBulk?: () => void;
    onMovePromptToStaging?: () => void;
    isMovingPromptToStaging?: boolean;
    onMove?: () => void;
    onArchive: () => void;
}

export const ItemManifestHeader: React.FC<ItemManifestHeaderProps> = ({
    title, onTitleChange, onClose, assetType, onNavigateToLab, onRemixToBulk, onMovePromptToStaging, isMovingPromptToStaging = false, onMove, onArchive
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="p-4 md:p-5 border-b border-slate-800 flex justify-between items-start bg-slate-900 z-10 shrink-0">
            <div className="flex-1 mr-4">
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Manifest Title</div>
                <input 
                    value={title} 
                    onChange={(e) => onTitleChange(e.target.value)} 
                    className="bg-transparent text-lg md:text-xl font-bold text-white w-full border-b border-transparent focus:border-indigo-500 focus:outline-none transition-colors" 
                    placeholder="Item Title" 
                />
            </div>
            <div className="flex gap-1 relative" ref={menuRef}>
                <button 
                    onClick={() => setShowMenu(!showMenu)} 
                    className={`p-2 rounded transition-all ${showMenu ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                    <MoreVertical size={20} />
                </button>
                {showMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-[70] py-1 overflow-hidden animate-in slide-in-from-top-1">
                        {assetType === AssetType.IMAGE && (
                            <button onClick={() => { setShowMenu(false); onNavigateToLab(); }} className="w-full text-left px-4 py-2.5 text-sm text-indigo-400 hover:bg-indigo-500/10 flex items-center gap-3 transition-colors">
                                <Wand2 size={14} /> Aesthetic Lab
                            </button>
                        )}
                        {onRemixToBulk && (
                            <button onClick={() => { setShowMenu(false); onRemixToBulk(); }} className="w-full text-left px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-3 transition-colors">
                                <Zap size={14} /> Remix to Bulk
                            </button>
                        )}
                        {onMovePromptToStaging && (
                            <button onClick={() => { setShowMenu(false); onMovePromptToStaging(); }} disabled={isMovingPromptToStaging} className="w-full text-left px-4 py-2.5 text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-wait disabled:opacity-60 flex items-center gap-3 transition-colors">
                                {isMovingPromptToStaging ? <Loader2 size={14} className="animate-spin" /> : <SendToBack size={14} />}
                                {isMovingPromptToStaging ? 'Moving Prompt...' : 'Move Prompt To Staging'}
                            </button>
                        )}
                        {onMove && (
                            <button onClick={() => { setShowMenu(false); onMove(); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-3 transition-colors">
                                <FolderPlus size={14} /> Move to Project
                            </button>
                        )}
                        <div className="h-px bg-slate-700 my-1" />
                        <button onClick={() => { setShowMenu(false); onArchive(); }} className="w-full text-left px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-900/20 flex items-center gap-3 transition-colors">
                            <Trash2 size={14} /> Delete Item
                        </button>
                    </div>
                )}
                <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-800 transition-colors">
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};
