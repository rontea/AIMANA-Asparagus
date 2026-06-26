
import React, { useState } from 'react';
import { X, Key, Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../services/api';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPwd !== confirmPwd) {
        setMessage({ type: 'error', text: "New passwords do not match." });
        return;
    }
    if (newPwd.length < 6) {
        setMessage({ type: 'error', text: "Password must be at least 6 characters." });
        return;
    }

    setLoading(true);
    try {
        await api.auth.updatePassword(currentPwd, newPwd);
        setMessage({ type: 'success', text: "Password updated. Sign in again to continue." });
        
        window.setTimeout(async () => {
            await api.auth.logout();
            onClose();
            setCurrentPwd('');
            setNewPwd('');
            setConfirmPwd('');
            setMessage(null);
            navigate('/login');
        }, 1500);
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message || "Failed to update password." });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-800/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Key size={18} className="text-indigo-400" /> Change Password
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors">
                    <X size={20} />
                </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Current Password</label>
                    <div className="relative">
                        <input 
                            type={showCurrentPwd ? "text" : "password"}
                            value={currentPwd}
                            onChange={(e) => setCurrentPwd(e.target.value)}
                            required
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                            placeholder="••••••••"
                        />
                        <button
                            type="button"
                            onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            {showCurrentPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                        </button>
                    </div>
                </div>
                
                <div className="space-y-4 pt-2 border-t border-slate-800/50">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">New Password</label>
                        <div className="relative">
                            <input 
                                type={showNewPwd ? "text" : "password"}
                                value={newPwd}
                                onChange={(e) => setNewPwd(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPwd(!showNewPwd)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {showNewPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Confirm Password</label>
                        <div className="relative">
                            <input 
                                type={showConfirmPwd ? "text" : "password"}
                                value={confirmPwd}
                                onChange={(e) => setConfirmPwd(e.target.value)}
                                required
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {showConfirmPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                            </button>
                        </div>
                    </div>
                </div>

                {message && (
                    <div className={`text-sm p-3 rounded-lg flex items-center ${message.type === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900/50' : 'bg-red-900/20 text-red-400 border border-red-900/50'}`}>
                        {message.type === 'success' ? <CheckCircle size={16} className="mr-2" /> : <AlertCircle size={16} className="mr-2" />}
                        {message.text}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-lg shadow-indigo-900/20 disabled:opacity-50 flex items-center"
                    >
                        {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> Updating...</> : "Update Password"}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default ChangePasswordModal;
