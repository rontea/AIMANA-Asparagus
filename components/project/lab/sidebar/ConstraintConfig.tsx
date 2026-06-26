import React from 'react';
import { Ban, Info } from 'lucide-react';

interface ConstraintConfigProps {
    negativePrompt: string;
    onSetNegativePrompt: (p: string) => void;
    show: boolean;
}

export const ConstraintConfig: React.FC<ConstraintConfigProps> = ({ negativePrompt, onSetNegativePrompt, show }) => {
    if (!show) return null;

    return (
        <section className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-500">
            <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Ban size={12} className="text-red-500" /> Global Constraints
                </label>
                <span className="cursor-help" title="Concepts, styles, or artifacts to strictly avoid during neural synthesis.">
                    <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                </span>
            </div>
            
            <div className="relative group">
                <textarea 
                    value={negativePrompt}
                    onChange={(e) => onSetNegativePrompt(e.target.value)}
                    placeholder="e.g. blur, low quality, distorted, extra limbs..."
                    className="w-full h-24 bg-black/40 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 outline-none resize-none focus:border-red-500/30 transition-all shadow-inner placeholder:text-slate-800 leading-relaxed"
                />
                <div className="absolute bottom-2 right-3 opacity-20 pointer-events-none">
                   <Ban size={14} className="text-red-500" />
                </div>
            </div>
            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter px-1">
                Applies to all generated manifests in the current batch.
            </p>
        </section>
    );
};