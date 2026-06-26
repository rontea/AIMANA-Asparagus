import React from 'react';
import { BrainCircuit, Sparkles } from 'lucide-react';

const SemanticForgeHome: React.FC = () => {
    return (
        <section className="mx-auto max-w-4xl space-y-6 rounded-[2rem] border border-emerald-500/20 bg-slate-950/80 p-8 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-300">
                    <BrainCircuit size={28} />
                </div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white">Semantic Forge</h1>
                    <p className="text-sm text-slate-400">
                        Example installable extension package built with the AIMANA Extension SDK.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                        <Sparkles size={14} /> Package Goal
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                        Demonstrate how a separate extension package can export routes, asset launch metadata,
                        capability declarations, and migration descriptors through the shared SDK.
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">
                        Safe Integration
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">
                        The host still owns validation and execution. This package only declares metadata and UI surfaces.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default SemanticForgeHome;
