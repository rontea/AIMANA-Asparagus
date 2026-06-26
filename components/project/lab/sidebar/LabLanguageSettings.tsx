import React from 'react';
import { Thermometer, UserCircle } from 'lucide-react';
import { LabSlider } from '../LabSlider';

interface LabLanguageSettingsProps {
    temperature: number;
    onSetTemperature: (t: number) => void;
}

export const LabLanguageSettings: React.FC<LabLanguageSettingsProps> = ({ temperature, onSetTemperature }) => {
    return (
        <div className="space-y-4 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
            <LabSlider label="Temperature" value={temperature} min={0} max={1} step={0.1} onChange={onSetTemperature} icon={Thermometer} unit="" />
            <div className="space-y-2">
                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                    <UserCircle size={10}/> Response Persona
                </label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500">
                    <option>Professional Assistant</option>
                    <option>Creative Director</option>
                    <option>Technical Lead</option>
                    <option>Casual Collaborator</option>
                </select>
            </div>
        </div>
    );
};