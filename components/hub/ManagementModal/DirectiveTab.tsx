import React from 'react';
import { Shield, Cpu, Zap, FlaskConical, BrainCircuit, Wind, Video, Image as LucideImage, Crown, Sparkles, Rocket, Activity, Layers } from 'lucide-react';

interface DirectiveTabProps {
    formData: any;
    setFormData: (data: any) => void;
}

const ICON_SET = ['Cpu', 'Zap', 'FlaskConical', 'BrainCircuit', 'Wind', 'Video', 'Image', 'Crown', 'Sparkles', 'Rocket', 'Activity', 'Layers'];

export const DirectiveTab: React.FC<DirectiveTabProps> = ({ formData, setFormData }) => {
    const getIcon = (name: string) => {
        switch(name) {
            case 'Cpu': return <Cpu size={20} />;
            case 'Zap': return <Zap size={20} />;
            case 'FlaskConical': return <FlaskConical size={20} />;
            case 'BrainCircuit': return <BrainCircuit size={20} />;
            case 'Wind': return <Wind size={20} />;
            case 'Video': return <Video size={20} />;
            case 'Image': return <LucideImage size={20} />;
            case 'Crown': return <Crown size={20} />;
            case 'Sparkles': return <Sparkles size={20} />;
            case 'Rocket': return <Rocket size={20} />;
            case 'Activity': return <Activity size={20} />;
            case 'Layers': return <Layers size={20} />;
            default: return <Cpu size={20} />;
        }
    };

    return (
        <div className="space-y-8 animate-in slide-in-from-left-2">
            <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                    <Shield className="text-indigo-400" size={18} />
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Neural System Instruction</label>
                </div>
                <textarea 
                    value={formData.systemInstruction} 
                    onChange={e => setFormData({...formData, systemInstruction: e.target.value})} 
                    className="w-full h-48 bg-black border border-slate-800 rounded-2xl p-4 text-sm text-slate-300 outline-none focus:border-indigo-500 resize-none leading-relaxed" 
                    placeholder="e.g. You are a highly professional architectural visualizer. Always prioritize photorealistic lighting..." 
                />
                <p className="text-[10px] text-slate-600 font-medium italic mt-2 px-1">This instruction is prepended to every user request dispatched to the engine.</p>
            </div>

            <div className="h-px bg-slate-800" />

            <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Infrastructure Icon</label>
                <div className="grid grid-cols-6 gap-3">
                    {ICON_SET.map(icon => (
                        <button 
                            key={icon}
                            onClick={() => setFormData({...formData, iconName: icon})}
                            className={`p-4 rounded-xl border transition-all flex items-center justify-center ${formData.iconName === icon ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-slate-400'}`}
                        >
                            <div className="flex flex-col items-center gap-2">
                                {getIcon(icon)}
                                <span className="text-[7px] font-black uppercase tracking-tighter">{icon}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};