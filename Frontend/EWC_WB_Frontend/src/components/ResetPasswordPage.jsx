import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { EWCLogo } from './EWCLogo';
import { resetPassword } from '../graphql/UserServer';

export function ResetPasswordPage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get('token') || '';

  const [password,     setPassword]     = useState('');
  const [confirm,      setConfirm]      = useState('');
  const [showPass,     setShowPass]     = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [done,         setDone]         = useState(false);
  const [error,        setError]        = useState('');

  const validation = useMemo(() => {
    const passErr = password.length > 0 && password.length < 8
      ? 'Password must be at least 8 characters.' : '';
    const confirmErr = confirm.length > 0 && confirm !== password
      ? 'Passwords do not match.' : '';
    const canSubmit = !passErr && !confirmErr && password.length >= 8 && confirm === password;
    return { passErr, confirmErr, canSubmit };
  }, [password, confirm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validation.canSubmit || !token) return;
    setSubmitting(true);
    setError('');
    try {
      await resetPassword({ Token: token, New_Password: password });
      setDone(true);
      setTimeout(() => navigate('/'), 3000);
    } catch (err) {
      if (err.message?.includes('INVALID_OR_EXPIRED_TOKEN')) {
        setError('This reset link has expired or already been used. Please request a new one.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (hasErr) =>
    'auth-input w-full h-12 rounded-xl border bg-white/8 text-[15px] text-white pl-10 pr-11 ' +
    'focus:outline-none focus:ring-0 focus:border-white/35 ' +
    'placeholder:text-white/30 placeholder:text-[14px] caret-white transition duration-200 ' +
    (hasErr ? 'border-rose-400/60' : 'border-white/15');

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse 120% 100% at 60% -10%, #1e1040 0%, #0d0d1a 55%, #000 100%)' }}>

      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <EWCLogo variant="auth" size={44} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-8">

          {!token ? (
            <div className="text-center">
              <p className="text-white/60 text-sm">Invalid reset link.</p>
              <Link to="/forgot-password" className="mt-3 inline-block text-sm text-blue-300/80 hover:text-blue-200 transition">
                Request a new one
              </Link>
            </div>
          ) : done ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white mb-1">Password updated!</h1>
                <p className="text-sm text-white/50 leading-relaxed">
                  Your password has been changed. Redirecting you to Sign In…
                </p>
              </div>
              <Link to="/" className="mt-1 text-sm text-blue-300/80 hover:text-blue-200 transition">
                Go to Sign In now
              </Link>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">Set new password</h1>
                <p className="text-sm text-white/50 mt-1">
                  Choose a strong password for your account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className={fieldClass(!!validation.passErr)}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80 transition"
                      aria-label={showPass ? 'Hide password' : 'Show password'}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validation.passErr && <p className="text-xs text-rose-300">{validation.passErr}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm" className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                    <input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repeat your new password"
                      autoComplete="new-password"
                      className={fieldClass(!!validation.confirmErr)}
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/80 transition"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validation.confirmErr && <p className="text-xs text-rose-300">{validation.confirmErr}</p>}
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                    {error}
                    {error.includes('expired') && (
                      <Link to="/forgot-password" className="block mt-1 text-blue-300/80 hover:text-blue-200 underline text-xs">
                        Request a new reset link
                      </Link>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !validation.canSubmit}
                  className="w-full h-12 rounded-xl bg-white text-slate-900 font-bold inline-flex items-center justify-center gap-2 hover:opacity-92 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 shadow-lg shadow-white/10">
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                    : 'Update Password'
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
