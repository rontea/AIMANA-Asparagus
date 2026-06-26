import React from 'react';
import { MessageSquare, Image as ImageIcon, Film, Cpu, Volume2, Package } from 'lucide-react';
import { ModelCategory, SupportedEngine } from './types';
import { ModelOption } from './registry';
import { ModelCard } from './ModelCard';

interface CategorySectionProps {
    category: ModelCategory;
    models: ModelOption[];
    currentModel: SupportedEngine;
    onSelect: (id: SupportedEngine) => void;
}

const getCategoryMeta = (cat: ModelCategory) => {
    switch(cat) {
        case 'Language': return { label: 'Text to Text', icon: <MessageSquare size={12} />, color: 'text-emerald-400' };
        case 'Visual': return { label: 'Text to Image', icon: <ImageIcon size={12} />, color: 'text-amber-400' };
        case 'Motion': return { label: 'Text to Video', icon: <Film size={12} />, color: 'text-blue-400' };
        case 'Audio': return { label: 'Text to Speech', icon: <Volume2 size={12} />, color: 'text-pink-400' };
        case 'Static': return { label: 'Reference / Manual Label', icon: <Package size={12} />, color: 'text-slate-500' };
        default: return { label: 'Neural Experiments', icon: <Cpu size={12} />, color: 'text-slate-400' };
    }
};

export const CategorySection: React.FC<CategorySectionProps> = ({ category, models, currentModel, onSelect }) => {
    if (models.length === 0) return null;
    const meta = getCategoryMeta(category);

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 px-1 group/header">
                <div className={`p-1.5 rounded-lg bg-slate-900 border border-slate-800 ${meta.color} transition-all group-hover/header:scale-110`}>
                    {meta.icon}
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] group-hover/header:text-slate-200 transition-colors">
                    {meta.label}
                </span>
                <div className="h-px bg-slate-800/60 flex-1 ml-2" />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {models.map(m => (
                    <ModelCard 
                        key={m.id} 
                        model={m} 
                        isActive={currentModel === m.id} 
                        onSelect={onSelect} 
                    />
                ))}
            </div>
        </div>
    );
};