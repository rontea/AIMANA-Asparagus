
import React from 'react';
import { IntelligenceHubContent } from '../components/hub/IntelligenceHubContent';
import { Cpu, Info, ShieldAlert } from 'lucide-react';

const CheckpointHub: React.FC = () => {
    return (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <section className="relative overflow-hidden rounded-[2rem] border border-slate-800/80 bg-[#050b18] px-6 py-8 md:px-8 md:py-10 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
                <div className="absolute -top-24 right-0 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
                <div className="absolute bottom-0 left-1/4 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />

                <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl space-y-4">
                        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">
                            <ShieldAlert size={14} />
                            Master Registry
                        </div>
                        <div className="space-y-3">
                            <h1 className="flex items-center gap-4 text-4xl font-black tracking-[0.08em] text-white md:text-5xl">
                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 shadow-[0_0_24px_rgba(99,102,241,0.22)]">
                                    <Cpu size={30} />
                                </span>
                                <span className="uppercase">Checkpoint Hub</span>
                            </h1>
                            <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-300 md:text-base">
                                Global AI engine registry and infrastructure configuration for every neural lane running inside AIMANA.
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 backdrop-blur-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Registry Layer</p>
                            <p className="mt-3 text-lg font-black uppercase tracking-[0.12em] text-white">Global</p>
                            <p className="mt-1 text-xs text-slate-400">Overrides cascade into current and future workspaces.</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300/80">Verification</p>
                            <p className="mt-3 text-lg font-black uppercase tracking-[0.12em] text-white">Tracked</p>
                            <p className="mt-1 text-xs text-slate-300">Tested and pending engines stay visible in one command center.</p>
                        </div>
                        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 backdrop-blur-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/80">Sync Surface</p>
                            <p className="mt-3 text-lg font-black uppercase tracking-[0.12em] text-white">Live</p>
                            <p className="mt-1 text-xs text-slate-300">Provider lanes can be refreshed without leaving the registry.</p>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="rounded-[2rem] border border-slate-800/70 bg-slate-900/40 p-6 shadow-inner shadow-slate-950/30 backdrop-blur-sm">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-indigo-400">
                            <Info size={20} />
                        </div>
                        <div className="text-sm leading-relaxed text-slate-300">
                            <p>
                                This command center manages all neural checkpoints available across the AIMANA platform. You can manually register new model endpoints by "Forging" them, or configure existing engines to use specific system instructions or upstream API mappings.
                            </p>
                            <p className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                                Overrides saved here apply globally to all current and future projects.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-[2rem] border border-slate-800/70 bg-[#060c18] p-6 shadow-[0_18px_60px_rgba(2,6,23,0.3)]">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Registry Protocol</p>
                    <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3">
                            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">Native Engines</span>
                            <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Protected</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3">
                            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">Forged Checkpoints</span>
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Portable</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3">
                            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">Sandbox + Promote</span>
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Verified Flow</span>
                        </div>
                    </div>
                </div>
            </div>

            <IntelligenceHubContent />
        </div>
    );
};

export default CheckpointHub;
