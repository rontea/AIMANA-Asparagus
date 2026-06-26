import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, MessageSquarePlus, FileJson, Loader2, Check, AlertCircle, Bot, ClipboardPaste, Upload, AlertTriangle, HelpCircle, Copy, Layers, Sparkles, Package, ChevronDown } from 'lucide-react';
import { api } from '../../services/api';
import { ItemWithCurrentRevision } from '../../types';
import { loadDynamicRegistry, ModelOption } from './lab/ModelSelector/registry/index';
import { DEFAULT_GOOGLE_TEXT_MODEL } from '../../utils/googleModelIds';

interface ImportPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  existingItems: ItemWithCurrentRevision[];
  onComplete: (result: { total: number; created: number; skipped: number; inputDuplicates?: number }) => void;
}

interface PromptCandidate {
    title: string;
    prompt: string;
    label?: string;
    note?: string;
    isDuplicate?: boolean;
    duplicateReason?: 'existing' | 'input' | 'both';
}

type ImportMode = 'file' | 'paste' | 'lines';

const JSON_SAMPLE = `[
  {
    "title": "Neon Cyberpunk City",
    "prompt": "A sprawling metropolis at night, rain-slicked streets, high-detail volumetric lighting.",
    "label": "Environment",
    "notes": "Key reference for the Level 1 background."
  },
  {
    "title": "Corporate Icon Set",
    "prompt": "A set of 12 minimalist flat icons for a banking app, monochrome blue palette.",
    "label": "UI Design"
  }
]`;
const CSV_SAMPLE = `title,prompt,label,notes
"Neon Cyberpunk City","A sprawling metropolis at night, rain-slicked streets, high-detail volumetric lighting.","Environment","Key reference for Level 1 background."
"Corporate Icon Set","A set of 12 minimalist flat icons for a banking app, monochrome blue palette.","UI Design","Keep style minimal and geometric."`;
const LINES_SAMPLE = `Neon Cyberpunk City | A sprawling metropolis at night, rain-slicked streets | Environment | Key reference for Level 1 background.
Corporate Icon Set | A set of 12 minimalist flat icons for a banking app, monochrome blue palette | UI Design
A cinematic overcast skyline with flying vehicles`;
const MAX_TITLE_LEN = 160;
const MAX_PROMPT_LEN = 8000;
const MAX_LABEL_LEN = 80;
const MAX_NOTE_LEN = 4000;

const getTierShortLabel = (category: string) => {
    switch(category) {
        case 'Language': return 'Semantic';
        case 'Visual': return 'Visual';
        case 'Motion': return 'Temporal';
        case 'Audio': return 'Acoustic';
        case 'Static': return 'Static';
        default: return 'Neural';
    }
};

const ImportPromptModal: React.FC<ImportPromptModalProps> = ({ isOpen, onClose, projectId, existingItems, onComplete }) => {
  const [mode, setMode] = useState<ImportMode>('file');
  const [fileHint, setFileHint] = useState<'json' | 'csv'>('json');
  const [pastedText, setPastedText] = useState('');
  const [lineText, setLineText] = useState('');
  const [candidates, setCandidates] = useState<PromptCandidate[]>([]);
  const [allModels, setAllModels] = useState<ModelOption[]>([]);
  const [selectedEngine, setSelectedEngine] = useState(DEFAULT_GOOGLE_TEXT_MODEL);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRegistryLoading, setIsRegistryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [copiedSample, setCopiedSample] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Neural Registry from Hub
  useEffect(() => {
    if (isOpen) {
      setIsRegistryLoading(true);
      loadDynamicRegistry().then(data => {
          setAllModels(data);
          setIsRegistryLoading(false);
          const preferredModel = data.find(m => m.id === DEFAULT_GOOGLE_TEXT_MODEL)
              || data.find(m => !m.isPaid && m.category !== 'Static')
              || data.find(m => m.category !== 'Static');
          if (preferredModel) {
              setSelectedEngine(preferredModel.id as string);
          }
      }).catch(() => {
          setIsRegistryLoading(false);
      });
    }
  }, [isOpen]);

  const { nativeModels, forgedModels, staticModels } = useMemo(() => {
    return {
        nativeModels: allModels.filter(m => m.isSystem && m.category !== 'Static'),
        forgedModels: allModels.filter(m => !m.isSystem && m.category !== 'Static' && m.isCustom),
        staticModels: allModels.filter(m => m.category === 'Static')
    };
  }, [allModels]);

  const activeModel = allModels.find(m => m.id === selectedEngine);

  if (!isOpen) return null;

  const parseCsvRows = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                value += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            row.push(value);
            value = '';
            continue;
        }

        if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && next === '\n') i++;
            row.push(value);
            if (row.some(cell => cell.trim().length > 0)) rows.push(row);
            row = [];
            value = '';
            continue;
        }

        value += ch;
    }

    row.push(value);
    if (row.some(cell => cell.trim().length > 0)) rows.push(row);
    return rows;
  };

  const parseCsvToData = (text: string) => {
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];

    const first = rows[0].map(c => c.trim().toLowerCase());
    const hasHeader = first.includes('title') || first.includes('prompt');
    const sourceRows = hasHeader ? rows.slice(1) : rows;

    return sourceRows.map((r, idx) => {
        const title = (r[0] || '').trim() || `CSV Prompt ${idx + 1}`;
        const prompt = (r[1] || '').trim();
        const label = (r[2] || '').trim();
        const notes = (r[3] || '').trim();
        return { title, prompt, label, notes };
    });
  };

  const parseLinesToData = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.map((line, idx) => {
        if (line.includes('|')) {
            const [title, prompt, label, notes] = line.split('|').map(p => p.trim());
            return {
                title: title || `Prompt ${idx + 1}`,
                prompt: prompt || '',
                label: label || '',
                notes: notes || ''
            };
        }
        if (line.includes('::')) {
            const [title, prompt] = line.split('::').map(p => p.trim());
            return { title: title || `Prompt ${idx + 1}`, prompt: prompt || '', label: '', notes: '' };
        }
        return { title: `Prompt ${idx + 1}`, prompt: line, label: '', notes: '' };
    });
  };

  const processData = (data: any) => {
    if (!Array.isArray(data)) {
        throw new Error("JSON must be an array of objects.");
    }

    const existingTitles = new Set(
        existingItems
            .map(i => i.currentRevision?.title)
            .filter((title): title is string => typeof title === 'string')
            .map(title => title.toLowerCase().trim())
    );

    const valid: PromptCandidate[] = [];
    const seenTitles = new Set<string>();
    const issues: string[] = [];

    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const rowLabel = `Row ${i + 1}`;

        if (!item || typeof item !== 'object') {
            issues.push(`${rowLabel}: entry must be an object`);
            continue;
        }

        if (typeof item.title !== 'string' || typeof item.prompt !== 'string') {
            issues.push(`${rowLabel}: title and prompt must be strings`);
            continue;
        }

        const title = item.title.trim();
        const prompt = item.prompt.trim();
        if (!title || !prompt) {
            issues.push(`${rowLabel}: title and prompt are required`);
            continue;
        }
        if (title.length > MAX_TITLE_LEN) {
            issues.push(`${rowLabel}: title exceeds ${MAX_TITLE_LEN} characters`);
            continue;
        }
        if (prompt.length > MAX_PROMPT_LEN) {
            issues.push(`${rowLabel}: prompt exceeds ${MAX_PROMPT_LEN} characters`);
            continue;
        }

        let label = '';
        if (item.label !== undefined && item.label !== null) {
            if (typeof item.label !== 'string') {
                issues.push(`${rowLabel}: label must be a string`);
                continue;
            }
            label = item.label.trim();
            if (label.length > MAX_LABEL_LEN) {
                issues.push(`${rowLabel}: label exceeds ${MAX_LABEL_LEN} characters`);
                continue;
            }
        }

        const noteValue = item.notes ?? item.note;
        let note = '';
        if (noteValue !== undefined && noteValue !== null) {
            if (typeof noteValue !== 'string') {
                issues.push(`${rowLabel}: note must be a string`);
                continue;
            }
            note = noteValue.trim();
            if (note.length > MAX_NOTE_LEN) {
                issues.push(`${rowLabel}: note exceeds ${MAX_NOTE_LEN} characters`);
                continue;
            }
        }

        const titleNormalized = title.toLowerCase();
        const duplicateExisting = existingTitles.has(titleNormalized);
        const duplicateInput = seenTitles.has(titleNormalized);
        if (!duplicateInput) seenTitles.add(titleNormalized);

        let duplicateReason: PromptCandidate['duplicateReason'];
        if (duplicateExisting && duplicateInput) duplicateReason = 'both';
        else if (duplicateExisting) duplicateReason = 'existing';
        else if (duplicateInput) duplicateReason = 'input';

        valid.push({
            title,
            prompt,
            label,
            note,
            isDuplicate: !!duplicateReason,
            duplicateReason
        });
    }

    if (valid.length === 0) {
        throw new Error(issues[0] || "No valid items found. Each item needs a string 'title' and 'prompt'.");
    }

    setCandidates(valid);
    if (issues.length > 0) {
        setError(`Loaded ${valid.length} valid entries. Skipped ${issues.length} invalid row(s).`);
    } else {
        setError(null);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
        const text = await file.text();
        const lower = file.name.toLowerCase();
        let data: any[] = [];

        if (lower.endsWith('.csv')) {
            data = parseCsvToData(text);
            setFileHint('csv');
        } else {
            data = JSON.parse(text);
            setFileHint('json');
        }
        processData(data);
    } catch (err: any) {
        setError(err.message || "Failed to parse JSON file.");
        setCandidates([]);
    }
  };

  const handlePasteSubmit = () => {
    setError(null);
    if (!pastedText.trim()) {
        setError("Please paste some JSON data first.");
        return;
    }
    try {
        const data = JSON.parse(pastedText);
        processData(data);
    } catch (err: any) {
        setError("Invalid JSON format. Please check your syntax.");
        setCandidates([]);
    }
  };

  const handleLineSubmit = () => {
    setError(null);
    if (!lineText.trim()) {
        setError("Please paste one or more lines first.");
        return;
    }
    try {
        const data = parseLinesToData(lineText);
        processData(data);
    } catch (err: any) {
        setError(err.message || "Failed to parse lines.");
        setCandidates([]);
    }
  };

  const handleCopySample = () => {
    navigator.clipboard.writeText(JSON_SAMPLE);
    setCopiedSample(true);
    setTimeout(() => setCopiedSample(false), 2000);
  };

  const handleSave = async () => {
    if (candidates.length === 0) return;
    setIsProcessing(true);
    try {
        const result = await api.items.createFromPrompts(projectId, selectedEngine, candidates, skipDuplicates);
        if (result.created <= 0) {
            setError(`No drafts created. ${result.skipped} duplicate item(s) were skipped.`);
            return;
        }
        onComplete({
            total: candidates.length,
            created: result.created,
            skipped: result.skipped,
            inputDuplicates: result.inputDuplicates
        });
        onClose();
    } catch (err: any) {
        setError(err.message || "Failed to create items.");
    } finally {
        setIsProcessing(false);
    }
  };

  const resetModal = () => {
      setCandidates([]);
      setPastedText('');
      setLineText('');
      setError(null);
      setSkipDuplicates(true);
  };

  const duplicateCount = candidates.filter(c => c.isDuplicate).length;
  const existingDuplicateCount = candidates.filter(c => c.duplicateReason === 'existing' || c.duplicateReason === 'both').length;
  const inputDuplicateCount = candidates.filter(c => c.duplicateReason === 'input' || c.duplicateReason === 'both').length;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-800/30">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400"><MessageSquarePlus size={28} /></div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Import Prompts</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Bulk create items from metadata.</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl flex items-center gap-3 text-red-400 text-sm animate-in slide-in-from-top-2">
                        <AlertCircle size={18} /> {error}
                    </div>
                )}

                {candidates.length === 0 ? (
                    <div className="space-y-6">
                        <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
                            <button 
                                onClick={() => setMode('file')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${mode === 'file' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Upload size={14} /> Upload File
                            </button>
                            <button 
                                onClick={() => setMode('paste')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'paste' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <ClipboardPaste size={14} /> Paste JSON
                            </button>
                            <button 
                                onClick={() => setMode('lines')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'lines' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <MessageSquarePlus size={14} /> Quick Lines
                            </button>
                        </div>

                        {/* Sample Data Toggle */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Format Requirements</span>
                                <button 
                                    onClick={() => setShowSample(!showSample)}
                                    className={`text-[9px] font-black uppercase tracking-tighter flex items-center gap-1.5 transition-colors ${showSample ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-400'}`}
                                >
                                    <HelpCircle size={12} /> {showSample ? 'Hide Specification' : 'View JSON Schema'}
                                </button>
                            </div>

                            {showSample && (
                                <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileJson size={14} className="text-indigo-400" />
                                            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Valid JSON Structure</span>
                                        </div>
                                        <button 
                                            onClick={handleCopySample}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${
                                                copiedSample 
                                                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400' 
                                                : 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'
                                            }`}
                                        >
                                            {copiedSample ? <Check size={12} /> : <Copy size={12} />}
                                            {copiedSample ? 'Copied' : 'Copy Sample'}
                                        </button>
                                    </div>
                                    {mode === 'paste' && (
                                        <pre className="text-[10px] font-mono text-slate-400 bg-black/40 p-4 rounded-xl overflow-x-auto leading-relaxed border border-white/5">
                                            {JSON_SAMPLE}
                                        </pre>
                                    )}
                                    {mode === 'file' && (
                                        <pre className="text-[10px] font-mono text-slate-400 bg-black/40 p-4 rounded-xl overflow-x-auto leading-relaxed border border-white/5">
                                            {fileHint === 'csv' ? CSV_SAMPLE : JSON_SAMPLE}
                                        </pre>
                                    )}
                                    {mode === 'lines' && (
                                        <pre className="text-[10px] font-mono text-slate-400 bg-black/40 p-4 rounded-xl overflow-x-auto leading-relaxed border border-white/5">
                                            {LINES_SAMPLE}
                                        </pre>
                                    )}
                                    <p className="text-[9px] text-slate-600 italic leading-relaxed">
                                        Note: required fields are <strong>title</strong> and <strong>prompt</strong>. Quick Lines format: <strong>title | prompt | label | note</strong>.
                                    </p>
                                </div>
                            )}
                        </div>

                        {mode === 'file' ? (
                            <div 
                                className="border-2 border-dashed border-slate-700 rounded-[2rem] p-12 text-center transition-all hover:border-indigo-500 hover:bg-indigo-500/5 group cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <FileJson size={48} className="text-slate-600 mx-auto mb-4 group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
                                <h3 className="text-lg font-bold text-white mb-2">Select JSON Data</h3>
                                <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">Upload a prompt manifest as JSON or CSV.</p>
                                <button className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-2.5 rounded-xl font-bold text-sm border border-slate-700 shadow-lg">Browse Files</button>
                                <input type="file" ref={fileInputRef} accept=".json,.csv,text/csv,application/json" className="hidden" onChange={e => {
                                    if (e.target.files?.[0]) handleFile(e.target.files[0]);
                                    e.target.value = '';
                                }} />
                            </div>
                        ) : mode === 'paste' ? (
                            <div className="space-y-4">
                                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner focus-within:border-indigo-500/50 transition-colors">
                                    <textarea 
                                        value={pastedText}
                                        onChange={(e) => setPastedText(e.target.value)}
                                        className="w-full h-64 bg-transparent p-6 text-sm font-mono text-indigo-300 focus:outline-none resize-none placeholder:text-slate-800"
                                        placeholder='Paste your JSON array here...'
                                    />
                                </div>
                                <button 
                                    onClick={handlePasteSubmit}
                                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
                                >
                                    <Check size={18} className="text-indigo-400" /> Validate JSON
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner focus-within:border-indigo-500/50 transition-colors">
                                    <textarea 
                                        value={lineText}
                                        onChange={(e) => setLineText(e.target.value)}
                                        className="w-full h-64 bg-transparent p-6 text-sm font-mono text-indigo-300 focus:outline-none resize-none placeholder:text-slate-800"
                                        placeholder='One prompt per line, or: title | prompt | label | note'
                                    />
                                </div>
                                <button 
                                    onClick={handleLineSubmit}
                                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
                                >
                                    <Check size={18} className="text-indigo-400" /> Validate Lines
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4 animate-in fade-in">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Found {candidates.length} Items</span>
                            <button onClick={resetModal} className="text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300 tracking-tighter underline">Change Input</button>
                        </div>

                        {duplicateCount > 0 && (
                            <div className="p-4 bg-amber-900/20 border border-amber-900/50 rounded-xl flex items-start gap-3 text-amber-400 text-sm animate-in slide-in-from-top-2">
                                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Duplicate Warning</p>
                                    <p className="text-xs opacity-80 mt-0.5">
                                        {duplicateCount} duplicate entries detected ({existingDuplicateCount} already in project, {inputDuplicateCount} duplicated inside this import).
                                    </p>
                                    <label className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold text-amber-300">
                                        <input
                                            type="checkbox"
                                            checked={skipDuplicates}
                                            onChange={(e) => setSkipDuplicates(e.target.checked)}
                                            className="accent-amber-500"
                                        />
                                        Skip duplicates during import
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
                            <table className="w-full text-left text-[11px]">
                                <thead className="bg-slate-900 text-slate-500 font-black uppercase tracking-tighter">
                                    <tr>
                                        <th className="p-3">Title</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Label</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {candidates.slice(0, 10).map((c, i) => (
                                        <tr key={i} className={`text-slate-300 ${c.isDuplicate ? 'bg-amber-900/5' : ''}`}>
                                            <td className="p-3 font-bold text-slate-200">{c.title}</td>
                                            <td className="p-3">
                                                {c.isDuplicate ? (
                                                    <span className="text-[8px] font-black uppercase bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded flex items-center gap-1 w-fit">
                                                        <AlertTriangle size={8} />
                                                        {c.duplicateReason === 'input' ? 'Duplicate (Import)' : c.duplicateReason === 'existing' ? 'Duplicate (Project)' : 'Duplicate (Both)'}
                                                    </span>
                                                ) : (
                                                    <span className="text-[8px] font-black uppercase bg-emerald-500 text-slate-950 px-1.5 py-0.5 rounded w-fit">New Draft</span>
                                                )}
                                            </td>
                                            <td className="p-3"><span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">{c.label || 'None'}</span></td>
                                        </tr>
                                    ))}
                                    {candidates.length > 10 && (
                                        <tr><td colSpan={3} className="p-3 text-center text-slate-600 italic">... and {candidates.length - 10} more items</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative group w-full md:w-64">
                        <label className="absolute -top-2 left-3 bg-slate-900 px-1 text-[9px] font-black text-slate-500 uppercase tracking-widest z-10">Assign Engine</label>
                        <select 
                            value={selectedEngine} 
                            onChange={e => setSelectedEngine(e.target.value)}
                            disabled={isRegistryLoading}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-2.5 text-xs font-bold text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none appearance-none cursor-pointer transition-all"
                        >
                            {isRegistryLoading ? (
                                <option>Loading Hub Registry...</option>
                            ) : (
                                <>
                                    <option value="default-placeholder">Unassigned Endpoint</option>
                                    <optgroup label="Native AIMANA Infrastructure">
                                        {nativeModels.map(m => (
                                            <option key={m.id} value={m.id}>{m.label} ({getTierShortLabel(m.category)})</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="User Forged Checkpoints">
                                        {forgedModels.map(m => (
                                            <option key={m.id} value={m.id}>{m.label} ({getTierShortLabel(m.category)})</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Archival / Static Labels">
                                        {staticModels.map(m => (
                                            <option key={m.id} value={m.id}>{m.label} (Metadata Only)</option>
                                        ))}
                                    </optgroup>
                                </>
                            )}
                        </select>
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            {isRegistryLoading ? <Loader2 size={14} className="animate-spin text-slate-500" /> : <Bot size={14} className="text-indigo-400" />}
                        </div>
                        <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                    </div>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={onClose} className="flex-1 md:flex-none px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isProcessing || isRegistryLoading || candidates.length === 0}
                        className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18}/> Create Drafts</>}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ImportPromptModal;
