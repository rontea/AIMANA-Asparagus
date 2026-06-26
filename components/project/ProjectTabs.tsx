
import React from 'react';

export type TabID = 'active' | 'linked_artifacts' | 'pinned' | 'reference' | 'forge_reference';

interface ProjectTabsProps {
    activeTab: TabID;
    onTabChange: (id: TabID) => void;
    counts: {
        active: number;
        linked_artifacts: number;
        pinned: number;
        reference: number;
        forge_reference: number;
    };
}

export const ProjectTabs: React.FC<ProjectTabsProps> = ({ activeTab, onTabChange, counts }) => {
    const tabs: { id: TabID; label: string }[] = [
        { id: 'active', label: 'Active Assets' },
        { id: 'pinned', label: 'Pinned Assets' },
        { id: 'linked_artifacts', label: 'Linked Artifacts' },
        { id: 'forge_reference', label: 'Used In Forge' },
        { id: 'reference', label: 'Reference Assets' }
    ];

    return (
        <div className="mb-6 border-b border-slate-800 bg-slate-900 z-10">
            <div className="flex gap-4 overflow-x-auto pb-1 pt-2 px-1 custom-scrollbar">
                {tabs.map((tab) => (
                    <button 
                        key={tab.id} 
                        onClick={() => onTabChange(tab.id)} 
                        className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-1 pb-3 text-sm font-bold transition-all ${
                            activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            activeTab === tab.id 
                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                            : 'bg-slate-800 border-slate-700 text-slate-500'
                        }`}>
                            {counts[tab.id as keyof typeof counts]}
                        </span>
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};
