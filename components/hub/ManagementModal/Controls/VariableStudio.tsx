import React, { useRef, useState } from 'react';
import { Sliders, Download, UploadCloud, FileJson, Code2, Layout, Clipboard, Check, AlertCircle } from 'lucide-react';
import { ParameterConfigRow } from './ParameterConfigRow';
import { LibraryPopover } from './LibraryPopover';
import { EngineFeatures } from '../../../../hooks/useEngineManagement';

interface VariableStudioProps {
    uiSchema: any[];
    onAddParam: (blueprintKey: string) => void;
    onUpdateParam: (index: number, updates: any) => void;
    onRemoveParam: (index: number) => void;
    onReplaceSchema: (newSchema: any[]) => void;
    onExport: () => void;
    onImport: (file: File) => void;
    category?: string;
    features: EngineFeatures;
}

export const VariableStudio: React.FC<VariableStudioProps> = ({ 
    uiSchema, onAddParam, onUpdateParam, onRemoveParam, onReplaceSchema, onExport, onImport, category, features
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isJsonMode, setIsJsonMode] = useState(false);
    const [jsonInput, setJsonInput] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [showCopyFeedback, setShowCopyFeedback] = useState(false);

    const handleOpenJsonEditor = () => {
        setJsonInput(JSON.stringify(uiSchema, null, 2));
        setJsonError(null);
        setIsJsonMode(true);
    };

    const handleSaveJson = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            if (!Array.isArray(parsed)) throw new Error("Schema must be an array of control objects.");
            onReplaceSchema(parsed);
            setIsJsonMode(false);
            setJsonError(null);
        } catch (e: any) {
            setJsonError(e.message || "Invalid JSON syntax.");
        }
    };

    const handleCopyAll = () => {
        navigator.clipboard.writeText(JSON.stringify(uiSchema, null, 2));
        setShowCopyFeedback(true);
        setTimeout(() => setShowCopyFeedback(false), 2000);
    };

    return (
        <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
                             <Sliders size={18} />
                        </div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">
                            Model-Specific Variables
                        </h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium mt-2 max-w-lg">
                        Bind individual UI controls to custom logic keys. Use Source mode to quickly paste variables between endpoints.
                    </p>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner mr-2">
                        <button 
                            type="button"
                            onClick={() => setIsJsonMode(false)}
                            className={`p-1.5 rounded-lg transition-all ${!isJsonMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
                            title="Layout Designer"
                        >
                            <Layout size={16} />
                        </button>
                        <button 
                            type="button"
                            onClick={handleOpenJsonEditor}
                            className={`p-1.5 rounded-lg transition-all ${isJsonMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}
                            title="Source Editor (JSON)"
                        >
                            <Code2 size={16} />
                        </button>
                    </div>

                    <div className="flex items-center bg-slate-900 rounded-2xl p-1.5 border border-slate-800 shadow-inner group">
                        <button 
                            type="button"
                            onClick={handleCopyAll}
                            className={`p-2 rounded-xl transition-all ${showCopyFeedback ? 'text-emerald-400' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                            title="Copy All to Clipboard"
                        >
                            {showCopyFeedback ? <Check size={18} /> : <Clipboard size={18} />}
                        </button>
                        <div className="w-px h-4 bg-slate-800 mx-1" />
                        <button 
                            type="button"
                            onClick={onExport}
                            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            title="Download Blueprint (JSON)"
                        >
                            <Download size={18} />
                        </button>
                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            title="Upload Blueprint (JSON)"
                        >
                            <UploadCloud size={18} />
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".json"
                            onChange={(e) => {
                                if (e.target.files?.[0]) {
                                    onImport(e.target.files[0]);
                                    e.target.value = ''; 
                                }
                            }}
                        />
                    </div>
                    
                    {!isJsonMode && (
                        <>
                            <div className="h-8 w-px bg-slate-800 mx-2" />
                            <LibraryPopover uiSchema={uiSchema} onAddParam={onAddParam} category={category} features={features} />
                        </>
                    )}
                </div>
            </div>
            
            {isJsonMode ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="relative">
                        <textarea 
                            value={jsonInput}
                            onChange={(e) => setJsonInput(e.target.value)}
                            spellCheck={false}
                            className="w-full h-[400px] bg-slate-950 border border-slate-800 rounded-[2rem] p-6 font-mono text-[11px] text-emerald-400 outline-none focus:border-indigo-500/50 shadow-inner transition-all resize-none custom-scrollbar"
                            placeholder='[ { "key": "param", "label": "My Param", "type": "slider", ... } ]'
                        />
                    </div>
                    
                    {jsonError && (
                        <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-900/50 rounded-2xl text-red-400 text-xs animate-in shake">
                            <AlertCircle size={16} />
                            <span className="font-medium">{jsonError}</span>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => setIsJsonMode(false)}
                            className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                        >
                            Cancel Changes
                        </button>
                        <button 
                            type="button"
                            onClick={handleSaveJson}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"
                        >
                            Apply Schema to Engine
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {uiSchema.map((param, i) => (
                        <ParameterConfigRow 
                            key={`${param.key}-${i}`}
                            param={param}
                            index={i}
                            onUpdate={onUpdateParam}
                            onRemove={onRemoveParam}
                        />
                    ))}
                    {uiSchema.length === 0 && (
                        <div className="py-20 text-center bg-slate-900/20 border border-dashed border-slate-800 rounded-[3rem] opacity-50 flex flex-col items-center animate-in fade-in">
                            <div className="p-8 bg-slate-900 rounded-[2rem] mb-6 border border-slate-800">
                                <FileJson size={48} className="text-slate-700" />
                            </div>
                            <h5 className="text-xs uppercase font-black tracking-[0.2em] text-slate-500">Atomic Variable Map Empty</h5>
                            <p className="text-[9px] text-slate-600 font-bold uppercase mt-3">Inject parameters from the library or upload a blueprint JSON</p>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
