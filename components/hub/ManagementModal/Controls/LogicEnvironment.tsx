
import React from 'react';
import { Ban } from 'lucide-react';

interface LogicEnvironmentProps {
    defaultNegativePrompt: string;
    onChange: (val: string) => void;
}

export const LogicEnvironment: React.FC<LogicEnvironmentProps> = ({ defaultNegativePrompt, onChange }) => {
    return (
        <section className="space-y-6">
            <div>
                <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Ban size={14} className="text-red-400" /> Default Logic Environment
                </h4>
                <p className="text-[10px] text-slate-500 font-medium mt-1">Configure sticky parameters that initialize automatically in the Laboratory.</p>
            </div>

            <div className="space-y-3">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Persistent Negative Context</label>
                <textarea 
                    value={defaultNegativePrompt}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full h-24 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 outline-none focus:border-red-500/50 resize-none transition-all"
                    placeholder="e.g. blur, distorted, text, watermark, low quality..."
                />
                <p className="text-[9px] text-slate-600 italic px-1 leading-relaxed">
                    Modifying this context within the Creative Lab sidebar will automatically update this Hub configuration.
                </p>
            </div>
        </section>
    );
};
