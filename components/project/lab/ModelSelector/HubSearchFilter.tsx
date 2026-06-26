import React from 'react';
import { Search, Shield, Globe, Layers, Image as ImageIcon, Film, Network } from 'lucide-react';
import { ModelOption } from './registry';

export type ProviderTab = 'all' | 'google' | 'pollinations' | 'nvidia';
export type MediaTab = 'all' | 'image' | 'video';

interface HubSearchFilterProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    activeTab: ProviderTab;
    setActiveTab: (tab: ProviderTab) => void;
    models: ModelOption[];
    activeMediaTab?: MediaTab;
    setActiveMediaTab?: (tab: MediaTab) => void;
    showMediaTabs?: boolean;
}

export const HubSearchFilter: React.FC<HubSearchFilterProps> = ({
    searchQuery, setSearchQuery, activeTab, setActiveTab, models, activeMediaTab = 'all', setActiveMediaTab, showMediaTabs = false
}) => {
    const providerStats = {
        google: models.filter(m => m.provider === 'google').length,
        pollinations: models.filter(m => m.provider === 'pollinations').length,
        nvidia: models.filter(m => m.provider === 'nvidia').length
    };
    const mediaStats = {
        image: models.filter((m) => m.category === 'Visual').length,
        video: models.filter((m) => m.category === 'Motion').length
    };

    return (
        <div className="px-8 py-5 bg-slate-900/10 border-b border-slate-800/50 flex flex-col gap-4 shrink-0">
            {showMediaTabs && (
                <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 w-full md:w-fit shadow-inner">
                    <button
                        onClick={() => setActiveMediaTab?.('all')}
                        className={`flex-1 md:w-24 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeMediaTab === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Layers size={12} /> All
                    </button>
                    <button
                        onClick={() => setActiveMediaTab?.('image')}
                        className={`flex-1 md:w-32 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeMediaTab === 'image' ? 'bg-slate-800 text-blue-300 shadow-lg border border-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <ImageIcon size={12} /> Image ({mediaStats.image})
                    </button>
                    <button
                        onClick={() => setActiveMediaTab?.('video')}
                        className={`flex-1 md:w-32 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeMediaTab === 'video' ? 'bg-slate-800 text-emerald-300 shadow-lg border border-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Film size={12} /> Video ({mediaStats.video})
                    </button>
                </div>
            )}

            <div className="flex flex-col md:flex-row items-center gap-6 w-full">
                <div className="relative flex-1 group w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={18} />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter by capability, model name or features..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-800 font-medium"
                    />
                </div>
                
                <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 w-full md:w-auto shadow-inner">
                    <button 
                        onClick={() => setActiveTab('all')}
                        className={`flex-1 md:w-28 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Layers size={12} /> Global
                    </button>
                    <button 
                        onClick={() => setActiveTab('google')}
                        className={`flex-1 md:w-32 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'google' ? 'bg-slate-800 text-indigo-400 shadow-lg border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Shield size={12} /> Google ({providerStats.google})
                    </button>
                    <button 
                        onClick={() => setActiveTab('pollinations')}
                        className={`flex-1 md:w-36 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'pollinations' ? 'bg-slate-800 text-cyan-400 shadow-lg border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Globe size={12} /> Gateway ({providerStats.pollinations})
                    </button>
                    <button
                        onClick={() => setActiveTab('nvidia')}
                        className={`flex-1 md:w-32 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'nvidia' ? 'bg-slate-800 text-emerald-400 shadow-lg border border-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Network size={12} /> NVIDIA ({providerStats.nvidia})
                    </button>
                </div>
            </div>
        </div>
    );
};
