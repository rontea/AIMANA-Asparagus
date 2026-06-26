
import React from 'react';

interface EditorSliderProps {
    icon: any;
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
}

export const EditorSlider: React.FC<EditorSliderProps> = ({ icon: Icon, label, value, min, max, step = 1, onChange }) => (
    <div className="space-y-1 group">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <Icon size={10} className="text-indigo-400" />
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">{label}</span>
            </div>
            <span className="text-[9px] font-mono text-indigo-400 font-bold">{Math.round(value)}</span>
        </div>
        <div className="relative flex items-center h-4">
            <input 
                type="range" 
                min={min} max={max} step={step} value={value} 
                onChange={e => onChange(parseFloat(e.target.value))} 
                className="w-full h-1 bg-slate-900 rounded-full appearance-none cursor-pointer accent-indigo-500 border border-white/5" 
            />
        </div>
    </div>
);
