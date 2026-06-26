import React, { useState } from 'react';
import { BrainCircuit, Info, ShieldAlert } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { IntentSection } from '../components/settings/IntentSection';
import { privilegedAuth } from '../services/privilegedAuth';
import SecurityChallengeModal from '../components/SecurityChallengeModal';
import { api } from '../services/api';

const NeuralIntents: React.FC = () => {
    const navigate = useNavigate();
    const user = api.auth.getUser();
    const [isAuthorized, setIsAuthorized] = useState(() => privilegedAuth.isAuthorized());

    // Strict Access Control: Redirect any non-root user
    if (user?.id !== 'admin-root') {
        return <Navigate to="/" replace />;
    }

    if (!isAuthorized) {
        return (
            <SecurityChallengeModal 
                isOpen={true}
                onClose={() => navigate('/')}
                onSuccess={() => {
                    privilegedAuth.authenticate();
                    setIsAuthorized(true);
                }}
                title="Neural Intent Access"
                description="To manage global project classification and neural intents, please verify your administrator credentials."
            />
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
                        <BrainCircuit size={36} className="text-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
                        Neural Intents
                    </h1>
                    <p className="text-slate-400 font-medium">Global Project Classification Registry & Neural Logic Clusters.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-900/20 border border-indigo-900/50 rounded-xl text-indigo-400 text-xs font-black uppercase tracking-widest">
                        <ShieldAlert size={14} /> Super Admin Access
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-3xl flex items-start gap-4 shadow-inner">
                <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 shrink-0">
                    <Info size={20} />
                </div>
                <div className="text-sm text-slate-400 leading-relaxed">
                    <p>Manage the high-level archetypes for all workspaces in the AIMANA ecosystem. Custom intents allow you to tailor project environments with specific icons and color identities, enabling faster visual navigation across large asset clusters.</p>
                    <p className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-tighter italic">Note: Changes made here are reflected immediately in the "Project Settings" and "Create Project" interfaces.</p>
                </div>
            </div>

            <div className="mt-6">
                <IntentSection />
            </div>
        </div>
    );
};

export default NeuralIntents;