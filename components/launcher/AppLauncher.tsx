import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
    LayoutGrid, 
    Layers, 
    Sparkles, 
    Cpu, 
    Settings, 
    Archive, 
    Database, 
    ListChecks,
    X,
    Shield,
    Zap,
    Aperture,
    ImageIcon,
    Video,
    MessageSquare,
    FileJson,
    AudioLines,
    Music2,
    FileAudio,
    Tag
} from 'lucide-react';

interface AppLauncherProps {
    isSuperUser: boolean;
}

interface AppTileProps {
    to: string;
    icon: React.ElementType;
    label: string;
    desc: string;
    color: string;
    onClick: () => void;
}

const AppTile: React.FC<AppTileProps> = ({ to, icon: Icon, label, desc, color, onClick }) => (
    <Link 
        to={to} 
        onClick={onClick}
        className="group flex flex-col items-center justify-center p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/10 text-center"
    >
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10 mb-2 group-hover:scale-110 transition-transform duration-300 shadow-lg group-hover:shadow-indigo-500/20`}>
            <Icon size={24} className={color} />
        </div>
        <span className="text-[11px] font-black text-white uppercase tracking-wider mb-1">{label}</span>
        <span className="text-[9px] text-slate-500 font-medium leading-tight opacity-0 group-hover:opacity-100 transition-opacity">{desc}</span>
    </Link>
);

const AppLauncher: React.FC<AppLauncherProps> = ({ isSuperUser }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2 rounded-xl transition-all relative group ${
                    isOpen 
                    ? 'bg-indigo-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="App Launcher"
            >
                <LayoutGrid size={22} className={isOpen ? 'animate-in spin-in-90 duration-300' : 'group-hover:rotate-90 transition-transform duration-500'} />
                {!isOpen && (
                    <div className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-3 w-[min(80vw,1100px)] max-w-[calc(100vw-1.5rem)] bg-slate-900/95 backdrop-blur-[32px] border border-slate-700/50 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-[1000] animate-in fade-in slide-in-from-top-4 overflow-hidden ring-1 ring-white/10">
                    <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <LayoutGrid size={14} className="text-indigo-500" />
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">AIMANA Ecosystem</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-slate-600 hover:text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        <AppTile 
                            to="/" 
                            icon={Layers} 
                            label="Project Dashboard" 
                            desc="Asset Workspaces" 
                            color="text-indigo-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/preview" 
                            icon={Aperture} 
                            label="Gallery" 
                            desc="Neural Stream" 
                            color="text-indigo-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/generate" 
                            icon={Sparkles} 
                            label="Studio" 
                            desc="Neural Lab" 
                            color="text-indigo-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/generate?mode=image" 
                            icon={ImageIcon} 
                            label="AI Creative Image" 
                            desc="Visual Synthesis" 
                            color="text-indigo-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/generate?mode=video" 
                            icon={Video} 
                            label="AI Creative Video" 
                            desc="Motion Studio" 
                            color="text-blue-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/generate?mode=audio" 
                            icon={AudioLines} 
                            label="AI Creative Audio" 
                            desc="Voice Synthesis" 
                            color="text-emerald-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/generate?mode=music" 
                            icon={Music2} 
                            label="AI Music" 
                            desc="Music Studio" 
                            color="text-amber-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/generate?mode=transcribe" 
                            icon={FileAudio} 
                            label="Audio to Text" 
                            desc="Transcript Studio" 
                            color="text-cyan-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/chat" 
                            icon={MessageSquare} 
                            label="AI Chat" 
                            desc="Language Runtime" 
                            color="text-cyan-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/bulk-studio" 
                            icon={Zap} 
                            label="Bulk Studio" 
                            desc="Multi-Prompt" 
                            color="text-emerald-400" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/prompt-manager" 
                            icon={FileJson} 
                            label="Prompt Manager" 
                            desc="Draft Pipeline" 
                            color="text-violet-300" 
                            onClick={() => setIsOpen(false)} 
                        />
                        <AppTile 
                            to="/variable-registry" 
                            icon={Tag} 
                            label="Var Registry" 
                            desc="Prompt Variables" 
                            color="text-indigo-300" 
                            onClick={() => setIsOpen(false)} 
                        />
                        
                        <div className="col-span-full h-px bg-white/5 my-2" />

                        <div className="col-span-full grid grid-cols-2 lg:grid-cols-4 gap-2">
                            <AppTile 
                                to="/checkpoints" 
                                icon={Cpu} 
                                label="Registry" 
                                desc="Intelligence Hub" 
                                color="text-cyan-400" 
                                onClick={() => setIsOpen(false)} 
                            />
                            <AppTile 
                                to="/settings" 
                                icon={Settings} 
                                label="Security" 
                                desc="Preferences" 
                                color="text-slate-400" 
                                onClick={() => setIsOpen(false)} 
                            />

                            {isSuperUser && (
                                <AppTile 
                                    to="/maintenance" 
                                    icon={Database} 
                                    label="Sys Ops" 
                                    desc="Instance Maint" 
                                    color="text-purple-400" 
                                    onClick={() => setIsOpen(false)} 
                                />
                            )}
                            
                            {isSuperUser && (
                                <AppTile 
                                    to="/audit-trail" 
                                    icon={ListChecks} 
                                    label="Audit" 
                                    desc="Access Logs" 
                                    color="text-rose-400" 
                                    onClick={() => setIsOpen(false)} 
                                />
                            )}
                        </div>
                    </div>

                    {isSuperUser && (
                        <div className="p-4 bg-indigo-600/10 border-t border-white/5 flex items-center justify-center gap-2">
                            <Shield size={10} className="text-indigo-500" />
                            <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Elevated Root Privileges Active</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AppLauncher;
