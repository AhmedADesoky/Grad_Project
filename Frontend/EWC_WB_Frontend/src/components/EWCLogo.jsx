import React from 'react';

/**
 * EWCLogo — Brand identity component.
 *
 * Variants:
 *   "navbar"  — "EC" serif mark + "English Writing Coach" subtitle (navbar)
 *   "auth"    — large stacked "EC" + subtitle, cream on navy (login page)
 *   "mark"    — "EC" only, compact inline (breadcrumbs, etc.)
 *   "agent"   — small navy square badge with cream "EC" (AI assistant avatar)
 *
 * Font: Cormorant Garamond (loaded via Google Fonts in index.html)
 */

const SERIF = `'Cormorant Garamond', 'Cormorant', Georgia, 'Times New Roman', serif`;

export function EWCLogo({ variant = 'navbar', className = '', size = null }) {

  /* ── AUTH — full stacked logo, cream on navy ── */
  if (variant === 'auth') {
    return (
      <div
        className={`flex flex-col items-center select-none ${className}`}
        aria-label="English Writing Coach"
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: size ?? 80,
            fontWeight: 400,
            letterSpacing: '0.06em',
            lineHeight: 1,
            color: '#E8DFC8',
          }}
        >
          EC
        </span>
        <span
          style={{
            fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'rgba(232,223,200,0.60)',
            marginTop: 16,
          }}
        >
          English Writing Coach
        </span>
      </div>
    );
  }

  /* ── MARK — EC only, primary color, compact ── */
  if (variant === 'mark') {
    return (
      <span
        className={`select-none ${className}`}
        aria-label="EC"
        style={{
          fontFamily: SERIF,
          fontSize: size ?? 26,
          fontWeight: 400,
          letterSpacing: '0.06em',
          lineHeight: 1,
          color: 'var(--primary, #1B2E4E)',
        }}
      >
        EC
      </span>
    );
  }

  /* ── AGENT — square navy badge with cream EC serif (AI assistant avatar) ── */
  if (variant === 'agent') {
    const sz = size ?? 36;
    const fs = Math.round(sz * 0.42);
    return (
      <div
        className={`select-none flex items-center justify-center rounded-xl shrink-0 ${className}`}
        aria-label="EC Assistant"
        style={{
          width: sz,
          height: sz,
          background: 'var(--primary, #1B2E4E)',
          boxShadow: '0 2px 8px rgba(27,46,78,0.18)',
        }}
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: fs,
            fontWeight: 400,
            letterSpacing: '0.04em',
            lineHeight: 1,
            color: '#E8DFC8',
          }}
        >
          EC
        </span>
      </div>
    );
  }

  /* ── NAVBAR (default) — EC + "English Writing Coach" subtitle ── */
  return (
    <div
      className={`flex flex-col items-center select-none group cursor-pointer ${className}`}
      aria-label="English Writing Coach — home"
    >
      <span
        className="group-hover:opacity-70 transition-opacity"
        style={{
          fontFamily: SERIF,
          fontSize: size ?? 24,
          fontWeight: 400,
          letterSpacing: '0.08em',
          lineHeight: 1,
          color: 'var(--primary, #1B2E4E)',
        }}
      >
        EC
      </span>
      <span
        className="group-hover:opacity-70 transition-opacity"
        style={{
          fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
          fontSize: 7,
          fontWeight: 400,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground, #6B7E96)',
          marginTop: 4,
        }}
      >
        English Writing Coach
      </span>
    </div>
  );
}
