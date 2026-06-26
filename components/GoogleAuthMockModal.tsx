
import React, { useState, useEffect } from 'react';
import { X, User as UserIcon, Loader2, Trash2 } from 'lucide-react';
import { StoredUser } from '../types';

interface GoogleAuthMockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email: string, name?: string, avatar?: string) => void;
  title?: string;
}

const GoogleAuthMockModal: React.FC<GoogleAuthMockModalProps> = ({ isOpen, onClose, onSuccess, title = "Sign in with Google" }) => {
  const [step, setStep] = useState<'chooser' | 'add'>('add');
  const [knownAccounts, setKnownAccounts] = useState<Partial<StoredUser>[]>([]);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
      setEmail('');
    }
  }, [isOpen]);

  const loadAccounts = () => {
    try {
      // Simulate browser "Remember Me" using LocalStorage instead of Backend API
      const stored = localStorage.getItem('aimana_mock_google_accounts');
      if (stored) {
          const accounts = JSON.parse(stored);
          setKnownAccounts(accounts);
          if (accounts.length > 0) {
              setStep('chooser');
          } else {
              setStep('add');
          }
      } else {
          setStep('add');
      }
    } catch (e) {
      console.error(e);
      setStep('add');
    }
  };

  const handleAccountClick = (account: Partial<StoredUser>) => {
    if (account.email) {
        // Update last login
        saveAccountLocally(account.email, account.name, account.avatar);
        onSuccess(account.email!, account.name, account.avatar);
    }
  };

  const forgetAccount = (e: React.MouseEvent, emailToRemove: string) => {
      e.stopPropagation();
      const updated = knownAccounts.filter(a => a.email !== emailToRemove);
      setKnownAccounts(updated);
      localStorage.setItem('aimana_mock_google_accounts', JSON.stringify(updated));
      if (updated.length === 0) setStep('add');
  };

  const saveAccountLocally = (email: string, name?: string, avatar?: string) => {
      const newAccount = { email, name, avatar, lastLogin: Date.now(), id: 'mock-' + email };
      const existing = knownAccounts.filter(a => a.email !== email);
      const updated = [newAccount, ...existing].slice(0, 5); // Keep last 5
      localStorage.setItem('aimana_mock_google_accounts', JSON.stringify(updated));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    // Generate placeholder info
    const localPart = email.split('@')[0];
    const generatedName = localPart.split(/[._-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    const generatedAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(generatedName)}&background=3b82f6&color=fff`;
    
    saveAccountLocally(email, generatedName, generatedAvatar);
    onSuccess(email, generatedName, generatedAvatar);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" role="dialog" aria-modal="true">
      <div className="bg-white text-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <span className="font-bold text-gray-500 flex items-center gap-1">
                <span className="text-blue-500">G</span>oogle
            </span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
            </button>
        </div>

        {step === 'chooser' ? (
            <div className="p-0">
                <div className="text-center p-6 pb-2">
                    <h3 className="text-lg font-medium">Choose an account</h3>
                    <p className="text-sm text-gray-500">to continue to AIMANA</p>
                </div>
                
                <div className="border-t border-gray-100 max-h-[300px] overflow-y-auto">
                    {knownAccounts.map(acc => (
                        <div 
                            key={acc.email}
                            onClick={() => handleAccountClick(acc)}
                            className="w-full flex items-center gap-4 px-6 py-3 hover:bg-gray-50 border-b border-gray-100 transition-colors text-left cursor-pointer group"
                        >
                            <img src={acc.avatar} alt="" className="w-10 h-10 rounded-full shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-800 truncate">{acc.name}</div>
                                <div className="text-sm text-gray-500 truncate">{acc.email}</div>
                            </div>
                            <button 
                                onClick={(e) => forgetAccount(e, acc.email!)}
                                className="text-gray-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all"
                                title="Remove account"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    
                    <button 
                        onClick={() => setStep('add')}
                        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left text-slate-700 font-medium"
                    >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-gray-200">
                            <UserIcon size={20} className="text-gray-500" />
                        </div>
                        <div>Use another account</div>
                    </button>
                </div>
            </div>
        ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="text-center mb-2">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-8 h-8" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium">Sign in</h3>
                    <p className="text-sm text-gray-500">to continue to AIMANA</p>
                </div>
                
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email or phone</label>
                    <input 
                        type="email" 
                        name="email"
                        id="google-mock-email"
                        autoComplete="username email"
                        required
                        autoFocus
                        placeholder="user@example.com"
                        className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-900"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                </div>

                <div className="flex justify-between items-center mt-4">
                    {knownAccounts.length > 0 && (
                        <button 
                            type="button"
                            onClick={() => setStep('chooser')}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                            Back
                        </button>
                    )}
                    <button 
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded transition-colors flex items-center justify-center ml-auto shadow-sm"
                    >
                        Next
                    </button>
                </div>
            </form>
        )}
      </div>
    </div>
  );
};

export default GoogleAuthMockModal;
