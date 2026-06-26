import React, { useState, useEffect } from 'react';
import { Shield, Smartphone, Key, PlusSquare, AlertTriangle, CheckCircle2, Edit2, ChevronRight, Info } from 'lucide-react';
import { AppSettings } from '../../types';
import { ProtectionToggle } from './protection/ProtectionToggle';
import { PinSetupForm } from './protection/PinSetupForm';

interface ProtectionSectionProps {
    settings: AppSettings;
    onToggleDeleteProtection: () => void;
    onTogglePinProtection: () => void;
    onToggleItemProtection: () => void;
    onSavePin: (pin: string) => Promise<void>;
}

export const ProtectionSection: React.FC<ProtectionSectionProps> = ({
    settings, onToggleDeleteProtection, onTogglePinProtection, onToggleItemProtection, onSavePin
}) => {
    const [isPinSetupMode, setIsPinSetupMode] = useState(false);
    const [showPinSuccess, setShowPinSuccess] = useState(false);
    const [isRecentlySaved, setIsRecentlySaved] = useState(false);
    const hasPinConfigured = !!settings.hasPinConfigured;

    useEffect(() => {
        if (hasPinConfigured) {
            setIsRecentlySaved(false);
        }
    }, [hasPinConfigured]);

    const handleSavePin = async (pin: string) => {
        await onSavePin(pin);
        setIsPinSetupMode(false);
        setIsRecentlySaved(true);
        setShowPinSuccess(true);
        setTimeout(() => setShowPinSuccess(false), 5000);
    };

    const isProtectionActive = settings.isTwoFactorRequiredForDelete || settings.isPinProtectionEnabled;
    const showPinForm = isPinSetupMode || (settings.isPinProtectionEnabled && !hasPinConfigured && !isRecentlySaved);

    return (
        <section className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg">
            <div className="p-6 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Shield size={20} className="text-amber-500"/> Project Protection
                </h2>
            </div>
            
            <div className="p-6 space-y-8">
                {/* 1. Authenticator (TOTP) */}
                <ProtectionToggle 
                    icon={Smartphone}
                    iconColor="text-indigo-400"
                    title="Enforce Authenticator (TOTP)"
                    description="Require a code from your authenticator app for deletions. Verification required to enable if PIN is active."
                    isEnabled={!!settings.isTwoFactorRequiredForDelete}
                    isDisabled={!!settings.isPinProtectionEnabled}
                    onToggle={onToggleDeleteProtection}
                    lockIcon={!!settings.isPinProtectionEnabled}
                    lockColor="text-amber-500"
                />

                <div className="h-px bg-slate-700"></div>

                {/* 2. 6-Digit PIN */}
                <div className="space-y-4">
                    <ProtectionToggle 
                        icon={Key}
                        iconColor="text-amber-400"
                        title="Enforce 6-Digit PIN"
                        description="Require a static user-defined PIN for deletions. Verification required to enable if TOTP is active."
                        isEnabled={!!settings.isPinProtectionEnabled}
                        isDisabled={!!settings.isTwoFactorRequiredForDelete}
                        onToggle={onTogglePinProtection}
                        lockIcon={!!settings.isTwoFactorRequiredForDelete}
                        lockColor="text-indigo-500"
                    />

                    {/* Security Reset Notification */}
                    {!settings.isPinProtectionEnabled && (
                         <div className="ml-0 md:ml-10 flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase tracking-tighter opacity-60">
                            <Info size={10} /> Disabling PIN will clear your stored code for security.
                        </div>
                    )}

                    {/* Prominent Update PIN button when enabled */}
                    {settings.isPinProtectionEnabled && hasPinConfigured && !showPinForm && (
                        <div className="ml-0 md:ml-10 animate-in fade-in slide-in-from-left-2">
                            <button 
                                onClick={() => setIsPinSetupMode(true)} 
                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-all bg-indigo-500/5 hover:bg-indigo-500/10 px-4 py-2 rounded-lg border border-indigo-500/20 group"
                            >
                                <Edit2 size={12} className="group-hover:rotate-12 transition-transform" /> 
                                <span>Update Security PIN</span>
                                <ChevronRight size={12} className="ml-1 opacity-50" />
                            </button>
                        </div>
                    )}

                    {showPinSuccess && (
                        <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2 ml-0 md:ml-10">
                            <CheckCircle2 size={18} className="shrink-0" /> 
                            <span>PIN has been configured and saved successfully.</span>
                        </div>
                    )}

                    {showPinForm && (
                        <div className="ml-0 md:ml-10">
                            <PinSetupForm 
                                isEditMode={hasPinConfigured}
                                onSave={handleSavePin}
                                onCancel={() => { setIsPinSetupMode(false); }}
                            />
                        </div>
                    )}
                </div>

                <div className="h-px bg-slate-700"></div>

                {/* 3. Permanent Deletion Security */}
                <ProtectionToggle 
                    icon={PlusSquare}
                    iconColor="text-emerald-400"
                    title="Permanent Deletion Security"
                    description="Verification Switch: If enabled, requires identity verification (PIN/Code) for permanently deleting items or projects."
                    isEnabled={!!settings.isItemProtectionEnabled}
                    isDisabled={!isProtectionActive}
                    onToggle={onToggleItemProtection}
                    activeLabel="Active"
                    inactiveLabel="Bypassed"
                />
                
                {/* 2FA Warning Notification */}
                {!settings.isTwoFactorEnabled && settings.isTwoFactorRequiredForDelete && !settings.isPinProtectionEnabled && (
                    <div className="bg-amber-900/20 border border-amber-900/50 p-4 rounded-lg flex items-start gap-3 mt-4">
                        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                        <p className="text-xs text-amber-200 leading-relaxed">
                            <strong>Note:</strong> Authenticator Protection is toggled ON but account 2FA is not setup. 
                            Please enable 2FA above for protection to be enforceable.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
};
