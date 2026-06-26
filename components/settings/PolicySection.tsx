
import React, { useState } from 'react';
import { Gauge, Save, Loader2, CheckCircle, Zap } from 'lucide-react';
import { AppSettings } from '../../types';

interface PolicySectionProps {
    settings: AppSettings;
    onSavePolicies: (updates: {
        maxUsers: number;
        timeout: number;
        bulkLimit: number;
        manualPollenHourlyRate: number;
    }) => Promise<void>;
}

export const PolicySection: React.FC<PolicySectionProps> = ({ settings, onSavePolicies }) => {
    const sanitizeMaxUsers = (value: number) => {
        if (!Number.isFinite(value)) return 5;
        return Math.max(1, Math.round(value));
    };

    const sanitizeTimeout = (value: number) => {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.round(value));
    };

    const sanitizeBulkLimit = (value: number) => {
        if (!Number.isFinite(value)) return 8;
        return Math.max(1, Math.round(value));
    };

    const sanitizeManualPollenRate = (value: number) => {
        if (!Number.isFinite(value) || value <= 0) return 0.15;
        return value;
    };

    const [maxUsers, setMaxUsers] = useState(settings.maxUsers || 5);
    const [timeout, setTimeoutVal] = useState(settings.inactivityTimeout || 0);
    const [bulkLimit, setBulkLimit] = useState(settings.bulkLimit || 8);
    const [manualPollenHourlyRate, setManualPollenHourlyRate] = useState(settings.manualPollenHourlyRate || 0.15);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    React.useEffect(() => {
        setMaxUsers(settings.maxUsers || 5);
        setTimeoutVal(settings.inactivityTimeout || 0);
        setBulkLimit(settings.bulkLimit || 8);
        setManualPollenHourlyRate(settings.manualPollenHourlyRate || 0.15);
    }, [
        settings.maxUsers,
        settings.inactivityTimeout,
        settings.bulkLimit,
        settings.manualPollenHourlyRate
    ]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const safeMaxUsers = sanitizeMaxUsers(maxUsers);
            const safeTimeout = sanitizeTimeout(timeout);
            const safeBulkLimit = sanitizeBulkLimit(bulkLimit);
            const safeManualRate = sanitizeManualPollenRate(manualPollenHourlyRate);

            setMaxUsers(safeMaxUsers);
            setTimeoutVal(safeTimeout);
            setBulkLimit(safeBulkLimit);
            setManualPollenHourlyRate(safeManualRate);

            await onSavePolicies({
                maxUsers: safeMaxUsers,
                timeout: safeTimeout,
                bulkLimit: safeBulkLimit,
                manualPollenHourlyRate: safeManualRate
            });
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (e) {} finally { setIsSaving(false); }
    };

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Gauge size={20} className="text-purple-400"/> System Policies
                </h2>
                <span className="text-[10px] font-black bg-purple-900/40 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full uppercase tracking-widest">Administrative Access</span>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Max User Registry</label>
                        <input type="number" value={maxUsers} onChange={e => setMaxUsers(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Idle Logout (Min)</label>
                        <input type="number" value={timeout} onChange={e => setTimeoutVal(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            <Zap size={12} className="text-amber-400 animate-pulse" /> Bulk Synthesis Limit
                        </label>
                        <input 
                            type="number" 
                            value={bulkLimit} 
                            onChange={e => setBulkLimit(parseInt(e.target.value))} 
                            className="w-full bg-slate-900 border border-indigo-500/30 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-inner" 
                        />
                        <p className="text-[9px] text-slate-500 italic px-1">Maximum allowed prompts in the bulk synthesis queue.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-red-400 uppercase tracking-[0.2em] ml-1">Manual Pollen Rate / Hour</label>
                        <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={manualPollenHourlyRate}
                            onChange={e => setManualPollenHourlyRate(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-red-500/30 rounded-xl px-4 py-2.5 text-white font-bold outline-none focus:ring-2 focus:ring-red-500/40 transition-all shadow-inner"
                        />
                        <p className="text-[9px] text-slate-500 italic px-1">Used when Pollinations balance cannot be retrieved. Manual fallback refreshes every hour.</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                    <button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-indigo-900/20 transition-all active:scale-95 disabled:opacity-50">
                        {isSaving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Commit System Policies
                    </button>
                    {showSuccess && <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-in fade-in"><CheckCircle size={14}/> Registry Synchronized</span>}
                </div>
            </div>
        </section>
    );
};
