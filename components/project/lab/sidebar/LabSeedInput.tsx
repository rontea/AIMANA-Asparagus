import React from 'react';
import { Info, Dices } from 'lucide-react';

interface LabSeedInputProps {
    seed: string;
    onSetSeed: (s: string) => void;
}

export const LabSeedInput: React.FC<LabSeedInputProps> = ({ seed, onSetSeed }) => (
    <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Neural Seed</label>
            <span className="cursor-help" title="Random seed for reproducible results. Use -1 for random.">
                <Info size={10} className="text-slate-600 hover:text-indigo-400 transition-colors" />
            </span>
        </div>
        <div className="relative group">
            <input 
                type="text"
                value={seed}
                onChange={(e) => onSetSeed(e.target.value.replace(/\D/g, ''))}
                placeholder="Inference: Randomized"
                className="w-full bg-[#1e1e1e] border border-slate-800 rounded-lg py-3 pl-4 pr-12 text-sm text-indigo-400 font-mono focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-700 shadow-inner"
            />
            <button 
                onClick={() => onSetSeed(Math.floor(Math.random() * 10000000).toString())}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-indigo-400 transition-colors"
                title="Randomize Neural Seed"
            >
                <Dices size={18} strokeWidth={2.5} />
            </button>
        </div>
        <p className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter px-1">
            Deterministic results require a fixed seed value.
        </p>
    </div>
);