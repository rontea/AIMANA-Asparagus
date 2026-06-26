
import React from 'react';
import { Save, Loader2, Check } from 'lucide-react';

interface ModalFooterProps {
    isSaving: boolean;
    showSuccess: boolean;
    disableCommit: boolean;
    onClose: () => void;
    onSave: () => void;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({ 
    isSaving, showSuccess, disableCommit, onClose, onSave 
}) => (
    <div className="p-8 border-t border-slate-800 bg-slate-900/30 flex flex-col sm:flex-row justify-end gap-4 shrink-0">
        <button 
            onClick={onClose} 
            className="px-8 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-2xl transition-all"
        >
            Exit Studio
        </button>
        <button 
            onClick={onSave} 
            disabled={isSaving || disableCommit} 
            className={`min-w-[240px] px-10 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-80 flex items-center justify-center ${
                showSuccess 
                ? 'bg-emerald-600 text-white shadow-emerald-900/40 ring-2 ring-emerald-500/50' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'
            }`}
        >
            {isSaving ? (
                <Loader2 size={16} className="animate-spin mr-3" />
            ) : showSuccess ? (
                <Check size={16} className="mr-3 animate-in zoom-in" />
            ) : (
                <Save size={16} className="mr-3" />
            )}
            {showSuccess ? 'Configuration Committed' : 'Commit Configuration'}
        </button>
    </div>
);
