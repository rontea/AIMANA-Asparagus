import React, { useState } from 'react';
import { Layers, ArrowLeft, Mail, CheckCircle, Loader2 } from 'lucide-react';
/* Splitting react-router imports to resolve missing named export errors */
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Mock sending email
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsLoading(false);
    setIsSent(true);
    
    // For demo purposes, auto-redirect to reset page after 2 seconds
    setTimeout(() => {
        // Pass email via query param to simulate a magic link
        navigate(`/reset-password?email=${encodeURIComponent(email)}&token=demo-token-123`);
    }, 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4 border border-slate-700 shadow-lg">
              <Layers className="text-indigo-500 w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Reset Password</h1>
            <p className="text-slate-400 text-sm mt-2 text-center">Enter your email to receive a reset link.</p>
          </div>

          {isSent ? (
              <div className="text-center py-8 animate-in fade-in">
                  <div className="mx-auto w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mb-4 text-green-500">
                      <CheckCircle size={32} />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">Check your email</h3>
                  <p className="text-slate-400 text-sm">We've sent a password reset link to <br/><span className="text-white font-medium">{email}</span></p>
                  <p className="text-slate-600 text-xs mt-6 italic">Redirecting to reset page for demo...</p>
              </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                        placeholder="name@company.com"
                        required
                        autoFocus
                    />
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <>
                        <Loader2 size={18} className="animate-spin" /> Sending Link...
                        </>
                    ) : (
                        "Send Reset Link"
                    )}
                </button>
            </form>
          )}
        </div>
        
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl text-center">
          <Link to="/login" className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 transition-colors">
            <ArrowLeft size={12} /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;