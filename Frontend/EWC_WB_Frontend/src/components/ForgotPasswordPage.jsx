import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { EWCLogo } from './EWCLogo';
import { requestPasswordReset } from '../graphql/UserServer';

export function ForgotPasswordPage() {
  const [email,       setEmail]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [sent,        setSent]        = useState(false);
  const [error,       setError]       = useState('');

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!emailValid) return;
    setSubmitting(true);
    setError('');
    try {
      await requestPasswordReset({ Email: email.trim() });
      setSent(true);
    } catch {
      // Show generic error — don't expose server details
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse 120% 100% at 60% -10%, #1e1040 0%, #0d0d1a 55%, #000 100%)' }}>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <EWCLogo variant="auth" size={44} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-8">

          {sent ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center">
                <MailCheck className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white mb-1">Check your inbox</h1>
                <p className="text-sm text-white/50 leading-relaxed">
                  If <span className="text-white/80">{email.trim()}</span> has an account, a reset link has been sent. It expires in 1 hour.
                </p>
              </div>
              <p className="text-xs text-white/30 mt-1">
                Didn't receive it? Check your spam folder or try again.
              </p>
              <Link to="/"
                className="mt-2 inline-flex items-center gap-2 text-sm text-blue-300/80 hover:text-blue-200 transition">
                <ArrowLeft className="w-4 h-4" /> Back to Sign In
              </Link>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">Forgot password?</h1>
                <p className="text-sm text-white/50 mt-1">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      autoComplete="email"
                      className={
                        'auth-input w-full h-12 rounded-xl border bg-white/8 text-[15px] text-white pl-10 pr-4 ' +
                        'focus:outline-none focus:ring-0 focus:border-white/35 ' +
                        'placeholder:text-white/30 placeholder:text-[14px] caret-white transition duration-200 ' +
                        (email && !emailValid ? 'border-rose-400/60' : 'border-white/15')
                      }
                    />
                  </div>
                  {email && !emailValid && (
                    <p className="text-xs text-rose-300">Please enter a valid email address.</p>
                  )}
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !emailValid}
                  className="w-full h-12 rounded-xl bg-white text-slate-900 font-bold inline-flex items-center justify-center gap-2 hover:opacity-92 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 shadow-lg shadow-white/10">
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : 'Send Reset Link'
                  }
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link to="/"
                  className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition">
                  <ArrowLeft className="w-4 h-4" /> Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
