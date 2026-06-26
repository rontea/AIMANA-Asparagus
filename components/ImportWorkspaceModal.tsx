import React, { useState, useRef, useEffect } from 'react';
import { X, FileStack, Archive, Loader2, Check, FileUp, AlertTriangle, ChevronDown, CheckSquare, Square, Download } from 'lucide-react';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { api } from '../services/api';
import { ItemWithCurrentRevision, Project } from '../types';

type ResolutionStrategy = 'create' | 'merge' | 'skip' | 'override';
type Step = 'select' | 'analyze' | 'preview' | 'executing' | 'result';

interface ImportCandidate {
  id: string;
  metadata: any;
  status: 'new' | 'duplicate';
  existingId?: string;
  sizeFormatted: string;
  fileNameInZip: string;
  isSelected: boolean;
  mimeType: string;
  originalName: string;
  strategy: ResolutionStrategy;
}

interface ImportWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  existingItems: ItemWithCurrentRevision[];
  onImportComplete: () => void;
}

interface ImportFailure {
  title: string;
  strategy: ResolutionStrategy;
  reason: string;
}

interface ImportReport {
  selected: number;
  attempted: number;
  created: number;
  merged: number;
  overridden: number;
  skipped: number;
  failed: number;
  failures: ImportFailure[];
}

const MAX_ZIP_SIZE_BYTES = 250 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 8000;
const MAX_METADATA_ROWS = 2000;
const MAX_SINGLE_FILE_BYTES = 100 * 1024 * 1024;

const normalizeKey = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const formatBytes = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const sanitizeZipPath = (rawPath: string) => {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) return null;
  return normalized;
};

const normalizeStrategy = (status: 'new' | 'duplicate', strategy: ResolutionStrategy): ResolutionStrategy => {
  if (status === 'new' && (strategy === 'merge' || strategy === 'override')) return 'create';
  return strategy;
};

const ImportWorkspaceModal: React.FC<ImportWorkspaceModalProps> = ({
  isOpen,
  onClose,
  project,
  existingItems,
  onImportComplete
}) => {
  const [step, setStep] = useState<Step>('select');
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(event.target as Node)) {
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setCandidates([]);
      setZipInstance(null);
      setStatusText('');
      setError(null);
      setWarnings([]);
      setReport(null);
      setShowBulkMenu(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleZipFile = async (file: File) => {
    setStep('analyze');
    setStatusText('Unpacking archive...');
    setError(null);
    setWarnings([]);
    setReport(null);

    try {
      if (file.size > MAX_ZIP_SIZE_BYTES) {
        throw new Error(`Archive too large. Max allowed is ${formatBytes(MAX_ZIP_SIZE_BYTES)}.`);
      }

      const zip = await JSZip.loadAsync(file);
      const zipEntries = Object.keys(zip.files).length;
      if (zipEntries > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`Archive has too many entries (${zipEntries}). Max is ${MAX_ARCHIVE_ENTRIES}.`);
      }

      const metaFile = zip.file('metadata.json');
      if (!metaFile) throw new Error('Invalid archive: metadata.json missing.');

      const metadataRaw = JSON.parse(await metaFile.async('string'));
      if (!Array.isArray(metadataRaw)) throw new Error('Invalid metadata.json: expected JSON array.');
      if (metadataRaw.length > MAX_METADATA_ROWS) {
        throw new Error(`metadata.json has too many rows (${metadataRaw.length}). Max is ${MAX_METADATA_ROWS}.`);
      }

      const existingByTitle = new Set(
        existingItems.map(i => normalizeKey(i.currentRevision?.title)).filter(Boolean)
      );
      const existingByFilename = new Set(
        existingItems.map(i => normalizeKey(i.currentRevision?.originalFilename)).filter(Boolean)
      );

      const rowWarnings: string[] = [];
      const mappedCandidates: ImportCandidate[] = [];

      metadataRaw.forEach((meta, idx) => {
        const row = idx + 1;
        if (!meta || typeof meta !== 'object') {
          rowWarnings.push(`Row ${row}: invalid metadata object.`);
          return;
        }

        const title = typeof meta.title === 'string' ? meta.title.trim() : '';
        if (!title) {
          rowWarnings.push(`Row ${row}: missing title.`);
          return;
        }

        const originalName =
          typeof meta.originalFilename === 'string' && meta.originalFilename.trim()
            ? meta.originalFilename.trim()
            : `${title.replace(/[^a-z0-9]/gi, '_')}.bin`;

        const extension = originalName.includes('.') ? originalName.split('.').pop() || 'bin' : 'bin';
        const version = Number.isFinite(meta.version) ? Number(meta.version) : 1;
        const fallbackPath = `assets/${title.replace(/[^a-z0-9]/gi, '_')}_v${version}.${extension}`;
        const zipPathRaw =
          typeof meta.fileNameInZip === 'string' && meta.fileNameInZip.trim()
            ? meta.fileNameInZip.trim()
            : fallbackPath;

        const zipPath = sanitizeZipPath(zipPathRaw);
        if (!zipPath) {
          rowWarnings.push(`Row ${row}: invalid file path "${zipPathRaw}".`);
          return;
        }

        const duplicate =
          existingByTitle.has(normalizeKey(title)) || existingByFilename.has(normalizeKey(originalName));

        mappedCandidates.push({
          id: uuidv4(),
          metadata: meta,
          status: duplicate ? 'duplicate' : 'new',
          existingId: duplicate
            ? existingItems.find(
                i =>
                  normalizeKey(i.currentRevision?.title) === normalizeKey(title) ||
                  normalizeKey(i.currentRevision?.originalFilename) === normalizeKey(originalName)
              )?.id
            : undefined,
          sizeFormatted: formatBytes(Number(meta.size) || 0),
          fileNameInZip: zipPath,
          isSelected: true,
          mimeType: typeof meta.mimeType === 'string' ? meta.mimeType : 'application/octet-stream',
          originalName,
          strategy: duplicate ? 'merge' : 'create'
        });
      });

      if (mappedCandidates.length === 0) {
        throw new Error('No valid import entries found in metadata.json.');
      }

      setWarnings(rowWarnings);
      setCandidates(mappedCandidates);
      setZipInstance(zip);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to process ZIP file.');
      setStep('select');
    }
  };

  const applyBulkStrategy = (strategy: ResolutionStrategy) => {
    setCandidates(prev =>
      prev.map(c =>
        c.isSelected ? { ...c, strategy: normalizeStrategy(c.status, strategy) } : c
      )
    );
    setShowBulkMenu(false);
  };

  const toggleAllSelection = () => {
    const allSelected = candidates.every(c => c.isSelected);
    setCandidates(prev => prev.map(c => ({ ...c, isSelected: !allSelected })));
  };

  const executeImport = async () => {
    const selected = candidates.filter(c => c.isSelected);
    const activeOnes = selected.filter(c => c.strategy !== 'skip');

    if (activeOnes.length === 0) {
      setError('No importable rows selected. Choose rows and set strategy other than Skip.');
      return;
    }
    if (!zipInstance) {
      setError('Archive session expired. Please reload the ZIP file.');
      setStep('select');
      return;
    }

    setStep('executing');
    setError(null);
    const failures: ImportFailure[] = [];
    let created = 0;
    let merged = 0;
    let overridden = 0;

    for (const cand of activeOnes) {
      try {
        setStatusText(`Processing: ${cand.metadata.title || cand.originalName}...`);
        const directEntry = zipInstance.file(cand.fileNameInZip);
        const prefixedEntry =
          directEntry || (!cand.fileNameInZip.startsWith('assets/') ? zipInstance.file(`assets/${cand.fileNameInZip}`) : null);
        const entry = directEntry || prefixedEntry;

        if (!entry) {
          failures.push({ title: cand.metadata.title || cand.originalName, strategy: cand.strategy, reason: `Missing file: ${cand.fileNameInZip}` });
          continue;
        }

        const blob = await entry.async('blob');
        if (blob.size > MAX_SINGLE_FILE_BYTES) {
          failures.push({
            title: cand.metadata.title || cand.originalName,
            strategy: cand.strategy,
            reason: `File exceeds max size (${formatBytes(blob.size)} > ${formatBytes(MAX_SINGLE_FILE_BYTES)})`
          });
          continue;
        }

        const fileToUpload = new window.File([blob], cand.originalName, { type: cand.mimeType });
        const aiParameters =
          typeof cand.metadata.aiParameters === 'string'
            ? cand.metadata.aiParameters
            : JSON.stringify(cand.metadata.aiParameters || '');

        const metadataPayload = {
          id: typeof cand.metadata.id === 'string' ? cand.metadata.id : undefined,
          title: cand.metadata.title,
          label: cand.metadata.label || '',
          prompt: cand.metadata.prompt || '',
          note: cand.metadata.note || cand.metadata.notes || '',
          aiParameters,
          engine: cand.metadata.engine || project.defaultEngine || 'default-placeholder',
          secondaryFiles: Array.isArray(cand.metadata.secondaryFiles) ? cand.metadata.secondaryFiles : []
        };

        if (cand.strategy === 'merge' && cand.existingId) {
          await api.revisions.add(cand.existingId, fileToUpload, metadataPayload);
          merged++;
          continue;
        }

        if (cand.strategy === 'override' && cand.existingId) {
          const existingItem = existingItems.find(i => i.id === cand.existingId);
          if (!existingItem?.currentRevisionId || !existingItem.currentRevision) {
            failures.push({
              title: cand.metadata.title || cand.originalName,
              strategy: cand.strategy,
              reason: 'Target revision not found for override.'
            });
            continue;
          }

          await api.revisions.replaceFile(existingItem.currentRevisionId, fileToUpload);
          await api.revisions.update({
            ...existingItem.currentRevision,
            ...metadataPayload
          });
          overridden++;
          continue;
        }

        await api.items.create(project.id, fileToUpload, () => {}, metadataPayload);
        created++;
      } catch (err: any) {
        failures.push({
          title: cand.metadata.title || cand.originalName,
          strategy: cand.strategy,
          reason: err?.message || 'Unknown import error'
        });
      }
    }

    const attempted = activeOnes.length;
    const skipped = selected.length - attempted;
    const reportData: ImportReport = {
      selected: selected.length,
      attempted,
      created,
      merged,
      overridden,
      skipped,
      failed: failures.length,
      failures
    };

    setReport(reportData);
    setStep('result');

    if (created + merged + overridden > 0) {
      onImportComplete();
    }
  };

  const selectedCount = candidates.filter(c => c.isSelected).length;
  const importableCount = candidates.filter(c => c.isSelected && c.strategy !== 'skip').length;
  const allSelected = candidates.length > 0 && selectedCount === candidates.length;

  const downloadReport = () => {
    if (!report) return;
    const payload = {
      projectId: project.id,
      projectName: project.name,
      timestamp: new Date().toISOString(),
      summary: {
        selected: report.selected,
        attempted: report.attempted,
        created: report.created,
        merged: report.merged,
        overridden: report.overridden,
        skipped: report.skipped,
        failed: report.failed
      },
      failures: report.failures
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400"><FileStack size={28} /></div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Import Workspace Data</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'select' ? 'Select a workspace archive (.zip).' : step === 'result' ? 'Import complete.' : 'Configure conflict resolution.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 flex flex-col min-h-0">
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl flex items-center gap-3 text-red-400 text-sm animate-in slide-in-from-top-2">
              <AlertTriangle size={18} /> {error}
            </div>
          )}

          {step === 'select' && (
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div
                className="w-full max-w-lg border-2 border-dashed border-slate-700 rounded-[2rem] p-16 text-center transition-all hover:border-indigo-500 hover:bg-indigo-500/5 group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-24 h-24 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-slate-700 group-hover:scale-110 transition-transform">
                  <Archive size={48} className="text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Drop workspace archive</h3>
                <p className="text-slate-500 text-sm mb-8">ZIP limits: {formatBytes(MAX_ZIP_SIZE_BYTES)} max, {MAX_METADATA_ROWS} metadata rows.</p>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-3.5 rounded-2xl font-bold shadow-xl transition-all active:scale-95">Browse Files</button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleZipFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          )}

          {step === 'analyze' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Loader2 size={80} className="text-indigo-500 animate-spin mx-auto" />
              <h3 className="text-2xl font-bold text-white tracking-tight mt-8">Analyzing Archive</h3>
              <p className="text-slate-400 mt-3">{statusText}</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="w-full h-full flex flex-col min-h-0">
              {warnings.length > 0 && (
                <div className="mb-4 p-4 bg-amber-900/20 border border-amber-900/50 rounded-xl text-amber-300 text-xs">
                  <p className="font-bold mb-1">Preflight warnings: {warnings.length} row(s) skipped during analysis.</p>
                  <p className="opacity-80">{warnings.slice(0, 3).join(' | ')}{warnings.length > 3 ? ' ...' : ''}</p>
                </div>
              )}

              <div className="mb-4 flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700 shrink-0">
                <div className="flex items-center gap-4">
                  <button onClick={toggleAllSelection} className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white px-2 py-1 rounded-md transition-colors">
                    {allSelected ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                    <span>{selectedCount} selected, {importableCount} importable</span>
                  </button>
                  {selectedCount > 0 && (
                    <div className="relative" ref={bulkMenuRef}>
                      <button onClick={() => setShowBulkMenu(!showBulkMenu)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg transition-all">
                        Bulk Action <ChevronDown size={14} className={`transition-transform ${showBulkMenu ? 'rotate-180' : ''}`} />
                      </button>
                      {showBulkMenu && (
                        <div className="absolute left-0 top-full mt-2 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[160] py-1 overflow-hidden animate-in slide-in-from-top-2">
                          <div className="px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 mb-1">Set strategy for selected</div>
                          <button onClick={() => applyBulkStrategy('merge')} className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">Merge (new version)</button>
                          <button onClick={() => applyBulkStrategy('override')} className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">Override current</button>
                          <button onClick={() => applyBulkStrategy('create')} className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">Create new item</button>
                          <button onClick={() => applyBulkStrategy('skip')} className="w-full text-left px-4 py-2.5 text-xs text-amber-400 hover:bg-amber-900/20 transition-colors">Skip</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-medium italic hidden md:block">Import count excludes rows with Skip strategy.</p>
              </div>

              <div className="flex-1 bg-slate-950/50 rounded-2xl border border-slate-800 overflow-hidden mb-8 flex flex-col min-h-0">
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 sticky top-0 backdrop-blur-md z-10 border-b border-slate-800">
                      <tr>
                        <th className="p-4 w-10"></th>
                        <th className="p-4">Asset Information</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Resolution Action</th>
                        <th className="p-4 w-24 text-center">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {candidates.map(c => (
                        <tr key={c.id} className={`hover:bg-slate-800/40 transition-colors ${!c.isSelected ? 'opacity-40' : ''}`}>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setCandidates(prev => prev.map(item => item.id === c.id ? { ...item, isSelected: !item.isSelected } : item))}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${c.isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-600 text-transparent'}`}
                            >
                              <Check size={12} />
                            </button>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-200">{c.metadata.title}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{c.originalName}</div>
                          </td>
                          <td className="p-4 text-center">
                            {c.status === 'duplicate'
                              ? <span className="bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase text-[9px]">Duplicate</span>
                              : <span className="bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase text-[9px]">New</span>}
                          </td>
                          <td className="p-4 text-center">
                            <select
                              value={c.strategy}
                              onChange={(e) => setCandidates(prev => prev.map(item => item.id === c.id ? { ...item, strategy: normalizeStrategy(item.status, e.target.value as ResolutionStrategy) } : item))}
                              className="bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider p-1.5 text-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                            >
                              {c.status === 'duplicate' ? (
                                <>
                                  <option value="merge">Merge</option>
                                  <option value="override">Override</option>
                                  <option value="create">New Item</option>
                                  <option value="skip">Skip</option>
                                </>
                              ) : (
                                <>
                                  <option value="create">Create</option>
                                  <option value="skip">Skip</option>
                                </>
                              )}
                            </select>
                          </td>
                          <td className="p-4 text-center text-slate-500 font-mono">{c.sizeFormatted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center shrink-0">
                <p className="text-xs text-slate-500 italic">Duplicate matching uses normalized title and filename.</p>
                <div className="flex gap-4">
                  <button onClick={() => setStep('select')} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors">Back</button>
                  <button
                    onClick={executeImport}
                    disabled={importableCount === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-10 py-3 rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
                  >
                    Import {importableCount} Assets
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'executing' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 animate-bounce shadow-2xl shadow-indigo-500/40">
                <FileUp size={40} className="text-white" />
              </div>
              <h3 className="text-3xl font-black text-white tracking-tight">Importing Assets</h3>
              <p className="text-slate-400 mt-4 font-medium">{statusText}</p>
              <div className="w-64 h-1.5 bg-slate-800 rounded-full mt-8 overflow-hidden">
                <div className="h-full bg-indigo-500 animate-progress-indeterminate"></div>
              </div>
            </div>
          )}

          {step === 'result' && report && (
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="p-3 rounded-xl border border-slate-700 bg-slate-800/40"><p className="text-[10px] text-slate-500 uppercase">Created</p><p className="text-xl font-black text-emerald-400">{report.created}</p></div>
                <div className="p-3 rounded-xl border border-slate-700 bg-slate-800/40"><p className="text-[10px] text-slate-500 uppercase">Merged</p><p className="text-xl font-black text-indigo-300">{report.merged}</p></div>
                <div className="p-3 rounded-xl border border-slate-700 bg-slate-800/40"><p className="text-[10px] text-slate-500 uppercase">Overridden</p><p className="text-xl font-black text-amber-300">{report.overridden}</p></div>
                <div className="p-3 rounded-xl border border-slate-700 bg-slate-800/40"><p className="text-[10px] text-slate-500 uppercase">Failed</p><p className="text-xl font-black text-rose-400">{report.failed}</p></div>
              </div>

              {report.failures.length > 0 && (
                <div className="flex-1 min-h-0 mb-6 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2 bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Failure Report</div>
                  <div className="overflow-y-auto max-h-64 divide-y divide-slate-800">
                    {report.failures.slice(0, 20).map((f, idx) => (
                      <div key={`${f.title}-${idx}`} className="px-4 py-3 text-xs">
                        <div className="font-bold text-slate-200">{f.title}</div>
                        <div className="text-slate-500">{f.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={downloadReport} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm font-bold">
                  <Download size={15} /> Download Report
                </button>
                <button onClick={onClose} className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black uppercase tracking-widest">Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportWorkspaceModal;
