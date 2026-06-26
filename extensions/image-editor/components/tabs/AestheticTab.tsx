
import React, { useState } from 'react';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, Sun, Contrast, Droplets, Ghost, RefreshCw, Layers, Maximize2, Moon, Sparkles, Aperture } from 'lucide-react';
import { EditorCollapsible } from '../ui/EditorCollapsible';
import { EditorSlider } from '../ui/EditorSlider';
import { EditorToolButton } from '../ui/EditorToolButton';

interface AestheticTabProps {
    filters: any;
    onUpdateFilter: (key: string, val: number) => void;
    onRotate: (angle: number) => void;
    onToggleFlip: (dir: 'h' | 'v') => void;
    flipH: boolean;
    flipV: boolean;
}

export const AestheticTab: React.FC<AestheticTabProps> = ({
    filters, onUpdateFilter, onRotate, onToggleFlip, flipH, flipV
}) => {
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());

    const toggleSection = (id: string) => {
        const next = new Set(openSections);
        if (next.has(id)) next.delete(id); else next.add(id);
        setOpenSections(next);
    };

    return (
        <div className="flex flex-col h-full bg-[#111]">
            <EditorCollapsible 
                title="Geometry" 
                icon={RotateCw}
                isOpen={openSections.has('geometry')} 
                onToggle={() => toggleSection('geometry')}
            >
                <div className="flex items-center gap-1">
                    <div className="flex bg-[#050505] border border-white/5 rounded-md p-0.5 shadow-inner">
                        <EditorToolButton onClick={() => onRotate(-90)} icon={RotateCcw} tooltip="Rotate Left" />
                        <EditorToolButton onClick={() => onRotate(90)} icon={RotateCw} tooltip="Rotate Right" />
                    </div>
                    <div className="w-px h-4 bg-white/10 mx-2" />
                    <div className="flex bg-[#050505] border border-white/5 rounded-md p-0.5 shadow-inner">
                        <EditorToolButton onClick={() => onToggleFlip('h')} icon={FlipHorizontal} active={flipH} tooltip="Flip Horizontal" />
                        <EditorToolButton onClick={() => onToggleFlip('v')} icon={FlipVertical} active={flipV} tooltip="Flip Vertical" />
                    </div>
                </div>
            </EditorCollapsible>

            <EditorCollapsible 
                title="Tone" 
                icon={Sun}
                isOpen={openSections.has('tone')} 
                onToggle={() => toggleSection('tone')}
            >
                <div className="space-y-4">
                    <EditorSlider icon={Sun} label="Exposure" value={filters.brightness} min={0} max={200} onChange={v => onUpdateFilter('brightness', v)} />
                    <EditorSlider icon={Contrast} label="Contrast" value={filters.contrast} min={0} max={200} onChange={v => onUpdateFilter('contrast', v)} />
                    <EditorSlider icon={Sun} label="Highlights" value={filters.highlights} min={-100} max={100} onChange={v => onUpdateFilter('highlights', v)} />
                    <EditorSlider icon={Moon} label="Shadows" value={filters.shadows} min={-100} max={100} onChange={v => onUpdateFilter('shadows', v)} />
                    <EditorSlider icon={Aperture} label="Clarity" value={filters.clarity} min={-100} max={100} onChange={v => onUpdateFilter('clarity', v)} />
                </div>
            </EditorCollapsible>

            <EditorCollapsible 
                title="Color" 
                icon={Droplets}
                isOpen={openSections.has('color')} 
                onToggle={() => toggleSection('color')}
            >
                <div className="space-y-4">
                    <EditorSlider icon={Droplets} label="Saturation" value={filters.saturate} min={0} max={200} onChange={v => onUpdateFilter('saturate', v)} />
                    <EditorSlider icon={Sparkles} label="Vibrance" value={filters.vibrance} min={-100} max={100} onChange={v => onUpdateFilter('vibrance', v)} />
                    <EditorSlider icon={Sun} label="Temperature" value={filters.temperature} min={-100} max={100} onChange={v => onUpdateFilter('temperature', v)} />
                    <EditorSlider icon={Layers} label="Tint" value={filters.tint} min={-100} max={100} onChange={v => onUpdateFilter('tint', v)} />
                    <EditorSlider icon={RefreshCw} label="Hue Shift" value={filters.hueRotate} min={-180} max={180} onChange={v => onUpdateFilter('hueRotate', v)} />
                    <EditorSlider icon={Ghost} label="Grayscale" value={filters.grayscale} min={0} max={100} onChange={v => onUpdateFilter('grayscale', v)} />
                    <EditorSlider icon={RefreshCw} label="Invert" value={filters.invert} min={0} max={100} onChange={v => onUpdateFilter('invert', v)} />
                    <EditorSlider icon={Layers} label="Sepia" value={filters.sepia} min={0} max={100} onChange={v => onUpdateFilter('sepia', v)} />
                </div>
            </EditorCollapsible>

            <EditorCollapsible 
                title="Effects" 
                icon={Sparkles}
                isOpen={openSections.has('effects')} 
                onToggle={() => toggleSection('effects')}
            >
                <div className="space-y-4">
                    <EditorSlider icon={Maximize2} label="Blur" value={filters.blur} min={0} max={20} step={0.5} onChange={v => onUpdateFilter('blur', v)} />
                    <EditorSlider icon={Aperture} label="Vignette" value={filters.vignette} min={0} max={100} onChange={v => onUpdateFilter('vignette', v)} />
                    <EditorSlider icon={Sparkles} label="Grain" value={filters.grain} min={0} max={100} onChange={v => onUpdateFilter('grain', v)} />
                </div>
            </EditorCollapsible>
        </div>
    );
};
