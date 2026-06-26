import React from 'react';
import { api } from '../../../services/api';

export const DashboardGreeting: React.FC = () => {
    const user = api.auth.getUser();
    const firstName = user?.name?.split(' ')[0] || 'Operator';

    return (
        <div className="space-y-1 animate-in fade-in slide-in-from-left-4 duration-700">
            <h1 className="text-2xl font-black italic tracking-tight text-white sm:text-3xl">
                Welcome back, <span className="text-indigo-400">{firstName}</span>.
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                AI Asset Orchestration Platform
            </p>
        </div>
    );
};
