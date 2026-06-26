import React, { useState, useEffect } from 'react';
import { ArrowRight, Lock, Mail, Loader2, Eye, EyeOff, XCircle, Key, ShieldAlert, RefreshCw } from 'lucide-react';
/* Splitting react-router imports to resolve missing named export errors */
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router';
import { api } from '../services/api';
import type { InstallStatus } from '../types';
import BrandMark from '../components/BrandMark';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
  const [bootstrapName, setBootstrapName] = useState('Root Admin');
  const [bootstrapEmail, setBootstrapEmail] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [bootstrapConfirmPassword, setBootstrapConfirmPassword] = useState('');
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  
  // CAPTCHA State
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  
  const navigate = useNavigate();
  const clientId = process.env.GOOGLE_CLIENT_ID;

  // Configuration Validation
  const isConfigError = clientId?.startsWith('AIza');

  useEffect(() => {
    if (api.auth.isAuthenticated()) {
        navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    const loadInstallStatus = async () => {
      try {
        const nextStatus = await api.app.getInstallStatus();
        setInstallStatus(nextStatus);
      } catch (err) {
        console.error('Failed to load install status', err);
      }
    };

    void loadInstallStatus();
  }, []);

  useEffect(() => {
    if (failedAttempts >= 3) {
        setShowCaptcha(true);
        refreshCaptcha();
    }
  }, [failedAttempts]);

  useEffect(() => {
    if (clientId && !isConfigError) {
        const checkGoogleScript = setInterval(() => {
            // @ts-ignore
            if (window.google && window.google.accounts) {
                clearInterval(checkGoogleScript);
                try {
                    // @ts-ignore
                    window.google.accounts.id.initialize({
                        client_id: clientId,
                        callback: handleGoogleResponse
                    });
                    // @ts-ignore
                    window.google.accounts.id.renderButton(
                        document.getElementById("googleBtn"),
                        { theme: "filled_blue", size: "large", width: "100%", text: "continue_with" } 
                    );
                } catch (e) {
                    console.error("Google Sign-In Error:", e);
                }
            }
        }, 100);
        const timeout = setTimeout(() => clearInterval(checkGoogleScript), 5000);
        return () => {
            clearInterval(checkGoogleScript);
            clearTimeout(timeout);
        };
    }
  }, [clientId, isConfigError]);

  const refreshCaptcha = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous 0, O, 1, I
      let result = '';
      for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setCaptchaCode(result);
      setCaptchaInput('');
  };

  const handleGoogleResponse = async (response: any) => {
      setError(null);
      setIsLoading(true);
      try {
          await api.auth.loginWithGoogle(response.credential);
          navigate('/');
      } catch (err: any) {
          setError(err.message || "Google login failed.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Check CAPTCHA if enabled
    if (showCaptcha) {
        if (captchaInput.toUpperCase() !== captchaCode) {
            setError("Incorrect CAPTCHA code. Please try again.");
            refreshCaptcha();
            return;
        }
    }

    if (requiresTwoFactor && twoFactorCode.length !== 6) {
        setError("Enter your 6-digit authenticator code.");
        return;
    }

    setIsLoading(true);

    try {
      await api.auth.login(email.trim(), password, requiresTwoFactor ? twoFactorCode : undefined);
      // Success - reset attempts
      setFailedAttempts(0);
      setShowCaptcha(false);
      setRequiresTwoFactor(false);
      setTwoFactorCode('');
      navigate('/');
    } catch (err: any) {
      if (err?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setError(err.message || "Enter your 6-digit authenticator code to continue.");
        setIsLoading(false);
        return;
      }
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      setError(err.message || "Invalid credentials. Please try again.");
      if (showCaptcha) refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const fillAdminCreds = () => {
      setEmail('admin@aimana.local');
      setPassword('newpassword123');
      setTwoFactorCode('');
      setRequiresTwoFactor(false);
      setError(null);
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
      e.preventDefault();
      setBootstrapError(null);

      if (bootstrapPassword.length < 10) {
          setBootstrapError('Use a password with at least 10 characters.');
          return;
      }
      if (bootstrapPassword !== bootstrapConfirmPassword) {
          setBootstrapError('Passwords do not match.');
          return;
      }

      setIsBootstrapping(true);
      try {
          await api.app.bootstrapAdmin({
              name: bootstrapName.trim() || 'Root Admin',
              email: bootstrapEmail.trim(),
              password: bootstrapPassword
          });
          await api.auth.login(bootstrapEmail.trim(), bootstrapPassword);
          navigate('/');
      } catch (err: any) {
          setBootstrapError(err.message || 'Initial admin setup failed.');
          try {
              setInstallStatus(await api.app.getInstallStatus());
          } catch {
              // Ignore refresh failures and keep the visible error.
          }
      } finally {
          setIsBootstrapping(false);
      }
  };

  const installState = installStatus?.state || 'ready';
  const canShowDemoAdmin = !!installStatus?.capabilities.allowDemoAdminLogin;
  const needsAdminBootstrap = installState === 'needs-admin-setup' && !!installStatus?.capabilities.allowAdminBootstrap;
  const blockingIssues = installStatus?.issues.filter((issue) => issue.severity === 'error') || [];
  const warningIssues = installStatus?.issues.filter((issue) => issue.severity === 'warn') || [];
  const loginDisabled = needsAdminBootstrap;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 pb-4">
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3 shadow-lg">
              <BrandMark
                showWordmark={false}
                imageClassName="h-12 w-auto"
              />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Welcome to AIMANA</h1>
            <p className="text-slate-400 text-sm mt-2">Sign in to access your workspace</p>
          </div>

          <div className="space-y-6">
            {needsAdminBootstrap && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-left space-y-4">
                    <div>
                        <h3 className="text-emerald-300 font-bold text-sm">Initial Admin Setup Required</h3>
                        <p className="text-emerald-100/90 text-xs mt-1">
                            This AIMANA instance does not have an admin account yet. Create the first admin below to finish installation.
                        </p>
                    </div>
                    <form onSubmit={handleBootstrapAdmin} className="space-y-3">
                        <input
                            type="text"
                            value={bootstrapName}
                            onChange={(e) => setBootstrapName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                            placeholder="Root Admin"
                            required
                        />
                        <input
                            type="email"
                            value={bootstrapEmail}
                            onChange={(e) => setBootstrapEmail(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                            placeholder="admin@example.com"
                            required
                        />
                        <input
                            type="password"
                            value={bootstrapPassword}
                            onChange={(e) => setBootstrapPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                            placeholder="Create a strong password"
                            required
                        />
                        <input
                            type="password"
                            value={bootstrapConfirmPassword}
                            onChange={(e) => setBootstrapConfirmPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                            placeholder="Confirm password"
                            required
                        />
                        {bootstrapError && (
                            <div className="text-red-300 text-xs bg-red-950/40 border border-red-900/60 rounded-lg p-2">
                                {bootstrapError}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={isBootstrapping}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isBootstrapping ? <><Loader2 size={18} className="animate-spin" /> Creating Admin...</> : <>Create Initial Admin <ArrowRight size={18} /></>}
                        </button>
                    </form>
                </div>
            )}
            
            {isConfigError && (
                 <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg text-left">
                    <h3 className="text-red-500 font-bold flex items-center gap-2 text-sm mb-1">
                        <XCircle size={16} /> Configuration Error
                    </h3>
                    <p className="text-red-200 text-xs leading-relaxed">
                        API Key used instead of Client ID. Update <code>.env</code>.
                    </p>
                </div>
            )}

            {blockingIssues.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2 text-left">
                    <h3 className="text-red-300 font-bold text-sm">Blocking Install Issues</h3>
                    {blockingIssues.slice(0, 3).map((issue) => (
                        <p key={issue.code} className="text-red-100 text-xs leading-relaxed">
                            {issue.message}
                        </p>
                    ))}
                </div>
            )}

            {blockingIssues.length === 0 && warningIssues.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2 text-left">
                    <h3 className="text-amber-200 font-bold text-sm">Install Warnings</h3>
                    {warningIssues.slice(0, 2).map((issue) => (
                        <p key={issue.code} className="text-amber-100 text-xs leading-relaxed">
                            {issue.message}
                        </p>
                    ))}
                </div>
            )}

            {clientId && !isConfigError ? (
                 <div className="w-full flex justify-center min-h-[40px]">
                    <div id="googleBtn" className="w-full"></div>
                </div>
            ) : (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                    <p className="text-amber-200 text-xs">Google Single Sign-On is not configured in .env</p>
                </div>
            )}

            <div className="relative flex items-center">
                <div className="flex-grow border-t border-slate-700"></div>
                <span className="flex-shrink-0 mx-4 text-slate-500 text-xs uppercase tracking-wider">or Email Access</span>
                <div className="flex-grow border-t border-slate-700"></div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    if (requiresTwoFactor) {
                                        setRequiresTwoFactor(false);
                                        setTwoFactorCode('');
                                    }
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                placeholder="admin@aimana.local"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
                            <Link to="/forgot-password" hidden className="text-xs text-indigo-400 hover:text-indigo-300">Forgot?</Link>
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (requiresTwoFactor) {
                                        setRequiresTwoFactor(false);
                                        setTwoFactorCode('');
                                    }
                                }}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                            </button>
                        </div>
                    </div>

                    {requiresTwoFactor && (
                        <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Authenticator Code</label>
                            <div className="relative">
                                <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={twoFactorCode}
                                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg py-2.5 pl-10 pr-4 text-slate-100 font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                                    placeholder="000000"
                                    required
                                />
                            </div>
                            <p className="text-[10px] text-slate-500">Password accepted. Enter your 6-digit authenticator code to finish sign-in.</p>
                        </div>
                    )}

                    {/* CAPTCHA Challenge */}
                    {showCaptcha && (
                        <div className="space-y-3 bg-slate-950/50 p-4 rounded-xl border border-indigo-500/30 animate-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <ShieldAlert size={12} /> Verification Challenge
                                </label>
                                <button 
                                    type="button" 
                                    onClick={refreshCaptcha}
                                    className="text-slate-500 hover:text-indigo-400 transition-colors"
                                    title="New Code"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                            
                            <div className="flex gap-3">
                                <div className="flex-1 h-11 bg-white rounded-lg flex items-center justify-center font-mono text-xl font-black tracking-widest text-slate-900 select-none relative overflow-hidden">
                                    {/* Obfuscation stripes */}
                                    <div className="absolute inset-0 opacity-10 pointer-events-none flex flex-col justify-between">
                                        {[...Array(6)].map((_, i) => <div key={i} className="h-px bg-black w-full" style={{ transform: `rotate(${Math.random() * 10 - 5}deg)` }}></div>)}
                                    </div>
                                    <span className="relative z-10">{captchaCode}</span>
                                </div>
                                <input 
                                    type="text"
                                    value={captchaInput}
                                    onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg text-center font-mono text-lg text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="???"
                                    maxLength={6}
                                    required
                                />
                            </div>
                            <p className="text-[9px] text-slate-500 text-center">Too many failed attempts. Solve to continue.</p>
                        </div>
                    )}
                </div>

                {error && (
                <div className="text-red-400 text-sm text-center bg-red-950/30 border border-red-900/50 p-2 rounded-lg animate-in slide-in-from-top-2">
                    {error}
                </div>
                )}

                <button 
                    type="submit" 
                    disabled={isLoading || loginDisabled}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
                >
                    {isLoading ? <><Loader2 size={18} className="animate-spin" /> Signing In...</> : loginDisabled ? 'Create Admin First' : <>Sign In <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
                </button>
            </form>
          </div>

          {canShowDemoAdmin && (
          <div className="mt-8 pt-6 border-t border-slate-800 pb-8">
             <button 
                onClick={fillAdminCreds}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-3 rounded-xl transition-all flex items-center justify-center gap-2 font-bold group active:scale-95"
             >
                <Key size={18} className="text-indigo-400 group-hover:rotate-12 transition-transform" />
                <span>Auto-fill Admin Demo</span>
             </button>
             <p className="text-[10px] text-slate-500 text-center mt-2">
                Standard Demo: <code>admin@aimana.local</code> / <code>newpassword123</code>
             </p>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
