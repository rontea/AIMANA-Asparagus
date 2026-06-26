
import React from 'react';
import { X, ShieldCheck, Smartphone, Shield, Loader2 } from 'lucide-react';

interface VerificationOverlayProps {
    type: 'none' | 'totp-disable' | 'pin-disable' | 'totp-to-pin' | 'pin-to-totp' | 'item-prot-disable';
    input: string;
    setInput: (val: string) => void;
    error: string | null;
    isVerifying: boolean;
    onClose: () => void;
    onSubmit: () => void;
    activeMethod: 'TOTP' | 'PIN';
}

export const VerificationOverlay: React.FC<VerificationOverlayProps> = ({
    type, input, setInput, error, isVerifying, onClose, onSubmit, activeMethod
}) => {
    if (type === 'none') return null;

    const isPinMode = type === 'pin-disable' || type === 'pin-to-totp' || (type === 'item-prot-disable' && activeMethod === 'PIN');

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="text-indigo-400" size={20}/>Security Verification
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                    <p className="text-sm text-slate-400 leading-relaxed">
                        {type === 'totp-disable' && "Enter your 6-digit Authenticator code to turn off Project Protection."}
                        {type === 'pin-disable' && "Enter your 6-digit PIN to turn off Project Protection."}
                        {type === 'totp-to-pin' && "Enter your 6-digit Authenticator code to disable it and switch to PIN protection."}
                        {type === 'pin-to-totp' && "Enter your 6-digit PIN to disable it and switch to Authenticator protection."}
                        {type === 'item-prot-disable' && `Enter your 6-digit ${activeMethod} to turn off Permanent Deletion Security.`}
                    </p>
                    <div className="relative">
                        <input 
                            type={isPinMode ? 'password' : 'text'} 
                            maxLength={6} 
                            value={input} 
                            onChange={(e) => setInput(e.target.value.replace(/\D/g,''))} 
                            className={`w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-center text-2xl font-mono text-white focus:ring-2 focus:ring-indigo-500 outline-none ${isPinMode ? 'tracking-[1em]' : 'tracking-widest'}`} 
                            placeholder="000000" 
                            autoFocus 
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                            {isPinMode ? <Shield size={20}/> : <Smartphone size={20}/>}
                        </div>
                    </div>
                    {error && <p className="text-red-400 text-xs text-center bg-red-950/20 py-2 rounded border border-red-900/30">{error}</p>}
                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-medium">Cancel</button>
                        <button onClick={onSubmit} disabled={isVerifying || input.length !== 6} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2">
                            {isVerifying ? <Loader2 size={14} className="animate-spin"/> : null}Verify & Update
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
