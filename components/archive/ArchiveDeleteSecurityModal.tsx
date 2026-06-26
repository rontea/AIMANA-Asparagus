
import React, { useState, useEffect } from 'react';
import { Shield, X, Lock, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';

interface ArchiveDeleteSecurityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (deleteVerificationToken?: string) => void;
    isProcessing: boolean;
}

export const ArchiveDeleteSecurityModal: React.FC<ArchiveDeleteSecurityModalProps> = ({
    isOpen, onClose, onConfirm, isProcessing
}) => {
    const navigate = useNavigate();
    const [isTOTPEnforced, setIsTOTPEnforced] = useState(false);
    const [isPINEnforced, setIsPINEnforced] = useState(false);
    const [userHas2FA, setUserHas2FA] = useState(false);
    const [userHasPIN, setUserHasPIN] = useState(false);
    const [verifyCode, setVerifyCode] = useState('');
    const [verifyError, setVerifyError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            checkSecurityStatus();
        }
    }, [isOpen]);

    const checkSecurityStatus = async () => {
        try {
            const settings = await api.settings.get();
            const itemProt = settings.isItemProtectionEnabled ?? false;
            setIsTOTPEnforced((settings.isTwoFactorRequiredForDelete ?? true) && itemProt);
            setIsPINEnforced((settings.isPinProtectionEnabled ?? false) && itemProt);
            setUserHas2FA(settings.isTwoFactorEnabled);
            setUserHasPIN(!!settings.hasPinConfigured);
        } catch (e) {
            setIsTOTPEnforced(false);
            setIsPINEnforced(false);
        }
    };

    const handleVerify = async () => {
        setVerifyError(null);
        let deleteVerificationToken: string | undefined;
        
        if (isTOTPEnforced && userHas2FA) {
            if (verifyCode.length !== 6) return setVerifyError("Enter 6-digit code.");
            try {
                const result = await api.settings.verifyTotp(verifyCode);
                deleteVerificationToken = result?.deleteVerificationToken;
            } catch (e) { return setVerifyError("Verification failed."); }
        }

        const shouldCheckPin = isPINEnforced && userHasPIN && (!isTOTPEnforced || !userHas2FA);
        if (shouldCheckPin) {
            if (verifyCode.length !== 6) return setVerifyError("Enter 6-digit PIN.");
            try {
                const result = await api.settings.verifyPin(verifyCode);
                deleteVerificationToken = result?.deleteVerificationToken;
            } catch {
                return setVerifyError("Invalid PIN.");
            }
        }

        onConfirm(deleteVerificationToken);
    };

    if (!isOpen) return null;

    const isSecSetupRequired = (isTOTPEnforced && !userHas2FA) || (isPINEnforced && !userHasPIN);
    const requiresVerification = (isTOTPEnforced && userHas2FA) || (isPINEnforced && userHasPIN);
    const securityTypeLabel = (isTOTPEnforced && userHas2FA) ? 'Authenticator Code' : '6-Digit PIN';

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-[3rem] shadow-2xl w-full max-w-md space-y-8">
                {isSecSetupRequired ? (
                    <div className="space-y-6 text-center">
                        <div className="w-20 h-20 bg-amber-500/10 rounded-[2rem] flex items-center justify-center mx-auto text-amber-500 border border-amber-500/20"><Shield size={40}/></div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Security Required</h3>
                            <p className="text-xs text-slate-500 leading-relaxed font-bold uppercase tracking-tighter">Destruction Guard is active. Verification protocol must be established to perform hard purges.</p>
                        </div>
                        <button onClick={() => navigate('/settings')} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all"><Lock size={16} /> Update Security Settings</button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                {requiresVerification ? <ShieldCheck className="text-indigo-400" size={24}/> : <AlertTriangle className="text-rose-500" size={24}/>} 
                                Identity Check
                            </h3>
                            <button onClick={onClose} className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-all"><X size={24}/></button>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            {requiresVerification ? `Enter your ${securityTypeLabel} to authorize permanent manifest destruction.` : `This action will physically remove all associated binary data from storage. It is irreversible.`}
                        </p>
                        {requiresVerification && (
                            <div>
                                <input 
                                    type={isPINEnforced ? 'password' : 'text'} 
                                    maxLength={6} 
                                    value={verifyCode} 
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g,''))} 
                                    className={`w-full bg-black border border-slate-700 rounded-2xl px-4 py-5 text-center text-4xl font-mono text-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none mb-3 shadow-inner ${isPINEnforced ? 'tracking-[0.8em]' : 'tracking-widest'}`} 
                                    placeholder="000000" 
                                    autoFocus 
                                />
                                {verifyError && <p className="text-red-400 text-[10px] font-black uppercase text-center bg-red-950/20 py-2 rounded-lg border border-red-900/30">{verifyError}</p>}
                            </div>
                        )}
                        <div className="flex gap-4">
                            <button onClick={onClose} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Abort</button>
                            <button onClick={handleVerify} disabled={isProcessing || (requiresVerification && verifyCode.length !== 6)} className="flex-[2] bg-rose-600 hover:bg-rose-500 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-50">
                                {isProcessing && <Loader2 size={16} className="animate-spin" />}
                                Authorize Purge
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
