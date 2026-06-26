import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Puzzle, Sparkles, Zap } from 'lucide-react';
import { api } from '../services/api';
import { getAccessibleExtensionRegistry, getAccessibleReadyExtensions } from '../extensions/registry';

interface ExtensionTileProps {
    label: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    isReady: boolean;
    tierLabel: string;
    statusLabel: string;
    onClick?: () => void;
}

const ExtensionTile: React.FC<ExtensionTileProps> = ({ label, desc, icon: Icon, color, isReady, tierLabel, statusLabel, onClick }) => (
    <button 
        onClick={isReady ? onClick : undefined}
        className={`group relative flex flex-col items-start p-8 rounded-[2.5rem] border transition-all overflow-hidden ${
            isReady 
            ? 'bg-slate-900/40 border-slate-800 hover:border-indigo-500/40 hover:-translate-y-1 shadow-xl' 
            : 'bg-slate-950/40 border-slate-900 cursor-not-allowed grayscale opacity-60'
        }`}
    >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className={`p-4 rounded-2xl ${color} bg-opacity-10 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg`}>
            <Icon size={32} className={color} />
        </div>
        
        <div className="relative z-10 text-left">
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2 flex items-center gap-3">
                {label}
                {!isReady && <Lock size={14} className="text-slate-600" />}
            </h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6">{desc}</p>
        </div>

        <div className="mt-auto relative z-10 flex items-center justify-between w-full">
            {isReady ? (
                <div className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                    <Zap size={12} /> {statusLabel}
                </div>
            ) : (
                <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                    {statusLabel}
                </div>
            )}
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">{tierLabel}</span>
        </div>
    </button>
);

const Extensions: React.FC = () => {
    const navigate = useNavigate();
    const user = api.auth.getUser();
    const extensionRegistry = getAccessibleExtensionRegistry(user);
    const readyExtensions = getAccessibleReadyExtensions(user);

    return (
        <div className="max-w-[1760px] mx-auto space-y-12 pb-20 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-10">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-white tracking-tighter flex items-center gap-6">
                        <Puzzle size={48} className="text-indigo-500 drop-shadow-[0_0_15px_rgba(99,102,241,0.3)]" />
                        Extensions
                    </h1>
                    <p className="text-slate-400 font-medium text-lg max-w-xl">Deepen your creative control with specialized ecosystem nodes and modular post-processing plugins.</p>
                </div>
                
                <div className="flex items-center gap-2 px-6 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
                    <Sparkles size={20} className="animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">{readyExtensions.length} Live Extension{readyExtensions.length === 1 ? '' : 's'}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {extensionRegistry.map((extension) => (
                    <ExtensionTile
                        key={extension.id}
                        label={extension.label}
                        desc={extension.description}
                        icon={extension.icon}
                        color={extension.colorClass}
                        isReady={extension.status === 'ready'}
                        tierLabel={extension.tierLabel}
                        statusLabel={extension.statusLabel}
                        onClick={extension.launchPath ? () => navigate(extension.launchPath!) : undefined}
                    />
                ))}
            </div>

            <div className="p-10 bg-slate-900/30 border border-slate-800 rounded-[3rem] text-center space-y-4">
                <h4 className="text-white font-black uppercase tracking-[0.3em] text-xs">Developer Ecosystem</h4>
                <p className="text-slate-500 text-[10px] max-w-md mx-auto leading-relaxed italic font-bold uppercase tracking-widest opacity-60">
                    Extensions now register through a shared system, so future tools can plug into routes, discovery, and launch actions without hand-wiring each screen.
                </p>
            </div>
        </div>
    );
};

export default Extensions;
