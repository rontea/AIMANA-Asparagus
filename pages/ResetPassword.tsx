import React, { useState, useEffect } from 'react';
import { Layers, Lock, CheckCircle, Loader2, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
/* Splitting react-router imports to resolve missing named export errors */
import { Link, useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router';
import { api } from '../services/api';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
      verifyToken();
  }, []);

  const verifyToken = async () => {
      if (!token || !email) {
          setIsVerifying(false);
          setIsValidToken(false);
          return;
      }

      try {
          const valid = await api.auth.verifyResetToken(token);
          setIsValidToken(valid);
      } catch (e) {
          setIsValidToken(false);
      } finally {
          setIsVerifying(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
    }

    if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
    }

    setIsLoading(true);
    
    try {
        // Simulate API Reset
        await api.auth.resetPassword(email, password);
        
        // Success -> Login
        // In a real app, verify success then navigate
        navigate('/login');
    } catch (err) {
        setError("Failed to reset password.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4 border border-slate-700 shadow-lg">
              <Layers className="text-indigo-500 w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Set New Password</h1>
            <p className="text-slate-400 text-sm mt-2 text-center">
                {email ? `for ${email}` : 'Create a secure password for your account.'}
            </p>
          </div>

          {isVerifying ? (
              <div className="flex flex-col items-center py-8 text-slate-400">
                  <Loader2 size={32} className="animate-spin text-indigo-500 mb-4" />
                  <p>Verifying reset link...</p>
              </div>
          ) : isValidToken ? (
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                placeholder="••••••••"
                                required
                                autoFocus
                            />
                            <button 
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirm Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input 
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="text-red-400 text-sm text-center bg-red-950/30 border border-red-900/50 p-2 rounded-lg animate-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <>
                        <Loader2 size={18} className="animate-spin" /> Updating...
                        </>
                    ) : (
                        "Reset Password"
                    )}
                </button>
            </form>
          ) : (
              <div className="text-center py-6 space-y-4">
                  <div className="inline-flex items-center justify-center p-3 bg-red-900/20 rounded-full text-red-500 mb-2">
                      <AlertCircle size={32} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Invalid or Expired Link</h3>
                    <p className="text-slate-400 text-sm mt-1">This password reset link is invalid or has expired.</p>
                  </div>
                  <Link 
                    to="/forgot-password"
                    className="inline-flex items-center text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                  >
                      <ArrowLeft size={16} className="mr-1" /> Request a new link
                  </Link>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;