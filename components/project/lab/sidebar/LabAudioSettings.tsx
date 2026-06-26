import React from 'react';
import { Mic2 } from 'lucide-react';

const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

interface LabAudioSettingsProps {
    selectedVoice: string;
    onSetVoice: (v: string) => void;
}

export const LabAudioSettings: React.FC<LabAudioSettingsProps> = ({ selectedVoice, onSetVoice }) => {
    return (
        <div className="space-y-4 p-5 bg-pink-500/5 border border-pink-500/10 rounded-2xl animate-in fade-in">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
                    <Mic2 size={12} /> Neural Voice Profile
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {VOICES.map(v => (
                        <button 
                            key={v}
                            onClick={() => onSetVoice(v)}
                            className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${
                                selectedVoice === v ? 'bg-pink-500 text-white border-pink-400 shadow-lg' : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-pink-500/30'
                            }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};