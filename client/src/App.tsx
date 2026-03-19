import React, { useState, useEffect } from 'react';
import { authApi, userApi } from './services/api';
import { initiateSocket, disconnectSocket } from './services/socket';
import Profile from './components/Profile';
import Chat from './components/Chat';

type AppState = 'LOGIN' | 'OTP' | 'PROFILE' | 'CHAT' | 'EDIT_PROFILE';
type Theme = 'midnight' | 'insta' | 'love' | 'matrix';

function App() {
  const [state, setState] = useState<AppState>('LOGIN');
  const [theme] = useState<Theme>((localStorage.getItem('app-theme') as Theme) || 'midnight');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [userId, setUserId] = useState<string | null>(localStorage.getItem('user_id'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (token) {
      checkProfileStatus();
      initiateSocket(token);
    }
    return () => disconnectSocket();
  }, [token]);

  const checkProfileStatus = async () => {
    try {
      const profile = await userApi.getProfile();
      if (!profile.isProfileComplete) {
        setState('PROFILE');
      } else {
        setState('CHAT');
      }
    } catch (err) {
      console.error("Profile check failed", err);
      setState('LOGIN');
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.requestOtp(email);
      setState('OTP');
    } catch (err) {
      alert('Failed to send OTP. Check console.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await authApi.verifyOtp(email, otp);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user_id', data.user_id);
      setToken(data.token);
      setUserId(data.user_id);
    } catch (err) {
      alert('Invalid OTP.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    setToken(null);
    setUserId(null);
    setState('LOGIN');
    disconnectSocket();
  };

  const renderContent = () => {
    switch (state) {
      case 'LOGIN':
        return (
          <div className="w-full max-w-md p-6 md:p-8 bg-bg-card rounded-2xl shadow-2xl border border-border-subtle animate-in fade-in zoom-in duration-300 mx-4">
            <h2 className="text-2xl md:text-3xl font-bold text-text-main mb-2">Welcome Back</h2>
            <p className="text-text-muted mb-8 text-sm md:text-base">Enter your email to receive a secure login code.</p>
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5 ml-1">Email Address</label>
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  className="w-full px-4 py-3 bg-bg-input border border-border-subtle rounded-xl text-text-main placeholder-text-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all text-sm md:text-base"
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-gradient-brand text-white font-semibold rounded-xl shadow-lg shadow-brand-primary/20 transition-all active:scale-[0.98] text-sm md:text-base"
              >
                {loading ? 'Sending Code...' : 'Send Secure OTP'}
              </button>
            </form>
          </div>
        );
      case 'OTP':
        return (
          <div className="w-full max-w-md p-6 md:p-8 bg-bg-card rounded-2xl shadow-2xl border border-border-subtle animate-in fade-in zoom-in duration-300 mx-4">
            <h2 className="text-2xl md:text-3xl font-bold text-text-main mb-2">Verify Identity</h2>
            <p className="text-text-muted mb-8 text-sm md:text-base">Enter the 6-digit code sent to <span className="text-brand-primary font-medium">{email}</span></p>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <input 
                type="text" 
                placeholder="000000" 
                maxLength={6}
                className="w-full px-4 py-4 bg-bg-input border border-border-subtle rounded-xl text-text-main text-center text-2xl md:text-3xl tracking-[0.5rem] md:tracking-[1rem] font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all"
                value={otp} 
                onChange={(e) => setOtp(e.target.value)} 
                required 
              />
              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3 bg-gradient-brand text-white font-semibold rounded-xl shadow-lg shadow-brand-primary/20 transition-all active:scale-[0.98] text-sm md:text-base"
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
              <button 
                type="button" 
                className="w-full text-text-muted hover:text-text-main text-sm font-medium transition-colors" 
                onClick={() => setState('LOGIN')}
              >
                ← Use a different email
              </button>
            </form>
          </div>
        );
      case 'PROFILE':
      case 'EDIT_PROFILE':
        return <Profile onComplete={() => setState('CHAT')} isEdit={state === 'EDIT_PROFILE'} />;
      case 'CHAT':
        return userId ? <Chat currentUserId={userId} /> : null;
      default:
        return (
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 md:w-12 md:h-12 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin mb-4"></div>
            <p className="text-text-muted font-medium text-sm">Initializing secure session...</p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-app text-text-main selection:bg-brand-primary/30 overflow-hidden transition-colors duration-300">
      <header className="shrink-0 backdrop-blur-md bg-bg-app/50 border-b border-border-subtle px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-brand rounded-lg flex items-center justify-center shadow-lg shadow-brand-primary/20">
                <span className="text-white font-bold text-xs md:text-base">P</span>
              </div>
              <h1 className="text-lg md:text-xl font-bold text-gradient-brand hidden sm:block">
                PrivateChat
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {token && (
              <>
                <button 
                  className="p-2 text-text-muted hover:text-text-main hover:bg-bg-input rounded-lg transition-all"
                  onClick={() => setState('EDIT_PROFILE')}
                  title="My Profile"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                </button>
                <button 
                  className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-text-muted hover:text-text-main hover:bg-bg-input rounded-lg transition-all border border-border-subtle" 
                  onClick={handleLogout}
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 flex justify-center items-center overflow-hidden relative">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
