import React from 'react';
import { Smartphone, Monitor, Square, Sliders, MoveVertical, MoveHorizontal, LucideIcon, Info } from 'lucide-react';
import { LabSlider } from '../LabSlider';

interface LabDimensionSelectorProps {
    ratios: string[];
    selectedRatio: string;
    onSetRatio: (r: string) => void;
    customWidth: number;
    setCustomWidth: (w: number) => void;
    customHeight: number;
    setCustomHeight: (h: number) => void;
}

interface RatioUI {
    label: string;
    res: string;
    icon: LucideIcon;
}

const MAP_RATIO_TO_UI: Record<string, RatioUI> = {
    "3:4": { label: "Portrait", res: "768x1152", icon: Smartphone },
    "4:3": { label: "Landscape", res: "1152x768", icon: Monitor },
    "9:16": { label: "Vertical", res: "720x1280", icon: Smartphone },
    "16:9": { label: "Widescreen", res: "1280x720", icon: Monitor },
    "1:1": { label: "Square", res: "1024x1024", icon: Square },
    "custom": { label: "custom", res: "custom", icon: Sliders }
};

export const LabDimensionSelector: React.FC<LabDimensionSelectorProps> = ({ 
    ratios, selectedRatio, onSetRatio, customWidth, setCustomWidth, customHeight, setCustomHeight 
}) => {
    const supported = Array.isArray(ratios) ? ratios.filter((r) => MAP_RATIO_TO_UI[r]) : [];
    const baseRatios = supported.length > 0 ? supported : ["3:4", "4:3", "1:1"];
    const gridRatios = baseRatios.includes("custom") ? baseRatios : [...baseRatios, "custom"];
    const gridColsClass =
        gridRatios.length <= 2 ? "grid-cols-2" :
        gridRatios.length === 3 ? "grid-cols-3" :
        gridRatios.length === 4 ? "grid-cols-4" : "grid-cols-5";

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Aspect Ratio</label>
                <span className="cursor-help" title="Pollinations video ratios currently wired in AIMANA: 16:9 and 9:16.">
                    <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                </span>
            </div>
            <div className={`grid ${gridColsClass} bg-[#161616] border border-slate-800 rounded-xl overflow-hidden`}>
                {gridRatios.map((key) => {
                    const ui = MAP_RATIO_TO_UI[key];
                    const isActive = selectedRatio === key;
                    return (
                        <button 
                            key={key}
                            onClick={() => onSetRatio(key)}
                            className={`flex flex-col items-center justify-center py-3.5 px-1 gap-1 border-r last:border-r-0 border-slate-800 transition-all ${
                                isActive ? 'bg-cyan-500 text-white shadow-inner' : 'bg-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <ui.icon size={16} strokeWidth={isActive ? 3 : 2} />
                            <div className="flex flex-col items-center gap-0.5">
                                <span className={`text-[8px] font-black uppercase tracking-tight leading-none ${isActive ? 'text-white' : 'text-slate-400'}`}>{ui.label}</span>
                                <span className={`text-[7px] font-bold opacity-60 font-mono tracking-tighter ${isActive ? 'text-white' : 'text-slate-600'}`}>{ui.res}</span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {selectedRatio === 'custom' && (
                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl space-y-5 animate-in slide-in-from-top-2">
                    <div className="relative">
                        <LabSlider label="Width" value={customWidth} min={256} max={2048} step={64} onChange={setCustomWidth} icon={MoveHorizontal} unit="px" />
                        <span className="absolute right-0 top-0 cursor-help" title="Image width in pixels">
                            <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                        </span>
                    </div>
                    <div className="relative">
                        <LabSlider label="Height" value={customHeight} min={256} max={2048} step={64} onChange={setCustomHeight} icon={MoveVertical} unit="px" />
                        <span className="absolute right-0 top-0 cursor-help" title="Image height in pixels">
                            <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
