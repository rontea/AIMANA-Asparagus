
import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Loader2, CheckCircle, AlertCircle, Mail } from 'lucide-react';
import { api } from '../../services/api';
import { StoredUser } from '../../types';

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

const ShareProjectModal: React.FC<ShareProjectModalProps> = ({ isOpen, onClose, projectId, projectName }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  const [suggestions, setSuggestions] = useState<Partial<StoredUser>[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
      if (isOpen) {
          fetchSuggestions('');
      }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
      try {
          if (abortRef.current) {
              abortRef.current.abort();
          }
          const controller = new AbortController();
          abortRef.current = controller;
          const users = await api.users.search(query, projectId, controller.signal);
          setSuggestions(users);
      } catch (e) {
          if ((e as any)?.name !== 'AbortError') {
              console.error("Failed to fetch suggestions", e);
          }
      }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setEmail(val);
      setStatus(null);
      if (debounceRef.current !== null) {
          window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
          fetchSuggestions(val);
      }, 220);
      setShowSuggestions(true);
  };

  const selectUser = (user: Partial<StoredUser>) => {
      if (user.email) {
          setEmail(user.email);
          setShowSuggestions(false);
      }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    setStatus(null);
    setShowSuggestions(false);

    try {
        await api.projects.share(projectId, email);
        setStatus({ type: 'success', message: `Access granted to ${email}` });
        setEmail('');
    } catch (err: any) {
        setStatus({ type: 'error', message: err.message || 'Failed to share project' });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95 overflow-visible">
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-800/30 rounded-t-3xl">
            <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <UserPlus size={24} className="text-indigo-400" /> Share Project
                </h2>
                <p className="text-xs text-slate-400 mt-1">Invite collaborators to <span className="text-white font-medium">{projectName}</span></p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors">
                <X size={24} />
            </button>
        </div>

        <form onSubmit={handleShare} className="p-8 space-y-6 relative">
            <div className="space-y-2 relative" ref={dropdownRef}>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">User Email Address</label>
                <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="email" 
                        value={email}
                        onChange={handleInputChange}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="colleague@example.com"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-700"
                        required
                        autoFocus
                        autoComplete="off"
                    />
                </div>
                
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-[170] max-h-56 overflow-y-auto animate-in slide-in-from-top-2">
                        {suggestions.map(user => (
                            <button
                                key={user.id}
                                type="button"
                                onClick={() => selectUser(user)}
                                className="w-full text-left px-5 py-4 hover:bg-slate-700 transition-colors flex items-center gap-4 border-b border-slate-700/50 last:border-0"
                            >
                                <div className="shrink-0">
                                    {user.avatar ? (
                                        <img src={user.avatar} className="w-9 h-9 rounded-full border border-slate-600" alt="" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                                            {(user.name || 'U').charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-slate-200 truncate">{user.name}</div>
                                    <div className="text-xs text-slate-500 truncate">{user.email}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {status && (
                <div className={`text-sm p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-1 ${status.type === 'success' ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-900/50' : 'bg-red-900/20 text-red-400 border border-red-900/50'}`}>
                    {status.type === 'success' ? <CheckCircle size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
                    <span className="font-medium">{status.message}</span>
                </div>
            )}

            <div className="flex justify-end gap-4 pt-4">
                <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors">
                    Cancel
                </button>
                <button 
                    type="submit"
                    disabled={isSubmitting || !email}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-3 rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-all active:scale-95"
                >
                    {isSubmitting ? <><Loader2 size={18} className="animate-spin mr-2" /> Sending</> : "Invite"}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default ShareProjectModal;
