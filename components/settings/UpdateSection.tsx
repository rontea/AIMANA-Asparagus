import React from 'react';
import { Download, RefreshCw, Shield, Sparkles } from 'lucide-react';

interface UpdateSectionProps {
    currentVersion: string;
    latestVersion: string;
    checkedAt: number | null;
    isChecking: boolean;
    isReloading: boolean;
    updateAvailable: boolean;
    error: string | null;
    onCheckNow: () => void;
    onUpdateNow: () => void;
}

export const UpdateSection: React.FC<UpdateSectionProps> = ({
    currentVersion,
    latestVersion,
    checkedAt,
    isChecking,
    isReloading,
    updateAvailable,
    error,
    onCheckNow,
    onUpdateNow
}) => {
    const checkedLabel = checkedAt
        ? new Date(checkedAt).toLocaleString()
        : 'Not checked yet';

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                    <RefreshCw size={20} className="text-amber-400" />
                    <h2 className="text-lg font-semibold text-white">Client Update</h2>
                </div>
                <span className="text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full uppercase tracking-widest">
                    Super User
                </span>
            </div>

            <div className="p-8 space-y-6">
                <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-slate-900 px-5 py-5">
                    <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/20 flex items-center justify-center shrink-0">
                            <Sparkles size={26} className="text-amber-300" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                                <Shield size={12} /> Manual Release Control
                            </div>
                            <p className="text-sm text-slate-200 leading-relaxed">
                                Check whether the server is running a newer AIMANA build than this browser session. If a newer build is available, reload this client to install the latest frontend assets.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Current Client</div>
                        <div className="mt-2 text-sm font-black text-white font-mono">v{currentVersion}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Latest Server Build</div>
                        <div className="mt-2 text-sm font-black text-white font-mono">v{latestVersion}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</div>
                        <div className={`mt-2 text-sm font-black ${updateAvailable ? 'text-amber-300' : 'text-emerald-300'}`}>
                            {updateAvailable ? 'Update available' : 'Already up to date'}
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/40 px-4 py-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Last Check</div>
                    <p className="mt-2 text-sm text-slate-300">{checkedLabel}</p>
                    {error && (
                        <p className="mt-3 text-xs text-red-400">
                            {error}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onCheckNow}
                        disabled={isChecking || isReloading}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-200 transition-colors hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
                        {isChecking ? 'Checking' : 'Check Update'}
                    </button>

                    <button
                        type="button"
                        onClick={onUpdateNow}
                        disabled={!updateAvailable || isReloading}
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Download size={14} />
                        {isReloading ? 'Reloading' : 'Update Now'}
                    </button>
                </div>
            </div>
        </section>
    );
};
