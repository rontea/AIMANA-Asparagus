
import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, CheckCircle, Loader2, X } from 'lucide-react';
import { AppSettings, User } from '../../types';
import { api } from '../../services/api';
import { useModalDialogs } from '../../hooks/useModalDialogs';

interface AuthenticatorSectionProps {
    settings: AppSettings;
    user: User | null;
    onUpdate: (updates: Partial<AppSettings>) => Promise<void>;
    onInitiateDisable: () => void;
}

export const AuthenticatorSection: React.FC<AuthenticatorSectionProps> = ({ 
    settings, user, onUpdate, onInitiateDisable 
}) => {
    const { alert, alertDialog } = useModalDialogs();
    const [isSetupMode, setIsSetupMode] = useState(false);
    const [secret, setSecret] = useState<string>('');
    const [code, setCode] = useState('');
    const [isTogglingLoginProtection, setIsTogglingLoginProtection] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (isSetupMode && secret && canvasRef.current) {
            const url = api.auth.generateTotpUrl(secret, user?.email);
            requestAnimationFrame(() => {
                if (canvasRef.current) api.auth.renderQrCode(canvasRef.current, url);
            });
        }
    }, [isSetupMode, secret, user]);

    const startSetup = () => {
        const newSecret = api.auth.generateSecret();
        setSecret(newSecret);
        setIsSetupMode(true);
    };

    const verifyAndEnable = async () => {
        const isValid = api.auth.verify(code, secret);
        if (isValid) {
            await onUpdate({ isTwoFactorEnabled: true, twoFactorSecret: secret, isTwoFactorLoginEnabled: false });
            setIsSetupMode(false);
            setSecret('');
            setCode('');
        } else {
            await alert({
                title: 'Invalid Code',
                description: 'Invalid code. Please try again.',
                tone: 'danger'
            });
        }
    };

    const toggleLoginProtection = async () => {
        if (!settings.isTwoFactorEnabled) return;
        setIsTogglingLoginProtection(true);
        try {
            await onUpdate({ isTwoFactorLoginEnabled: !settings.isTwoFactorLoginEnabled });
        } catch {
            await alert({
                title: 'Update Failed',
                description: 'Could not update login protection right now. Please try again.',
                tone: 'danger'
            });
        } finally {
            setIsTogglingLoginProtection(false);
        }
    };

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Smartphone size={20} className="text-indigo-400"/> Authenticator Account
                </h2>
            </div>
            <div className="p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div>
                        <h3 className="font-medium text-slate-200">Authenticator App (TOTP)</h3>
                        <p className="text-sm text-slate-400 mt-1 max-w-lg">Enable a TOTP code from your authenticator app to enable high-security protection for your account.</p>
                    </div>
                    <div>
                        {settings.isTwoFactorEnabled ? (
                            <div className="flex flex-col items-end gap-3">
                                <span className="flex items-center text-green-400 text-sm font-medium bg-green-900/20 px-3 py-1 rounded-full border border-green-900/50">
                                    <CheckCircle size={14} className="mr-1.5"/> Enabled
                                </span>
                                <button onClick={onInitiateDisable} className="text-sm text-red-400 hover:text-red-300 underline">Disable 2FA</button>
                            </div>
                        ) : (
                            !isSetupMode && <button onClick={startSetup} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">Enable 2FA</button>
                        )}
                    </div>
                </div>
                
                {isSetupMode && (
                    <div className="mt-6 bg-slate-900 rounded-xl border border-indigo-500/30 p-6 animate-in slide-in-from-top-2">
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Smartphone size={18} className="text-indigo-400"/> Setup Authenticator</h3>
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            <div className="bg-white p-2 rounded-lg shrink-0 flex items-center justify-center">
                                <canvas ref={canvasRef} className="w-40 h-40"></canvas>
                            </div>
                            <div className="space-y-4 flex-1">
                                <div>
                                    <p className="text-sm text-slate-300 mb-2">1. Scan the QR code with your authenticator app.</p>
                                    <p className="text-xs text-slate-500 font-mono">Secret: {secret}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-300 mb-2">2. Enter the 6-digit code to verify.</p>
                                    <div className="flex gap-2">
                                        <input type="text" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g,''))} placeholder="000000" className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white font-mono tracking-widest w-32 focus:ring-2 focus:ring-indigo-500 outline-none text-center" />
                                        <button onClick={verifyAndEnable} disabled={code.length !== 6} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Verify & Enable</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                            <button onClick={() => setIsSetupMode(false)} className="text-slate-500 hover:text-slate-300 text-sm">Cancel</button>
                        </div>
                    </div>
                )}

                {!isSetupMode && (
                    <div className="mt-6 pt-4 border-t border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-200">Require TOTP on Password Login</h4>
                            <p className="text-xs text-slate-400 mt-1">
                                {settings.isTwoFactorEnabled
                                    ? 'When enabled, email/password sign-in also requires your 6-digit authenticator code. When disabled, password-only login remains active.'
                                    : 'Enable Authenticator Account first to enforce TOTP during password login.'}
                            </p>
                        </div>
                        <button
                            onClick={toggleLoginProtection}
                            disabled={!settings.isTwoFactorEnabled || isTogglingLoginProtection}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border transition-all ${
                                settings.isTwoFactorLoginEnabled
                                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                            {isTogglingLoginProtection ? (
                                <span className="inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Updating</span>
                            ) : (
                                settings.isTwoFactorEnabled
                                    ? (settings.isTwoFactorLoginEnabled ? '2FA Login On' : '2FA Login Off')
                                    : 'Enable Authenticator First'
                            )}
                        </button>
                    </div>
                )}
            </div>

            {alertDialog}
        </section>
    );
};
