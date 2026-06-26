import React from 'react';
import { Gauge, Layers, Link2, NotebookTabs } from 'lucide-react';

interface IntelligenceTabProps {
    formData: any;
    setFormData: (data: any) => void;
}

export const IntelligenceTab: React.FC<IntelligenceTabProps> = ({ formData, setFormData }) => {
    return (
        <div className="space-y-8 animate-in slide-in-from-left-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Provider Channel</label>
                    <select
                        value={formData.provider}
                        onChange={e => setFormData({ ...formData, provider: e.target.value })}
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500"
                    >
                        <option value="google">Google</option>
                        <option value="pollinations">Gateway</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Efficiency Ranking</label>
                    <select
                        value={formData.efficiencyTier}
                        onChange={e => setFormData({ ...formData, efficiencyTier: e.target.value })}
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500"
                    >
                        <option value="Tier-Express">Tier-Express (Real-time)</option>
                        <option value="Tier-Stable">Tier-Stable (Balanced)</option>
                        <option value="Tier-Elite">Tier-Elite (High Quality)</option>
                        <option value="Tier-Video">Tier-Video (Heavy Inference)</option>
                        <option value="Static-Label">Static (Non-Programmable)</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                        <Gauge size={12} className="text-indigo-400" /> Usage Quota
                    </label>
                    <input
                        type="text"
                        value={formData.limits}
                        onChange={e => setFormData({ ...formData, limits: e.target.value })}
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-indigo-400 font-bold outline-none focus:border-indigo-500"
                        placeholder="e.g. 15 RPM | 1M TPM"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                        <Layers size={12} className="text-indigo-400" /> Supported Ratios
                    </label>
                    <input
                        type="text"
                        value={formData.supportedRatios}
                        onChange={e => setFormData({ ...formData, supportedRatios: e.target.value })}
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500"
                        placeholder="e.g. 1:1, 4:3, 16:9"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                        <Link2 size={12} className="text-indigo-400" /> Dashboard Link
                    </label>
                    <input
                        type="url"
                        value={formData.dashboardUrl}
                        onChange={e => setFormData({ ...formData, dashboardUrl: e.target.value })}
                        className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500"
                        placeholder="https://..."
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
                    <NotebookTabs size={12} className="text-indigo-400" /> Ratio Context Note
                </label>
                <textarea
                    value={formData.ratioNotes}
                    onChange={e => setFormData({ ...formData, ratioNotes: e.target.value })}
                    className="w-full h-24 bg-black border border-slate-800 rounded-2xl p-4 text-sm text-slate-400 outline-none resize-none focus:border-indigo-500 italic"
                    placeholder="Optional note shown in Model Intelligence panel for this checkpoint..."
                />
            </div>
        </div>
    );
};
