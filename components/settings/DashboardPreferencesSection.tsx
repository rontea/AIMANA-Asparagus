import React, { useState } from 'react';
import { CheckCircle, LayoutDashboard, Loader2, Save } from 'lucide-react';

interface DashboardPreferencesSectionProps {
    dashboardResultLimit?: number;
    onSaveDashboardPreferences: (updates: { dashboardResultLimit: number }) => Promise<void>;
}

export const DashboardPreferencesSection: React.FC<DashboardPreferencesSectionProps> = ({
    dashboardResultLimit = 24,
    onSaveDashboardPreferences
}) => {
    const sanitizeDashboardResultLimit = (value: number) => {
        if (!Number.isFinite(value)) return 24;
        return Math.max(1, Math.min(200, Math.round(value)));
    };

    const [resultLimit, setResultLimit] = useState(dashboardResultLimit || 24);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    React.useEffect(() => {
        setResultLimit(dashboardResultLimit || 24);
    }, [dashboardResultLimit]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const safeResultLimit = sanitizeDashboardResultLimit(resultLimit);
            setResultLimit(safeResultLimit);
            await onSaveDashboardPreferences({ dashboardResultLimit: safeResultLimit });
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <LayoutDashboard size={20} className="text-cyan-400" /> Dashboard Preferences
                </h2>
                <span className="text-[10px] font-black bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 px-3 py-1 rounded-full uppercase tracking-widest">User Preference</span>
            </div>
            <div className="p-6 space-y-6">
                <div className="max-w-xs space-y-2">
                    <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] ml-1">Dashboard Results</label>
                    <input
                        type="number"
                        min="1"
                        max="200"
                        value={resultLimit}
                        onChange={e => setResultLimit(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all shadow-inner"
                    />
                    <p className="text-[9px] text-slate-500 italic px-1">Number of cards or rows shown when the main dashboard loads.</p>
                </div>
                <div className="flex items-center gap-4 pt-2">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-cyan-900/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Dashboard Preference
                    </button>
                    {showSuccess && <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-in fade-in"><CheckCircle size={14} /> Preference Saved</span>}
                </div>
            </div>
        </section>
    );
};
