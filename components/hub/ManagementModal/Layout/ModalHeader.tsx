
import React from 'react';
import { X, Cpu } from 'lucide-react';

interface ModalHeaderProps {
    isNew: boolean;
    engineId: string;
    onClose: () => void;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ isNew, engineId, onClose }) => (
    <div className="p-6 md:p-8 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                <Cpu size={24} />
            </div>
            <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                    {isNew ? 'Forge New Checkpoint' : 'Configure Intelligence'}
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    Infrastructure: {engineId || 'Pending Registry'}
                </p>
            </div>
        </div>
        <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"
        >
            <X size={24} />
        </button>
    </div>
);
