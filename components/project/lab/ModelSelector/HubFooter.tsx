import React from 'react';
import { Info } from 'lucide-react';

interface HubFooterProps {
    onClose: () => void;
}

export const HubFooter: React.FC<HubFooterProps> = ({ onClose }) => (
    <div className="p-6 bg-slate-900/30 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 text-slate-500">
            <div className="p-2 bg-slate-800 rounded-lg">
                <Info size={14} />
            </div>
            <p className="text-[10px] font-bold uppercase leading-tight tracking-tight max-w-md">
                Changes apply immediately to this project's laboratory environment. Google AI models may require regional availability and billing configuration.
            </p>
        </div>
        <button 
            onClick={onClose}
            className="w-full md:w-auto px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all active:scale-95 border border-white/5"
        >
            Save Configuration
        </button>
    </div>
);