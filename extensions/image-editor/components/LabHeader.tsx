
import React, { useEffect, useState } from 'react';
import { X, Save, Loader2, LayoutGrid, Info, Undo2, Redo2 } from 'lucide-react';

interface LabHeaderProps {
    onBack: () => void;
    onReset: () => void;
    onCommit: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    isCommitting: boolean;
    canCommit: boolean;
    view: 'ingest' | 'editor' | 'matrix';
}

export const LabHeader: React.FC<LabHeaderProps> = ({ 
    onBack, onReset, onCommit, onUndo, onRedo, canUndo, canRedo, isCommitting, canCommit, view
}) => {
    const isActive = view !== 'ingest';
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const tag = (document.activeElement?.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea') return;
                e.preventDefault();
                setShowHelp(prev => !prev);
            }

            if (e.key === 'Escape') {
                setShowHelp(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="border-b border-white/5 bg-[#0a0a0a] shrink-0 z-[250] relative">
            <div className="h-16 flex items-center justify-between px-8">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5">
                        <X size={20} />
                    </button>
                    <div className="h-4 w-px bg-white/5" />
                    
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                                <LayoutGrid size={18} />
                            </div>
                            <h2 className="text-xs font-black text-white uppercase tracking-[0.3em] hidden sm:block">Aesthetic Lab</h2>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className="p-2 rounded-lg border bg-slate-900/40 border-white/10 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        title="Undo (Ctrl/Cmd + Z)"
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className="p-2 rounded-lg border bg-slate-900/40 border-white/10 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        title="Redo (Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y)"
                    >
                        <Redo2 size={14} />
                    </button>
                    <button
                        onClick={() => setShowHelp((v) => !v)}
                        className={`p-2 rounded-lg border transition-all ${showHelp ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'bg-slate-900/40 border-white/10 text-slate-400 hover:text-white'}`}
                        title="Keyboard controls help"
                    >
                        <Info size={14} />
                    </button>
                    {isActive && (
                        <button onClick={onBack} className="px-4 py-2 text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 group">
                            <X size={14} /> Close
                        </button>
                    )}
                    <button 
                        onClick={onCommit} 
                        disabled={isCommitting || !canCommit} 
                        className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-indigo-900/40 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95 border border-indigo-400/20"
                    >
                        {isCommitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                        {isCommitting ? 'Saving Artifact' : 'Commit Changes'}
                    </button>
                </div>
            </div>

            {showHelp && (
                <div className="border-t border-white/5 bg-slate-950/95 px-8 py-4">
                    <div className="w-full max-w-2xl rounded-2xl border border-indigo-400/40 bg-slate-950/90 backdrop-blur-xl shadow-2xl p-5 space-y-3 ring-1 ring-black/40">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-300">Editor Controls</h4>
                    <div className="text-[11px] leading-5 text-slate-200 space-y-2">
                        <p><span className="font-black text-slate-400">Pan:</span> `Space` + drag, `W/A/S/D`, arrows</p>
                        <p><span className="font-black text-slate-400">Zoom:</span> Mouse wheel, `Ctrl/Cmd +` `+/-`, `Ctrl/Cmd + 0`, `Ctrl/Cmd + 1`</p>
                        <p><span className="font-black text-slate-400">History:</span> `Ctrl/Cmd + Z` undo, `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` redo</p>
                        <p><span className="font-black text-slate-400">Transform:</span> `T` toggle image transform mode, drag to move image layer, `W/A/S/D` or arrows to nudge</p>
                        <p><span className="font-black text-slate-400">Brush:</span> `[` decrease, `]` increase (inpaint mode)</p>
                        <p><span className="font-black text-slate-400">Help:</span> `I` toggle, `Esc` close</p>
                    </div>
                </div>
                </div>
            )}
        </div>
    );
};
