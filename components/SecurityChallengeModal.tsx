import React, { useState } from 'react';
import { Lock, X, Loader2, ShieldAlert, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { privilegedAuth } from '../services/privilegedAuth';

interface SecurityChallengeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    title?: string;
    description?: string;
}

const SecurityChallengeModal: React.FC<SecurityChallengeModalProps> = ({
    isOpen, onClose, onSuccess, title = "Security Verification", description = "Please enter your password to authorize this sensitive operation."
}) => {
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await api.auth.verifyPassword(password);
            privilegedAuth.authenticate();
            onSuccess();
            setPassword('');
        } catch (err: any) {
            setError(err.message || "Invalid password. Access denied.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
                    <h3 className="text-lg font-bold text-white flex items-center gap-3">
                        <ShieldAlert className="text-indigo-400" /> {title}
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <p className="text-sm text-slate-400 leading-relaxed text-center">{description}</p>
                    
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Super Admin Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-800"
                                placeholder="••••••••"
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-xs font-bold animate-in shake">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="flex-1 px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isLoading || !password}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-3 rounded-xl text-sm shadow-xl shadow-indigo-900/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : "Verify"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SecurityChallengeModal;
