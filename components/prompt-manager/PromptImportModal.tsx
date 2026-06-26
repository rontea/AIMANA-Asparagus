import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CheckCircle2, Copy, Database, FileJson, HelpCircle, Loader2, Plus, RefreshCw, Tag, Trash2, Type, Wand2, X } from 'lucide-react';
import { api } from '../../services/api';
import { autoCorrectPromptImportJsonInput, checkPromptImportJsonInput, resolvePromptImportVariables } from './utils';
import { readRegistryVariables, readSavedRegistryLists } from '../../utils/variableRegistryStorage';

interface ImportVariable {
  id: string;
  key: string;
  value: string;
}

interface SavedRegistryList {
  id: string;
  name: string;
  variables: ImportVariable[];
  createdAt: number;
  updatedAt: number;
}

interface PromptImportModalProps {
  isOpen: boolean;
  isImporting: boolean;
  onClose: () => void;
  onImport: (resolvedInput: string, sourceInput?: string) => Promise<void>;
}

const readStoredVariables = (): ImportVariable[] => {
  return readRegistryVariables().map((variable) => ({
    id: variable.id,
    key: variable.key,
    value: variable.value
  }));
};

const hasDuplicateRegistryKeys = (variables: ImportVariable[]) => {
  const keyCounts = variables.reduce<Record<string, number>>((counts, variable) => {
    const normalizedKey = variable.key.trim().toLowerCase();
    if (!normalizedKey) return counts;
    counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
    return counts;
  }, {});

  return Object.values(keyCounts).some((count) => count > 1);
};

const syncActiveRegistryIfValid = (variables: ImportVariable[]) => {
  if (hasDuplicateRegistryKeys(variables)) return;
  void api.settings.replaceActiveVariableRegistry(variables).catch(() => {
    // Keep the modal state local if the DB write fails.
  });
};

export const PromptImportModal: React.FC<PromptImportModalProps> = ({
  isOpen,
  isImporting,
  onClose,
  onImport
}) => {
  const [rawInput, setRawInput] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'json'>('json');
  const [error, setError] = useState<string | null>(null);
  const [variables, setVariables] = useState<ImportVariable[]>(() => readStoredVariables());
  const [savedLists, setSavedLists] = useState<SavedRegistryList[]>([]);
  const [selectedVaultListId, setSelectedVaultListId] = useState('');
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [copiedKeys, setCopiedKeys] = useState(false);
  const [showVariableHelp, setShowVariableHelp] = useState(false);
  const [showSampleFormat, setShowSampleFormat] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadSavedLists = async () => {
      setIsVaultLoading(true);
      try {
        const [remoteLists, remoteVariables] = await Promise.all([
          api.settings.listVariableRegistryLists() as Promise<SavedRegistryList[]>,
          api.settings.getActiveVariableRegistry() as Promise<ImportVariable[]>
        ]);
        if (!isMounted) return;
        const sorted = [...remoteLists].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setSavedLists(sorted);
        setVariables(remoteVariables);
        setSelectedVaultListId((current) => current || sorted[0]?.id || '');
      } catch {
        if (!isMounted) return;
        const fallbackLists = readSavedRegistryLists();
        setSavedLists(fallbackLists);
        setSelectedVaultListId((current) => current || fallbackLists[0]?.id || '');
      } finally {
        if (isMounted) {
          setIsVaultLoading(false);
        }
      }
    };

    void loadSavedLists();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const TEXT_SAMPLE = 'Hero Shot | Cinematic portrait for {{ name }} in warm sunrise light\nNeon Street | Cyberpunk skyline for {{ name }} with reflective rain streets\nStudio product shot for {{ name }} with dramatic edge lighting';
  const JSON_SAMPLE = '[\n  {\n    "title": "Hero Shot",\n    "prompt": "Cinematic portrait for {{ name }} in warm sunrise light"\n  },\n  {\n    "title": "Neon Street",\n    "prompt": "Cyberpunk skyline for {{ name }} with reflective rain streets"\n  }\n]';
  const variableKeyCounts = variables.reduce<Record<string, number>>((counts, variable) => {
    const normalizedKey = variable.key.trim().toLowerCase();
    if (!normalizedKey) return counts;
    counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
    return counts;
  }, {});
  const duplicateVariableKeys = new Set(
    Object.entries(variableKeyCounts)
      .filter(([, count]) => count > 1)
      .map(([key]) => key)
  );
  const hasDuplicateVariables = duplicateVariableKeys.size > 0;
  const jsonCheck = useMemo(() => {
    if (inputMode !== 'json') return null;
    return checkPromptImportJsonInput(resolvePromptImportVariables(rawInput, variables));
  }, [inputMode, rawInput, variables]);
  const isJsonImportBlocked = inputMode === 'json' && (!jsonCheck || !jsonCheck.ok);

  useEffect(() => {
    if (!hasDuplicateVariables && error === 'Duplicate variable keys detected. Rename the red entries before importing drafts.') {
      setError(null);
    }
  }, [error, hasDuplicateVariables]);

  if (!isOpen) return null;

  const handleClose = () => {
    setRawInput('');
    setError(null);
    setCopiedKeys(false);
    setShowVariableHelp(false);
    setShowSampleFormat(true);
    onClose();
  };

  const handleAddVariable = () => {
    setVariables((previous) => {
      const next = [
        ...previous,
        {
          id: Math.random().toString(36).slice(2, 10),
          key: '',
          value: ''
        }
      ];
      syncActiveRegistryIfValid(next);
      return next;
    });
  };

  const handleUpdateVariable = (id: string, updates: Partial<ImportVariable>) => {
    setVariables((previous) => {
      const next = previous.map((variable) => (
        variable.id === id ? { ...variable, ...updates } : variable
      ));
      syncActiveRegistryIfValid(next);
      return next;
    });
  };

  const handleRemoveVariable = (id: string) => {
    setVariables((previous) => {
      const next = previous.filter((variable) => variable.id !== id);
      syncActiveRegistryIfValid(next);
      return next;
    });
  };

  const handleCopyKeys = async () => {
    const keys = variables
      .filter((variable) => variable.key.trim())
      .map((variable) => `{{ ${variable.key.trim()} }}`)
      .join(' ');

    if (!keys) return;

    await navigator.clipboard.writeText(keys);
    setCopiedKeys(true);
    window.setTimeout(() => setCopiedKeys(false), 2000);
  };

  const handleAutoCorrectJson = () => {
    const result = autoCorrectPromptImportJsonInput(rawInput);
    if (result.changed) {
      setRawInput(result.corrected);
      setError(result.check.ok ? null : result.check.message);
      return;
    }
    setError(result.check.ok ? null : 'No automatic JSON corrections were found.');
  };

  const handleImport = async () => {
    if (hasDuplicateVariables) {
      setError('Duplicate variable keys detected. Rename the red entries before importing drafts.');
      return;
    }

    try {
      setError(null);
      const resolvedInput = resolvePromptImportVariables(rawInput, variables);
      if (inputMode === 'json') {
        const nextJsonCheck = checkPromptImportJsonInput(resolvedInput);
        if (!nextJsonCheck.ok) {
          setError(nextJsonCheck.message);
          return;
        }
      }
      await onImport(resolvedInput, rawInput);
      handleClose();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.');
    }
  };

  const handleLoadActiveRegistry = () => {
    setVariables(readStoredVariables());
  };

  const handleLoadVaultRegistry = () => {
    const selected = savedLists.find((entry) => entry.id === selectedVaultListId);
    if (!selected) return;
    setVariables(selected.variables.map((variable) => ({
      id: variable.id || Math.random().toString(36).slice(2, 10),
      key: variable.key,
      value: variable.value
    })));
  };

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-[58rem] flex-col overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#050b18] shadow-[0_24px_80px_rgba(2,6,23,0.62)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.08),transparent_40%)]" />

        <div className="relative flex items-center justify-between border-b border-slate-800/80 px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-violet-300">
              <FileJson size={12} />
              Bulk Import
            </div>
            <h2 className="mt-2 text-xl font-black text-white">Import Prompt Drafts</h2>
          </div>
          <button onClick={handleClose} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-900/70 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-400">
            Paste a JSON array like <code className="text-violet-300">[{`{"title":"Campaign A","prompt":"..."}`}]</code> or use text lines like <code className="text-violet-300">Title | Prompt content</code> for a quick import.
          </p>

          <div className="mt-5 space-y-4 rounded-[1.5rem] border border-slate-800/80 bg-slate-950/50 p-5">
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex gap-1 shadow-inner">
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${inputMode === 'text' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Type size={14} /> Text Manifest
              </button>
              <button
                type="button"
                onClick={() => setInputMode('json')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${inputMode === 'json' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <FileJson size={14} /> JSON Manifest
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {inputMode === 'text' ? 'Text Manifest' : 'Structured JSON Manifest'}
                </label>
                <div className="flex items-center gap-2">
                  {inputMode === 'json' && (
                    <button
                      type="button"
                      onClick={handleAutoCorrectJson}
                      disabled={!rawInput.trim()}
                      className="text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 transition-colors text-slate-500 hover:text-emerald-300 disabled:opacity-40"
                    >
                      <Wand2 size={10} /> Auto Correct
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const sample = inputMode === 'text' ? TEXT_SAMPLE : JSON_SAMPLE;
                      await navigator.clipboard.writeText(sample);
                      setCopiedKeys(false);
                    }}
                    className="text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 transition-colors text-slate-500 hover:text-indigo-300"
                  >
                    <Copy size={10} /> Copy Sample
                  </button>
                </div>
              </div>

              <textarea
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder={inputMode === 'text'
                  ? 'Hero Shot | Cinematic portrait for {{ name }} in warm sunrise light'
                  : '[{"title":"Hero shot","prompt":"Cinematic portrait for {{ name }} in warm sunrise light"}]'}
                className="min-h-[360px] w-full rounded-[1.5rem] border border-slate-800 bg-black/40 p-4 font-mono text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/50"
              />

              {inputMode === 'json' && jsonCheck && (
                <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                  jsonCheck.ok
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                }`}>
                  <div className="mt-0.5 shrink-0">
                    {jsonCheck.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em]">
                      {jsonCheck.ok ? 'JSON Valid' : 'JSON Check'}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">{jsonCheck.message}</p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                    Example {inputMode === 'text' ? 'Text' : 'JSON'} Format
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSampleFormat((current) => !current)}
                    className="text-[9px] font-black uppercase tracking-tighter text-slate-400 transition-colors hover:text-indigo-200"
                  >
                    {showSampleFormat ? 'Hide Sample' : 'Expand Sample'}
                  </button>
                </div>
                {showSampleFormat && (
                  <>
                    <pre className="mt-3 text-[9px] font-mono text-slate-300 bg-black/40 p-3 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {inputMode === 'text' ? TEXT_SAMPLE : JSON_SAMPLE}
                    </pre>
                    {inputMode === 'text' && (
                      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                        Each non-empty line can be either a prompt only, or a titled entry using <code className="text-violet-300">title | prompt</code>, <code className="text-violet-300">title :: prompt</code>, or tab-separated values.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4 rounded-[1.5rem] border border-slate-800/80 bg-slate-950/50 p-5">
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-300">
                  <Tag size={12} />
                  Neural Variable Registry
                </label>
                <div className="flex items-center gap-2">
                  <Link
                    to="/variable-registry"
                    onClick={handleClose}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
                  >
                    Open Page
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowVariableHelp((current) => !current)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors ${showVariableHelp ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                >
                  <HelpCircle size={11} />
                  {showVariableHelp ? 'Hide Help' : 'How To Use'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyKeys}
                  disabled={!variables.some((variable) => variable.key.trim())}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${copiedKeys ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-600 hover:text-white disabled:opacity-40'}`}
                >
                  {copiedKeys ? <Check size={11} /> : <Copy size={11} />}
                  {copiedKeys ? 'Copied' : 'Copy Keys'}
                </button>
                <button
                  type="button"
                  onClick={handleAddVariable}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-indigo-300 transition-colors hover:bg-indigo-600 hover:text-white"
                >
                  <Plus size={11} />
                  Add
                </button>
              </div>
            </div>

            {showVariableHelp && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-[11px] leading-relaxed text-slate-300">
                Use placeholders like <code className="text-indigo-200">{'{{ name }}'}</code> in your import text or JSON prompts.
                Values from the registry below will be substituted before the drafts are imported.
              </div>
            )}

            <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-black/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Load Registry Source
                  </div>
                  <p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-slate-500">
                    Pull the current active registry back into this modal, or preview a saved vault list here without replacing the active registry.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                <button
                  type="button"
                  onClick={handleLoadActiveRegistry}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-300 transition-colors hover:bg-indigo-600 hover:text-white md:w-auto"
                >
                  <RefreshCw size={11} />
                  Load Active Registry
                </button>
                <div className="inline-flex w-full items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
                  <Database size={12} className="shrink-0 text-emerald-300" />
                  <select
                    value={selectedVaultListId}
                    onChange={(event) => setSelectedVaultListId(event.target.value)}
                    disabled={isVaultLoading || savedLists.length === 0}
                    className="w-full bg-transparent text-[10px] font-black uppercase tracking-widest text-emerald-200 outline-none disabled:opacity-50"
                  >
                    <option value="">{isVaultLoading ? 'Loading vault...' : 'Select vault list'}</option>
                    {savedLists.map((entry) => (
                      <option key={entry.id} value={entry.id} className="bg-slate-900 text-white">
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleLoadVaultRegistry}
                  disabled={!selectedVaultListId}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-40 md:w-auto"
                >
                  <Database size={11} />
                  Load Vault Only
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {variables.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-5 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                  No variables defined
                </div>
              ) : (
                variables.map((variable) => (
                  <div key={variable.id} className="flex gap-2">
                    <div className="flex-1">
                      {duplicateVariableKeys.has(variable.key.trim().toLowerCase()) && (
                        <p className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.14em] text-red-300">
                          Duplicate key
                        </p>
                      )}
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono ${duplicateVariableKeys.has(variable.key.trim().toLowerCase()) ? 'text-red-300/80' : 'text-indigo-500/60'}`}>{'{{'}</span>
                        <input
                          type="text"
                          value={variable.key}
                          onChange={(event) => handleUpdateVariable(variable.id, { key: event.target.value.toLowerCase().replace(/\s/g, '_') })}
                          placeholder="key"
                          className={`w-full rounded-xl border bg-black/40 py-2 pl-8 pr-8 text-[10px] font-mono outline-none transition-colors ${duplicateVariableKeys.has(variable.key.trim().toLowerCase()) ? 'border-red-500/60 text-red-200 focus:border-red-400' : 'border-slate-800 text-indigo-300 focus:border-indigo-500'}`}
                        />
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono ${duplicateVariableKeys.has(variable.key.trim().toLowerCase()) ? 'text-red-300/80' : 'text-indigo-500/60'}`}>{'}}'}</span>
                      </div>
                    </div>
                    <div className="flex-[2]">
                      <input
                        type="text"
                        value={variable.value}
                        onChange={(event) => handleUpdateVariable(variable.id, { value: event.target.value })}
                        placeholder="replacement value..."
                        className={`w-full rounded-xl border bg-black/40 px-4 py-2 text-[10px] outline-none transition-colors placeholder:text-slate-700 ${duplicateVariableKeys.has(variable.key.trim().toLowerCase()) ? 'border-red-500/60 text-red-100 focus:border-red-400' : 'border-slate-800 text-white focus:border-indigo-500'}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVariable(variable.id)}
                      className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      title="Remove variable"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Placeholders like {'{{ key }}'} will be resolved during import.
            </p>
            {hasDuplicateVariables && (
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-300">
                Duplicate registry keys must be fixed before drafts can be imported.
              </p>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="relative flex justify-end gap-3 border-t border-slate-800/80 px-6 py-5">
          <button
            onClick={handleClose}
            className="rounded-2xl px-4 py-3 text-sm font-black text-slate-400 transition-colors hover:bg-slate-900/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || !rawInput.trim() || hasDuplicateVariables || isJsonImportBlocked}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-500/40 bg-violet-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isImporting && <Loader2 size={16} className="animate-spin" />}
            Import Drafts
          </button>
        </div>
      </div>
    </div>
  );
};
