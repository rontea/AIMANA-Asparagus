
import React from 'react';
import { X, Activity } from 'lucide-react';

interface HubHeaderProps {
    onClose: () => void;
}

export const HubHeader: React.FC<HubHeaderProps> = ({ onClose }) => (
    <div className="p-6 md:p-8 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center shrink-0">
        <div>
            <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                <Activity className="text-indigo-500" /> Checkpoint Hub
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-widest">Global Intelligence Configuration</p>
        </div>
        <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-white p-2.5 rounded-full hover:bg-slate-800 transition-all active:scale-90"
        >
            <X size={24} />
        </button>
    </div>
);
