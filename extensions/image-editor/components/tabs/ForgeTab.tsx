import React, { useState } from 'react';
import { Wand2, Zap, ScanEye, Maximize, Ghost, Layers, Compass, Image as ImageIcon, Paintbrush, Eraser, RotateCcw, Sliders } from 'lucide-react';
import { EditorCollapsible } from '../ui/EditorCollapsible';
import { EditorSlider } from '../ui/EditorSlider';

interface ForgeTabProps {
    onApplyAction: (action: string) => void;
    isInpainting: boolean;
    setIsInpainting: (v: boolean) => void;
    brushSize: number;
    setBrushSize: (v: number) => void;
    isEraser: boolean;
    setIsEraser: (v: boolean) => void;
    onClearMask: () => void;
}

export const ForgeTab: React.FC<ForgeTabProps> = ({ 
    onApplyAction, isInpainting, setIsInpainting, brushSize, setBrushSize, isEraser, setIsEraser, onClearMask
}) => {
    const [openSections, setOpenSections] = useState<Set<string>>(new Set(['inpaint', 'guidance', 'refinement']));

    const toggleSection = (id: string) => {
        const next = new Set(openSections);
        if (next.has(id)) next.delete(id); else next.add(id);
        setOpenSections(next);
    };

    return (
        <div className="flex flex-col h-full bg-[#111]">
            <EditorCollapsible 
                title="Inpaint or Outpaint" 
                isOpen={openSections.has('inpaint')} 
                onToggle={() => toggleSection('inpaint')}
            >
                <div className="space-y-4">
                    <button 
                        onClick={() => setIsInpainting(!isInpainting)}
                        className={`w-full py-2.5 px-3 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all ${isInpainting ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5'}`}
                    >
                        <Paintbrush size={14} /> {isInpainting ? 'Drawing Enabled' : 'Draw Inpaint Mask'}
                    </button>

                    {isInpainting && (
                        <div className="space-y-6 p-4 bg-black/40 border border-white/5 rounded-xl animate-in slide-in-from-top-2">
                            <EditorSlider 
                                icon={Sliders} 
                                label="Brush Size" 
                                value={brushSize} 
                                min={5} 
                                max={150} 
                                onChange={setBrushSize} 
                            />
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setIsEraser(!isEraser)}
                                    className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${isEraser ? 'bg-rose-600 border-rose-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-white'}`}
                                >
                                    <Eraser size={12} /> Eraser
                                </button>
                                <button 
                                    onClick={onClearMask}
                                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-white border border-slate-700 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <RotateCcw size={12} /> Clear Mask
                                </button>
                            </div>

                            <p className="text-[8px] text-slate-600 italic leading-relaxed px-1">
                                Highlight the area of the image you want to modify. The AI will target this region for synthesis.
                            </p>
                        </div>
                    )}
                </div>
            </EditorCollapsible>

            <EditorCollapsible 
                title="Neural Guidance" 
                isOpen={openSections.has('guidance')} 
                onToggle={() => toggleSection('guidance')}
            >
                <div className="space-y-1">
                    <p className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-2 px-1">Pre-processor Maps</p>
                    <div className="grid grid-cols-1 gap-1">
                        <ActionButton icon={ScanEye} label="Canny Edge" sub="Guided Contours" onClick={() => onApplyAction('canny')} color="text-emerald-400" />
                        <ActionButton icon={Layers} label="Depth Map" sub="Z-Buffer Extraction" onClick={() => onApplyAction('depth')} color="text-blue-400" />
                        <ActionButton icon={Compass} label="Normal Map" sub="Surface Vectors" onClick={() => onApplyAction('normal')} color="text-purple-400" />
                        <ActionButton icon={Zap} label="Scribble" sub="Boundary Sketch" onClick={() => onApplyAction('scribble')} color="text-amber-400" />
                    </div>
                </div>
            </EditorCollapsible>

            <EditorCollapsible 
                title="Refinement" 
                isOpen={openSections.has('refinement')} 
                onToggle={() => toggleSection('refinement')}
            >
                <div className="space-y-1">
                    <div className="grid grid-cols-1 gap-1">
                        <ActionButton icon={Maximize} label="Neural Upscale" sub="2x Resolution" onClick={() => onApplyAction('upscale')} color="text-indigo-400" />
                        <ActionButton icon={Ghost} label="Remove Background" sub="Segment Artifact" onClick={() => onApplyAction('rembg')} color="text-rose-400" />
                        <ActionButton icon={Wand2} label="Magic Refine" sub="Aesthetic Polish" onClick={() => onApplyAction('refine')} color="text-white" />
                    </div>
                </div>
            </EditorCollapsible>

            <div className="p-4 mt-auto">
                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <ImageIcon size={10} className="text-indigo-400" />
                        <span className="text-[8px] font-black text-indigo-300 uppercase tracking-widest">Inference Protocol</span>
                    </div>
                    <p className="text-[8px] text-slate-500 leading-relaxed font-medium">Guidance maps are generated locally for ingestion into the main Studio's ControlNet module.</p>
                </div>
            </div>
        </div>
    );
};

const ActionButton: React.FC<{ icon: any, label: string, sub: string, onClick: () => void, color: string }> = ({ icon: Icon, label, sub, onClick, color }) => (
    <button 
        onClick={onClick}
        className="w-full flex items-center gap-3 p-2 bg-[#050505] border border-white/5 hover:border-white/10 hover:bg-white/5 rounded-lg transition-all group text-left shadow-sm"
    >
        <div className={`p-1.5 rounded bg-black border border-white/5 transition-transform group-hover:scale-105 ${color}`}>
            <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
            <div className="text-[9px] font-black text-slate-200 uppercase leading-none">{label}</div>
            <div className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter mt-1">{sub}</div>
        </div>
    </button>
);