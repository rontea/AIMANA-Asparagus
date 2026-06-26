import React from 'react';

interface HubLayoutProps {
    mainContent: React.ReactNode;
    sidebar: React.ReactNode;
}

export const HubLayout: React.FC<HubLayoutProps> = ({ mainContent, sidebar }) => (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-950/20">
            {mainContent}
        </div>
        <aside className="w-full md:w-[400px] border-l border-slate-800/50 bg-slate-950/40 overflow-y-auto custom-scrollbar">
            {sidebar}
        </aside>
    </div>
);