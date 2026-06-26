import React from 'react';
import { Info, Github, Heart, ExternalLink, User, Code2, Sparkles } from 'lucide-react';
import { APP_METADATA } from '../../utils/appMetadata';

export const AboutSection: React.FC = () => {
    const currentYear = new Date().getFullYear();

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Info size={20} className="text-indigo-400" /> About AIMANA
                </h2>
                <span className="text-[10px] font-black bg-indigo-950 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full uppercase tracking-widest">{APP_METADATA.versionLabel}</span>
            </div>

            <div className="p-8 space-y-8">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shrink-0 shadow-2xl shadow-indigo-900/40 border border-indigo-400/30">
                        <Sparkles size={40} className="text-white animate-pulse" />
                    </div>
                    <div className="space-y-4">
                        <p className="text-slate-300 text-sm leading-relaxed">
                            {APP_METADATA.summary}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {APP_METADATA.highlights.map((highlight) => (
                                <span key={highlight} className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    {highlight}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-700/50">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Architect & Developer</h4>
                        <div className="flex items-center gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800 group hover:border-indigo-500/30 transition-all">
                            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:scale-110 transition-transform">
                                <User size={24} className="text-indigo-400" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-white uppercase tracking-tight">RonTea</span>
                                    <span className="bg-emerald-900/40 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">Vibe Developer</span>
                                </div>
                                <a
                                    href="https://github.com/rontea"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors mt-0.5"
                                >
                                    @rontea <ExternalLink size={10} />
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Ecosystem Links</h4>
                        <div className="grid grid-cols-1 gap-2">
                            <a
                                href="https://github.com/rontea/AIMANA-Asparagus"
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between p-3 bg-slate-900/40 border border-slate-800 rounded-xl hover:bg-slate-800 hover:border-indigo-500/30 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <Github size={16} className="text-slate-400 group-hover:text-white" />
                                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">Source Repository</span>
                                </div>
                                <ExternalLink size={12} className="text-slate-600" />
                            </a>
                            <a
                                href="https://github.com/sponsors/rontea"
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between p-3 bg-rose-500/5 border border-rose-500/20 rounded-xl hover:bg-rose-500/10 hover:border-rose-500/40 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <Heart size={16} className="text-rose-500 fill-rose-500/20" />
                                    <span className="text-xs font-bold text-rose-200">Support Development</span>
                                </div>
                                <ExternalLink size={12} className="text-rose-500/50" />
                            </a>
                        </div>
                    </div>
                </div>

                <div className="pt-4 flex flex-col md:flex-row items-center justify-between gap-4 opacity-40">
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
                        <Code2 size={12} /> Forged with Neural Excellence
                    </div>
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center md:text-right">
                        Copyright {currentYear} RonTea. Released under open source protocols.
                    </div>
                </div>
            </div>
        </section>
    );
};
