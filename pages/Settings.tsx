import React, { useEffect, useState } from 'react';
/* Importing useNavigate from core package to resolve missing named export issue */
import { useNavigate } from 'react-router';
import { api } from '../services/api';
import { privilegedAuth } from '../services/privilegedAuth';
import { AppSettings, User } from '../types';
import { Lock, Loader2, Shield } from 'lucide-react';
import { AuthenticatorSection } from '../components/settings/AuthenticatorSection';
import { ProtectionSection } from '../components/settings/ProtectionSection';
import { UserSection } from '../components/settings/UserSection';
import { PolicySection } from '../components/settings/PolicySection';
import { DashboardPreferencesSection } from '../components/settings/DashboardPreferencesSection';
import { LicenseSection } from '../components/settings/LicenseSection';
import { UpdateSection } from '../components/settings/UpdateSection';
import { AboutSection } from '../components/settings/AboutSection';
import { VerificationOverlay } from '../components/settings/VerificationOverlay';
import { VoiceSection } from '../components/settings/VoiceSection';
import SecurityChallengeModal from '../components/SecurityChallengeModal';
import { useAppUpdate } from '../hooks/useAppUpdate';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings>({ 
      isTwoFactorEnabled: false, 
      isTwoFactorLoginEnabled: false,
      isTwoFactorRequiredForDelete: true, 
      maxUsers: 5, 
      inactivityTimeout: 0, 
      aiEngines: [], 
      assetIngestionEngines: [],
      isPinProtectionEnabled: false, 
      isItemProtectionEnabled: false,
      bulkLimit: 8,
      manualPollenHourlyRate: 0.15,
      dashboardResultLimit: 24,
      defaultReadAloudVoiceURI: '',
      defaultReadAloudVoiceName: ''
  });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(() => privilegedAuth.isAuthorized());

  // Verification Flow State
  const [verificationType, setVerificationType] = useState<'none' | 'totp-disable' | 'pin-disable' | 'totp-to-pin' | 'pin-to-totp' | 'item-prot-disable'>('none');
  const [verificationInput, setVerificationInput] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Account 2FA Disable Flow
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [isReloadingForUpdate, setIsReloadingForUpdate] = useState(false);
  const {
    currentVersion,
    latestVersion,
    checkedAt: updateCheckedAt,
    isChecking: isCheckingForUpdate,
    updateAvailable,
    error: updateError,
    refresh: refreshAppVersion
  } = useAppUpdate();

  useEffect(() => {
    setCurrentUser(api.auth.getUser());
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const s = await api.settings.get();
      setSettings({
          ...s,
          isTwoFactorLoginEnabled: s.isTwoFactorLoginEnabled ?? false,
          aiEngines: s.aiEngines || [],
          assetIngestionEngines: s.assetIngestionEngines || [],
          isTwoFactorRequiredForDelete: s.isTwoFactorRequiredForDelete ?? true,
          isPinProtectionEnabled: s.isPinProtectionEnabled ?? false,
          isItemProtectionEnabled: s.isItemProtectionEnabled ?? false,
          bulkLimit: s.bulkLimit ?? 8,
          manualPollenHourlyRate: s.manualPollenHourlyRate ?? 0.15,
          dashboardResultLimit: s.dashboardResultLimit ?? 24,
          defaultReadAloudVoiceURI: s.defaultReadAloudVoiceURI ?? '',
          defaultReadAloudVoiceName: s.defaultReadAloudVoiceName ?? ''
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const executeSettingsUpdate = async (updates: any) => {
      const payload = { ...settings, ...updates };
      
      const nextPin = updates.isPinProtectionEnabled !== undefined ? updates.isPinProtectionEnabled : payload.isPinProtectionEnabled;
      const nextTotp = updates.isTwoFactorRequiredForDelete !== undefined ? updates.isTwoFactorRequiredForDelete : payload.isTwoFactorRequiredForDelete;
      
      if (!nextPin && !nextTotp) payload.isItemProtectionEnabled = false;

      try {
          await api.settings.update(payload);
          await loadSettings();
          setVerificationType('none');
          window.dispatchEvent(new CustomEvent('settings-updated'));
      } catch(e) { console.error(e); }
  };

  const toggleDeleteProtection = () => {
      const turningOn = !settings.isTwoFactorRequiredForDelete;
      if (turningOn) {
          if (settings.isPinProtectionEnabled) {
              setVerificationType('pin-to-totp'); setVerificationInput(''); setVerificationError(null);
          } else executeSettingsUpdate({ isTwoFactorRequiredForDelete: true, isPinProtectionEnabled: false, pinHash: null });
      } else {
          if (settings.isTwoFactorEnabled) {
              setVerificationType('totp-disable'); setVerificationInput(''); setVerificationError(null);
          } else executeSettingsUpdate({ isTwoFactorRequiredForDelete: false });
      }
  };

  const togglePinProtection = () => {
      const turningOn = !settings.isPinProtectionEnabled;
      if (turningOn) {
          if (settings.isTwoFactorRequiredForDelete && settings.isTwoFactorEnabled) {
              setVerificationType('totp-to-pin'); setVerificationInput(''); setVerificationError(null);
          } else executeSettingsUpdate({ isPinProtectionEnabled: true, isTwoFactorRequiredForDelete: false });
      } else {
          setVerificationType('pin-disable'); setVerificationInput(''); setVerificationError(null);
      }
  };

  const toggleItemProtection = () => {
      if (settings.isItemProtectionEnabled) {
          setVerificationType('item-prot-disable'); setVerificationInput(''); setVerificationError(null);
      } else executeSettingsUpdate({ isItemProtectionEnabled: true });
  };

  const handleVerificationSubmit = async () => {
      setIsVerifying(true); setVerificationError(null);
      try {
          let verified = false;
          const checkMethod: 'totp' | 'pin' = (verificationType === 'totp-disable' || verificationType === 'totp-to-pin') ? 'totp' : 'pin';

          if (checkMethod === 'totp') {
              await api.settings.verifyTotp(verificationInput);
              verified = true;
          } else {
              await api.settings.verifyPin(verificationInput);
              verified = true;
          }

          if (verified) {
              switch(verificationType) {
                  case 'totp-disable': await executeSettingsUpdate({ isTwoFactorRequiredForDelete: false }); break;
                  case 'pin-disable': await executeSettingsUpdate({ isPinProtectionEnabled: false, pinHash: null }); break;
                  case 'item-prot-disable': await executeSettingsUpdate({ isItemProtectionEnabled: false }); break;
                  case 'totp-to-pin': setVerificationType('none'); await executeSettingsUpdate({ isPinProtectionEnabled: true, isTwoFactorRequiredForDelete: false }); break;
                  case 'pin-to-totp': await executeSettingsUpdate({ isTwoFactorRequiredForDelete: true, isPinProtectionEnabled: false, pinHash: null }); break;
              }
          }
      } catch (e: any) { setVerificationError(e.message || "Verification failed."); }
      finally { setIsVerifying(false); }
  };

  const handleConfirmAccountDisable = async () => {
      try {
          await api.settings.verifyTotp(disableCode);
          await executeSettingsUpdate({ isTwoFactorEnabled: false, twoFactorSecret: '' });
          setIsDisableModalOpen(false);
      } catch {
          setDisableError("Invalid code.");
      }
  };

  const isAdmin = currentUser?.role === 'admin';
  const isSuperUser = currentUser?.id === 'admin-root';

  if (!isAuthorized) {
      return (
          <SecurityChallengeModal 
              isOpen={true}
              onClose={() => navigate('/')}
              onSuccess={() => {
                  privilegedAuth.authenticate();
                  setIsAuthorized(true);
              }}
              title="Settings Access"
              description="To view or modify application security and user policies, please verify your identity."
          />
      );
  }

  if (loading) return <div className="text-slate-400 p-8 text-center"><Loader2 className="animate-spin inline mr-2" /> Loading settings...</div>;

  const sectionNavItems = [
      { id: 'settings-authenticator', label: 'Authenticator' },
      { id: 'settings-protection', label: 'Protection' },
      ...(isAdmin ? [{ id: 'settings-users', label: 'Users' }] : []),
      ...(isAdmin ? [{ id: 'settings-policies', label: 'Policies' }] : []),
      { id: 'settings-dashboard', label: 'Dashboard' },
      { id: 'settings-voice', label: 'Voice Reader' },
      ...(isSuperUser ? [{ id: 'settings-update', label: 'Client Update' }] : []),
      { id: 'settings-about', label: 'About' },
      { id: 'settings-license', label: 'License' }
  ];

  const scrollToSection = (id: string) => {
      const targetSection = document.getElementById(id);
      if (!targetSection) return;
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const handleReloadForUpdate = () => {
      setIsReloadingForUpdate(true);
      window.location.reload();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight flex items-center gap-3">
            <Lock className="text-indigo-500" /> Settings
        </h1>
        <p className="text-slate-400 mt-1">Manage application security and preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <aside className="lg:sticky lg:top-20 h-fit">
              <nav className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="px-2 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Sections</p>
                  <div className="space-y-1">
                      {sectionNavItems.map((item) => (
                          <button
                              type="button"
                              key={item.id}
                              onClick={() => scrollToSection(item.id)}
                              className="block rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                          >
                              {item.label}
                          </button>
                      ))}
                  </div>
              </nav>
          </aside>

          <div className="space-y-8">
              <div id="settings-authenticator" className="scroll-mt-24">
                  <AuthenticatorSection 
                      settings={settings} 
                      user={currentUser} 
                      onUpdate={async (u) => executeSettingsUpdate(u)} 
                      onInitiateDisable={() => { setDisableCode(''); setDisableError(null); setIsDisableModalOpen(true); }} 
                  />
              </div>

              <div id="settings-protection" className="scroll-mt-24">
                  <ProtectionSection 
                      settings={settings} 
                      onToggleDeleteProtection={toggleDeleteProtection}
                      onTogglePinProtection={togglePinProtection}
                      onToggleItemProtection={toggleItemProtection}
                      onSavePin={async (pin) => executeSettingsUpdate({ isPinProtectionEnabled: true, isTwoFactorRequiredForDelete: false, newRawPin: pin })}
                  />
              </div>

              {isAdmin && (
                  <div id="settings-users" className="scroll-mt-24">
                      <UserSection />
                  </div>
              )}

              {isAdmin && (
                  <div id="settings-policies" className="scroll-mt-24">
                      <PolicySection 
                          settings={settings} 
                          onSavePolicies={async ({ maxUsers, timeout, bulkLimit, manualPollenHourlyRate }) => executeSettingsUpdate({ maxUsers, inactivityTimeout: timeout, bulkLimit, manualPollenHourlyRate })}
                      />
                  </div>
              )}

              <div id="settings-dashboard" className="scroll-mt-24">
                  <DashboardPreferencesSection
                      dashboardResultLimit={settings.dashboardResultLimit}
                      onSaveDashboardPreferences={async ({ dashboardResultLimit }) => executeSettingsUpdate({ dashboardResultLimit })}
                  />
              </div>

              <div id="settings-voice" className="scroll-mt-24">
                  <VoiceSection
                      defaultVoiceURI={settings.defaultReadAloudVoiceURI}
                      defaultVoiceName={settings.defaultReadAloudVoiceName}
                      isAdmin={isAdmin}
                      onSaveDefaultVoice={async (voiceURI, voiceName) => executeSettingsUpdate({
                          defaultReadAloudVoiceURI: voiceURI,
                          defaultReadAloudVoiceName: voiceName
                      })}
                  />
              </div>

              {isSuperUser && (
                  <div id="settings-update" className="scroll-mt-24">
                      <UpdateSection
                          currentVersion={currentVersion}
                          latestVersion={latestVersion}
                          checkedAt={updateCheckedAt}
                          isChecking={isCheckingForUpdate}
                          isReloading={isReloadingForUpdate}
                          updateAvailable={updateAvailable}
                          error={updateError}
                          onCheckNow={() => { void refreshAppVersion(); }}
                          onUpdateNow={handleReloadForUpdate}
                      />
                  </div>
              )}

              <div id="settings-about" className="scroll-mt-24">
                  <AboutSection />
              </div>

              <div id="settings-license" className="scroll-mt-24">
                  <LicenseSection />
              </div>
          </div>
      </div>

      <VerificationOverlay 
          type={verificationType} input={verificationInput} setInput={setVerificationInput} 
          error={verificationError} isVerifying={isVerifying} 
          onClose={() => setVerificationType('none')} onSubmit={handleVerificationSubmit}
          activeMethod={settings.isTwoFactorRequiredForDelete ? 'TOTP' : 'PIN'}
      />

      {isDisableModalOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in">
              <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-sm">
                  <div className="flex justify-between items-start mb-4"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Shield className="text-indigo-400" size={20}/>Disable 2FA</h3><button onClick={() => setIsDisableModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">X</button></div>
                  <div className="space-y-4">
                      <p className="text-sm text-slate-400">Enter the 6-digit code from your app to disable account-level 2FA.</p>
                      <input type="text" maxLength={6} value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g,''))} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-center text-2xl tracking-widest font-mono text-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="000000" />
                      {disableError && <p className="text-red-400 text-xs text-center">{disableError}</p>}
                      <div className="flex gap-3"><button onClick={() => setIsDisableModalOpen(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-medium">Cancel</button><button onClick={handleConfirmAccountDisable} disabled={disableCode.length !== 6} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg text-sm">Confirm</button></div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Settings;
