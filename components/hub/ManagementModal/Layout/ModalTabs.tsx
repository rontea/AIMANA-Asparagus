
import React, { useMemo } from 'react';
import { Layout, Network, Settings2, Code2, Beaker, BarChart3 } from 'lucide-react';
import { TabID } from '../../../../hooks/useEngineManagement';

interface ModalTabsProps {
    activeTab: TabID;
    setActiveTab: (tab: TabID) => void;
    isProgrammable: boolean;
    category: string;
}

const ALL_TABS = [
    { id: 'meta' as TabID, label: 'Identity', icon: Layout, functional: false, hiddenForStatic: false },
    { id: 'logic' as TabID, label: 'Network', icon: Network, functional: true, hiddenForStatic: true },
    { id: 'ui' as TabID, label: 'Controls', icon: Settings2, functional: true, hiddenForStatic: true },
    { id: 'advanced' as TabID, label: 'Directive', icon: Code2, functional: false, hiddenForStatic: true },
    { id: 'intelligence' as TabID, label: 'Model Intelligence', icon: BarChart3, functional: false, hiddenForStatic: false },
    { id: 'test' as TabID, label: 'Sandbox', icon: Beaker, functional: true, hiddenForStatic: true }
];

export const ModalTabs: React.FC<ModalTabsProps> = ({ activeTab, setActiveTab, isProgrammable, category }) => {
    const isStatic = category === 'Static';

    const visibleTabs = useMemo(() => {
        return ALL_TABS.filter(tab => {
            // 1. If it's a static engine, hide everything except Identity
            if (isStatic && tab.hiddenForStatic) return false;
            
            // 2. For non-static, handle functional tab visibility via the Programmable toggle
            if (!isStatic && tab.functional && !isProgrammable) return false;

            return true;
        });
    }, [isProgrammable, isStatic]);

    return (
        <div className="flex bg-slate-950 border-b border-slate-800 px-8 shrink-0 overflow-x-auto scrollbar-hide">
            {visibleTabs.map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
                        activeTab === tab.id 
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' 
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <tab.icon size={14} /> {tab.label}
                </button>
            ))}
        </div>
    );
};
