/**
 * Unit tests for helper functions in ExamPage.jsx
 *
 * We extract and test:
 *   - formatTimer        (MM:SS formatter)
 *   - parseWordTarget    (word-range parser)
 *   - getMinWords        (min-word derivation)
 *   - deriveWordTarget   (target range from minimum)
 *   - parseBlockingError (error message classifier)
 */

import { describe, it, expect } from 'vitest';

// ── Inline helpers mirroring the real ExamPage.jsx functions ──────────────────

function formatTimer(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
}

function parseWordTarget(text) {
  const m = text.match(/\((\d+)[–\-–](\d+)\s*words?\)/i);
  return m ? { min: +m[1], max: +m[2] } : null;
}

function getMinWords(questionText) {
  const target = parseWordTarget(questionText);
  if (target) return target.min;
  const t = questionText.toLowerCase();
  if (t.includes('essay') || t.includes('discuss') || t.includes('argu')) return 120;
  if (t.includes('email') || t.includes('letter') || t.includes('report') || t.includes('reflec')) return 80;
  if (t.includes('paragraph') || t.includes('describ') || t.includes('explain') ||
      t.includes('blog') || t.includes('review') || t.includes('summar')) return 60;
  if (t.includes('sentence') || t.includes('complete') || t.includes('fill')) return 10;
  return 40;
}

function deriveWordTarget(minWords) {
  const max = minWords <= 10 ? 30 : Math.round(minWords * 2.5);
  return { min: minWords, max };
}

function parseBlockingError(msg) {
  if (!msg) return null;
  const planMatch = msg.match(/(\d+(?:\.\d+)?)\s*%.*?(\d+)\s*\/\s*(\d+)/);
  if (planMatch) return { type: 'plan', pct: parseFloat(planMatch[1]), done: +planMatch[2], total: +planMatch[3] };
  if (msg.toLowerCase().includes('rate limit')) return { type: 'rate_limit', msg };
  if (msg.toLowerCase().includes('not start') || msg.toLowerCase().includes('gate')) return { type: 'gate_error' };
  return null;
}

// ── formatTimer ───────────────────────────────────────────────────────────────

describe('formatTimer', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTimer(0)).toBe('00:00');
  });

  it('formats 60 seconds as 01:00', () => {
    expect(formatTimer(60)).toBe('01:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatTimer(90)).toBe('01:30');
  });

  it('formats 2700 seconds (45 min) as 45:00', () => {
    expect(formatTimer(2700)).toBe('45:00');
  });

  it('pads single-digit seconds with leading zero', () => {
    expect(formatTimer(65)).toBe('01:05');
  });

  it('clamps negative values to 00:00', () => {
    expect(formatTimer(-10)).toBe('00:00');
  });

  it('handles null gracefully', () => {
    expect(formatTimer(null)).toBe('00:00');
  });

  it('handles undefined gracefully', () => {
    expect(formatTimer(undefined)).toBe('00:00');
  });
});

// ── parseWordTarget ───────────────────────────────────────────────────────────

describe('parseWordTarget', () => {
  it('parses explicit (50-100 words) range', () => {
    const result = parseWordTarget('Write a paragraph (50-100 words).');
    expect(result).toEqual({ min: 50, max: 100 });
  });

  it('parses range with en-dash', () => {
    // Note: the em-dash and en-dash variants are handled by [–\-–]
    const result = parseWordTarget('Write an essay (100–200 words).');
    expect(result).not.toBeNull();
    expect(result.min).toBe(100);
    expect(result.max).toBe(200);
  });

  it('returns null when no word range present', () => {
    expect(parseWordTarget('Write about your hobby.')).toBeNull();
  });

  it('parses "word" without plural s', () => {
    const result = parseWordTarget('Complete in (10-20 word)');
    expect(result).toEqual({ min: 10, max: 20 });
  });
});

// ── getMinWords ───────────────────────────────────────────────────────────────

describe('getMinWords', () => {
  it('uses explicit range when present', () => {
    expect(getMinWords('Write (80-120 words) about yourself.')).toBe(80);
  });

  it('returns 120 for essay-type questions', () => {
    expect(getMinWords('Write an essay about climate change.')).toBe(120);
  });

  it('returns 120 for discuss questions', () => {
    expect(getMinWords('Discuss the importance of education.')).toBe(120);
  });

  it('returns 80 for email questions', () => {
    expect(getMinWords('Write a formal email requesting more information.')).toBe(80);
  });

  it('returns 80 for letter questions', () => {
    expect(getMinWords('Write a letter to your friend.')).toBe(80);
  });

  it('returns 60 for paragraph questions', () => {
    expect(getMinWords('Write a short paragraph about your day.')).toBe(60);
  });

  it('returns 60 for describe questions', () => {
    expect(getMinWords('Describe your favorite place.')).toBe(60);
  });

  it('returns 10 for sentence/complete questions', () => {
    expect(getMinWords('Complete the sentence: I enjoy...')).toBe(10);
  });

  it('returns 40 as default fallback', () => {
    expect(getMinWords('Answer the question briefly.')).toBe(40);
  });
});

// ── deriveWordTarget ──────────────────────────────────────────────────────────

describe('deriveWordTarget', () => {
  it('min <= 10 gets max of 30', () => {
    expect(deriveWordTarget(10)).toEqual({ min: 10, max: 30 });
  });

  it('min 40 gets max ~100', () => {
    const result = deriveWordTarget(40);
    expect(result.min).toBe(40);
    expect(result.max).toBe(100);
  });

  it('min 120 gets max 300', () => {
    const result = deriveWordTarget(120);
    expect(result.min).toBe(120);
    expect(result.max).toBe(300);
  });

  it('preserves min in result', () => {
    const result = deriveWordTarget(80);
    expect(result.min).toBe(80);
  });
});

// ── parseBlockingError ────────────────────────────────────────────────────────

describe('parseBlockingError', () => {
  it('returns null for falsy input', () => {
    expect(parseBlockingError('')).toBeNull();
    expect(parseBlockingError(null)).toBeNull();
  });

  it('detects rate limit message', () => {
    const result = parseBlockingError('Rate limit exceeded. Try again later.');
    expect(result).not.toBeNull();
    expect(result.type).toBe('rate_limit');
  });
});
