import React from 'react';
import { LucideIcon } from 'lucide-react';

interface LabSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
    icon: LucideIcon;
    unit?: string;
    color?: string;
}

export const LabSlider: React.FC<LabSliderProps> = ({ 
    label, value, min, max, step = 1, onChange, icon: Icon, unit = "", color = "bg-indigo-500" 
}) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Icon size={12} className="text-slate-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                </div>
                <div className="flex items-center gap-2 bg-slate-800 px-1.5 py-0.5 rounded border border-white/5">
                    <input 
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) onChange(Math.max(min, Math.min(max, val)));
                        }}
                        className="bg-transparent text-[10px] font-mono font-bold text-indigo-400 w-10 text-center outline-none focus:text-white"
                    />
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">{unit}</span>
                </div>
            </div>
            <div className="relative group flex items-center h-6">
                <input 
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-900 rounded-full appearance-none cursor-pointer accent-indigo-500"
                />
            </div>
        </div>
    );
};