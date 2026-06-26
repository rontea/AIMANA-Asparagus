
import React from 'react';
import { Save, RefreshCw, Trash2 } from 'lucide-react';

interface ItemActionFooterProps {
    onClose: () => void;
    onSave: () => void;
    onArchive: () => void;
    isSubmitting: boolean;
    canSave: boolean;
    archiveLabel?: string;
}

export const ItemActionFooter: React.FC<ItemActionFooterProps> = ({
    onClose, onSave, onArchive, isSubmitting, canSave, archiveLabel = "Delete Item"
}) => {
    return (
        <div className="p-4 md:p-5 border-t border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
            <button 
                onClick={onArchive} 
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
            >
                <Trash2 size={16} />
                <span>{archiveLabel}</span>
            </button>
            <div className="flex gap-3">
                <button 
                    onClick={onClose} 
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={onSave} 
                    disabled={isSubmitting || !canSave} 
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                    {isSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Manifest
                </button>
            </div>
        </div>
    );
};
