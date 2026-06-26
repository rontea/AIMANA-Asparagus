import React from 'react';
import { FileJson, FolderPlus, Plus, Sparkles } from 'lucide-react';

interface PromptManagerHeaderProps {
  stagingCount: number;
  readyCount: number;
  projectCount: number;
  missingPreviewCount: number;
  onOpenImport: () => void;
  onOpenProjectModal: () => void;
  onCreateDraft: () => void;
}

export const PromptManagerHeader: React.FC<PromptManagerHeaderProps> = ({
  stagingCount,
  readyCount,
  projectCount,
  missingPreviewCount,
  onOpenImport,
  onOpenProjectModal,
  onCreateDraft
}) => (
  <header className="relative shrink-0 overflow-hidden border-b border-slate-800/80 bg-slate-950/55 px-6 py-6 backdrop-blur-sm lg:px-8">
    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:34px_34px] opacity-20" />
    <div className="absolute -top-20 right-0 h-52 w-52 rounded-full bg-violet-500/15 blur-3xl" />
    <div className="absolute bottom-0 left-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

    <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-violet-200">
          <Sparkles size={12} />
          Prompt Workspace
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">Prompt Manager</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
          Import, stage, and prepare prompt drafts before publishing them into dedicated prompt collections.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">Staging</p>
            <p className="mt-2 text-2xl font-black text-white">{stagingCount}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-300/80">Ready</p>
            <p className="mt-2 text-2xl font-black text-white">{readyCount}</p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300/80">Collections</p>
            <p className="mt-2 text-2xl font-black text-white">{projectCount}</p>
          </div>
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-300/80">Missing Preview</p>
            <p className="mt-2 text-2xl font-black text-white">{missingPreviewCount}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <button
          onClick={onCreateDraft}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-500/40 bg-violet-600/90 px-5 py-3 text-sm font-black uppercase tracking-[0.15em] text-white shadow-lg shadow-violet-950/30 transition-all hover:bg-violet-500"
        >
          <Plus size={15} />
          New Draft
        </button>
        <button
          onClick={onOpenProjectModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/85 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-100 transition-all hover:border-slate-600 hover:bg-slate-800"
        >
          <FolderPlus size={16} />
          New Collection
        </button>
        <button
          onClick={onOpenImport}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-500/20 px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-cyan-100 shadow-lg shadow-cyan-950/20 transition-all hover:bg-cyan-500/30"
        >
          <FileJson size={16} />
          Bulk Import JSON
        </button>
      </div>
    </div>
  </header>
);
