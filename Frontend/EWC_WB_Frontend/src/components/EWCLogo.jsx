import React from 'react';

/**
 * EWCLogo — Typography-only logo matching the uploaded brand image.
 *
 * Design:  Large serif "EWC" monogram + spaced caps "ENGLISH WRITING COACH"
 * Font:    Cormorant Garamond (serif, loaded via Google Fonts in index.html)
 *          Falls back to Georgia → Times New Roman → serif
 * Colors:
 *   - On dark (auth/navy):  cream #E8DFC8
 *   - On light (navbar):    primary navy #1B2E4E
 *
 * Variants:
 *   "navbar" — inline EWC + "English Writing Coach" wordmark (centered in bar)
 *   "mark"   — EWC only, compact
 *   "auth"   — stacked EWC large + ENGLISH WRITING COACH below (white on navy)
 */

const SERIF = `'Cormorant Garamond', 'Cormorant', Georgia, 'Times New Roman', serif`;

export function EWCLogo({ variant = 'navbar', className = '' }) {

  /* ── AUTH — full stacked logo, cream on navy ── */
  if (variant === 'auth') {
    return (
      <div
        className={`flex flex-col items-center select-none ${className}`}
        aria-label="English Writing Coach"
      >
        {/* Large serif EWC */}
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 72,
            fontWeight: 400,
            letterSpacing: '0.08em',
            lineHeight: 1,
            color: '#E8DFC8',
          }}
        >
          EWC
        </span>
        {/* ENGLISH WRITING COACH — spaced caps */}
        <span
          style={{
            fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'rgba(232,223,200,0.65)',
            marginTop: 14,
          }}
        >
          English Writing Coach
        </span>
      </div>
    );
  }

  /* ── MARK — EWC only, navy, compact ── */
  if (variant === 'mark') {
    return (
      <span
        className={`select-none ${className}`}
        aria-label="EWC"
        style={{
          fontFamily: SERIF,
          fontSize: 26,
          fontWeight: 400,
          letterSpacing: '0.06em',
          lineHeight: 1,
          color: 'var(--primary, #1B2E4E)',
        }}
      >
        EWC
      </span>
    );
  }

  /* ── NAVBAR (default) — EWC + subtitle in one line ── */
  return (
    <div
      className={`flex flex-col items-center select-none group cursor-pointer ${className}`}
      aria-label="English Writing Coach — home"
    >
      {/* EWC — serif, navy */}
      <span
        className="group-hover:opacity-70 transition-opacity"
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          fontWeight: 400,
          letterSpacing: '0.1em',
          lineHeight: 1,
          color: 'var(--primary, #1B2E4E)',
        }}
      >
        EWC
      </span>
      {/* English Writing Coach — spaced caps */}
      <span
        className="group-hover:opacity-70 transition-opacity"
        style={{
          fontFamily: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
          fontSize: 7,
          fontWeight: 400,
          letterSpacing: '0.3em',
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