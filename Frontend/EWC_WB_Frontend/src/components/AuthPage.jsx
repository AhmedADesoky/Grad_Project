import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { EWCLogo } from './EWCLogo';

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialLoading, setSocialLoading] = useState('');
  const [error, setError] = useState('');

  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const pageTitle = isLogin ? 'Welcome Back' : 'Create Account';
  const pageSubtitle = isLogin
    ? 'Sign in and continue your English writing journey.'
    : 'Start with AI feedback and a personalized learning plan.';

  const validation = useMemo(() => {
    const emailError =
      email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? 'Please enter a valid email address.'
        : '';

    const passwordError =
      password.length > 0 && password.length < 6
        ? 'Password must be at least 6 characters.'
        : '';

    const usernameError =
      !isLogin && username.length > 0 && username.trim().length < 3
        ? 'Username must be at least 3 characters.'
        : '';

    const canSubmit =
      !emailError &&
      !passwordError &&
      !usernameError &&
      email.trim() &&
      password.trim() &&
      (isLogin || username.trim());

    return { emailError, passwordError, usernameError, canSubmit };
  }, [email, password, username, isLogin]);

  const isBusy = isSubmitting || !!socialLoading;

  const fieldClass = (hasError) => {
    const base =
      'w-full h-12 rounded-xl border bg-white/10 text-white transition duration-200 ' +
      'focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/55 ' +
      'placeholder:text-white/40 ' +
      '[&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_rgba(30,41,59,0.95)] ' +
      '[&:-webkit-autofill]:[-webkit-text-fill-color:white]';
    if (hasError) return base + ' border-rose-400/70';
    return base + ' border-white/20';
  };

  const socialBtnClass =
    'h-12 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 disabled:opacity-60 disabled:cursor-not-allowed ' +
    'transition duration-200 inline-flex items-center justify-center gap-2.5 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white/40';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validation.canSubmit) {
      setError('Please correct the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        const success = await login(email.trim(), password);
        if (success) navigate('/main');
        else setError('Invalid email or password.');
      } else {
        const success = await signup(username.trim(), email.trim(), password);
        if (success) navigate('/main');
        else setError('Email or username already exists.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    if (isBusy) return;
    setError('');
    setSocialLoading(provider);

    try {
      const mockEmail = 'user@' + provider + '.com';
      const mockPassword = 'demo123';
      const success = await signup(provider + 'User', mockEmail, mockPassword);
      if (success) navigate('/main');
    } finally {
      setSocialLoading('');
    }
  };

  return (
    <div className="fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,#1B2E4E_0%,#13223D_45%,#0A1424_100%)] text-white overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-[#3D5A8C]/25 blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full bg-[#1D7D58]/15 blur-3xl" />
      </div>

      <div className="relative z-10 h-full px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-center overflow-hidden">
        <section className="w-full max-w-xl max-h-[calc(100vh-2rem)] rounded-3xl border border-white/15 bg-white/5 backdrop-blur-xl p-5 sm:p-6 lg:p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)] overflow-hidden">
          <div className="flex justify-center mb-6">
            <EWCLogo variant="auth" />
          </div>

          <div className="mb-5">
            <h1 className="text-3xl font-bold">{pageTitle}</h1>
            <p className="text-sm text-white/75 mt-1">{pageSubtitle}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/70">
              <ShieldCheck className="w-3.5 h-3.5 text-[#9DBDE8]" />
              Protected session, private learning data.
            </p>

            <div className="mt-3 text-sm text-white/80">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin((prev) => !prev);
                  setError('');
                }}
                className="text-[#9DBDE8] hover:text-white underline underline-offset-2"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!isLogin && (
              <div className="space-y-2">
                <label htmlFor="username" className="block text-sm font-medium text-white">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className={fieldClass(!!validation.usernameError) + ' pl-11 pr-11'}
                    required={!isLogin}
                    aria-invalid={!!validation.usernameError}
                  />
                </div>
                {validation.usernameError && (
                  <p className="text-xs text-rose-200">{validation.usernameError}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-white">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={fieldClass(!!validation.emailError) + ' pl-11 pr-11'}
                  required
                  aria-invalid={!!validation.emailError}
                />
              </div>
              {validation.emailError && <p className="text-xs text-rose-200">{validation.emailError}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-white">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={fieldClass(!!validation.passwordError) + ' pl-11 pr-11'}
                  required
                  aria-invalid={!!validation.passwordError}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 rounded-md"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {validation.passwordError && (
                <p className="text-xs text-rose-200">{validation.passwordError}</p>
              )}

              {isLogin && (
                <div className="flex justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-xs text-[#9DBDE8] hover:underline focus:outline-none focus:ring-2 focus:ring-white/40 rounded-sm"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}
            </div>

            {error && (
              <div
                className="rounded-xl border border-rose-300/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy || !validation.canSubmit}
              className="w-full h-12 rounded-xl bg-white text-slate-900 font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition duration-200 focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="relative mt-7 mb-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <button
              onClick={() => handleSocialLogin('google')}
              type="button"
              disabled={isBusy}
              className={socialBtnClass}
            >
              {socialLoading === 'google' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              <span className="text-sm">Google</span>
            </button>

            <button
              onClick={() => handleSocialLogin('facebook')}
              type="button"
              disabled={isBusy}
              className={socialBtnClass}
            >
              {socialLoading === 'facebook' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#1877F2" d="M24 12.073C24 5.445 18.627.072 12 .072S0 5.445 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.008 1.792-4.67 4.533-4.67 1.312 0 2.686.236 2.686.236v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              )}
              <span className="text-sm">Facebook</span>
            </button>
          </div>

          <p className="text-center text-xs text-white/60 mt-5">
            By continuing, you agree to our learning terms and privacy policy.
          </p>
        </section>
      </div>
    </div>
  );
}