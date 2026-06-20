import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail, Lock, User, ArrowRight, Eye, EyeOff,
  Loader2, MailCheck, RefreshCw,
  BookOpen, BarChart2, Brain, ShieldCheck,
} from 'lucide-react';
import { EWCLogo } from './EWCLogo';
import { verifyOTP, resendOTP } from '../graphql/UserServer';

/* ── Brand feature bullets shown on the left panel ── */
const FEATURES = [
  { icon: Brain,     text: 'AI-powered writing feedback in seconds'     },
  { icon: BarChart2, text: 'CEFR-graded plans that adapt as you grow'   },
  { icon: BookOpen,  text: 'Curated resources matched to your weak spots' },
];

export function AuthPage() {
  const [isLogin,       setIsLogin]       = useState(true);
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [username,      setUsername]      = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [socialLoading, setSocialLoading] = useState('');
  const [error,         setError]         = useState('');

  const [otpScreen,      setOtpScreen]      = useState(false);
  const [pendingEmail,   setPendingEmail]   = useState('');
  const [otp,            setOtp]            = useState(['','','','','','']);
  const [otpSubmitting,  setOtpSubmitting]  = useState(false);
  const [otpError,       setOtpError]       = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs    = useRef([]);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (resendCooldown > 0) {
      cooldownRef.current = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(cooldownRef.current);
  }, [resendCooldown]);

  const { login, signup, loginWithUserData } = useAuth();
  const navigate = useNavigate();

  const validation = useMemo(() => {
    const emailError    = email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? 'Please enter a valid email address.' : '';
    const passwordError = password.length > 0 && password.length < 6
      ? 'Password must be at least 6 characters.' : '';
    const usernameError = !isLogin && username.length > 0 && username.trim().length < 3
      ? 'Username must be at least 3 characters.' : '';
    const canSubmit = !emailError && !passwordError && !usernameError
      && email.trim() && password.trim() && (isLogin || username.trim());
    return { emailError, passwordError, usernameError, canSubmit };
  }, [email, password, username, isLogin]);

  const isBusy = isSubmitting || !!socialLoading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validation.canSubmit) { setError('Please correct the highlighted fields.'); return; }
    setIsSubmitting(true);
    try {
      if (isLogin) {
        const result = await login(email.trim(), password);
        if (result === 'EMAIL_NOT_VERIFIED') {
          setPendingEmail(email.trim().toLowerCase());
          setOtpScreen(true); setResendCooldown(60);
        } else if (result) {
          navigate('/main');
        } else {
          setError('Invalid email or password.');
        }
      } else {
        const result = await signup(username.trim(), email.trim(), password);
        if (result?.requiresVerification) {
          setPendingEmail(result.email);
          setOtpScreen(true); setResendCooldown(60);
        } else if (result === true) {
          navigate('/main');
        } else {
          setError('Email or username already exists.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp]; next[index] = value.slice(-1); setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };
  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) { setOtp(pasted.split('')); otpRefs.current[5]?.focus(); }
  };
  const handleVerifyOTP = async () => {
    const code = otp.join('');
    if (code.length !== 6) { setOtpError('Please enter the full 6-digit code.'); return; }
    setOtpSubmitting(true); setOtpError('');
    try {
      const userData = await verifyOTP({ Email: pendingEmail, OTP: code });
      if (userData) {
        // Clear sensitive state before navigating — prevents DevTools memory exposure
        setPendingEmail('');
        setOtp(['','','','','','']);
        loginWithUserData(userData);
        navigate('/main');
      }
    } catch (err) {
      setOtpError(err.message || 'Invalid code. Please try again.');
      setOtp(['','','','','','']); otpRefs.current[0]?.focus();
    } finally { setOtpSubmitting(false); }
  };
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    try { await resendOTP({ Email: pendingEmail }); setResendCooldown(60); setOtpError(''); }
    catch (err) { setOtpError(err.message || 'Failed to resend code.'); }
  };
  const handleSocialLogin = (provider) => {
    if (isBusy) return;
    if (provider === 'google') {
      window.location.href = 'http://localhost:4000/auth/google';
    }
  };
  const switchMode = () => { setIsLogin(p => !p); setError(''); };

  /* ── shared input field style ── */
  const field = (err) =>
    'auth-input w-full h-12 rounded-xl border bg-white/8 text-[15px] text-white pl-10 pr-4 py-0 leading-[3rem] transition duration-200 ' +
    'focus:outline-none focus:ring-0 focus:border-white/35 ' +
    'placeholder:text-white/30 placeholder:text-[14px] placeholder:font-normal placeholder:tracking-wide caret-white ' +
    (err ? 'border-rose-400/60' : 'border-white/15');

  /* ══════════════════════════════════════════════════════════════════
     OTP screen
  ══════════════════════════════════════════════════════════════════ */
  if (otpScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-4"
           style={{ background: 'radial-gradient(ellipse 120% 90% at 20% -10%, #1B2E4E 0%, #0D1C37 50%, #070F1E 100%)' }}>
        {/* ambient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/15 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-violet-600/10 blur-3xl" />
        </div>

        <section className="relative w-full max-w-md rounded-3xl border border-white/12 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6"><EWCLogo variant="auth" size={56} /></div>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-400/20 mb-4">
              <MailCheck className="w-7 h-7 text-violet-300" />
            </div>
            <h2 className="text-2xl font-bold text-white">Check your email</h2>
            <p className="text-white/60 text-sm mt-2">
              We sent a 6-digit code to<br />
              <span className="text-white font-semibold">{pendingEmail}</span>
            </p>
          </div>

          <div className="flex gap-2 justify-center mb-6" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input key={i} ref={el => otpRefs.current[i] = el}
                type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                className="auth-input w-12 h-14 rounded-xl border border-white/18 bg-white/8 text-white text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-violet-400/60 focus:border-violet-400/60 transition !pl-0 !pr-0"
              />
            ))}
          </div>

          {otpError && (
            <div className="rounded-xl border border-rose-300/30 bg-rose-400/8 px-4 py-3 text-sm text-rose-200 text-center mb-4">
              {otpError}
            </div>
          )}

          <button onClick={handleVerifyOTP} disabled={otpSubmitting || otp.join('').length !== 6}
            className="w-full h-12 rounded-xl bg-white text-slate-900 font-bold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition mb-4 shadow-lg shadow-white/10">
            {otpSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : <>Verify Email <ArrowRight className="w-4 h-4" /></>}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button onClick={() => { setOtpScreen(false); setOtp(['','','','','','']); setOtpError(''); }}
              className="text-white/40 hover:text-white/70 transition text-xs">
              ← Back to sign in
            </button>
            <button onClick={handleResendOTP} disabled={resendCooldown > 0}
              className="inline-flex items-center gap-1.5 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition">
              <RefreshCw className="w-3.5 h-3.5" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     Main auth page — two-column layout on md+
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 text-white overflow-hidden"
         style={{ background: 'radial-gradient(ellipse 120% 90% at 20% -10%, #1B2E4E 0%, #0D1C37 50%, #070F1E 100%)' }}>

      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 w-[500px] h-[500px] rounded-full bg-blue-700/15 blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-indigo-600/12 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-violet-700/10 blur-3xl" />
      </div>

      <div className="relative z-10 h-full flex items-center justify-center px-4 py-4 sm:py-6 overflow-y-auto">
        <div className="w-full max-w-4xl flex rounded-2xl sm:rounded-3xl border border-white/10 overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] my-auto">

          {/* ── Left brand panel (hidden on mobile) ── */}
          <div className="hidden md:flex flex-col justify-between w-[42%] shrink-0 p-10 relative overflow-hidden"
               style={{ background: 'linear-gradient(145deg, rgba(37,73,120,0.55) 0%, rgba(20,40,80,0.35) 100%)' }}>

            {/* Decorative ring */}
            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full border border-white/5" />
            <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full border border-white/5" />

            <EWCLogo variant="auth" size={64} />

            <div className="space-y-7 my-auto pt-8">
              <div>
                <h2 className="text-2xl font-bold leading-tight text-white/95">
                  Master English writing<br />with AI guidance
                </h2>
                <p className="text-white/50 text-sm mt-2 leading-relaxed">
                  Real-time corrections, CEFR scoring, and a plan that evolves with you.
                </p>
              </div>
              <ul className="space-y-4">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/12 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-blue-300" />
                    </div>
                    <span className="text-sm text-white/70 leading-snug">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* ── Right form panel ── */}
          <div className="flex-1 flex flex-col justify-center p-5 sm:p-8 md:p-10 bg-white/[0.04] backdrop-blur-2xl overflow-y-auto min-w-0">

            {/* Mobile logo */}
            <div className="flex justify-center mb-4 md:hidden">
              <EWCLogo variant="auth" size={44} />
            </div>

            {/* Mode toggle tabs */}
            <div className="flex rounded-xl bg-white/8 p-1 gap-1 mb-5 border border-white/10">
              {['Sign In', 'Sign Up'].map((label, i) => {
                const active = isLogin ? i === 0 : i === 1;
                return (
                  <button key={label} type="button"
                    onClick={() => { setIsLogin(i === 0); setError(''); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      active
                        ? 'bg-white text-slate-900 shadow-md'
                        : 'text-white/50 hover:text-white/80'
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Heading */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-white">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-white/50 text-sm mt-1">
                {isLogin
                  ? 'Continue your English writing journey.'
                  : 'Start with AI feedback and personalised plan.'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>

              {!isLogin && (
                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                    <input id="username" type="text" value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Choose a username"
                      className={field(!!validation.usernameError)}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false" />
                  </div>
                  {validation.usernameError && <p className="text-xs text-rose-300">{validation.usernameError}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                  <input id="email" type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className={field(!!validation.emailError)}
                    autoComplete="email" />
                </div>
                {validation.emailError && <p className="text-xs text-rose-300">{validation.emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                  <input id="password" type={showPassword ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={isLogin ? 'Enter your password' : 'Create a strong password'}
                    className={field(!!validation.passwordError).replace('pr-4', 'pr-11')}
                    autoComplete={isLogin ? 'current-password' : 'new-password'} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validation.passwordError && <p className="text-xs text-rose-300">{validation.passwordError}</p>}
                {isLogin && (
                  <div className="flex justify-end pt-0.5">
                    <Link to="/forgot-password" className="text-xs text-blue-300/80 hover:text-blue-200 transition">
                      Forgot password?
                    </Link>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" disabled={isBusy || !validation.canSubmit}
                className="w-full h-12 rounded-xl bg-white text-slate-900 font-bold inline-flex items-center justify-center gap-2 hover:opacity-92 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 shadow-lg shadow-white/10 mt-1">
                {isSubmitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{isLogin ? 'Signing in…' : 'Creating account…'}</>
                  : <>{isLogin ? 'Sign In' : 'Create Account'} <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </form>

            {/* Social login */}
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] text-white/30 font-medium uppercase tracking-widest shrink-0">or continue with</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <button type="button" disabled={isBusy} onClick={() => handleSocialLogin('google')}
                className="w-full h-11 rounded-xl border border-white/12 bg-white/6 hover:bg-white/12 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 inline-flex items-center justify-center gap-2.5 text-sm font-medium text-white/80 hover:text-white">
                {socialLoading === 'google'
                  ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )
                }
                Continue with Google
              </button>
            </div>

            <p className="text-center text-[11px] text-white/25 mt-5 leading-relaxed">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
